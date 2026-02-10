import fs from 'node:fs';
import path from 'node:path';
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
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
  CodeActionKind,
  TextEdit,
  WorkspaceEdit,
  RenameParams,
  PrepareRenameParams,
  Range,
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

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let workspaceRoot: string | null = null;
let workspaceRoots: string[] = [];
let settings: LuminaLspSettings = { ...defaultSettings };
let project: ProjectContext | null = null;

const keywordCompletions: CompletionItem[] = [
  'import', 'from', 'type', 'fn', 'let', 'return', 'if', 'else', 'for', 'while',
  'true', 'false',
].map((label) => ({ label, kind: CompletionItemKind.Keyword }));

const typeCompletions: CompletionItem[] = ['int', 'string', 'bool', 'void'].map((label) => ({
  label,
  kind: CompletionItemKind.TypeParameter,
}));

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
  'import', 'from', 'type', 'fn', 'let', 'return', 'if', 'else', 'for', 'while',
  'true', 'false',
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
  project = new ProjectContext(parser);
  connection.console.info(`Lumina grammar loaded: ${grammarPath}`);
}

function uriToFsPath(uri: string): string {
  if (uri.startsWith('file://')) return URI.parse(uri).fsPath;
  return uri;
}

function getWordAt(doc: TextDocument, line: number, character: number): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (offset < 0 || offset >= text.length) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  if (start === end) return null;
  const word = text.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return null;
  return word;
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
    range: {
      start: { line: d.location.start.line - 1, character: d.location.start.column - 1 },
      end: { line: d.location.end.line - 1, character: d.location.end.column - 1 },
    },
  }));
  connection.sendDiagnostics({ uri, diagnostics: lspDiagnostics });
}

function refreshDependents(uri: string) {
  if (!project) return;
  for (const dep of project.getDependents(uri)) {
    project.parseDocument(dep);
    publishDiagnostics(dep);
  }
}

function refreshFromDisk(uri: string) {
  if (!project) return;
  const fsPath = uriToFsPath(uri);
  if (!fs.existsSync(fsPath)) return;
  const text = fs.readFileSync(fsPath, 'utf-8');
  project.addOrUpdateDocument(uri, text, 1);
  publishDiagnostics(uri);
  refreshDependents(uri);
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
      codeActionProvider: true,
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
});

documents.onDidOpen((e) => {
  project?.addOrUpdateDocument(e.document.uri, e.document.getText(), e.document.version);
  publishDiagnostics(e.document.uri);
  refreshDependents(e.document.uri);
});

documents.onDidChangeContent((e) => {
  project?.addOrUpdateDocument(e.document.uri, e.document.getText(), e.document.version);
  publishDiagnostics(e.document.uri);
  refreshDependents(e.document.uri);
});

documents.onDidClose((e) => {
  project?.removeDocument(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const items: CompletionItem[] = [...keywordCompletions, ...typeCompletions];
  const symbols = project?.getSymbols(params.textDocument.uri)?.list() ?? [];
  for (const sym of symbols) {
    let kind: CompletionItemKind = CompletionItemKind.Variable;
    if (sym.kind === 'function') kind = CompletionItemKind.Function;
    if (sym.kind === 'type') kind = CompletionItemKind.Class;
    items.push({ label: sym.name, kind });
  }
  return items;
});

connection.onDefinition((params: DefinitionParams): Location[] => {
  if (!project) return [];
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const word = getWordAt(doc, params.position.line, params.position.character);
  if (!word) return [];
  const found = project.findSymbolLocation(word, params.textDocument.uri);
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
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) insertLine = i + 1;
  }

  const actions: CodeAction[] = [];

  for (const diag of params.context.diagnostics) {
    const unknownIdMatch = /Unknown identifier '([^']+)'/.exec(diag.message);
    if (unknownIdMatch) {
      const name = unknownIdMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [params.textDocument.uri]: [
            TextEdit.insert({ line: insertLine, character: 0 }, `let ${name}: int = 0;\n`),
          ],
        },
      };
      actions.push({
        title: `Declare '${name}' at top of file`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      continue;
    }

    const unknownTypeMatch = /Unknown type '([^']+)'/.exec(diag.message);
    if (unknownTypeMatch) {
      const typeName = unknownTypeMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [params.textDocument.uri]: [
            TextEdit.insert({ line: insertLine, character: 0 }, `type ${typeName} = {};\n`),
          ],
        },
      };
      actions.push({
        title: `Declare type '${typeName}' at top of file`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      continue;
    }

    if (diag.code === 'MISSING_SEMICOLON' || /Missing semicolon/i.test(diag.message)) {
      const range = diag.range;
      const edit: WorkspaceEdit = {
        changes: {
          [params.textDocument.uri]: [TextEdit.insert(range.end, ';')],
        },
      };
      actions.push({
        title: 'Insert missing semicolon',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      continue;
    }

    const unusedMatch = /Unused binding '([^']+)'/.exec(diag.message);
    if (unusedMatch) {
      const name = unusedMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [params.textDocument.uri]: [
            TextEdit.replace(diag.range, `_${name}`),
          ],
        },
      };
      actions.push({
        title: `Prefix '${name}' with '_'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      const line = diag.range.start.line;
      const lineText = lines[line] ?? '';
      if (/^\s*let\b/.test(lineText)) {
        let endLine = line + 1;
        if (endLine < lines.length) {
          const nextLine = lines[endLine];
          if (nextLine.trim() === '') endLine += 1;
        }
        const removeRange = {
          start: { line, character: 0 },
          end: { line: Math.min(endLine, lines.length), character: 0 },
        };
        const removeEdit: WorkspaceEdit = {
          changes: {
            [params.textDocument.uri]: [TextEdit.del(removeRange)],
          },
        };
        actions.push({
          title: `Remove unused let '${name}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: removeEdit,
        });
      }
    }
  }

  return actions;
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
      if (builtinTypes.has(token.value)) tokenType = 'type';
      else tokenType = symbolMap.get(token.value) ?? 'variable';
    }
    if (!tokenType) continue;
    const line = Math.max(0, (token.line ?? 1) - 1);
    const char = Math.max(0, (token.col ?? 1) - 1);
    builder.push(line, char, token.value.length, semanticTokenTypes.indexOf(tokenType), 0);
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
