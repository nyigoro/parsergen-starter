import fs from 'node:fs';
import path from 'node:path';
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  DocumentSymbol,
  SymbolKind,
  SymbolInformation,
  Location,
  ReferenceParams,
  DefinitionParams,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  CodeAction,
  TextEdit,
  WorkspaceEdit,
  RenameParams,
  PrepareRenameParams,
  Range,
  Hover,
  InlayHint,
  MarkupKind,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  ResponseError,
  ErrorCodes,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import { compileGrammar } from '../grammar/index.js';
import { ProjectContext } from '../project/context.js';
import { defaultSettings, type LuminaLspSettings } from './config.js';
import { createLuminaLexer } from '../lumina/lexer.js';
import { buildCompletionItems } from './completion.js';
import {
  createStdModuleRegistry,
  getPreludeExports,
  type ModuleExport,
} from '../lumina/module-registry.js';
import { findMemberAt, getWordAt, resolveHoverLabel, resolveSignatureHelp } from './hover-signature.js';
import { getCodeActionsForDiagnostics } from './code-actions.js';
import { buildModuleGraph, resolveSymbol, type ModuleGraph } from './module-graph.js';
import { formatHoverContents } from './hover-format.js';
import { buildInlayHints } from './inlay-hints.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let workspaceRoot: string | null = null;
let workspaceRoots: string[] = [];
let settings: LuminaLspSettings = { ...defaultSettings };
let project: ProjectContext | null = null;
let moduleGraph: ModuleGraph | null = null;
const diagnosticsDebounce = new Map<string, NodeJS.Timeout>();
const debounceMs = 120;
const moduleRegistry = createStdModuleRegistry();
const preludeExports = getPreludeExports(moduleRegistry);
const preludeExportMap = new Map<string, ModuleExport>(preludeExports.map((exp) => [exp.name, exp]));

const semanticTokenTypes = [
  'keyword',
  'string',
  'number',
  'operator',
  'variable',
  'function',
  'class',
  'type',
  'comment',
] as const;

const reservedKeywords = new Set([
  'import', 'from', 'type', 'struct', 'enum', 'fn', 'let', 'return', 'if', 'else', 'for', 'while',
  'match', 'true', 'false', 'pub', 'extern',
]);
const builtinTypes = new Set(['int', 'string', 'bool', 'void']);

const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: [...semanticTokenTypes],
  tokenModifiers: [],
};

function resolveGrammarPath(): string {
  if (settings.grammarPath) return path.resolve(settings.grammarPath);
  const roots = workspaceRoots.length > 0 ? workspaceRoots : workspaceRoot ? [workspaceRoot] : [];
  const candidates = roots.flatMap((root) => [
    path.join(root, 'src', 'grammar', 'lumina.peg'),
    path.join(root, 'examples', 'lumina.peg'),
  ]);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Lumina grammar not found. Configure lumina.grammarPath.');
}

function initProjectContext() {
  const grammarPath = resolveGrammarPath();
  const grammarText = fs.readFileSync(grammarPath, 'utf-8');
  const parser = compileGrammar(grammarText);
  project = new ProjectContext(parser, undefined, undefined, {
    useHmDiagnostics: settings.useHmDiagnostics ?? false,
  });
  moduleGraph = null;
  connection.console.info(`Lumina grammar loaded: ${grammarPath}`);
}

function uriToFsPath(uri: string): string {
  if (uri.startsWith('file://')) return URI.parse(uri).fsPath;
  return uri;
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function addEdit(edit: WorkspaceEdit, uri: string, range: { start: { line: number; character: number }; end: { line: number; character: number } }, newText: string) {
  if (!edit.changes) edit.changes = {};
  if (!edit.changes[uri]) edit.changes[uri] = [];
  edit.changes[uri].push(TextEdit.replace(range, newText));
}

function locationToRange(location: { start: { line: number; column: number }; end: { line: number; column: number } }): Range {
  return {
    start: { line: location.start.line - 1, character: location.start.column - 1 },
    end: { line: location.end.line - 1, character: location.end.column - 1 },
  };
}


function summarizeWorkspaceEdit(edit: WorkspaceEdit): { files: number; edits: number } {
  const changes = edit.changes ?? {};
  const fileUris = Object.keys(changes);
  let edits = 0;
  for (const uri of fileUris) {
    edits += changes[uri]?.length ?? 0;
  }
  return { files: fileUris.length, edits };
}

function findImportedSymbolInfo(name: string, uri: string) {
  if (!project) return null;
  if (!project.hasImportNameInDoc(name, uri)) return null;
  const resolved = project.resolveImportedSymbol(name, uri);
  if (resolved) return resolved;
  const deps = project.getDependencies(uri);
  for (const dep of deps) {
    const symbols = project.getSymbols(dep);
    const sym = symbols?.get(name);
    if (!sym) continue;
    if (sym.visibility === 'private' && dep !== uri) continue;
    return sym;
  }
  return null;
}

function publishDiagnostics(uri: string) {
  if (!project) return;
  const diags = project.getDiagnostics(uri).slice(0, settings.maxDiagnostics ?? 200);
  const lspDiagnostics = diags.map((d) => ({
    severity:
      d.severity === 'error'
        ? DiagnosticSeverity.Error
        : d.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : d.severity === 'info'
            ? DiagnosticSeverity.Information
            : DiagnosticSeverity.Hint,
    message: d.message,
    source: d.source ?? 'lumina',
    code: d.code,
    range: {
      start: { line: d.location.start.line - 1, character: d.location.start.column - 1 },
      end: { line: d.location.end.line - 1, character: d.location.end.column - 1 },
    },
    relatedInformation: d.relatedInformation?.map((info) => ({
      location: {
        uri,
        range: {
          start: { line: info.location.start.line - 1, character: info.location.start.column - 1 },
          end: { line: info.location.end.line - 1, character: info.location.end.column - 1 },
        },
      },
      message: info.message,
    })),
  }));
  connection.sendDiagnostics({ uri, diagnostics: lspDiagnostics });
}

function rebuildModuleGraph() {
  if (!project) return;
  moduleGraph = buildModuleGraph(project);
}

function refreshDependents(uri: string, changedSymbols: string[] = []) {
  if (!project) return;
  const dependents = project.getDependentsForSymbols(uri, changedSymbols);
  for (const dep of dependents) {
    project.parseDocument(dep);
    publishDiagnostics(dep);
  }
}

function refreshFromDisk(uri: string) {
  if (!project) return;
  const fsPath = uriToFsPath(uri);
  if (!fs.existsSync(fsPath)) return;
  const text = fs.readFileSync(fsPath, 'utf-8');
  const result = project.addOrUpdateDocument(uri, text, 1);
  publishDiagnostics(uri);
  rebuildModuleGraph();
  if (result.signatureChanged) {
    refreshDependents(uri, result.changedSymbols);
  }
}

function scanWorkspace(root: string, extensions: string[], maxFiles: number): string[] {
  const results: string[] = [];
  const queue: string[] = [root];
  const normalizedExts = extensions.map((ext) => ext.toLowerCase());
  const ignored = new Set(['node_modules', 'dist', 'build', '.git']);

  while (queue.length > 0 && results.length < maxFiles) {
    const current = queue.pop();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        queue.push(path.join(current, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (normalizedExts.includes(ext)) {
          results.push(path.join(current, entry.name));
          if (results.length >= maxFiles) break;
        }
      }
    }
  }

  return results;
}

function indexWorkspaceFiles() {
  if (!project) return;
  const roots = workspaceRoots.length > 0 ? workspaceRoots : workspaceRoot ? [workspaceRoot] : [];
  if (roots.length === 0) return;
  const extensions = settings.fileExtensions ?? ['.lum', '.lumina'];
  const maxFiles = settings.maxIndexFiles ?? 2000;
  for (const root of roots) {
    const files = scanWorkspace(root, extensions, maxFiles);
    for (const filePath of files) {
      const uri = URI.file(filePath).toString();
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, 'utf-8');
      project.addOrUpdateDocument(uri, text, 1);
      publishDiagnostics(uri);
    }
  }
  rebuildModuleGraph();
}

connection.onInitialize((params: InitializeParams) => {
  workspaceRoot = params.rootPath ?? (params.rootUri ? URI.parse(params.rootUri).fsPath : null);
  workspaceRoots = params.workspaceFolders?.map((folder) => URI.parse(folder.uri).fsPath) ?? [];
  if (workspaceRoot && !workspaceRoots.includes(workspaceRoot)) {
    workspaceRoots = [workspaceRoot, ...workspaceRoots];
  }
  initProjectContext();
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false },
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', ','] },
      codeActionProvider: true,
      inlayHintProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        full: true,
      },
    },
  };
});

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type);
  const extensions = settings.fileExtensions ?? ['.lum', '.lumina'];
  const sanitized = extensions.map((ext) => ext.replace(/^\./, '')).filter(Boolean);
  const globPattern = sanitized.length > 0 ? `**/*.{${sanitized.join(',')}}` : '**/*.lum';
  connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [{ globPattern }],
  });
  indexWorkspaceFiles();
});

connection.onDidChangeConfiguration((change) => {
  settings = { ...defaultSettings, ...(change.settings?.lumina ?? {}) };
  initProjectContext();
  documents.all().forEach((doc) => {
    project?.addOrUpdateDocument(doc.uri, doc.getText(), doc.version);
    publishDiagnostics(doc.uri);
  });
  indexWorkspaceFiles();
  rebuildModuleGraph();
});

function scheduleDiagnostics(uri: string, text: string, version: number) {
  const existing = diagnosticsDebounce.get(uri);
  if (existing) clearTimeout(existing);
  diagnosticsDebounce.set(
    uri,
    setTimeout(() => {
      diagnosticsDebounce.delete(uri);
      const result = project?.addOrUpdateDocument(uri, text, version);
      publishDiagnostics(uri);
      rebuildModuleGraph();
      if (result?.signatureChanged) {
        refreshDependents(uri, result.changedSymbols);
      }
    }, debounceMs)
  );
}

documents.onDidOpen((e) => {
  scheduleDiagnostics(e.document.uri, e.document.getText(), e.document.version);
});

documents.onDidChangeContent((e) => {
  scheduleDiagnostics(e.document.uri, e.document.getText(), e.document.version);
});

documents.onDidClose((e) => {
  project?.removeDocument(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const symbols = project?.getSymbols(params.textDocument.uri);
  const moduleBindings = project?.getModuleBindings(params.textDocument.uri) ?? new Map<string, ModuleExport>();
  const ast = project?.getDocumentAst(params.textDocument.uri);
  const hmCallSignatures = project?.getHmCallSignatures(params.textDocument.uri);
  const hmExprTypes = project?.getHmExprTypes(params.textDocument.uri);
  const graph = project ? (moduleGraph ?? buildModuleGraph(project)) : null;
  const label = resolveHoverLabel({
    doc,
    position: params.position,
    symbols,
    moduleBindings,
    ast,
    hmCallSignatures,
    hmExprTypes,
    preludeExportMap,
    resolveImportedSymbol: (name) => findImportedSymbolInfo(name, params.textDocument.uri),
    resolveImportedMember: (base, member) => project?.resolveImportedMember(base, member, params.textDocument.uri),
  });
  if (!label) return null;
  let definition = null;
  if (graph) {
    const member = findMemberAt(doc, params.position.line, params.position.character);
    if (member) {
      const localSym = symbols?.get(member.base);
      if (!localSym || localSym.kind === 'type') {
        definition = resolveSymbol(graph, params.textDocument.uri, member.base, member.member);
      }
    }
    if (!definition) {
      const word = getWordAt(doc, params.position.line, params.position.character);
      if (word) {
        definition = resolveSymbol(graph, params.textDocument.uri, word);
      }
    }
  }
  const contents = formatHoverContents(label, definition);
  return { contents: { kind: MarkupKind.Markdown, value: contents } };
});

connection.onSignatureHelp((params): SignatureHelp | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const symbols = project?.getSymbols(params.textDocument.uri);
  const moduleBindings = project?.getModuleBindings(params.textDocument.uri) ?? new Map<string, ModuleExport>();
  const ast = project?.getDocumentAst(params.textDocument.uri);
  const hmCallSignatures = project?.getHmCallSignatures(params.textDocument.uri);
  const resolved = resolveSignatureHelp({
    doc,
    position: params.position,
    symbols,
    moduleBindings,
    ast,
    hmCallSignatures,
    preludeExportMap,
    resolveImportedSymbol: (name) => findImportedSymbolInfo(name, params.textDocument.uri),
    resolveImportedMember: (base, member) => project?.resolveImportedMember(base, member, params.textDocument.uri),
  });
  if (!resolved) return null;
  const parameters = resolved.signature.parameters.map((label) => ParameterInformation.create(label));
  const signature = SignatureInformation.create(resolved.signature.label, undefined, ...parameters);
  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: resolved.activeParam,
  };
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return buildCompletionItems({
    doc,
    position: params.position,
    symbols: project?.getSymbols(params.textDocument.uri),
    ast: project?.getDocumentAst(params.textDocument.uri),
  });
});

connection.onDefinition((params: DefinitionParams): Location[] => {
  if (!project) return [];
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const word = getWordAt(doc, params.position.line, params.position.character);
  const member = findMemberAt(doc, params.position.line, params.position.character);
  const symbols = project.getSymbols(params.textDocument.uri);
  const graph = moduleGraph ?? buildModuleGraph(project);

  let found: { uri: string; location: { start: { line: number; column: number }; end: { line: number; column: number } } } | null = null;
  if (member) {
    const localSym = symbols?.get(member.base);
    if (!localSym || localSym.kind === 'type') {
      const resolved = resolveSymbol(graph, params.textDocument.uri, member.base, member.member);
      if (resolved) {
        found = { uri: resolved.uri, location: resolved.location };
      }
    }
  }
  if (!found && word) {
    const resolved = resolveSymbol(graph, params.textDocument.uri, word);
    if (resolved) {
      found = { uri: resolved.uri, location: resolved.location };
    }
  }
  if (!found && word) {
    found = project.findSymbolLocation(word, params.textDocument.uri);
  }
  if (!found) return [];
  return [
    {
      uri: found.uri,
      range: {
        start: { line: found.location.start.line - 1, character: found.location.start.column - 1 },
        end: { line: found.location.end.line - 1, character: found.location.end.column - 1 },
      },
    },
  ];
});

connection.onReferences((params: ReferenceParams): Location[] => {
  if (!project) return [];
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const word = getWordAt(doc, params.position.line, params.position.character);
  if (!word) return [];
  const refs = project.findReferences(word);
  const locations = refs.map((ref) => ({
    uri: ref.uri,
    range: {
      start: { line: ref.location.start.line - 1, character: ref.location.start.column - 1 },
      end: { line: ref.location.end.line - 1, character: ref.location.end.column - 1 },
    },
  }));
  if (params.context.includeDeclaration) {
    const def = project.findSymbolLocation(word);
    if (def) {
      locations.push({
        uri: def.uri,
        range: {
          start: { line: def.location.start.line - 1, character: def.location.start.column - 1 },
          end: { line: def.location.end.line - 1, character: def.location.end.column - 1 },
        },
      });
    }
  }
  return locations;
});

connection.onPrepareRename((params: PrepareRenameParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = getWordAt(doc, params.position.line, params.position.character);
  if (!word) return null;
  const offset = doc.offsetAt(params.position);
  const text = doc.getText();
  let start = offset;
  let end = offset;
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  if (start === end) return null;
  return {
    range: {
      start: doc.positionAt(start),
      end: doc.positionAt(end),
    },
    placeholder: word,
  };
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  if (!project) return null;
  if (!isValidIdentifier(params.newName)) return null;
  if (reservedKeywords.has(params.newName) || builtinTypes.has(params.newName)) {
    throw new ResponseError(ErrorCodes.InvalidRequest, `'${params.newName}' is reserved.`);
  }
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = getWordAt(doc, params.position.line, params.position.character);
  if (!word) return null;
  if (params.newName === word) return null;
  const def = project.findSymbolLocation(word, params.textDocument.uri);
  if (def) {
    if (project.hasSymbolGlobal(params.newName, { uri: def.uri, location: def.location })) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Rename conflict: '${params.newName}' already exists in the project.`);
    }
    if (settings.renameConflictMode === 'all' && project.hasImportNameGlobal(params.newName)) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Rename conflict: '${params.newName}' is imported in the project.`);
    }
  }
  const edit: WorkspaceEdit = { changes: {} };

  if (def) {
    addEdit(edit, def.uri, locationToRange(def.location), params.newName);
  }

  if (def) {
    const refs = project.findReferences(word);
    for (const ref of refs) {
      addEdit(edit, ref.uri, locationToRange(ref.location), params.newName);
    }
  } else {
    const local = project.findLocalBindingAt(params.textDocument.uri, params.position);
    if (!local) return null;
    if (settings.renameConflictMode === 'all' && project.hasImportNameInDoc(params.newName, params.textDocument.uri)) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Rename conflict: '${params.newName}' is imported in this file.`);
    }
    if (project.hasLocalConflictInScope(params.newName, params.textDocument.uri, local.scopeRange, local.location)) {
      throw new ResponseError(ErrorCodes.InvalidRequest, `Rename conflict: '${params.newName}' already exists in this scope.`);
    }
    addEdit(edit, params.textDocument.uri, locationToRange(local.location), params.newName);
    const refs = project.findReferencesInScope(local.name, params.textDocument.uri, local.scopeRange);
    for (const ref of refs) {
      addEdit(edit, ref.uri, locationToRange(ref.location), params.newName);
    }
  }

  const summary = summarizeWorkspaceEdit(edit);
  const message = `Rename preview: ${summary.edits} edits across ${summary.files} file${summary.files === 1 ? '' : 's'}.`;
  if (settings.renamePreviewMode === 'popup') {
    connection.window.showInformationMessage(message);
  } else if (settings.renamePreviewMode === 'log') {
    connection.console.info(message);
  }
  return edit;
});

connection.onCodeAction((params): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return getCodeActionsForDiagnostics(doc.getText(), params.textDocument.uri, params.context.diagnostics, {
    range: params.range,
  });
});

connection.languages.inlayHint.on((params): InlayHint[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !project) return [];
  const ast = project.getDocumentAst(params.textDocument.uri);
  const symbols = project.getSymbols(params.textDocument.uri);
  const moduleBindings = project.getModuleBindings(params.textDocument.uri);
  const hmExprTypes = project.getHmExprTypes(params.textDocument.uri);
  return buildInlayHints({
    doc,
    ast,
    range: params.range,
    symbols,
    moduleBindings,
    hmExprTypes,
  });
});

connection.languages.semanticTokens.on((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  const symbols = project?.getSymbols(params.textDocument.uri)?.list() ?? [];
  const symbolMap = new Map<string, 'function' | 'class' | 'variable'>();
  for (const sym of symbols) {
    if (sym.kind === 'function') symbolMap.set(sym.name, 'function');
    else if (sym.kind === 'type') symbolMap.set(sym.name, 'class');
    else symbolMap.set(sym.name, 'variable');
  }

  const builder = new SemanticTokensBuilder();
  const lexer = createLuminaLexer();
  lexer.reset(doc.getText());
  for (const token of lexer) {
    if (token.type === 'ws' || token.type === 'newline') continue;
    let tokenType: typeof semanticTokenTypes[number] | null = null;
    if (token.type === 'keyword') tokenType = 'keyword';
    else if (token.type === 'string') tokenType = 'string';
    else if (token.type === 'number') tokenType = 'number';
    else if (token.type === 'op') tokenType = 'operator';
    else if (token.type === 'comment') tokenType = 'comment';
    else if (token.type === 'identifier') {
      const builtinTypes = new Set(['int', 'string', 'bool', 'void']);
      if (builtinTypes.has(token.text)) tokenType = 'type';
      else tokenType = symbolMap.get(token.text) ?? 'variable';
    }
    if (!tokenType) continue;
    const line = Math.max(0, (token.line ?? 1) - 1);
    const char = Math.max(0, (token.col ?? 1) - 1);
    builder.push(line, char, token.text.length, semanticTokenTypes.indexOf(tokenType), 0);
  }
  return builder.build();
});

connection.onDidChangeWatchedFiles((change) => {
  for (const c of change.changes) {
    if (c.type === FileChangeType.Deleted) {
      project?.removeDocument(c.uri);
      connection.sendDiagnostics({ uri: c.uri, diagnostics: [] });
      continue;
    }
    refreshFromDisk(c.uri);
  }
});

connection.onDocumentSymbol((params) => {
  project?.indexDocument(params.textDocument.uri);
  const symbols = project?.getSymbols(params.textDocument.uri)?.list() ?? [];
  const documentSymbols: DocumentSymbol[] = [];
  for (const sym of symbols) {
    if (!sym.location) continue;
    const range = {
      start: { line: sym.location.start.line - 1, character: sym.location.start.column - 1 },
      end: { line: sym.location.end.line - 1, character: sym.location.end.column - 1 },
    };
    const kind = sym.kind === 'type' ? SymbolKind.Class : sym.kind === 'function' ? SymbolKind.Function : SymbolKind.Variable;
    documentSymbols.push({
      name: sym.name,
      kind,
      range,
      selectionRange: range,
      children: [],
    });
  }
  return documentSymbols;
});

connection.onWorkspaceSymbol((params) => {
  if (!project) return [];
  const query = params.query.toLowerCase();
  const results: SymbolInformation[] = [];
  for (const doc of project.listDocuments()) {
    project.indexDocument(doc.uri);
    const symbols = doc.symbols?.list() ?? [];
    for (const sym of symbols) {
      if (!sym.location) continue;
      if (query && !sym.name.toLowerCase().includes(query)) continue;
      const range = {
        start: { line: sym.location.start.line - 1, character: sym.location.start.column - 1 },
        end: { line: sym.location.end.line - 1, character: sym.location.end.column - 1 },
      };
      const kind = sym.kind === 'type' ? SymbolKind.Class : sym.kind === 'function' ? SymbolKind.Function : SymbolKind.Variable;
      results.push({ name: sym.name, kind, location: { uri: doc.uri, range } });
    }
  }
  return results;
});

documents.listen(connection);
connection.listen();
