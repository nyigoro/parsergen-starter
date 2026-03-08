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
  CodeAction,
  WorkspaceEdit,
  RenameParams,
  PrepareRenameParams,
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
import { LuminaCommands } from 'lumina-language-client';

import { compileGrammar } from '../grammar/index.js';
import { ProjectContext } from '../project/context.js';
import { defaultSettings, type LuminaLspSettings } from './config.js';
import { resolveCompletions } from './completion.js';
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
import { findReferencesAtPosition } from './references.js';
import { applyRename } from './rename.js';
import { buildInlineVariableCodeAction } from './refactor-inline.js';
import { buildExtractTypeAliasCodeAction } from './refactor-extract-type.js';
import { buildExtractVariableCodeAction } from './refactor-extract-variable.js';
import { buildPromoteToRefCodeAction } from './refactor-promote-ref.js';
import { buildSplitVariableCodeAction } from './refactor-split-variable.js';
import { buildTraitStubsCodeAction } from './refactor-trait-stubs.js';
import { buildExtractFunctionCodeAction } from './refactor-extract-function.js';
import { buildConvertToAsyncCodeAction } from './refactor-async-convert.js';
import { buildFlipIfElseCodeAction } from './refactor-flip-if.js';
import { buildIfLetToMatchCodeAction, buildMatchToIfLetCodeAction } from './refactor-if-let-match.js';
import { buildWrapReturnResultCodeAction } from './refactor-wrap-result.js';
import {
  applyChangeSignature,
  buildChangeSignatureCodeAction,
  previewChangeSignature,
  type ParamChange,
} from './refactor-change-signature.js';
import { applyMoveSymbol, buildMoveSymbolCodeAction } from './refactor-move-symbol.js';
import {
  applyChangeReturnType,
  buildChangeReturnTypeCodeAction,
  previewChangeReturnType,
} from './refactor-change-return-type.js';
import {
  applyChangeTraitSignature,
  buildChangeTraitSignatureCodeAction,
  previewChangeTraitSignature,
} from './refactor-change-trait-signature.js';
import { applyExtractModule, buildExtractModuleCodeAction } from './refactor-extract-module.js';
import { buildSemanticTokens, semanticTokensLegend } from './semantic-tokens.js';

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


function summarizeWorkspaceEdit(edit: WorkspaceEdit): { files: number; edits: number } {
  const changes = edit.changes ?? {};
  const fileUris = Object.keys(changes);
  let edits = 0;
  for (const uri of fileUris) {
    edits += changes[uri]?.length ?? 0;
  }
  return { files: fileUris.length, edits };
}

function collectAllFileTexts(currentUri?: string, currentText?: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const doc of project?.listDocuments() ?? []) {
    files.set(doc.uri, doc.text);
  }
  if (currentUri && currentText !== undefined) files.set(currentUri, currentText);
  return files;
}

function collectAllPrograms(currentUri?: string): Map<string, NonNullable<ReturnType<ProjectContext['getDocumentAst']>>> {
  const programs = new Map<string, NonNullable<ReturnType<ProjectContext['getDocumentAst']>>>();
  for (const doc of project?.listDocuments() ?? []) {
    const ast = project?.getDocumentAst(doc.uri);
    if (ast) programs.set(doc.uri, ast);
  }
  if (currentUri) {
    const ast = project?.getDocumentAst(currentUri);
    if (ast) programs.set(currentUri, ast);
  }
  return programs;
}

function findImportedSymbolInfo(name: string, uri: string) {
  if (!project) return undefined;
  if (!project.hasImportNameInDoc(name, uri)) return undefined;
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
  return undefined;
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
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', ':', '"', '{'],
      },
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
      executeCommandProvider: {
      commands: [
        LuminaCommands.previewChangeSignature,
        LuminaCommands.applyChangeSignature,
        LuminaCommands.applyMoveSymbol,
        LuminaCommands.previewChangeReturnType,
        LuminaCommands.applyChangeReturnType,
        LuminaCommands.previewChangeTraitSignature,
        LuminaCommands.applyChangeTraitSignature,
        LuminaCommands.applyExtractModule,
      ],
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
  const signatureInfos = resolved.signatures.map((sig) => {
    const parameters = sig.parameters.map((label) => ParameterInformation.create(label));
    return SignatureInformation.create(sig.label, undefined, ...parameters);
  });
  return {
    signatures: signatureInfos,
    activeSignature: resolved.activeSignature,
    activeParameter: resolved.activeParam,
  };
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return resolveCompletions({
    doc,
    position: params.position,
    symbols: project?.getSymbols(params.textDocument.uri),
    ast: project?.getDocumentAst(params.textDocument.uri),
    moduleBindings: project?.getModuleBindings(params.textDocument.uri) ?? new Map<string, ModuleExport>(),
    hmExprTypes: project?.getHmExprTypes(params.textDocument.uri),
    preludeExportMap,
    moduleRegistry,
    project: project ?? undefined,
    uri: params.textDocument.uri,
    resolveImportedSymbol: (name) => findImportedSymbolInfo(name, params.textDocument.uri) ?? undefined,
    resolveImportedMember: (base, member) => project?.resolveImportedMember(base, member, params.textDocument.uri),
  });
});

connection.onCompletionResolve((item) => item);

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
  return findReferencesAtPosition(project, doc, params.textDocument.uri, params.position, params.context.includeDeclaration);
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
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const result = applyRename({
    project,
    doc,
    uri: params.textDocument.uri,
    position: params.position,
    newName: params.newName,
  });
  if (result.errors.length > 0) {
    throw new ResponseError(ErrorCodes.InvalidRequest, result.errors[0].message);
  }
  if (!result.edit) return null;
  const summary = summarizeWorkspaceEdit(result.edit);
  const message = `Rename preview: ${summary.edits} edits across ${summary.files} file${summary.files === 1 ? '' : 's'}.`;
  if (settings.renamePreviewMode === 'popup') {
    connection.window.showInformationMessage(message);
  } else if (settings.renamePreviewMode === 'log') {
    connection.console.info(message);
  }
  return result.edit;
});

connection.onCodeAction((params): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const actions = getCodeActionsForDiagnostics(text, params.textDocument.uri, params.context.diagnostics, {
    range: params.range,
  });
  const inline = buildInlineVariableCodeAction(text, params.textDocument.uri, params.range);
  if (inline) actions.push(inline);
  const extractType = buildExtractTypeAliasCodeAction(text, params.textDocument.uri, params.range);
  if (extractType) actions.push(extractType);
  const program = project?.getDocumentAst(params.textDocument.uri);
  const refactors = [
    buildExtractVariableCodeAction(text, params.textDocument.uri, params.range),
    buildPromoteToRefCodeAction(text, params.textDocument.uri, params.range),
    buildSplitVariableCodeAction(text, params.textDocument.uri, params.range),
    buildTraitStubsCodeAction(text, params.textDocument.uri, params.range),
    buildExtractFunctionCodeAction(text, params.textDocument.uri, params.range),
    buildConvertToAsyncCodeAction(text, params.textDocument.uri, params.range),
    buildFlipIfElseCodeAction(text, params.textDocument.uri, params.range),
    buildIfLetToMatchCodeAction(text, params.textDocument.uri, params.range),
    buildMatchToIfLetCodeAction(text, params.textDocument.uri, params.range),
    buildWrapReturnResultCodeAction(text, params.textDocument.uri, params.range),
    buildChangeSignatureCodeAction(text, params.textDocument.uri, params.range, program),
    buildMoveSymbolCodeAction(text, params.textDocument.uri, params.range, program),
    buildChangeReturnTypeCodeAction(text, params.textDocument.uri, params.range, program),
    buildChangeTraitSignatureCodeAction(text, params.textDocument.uri, params.range, program),
    buildExtractModuleCodeAction(text, params.textDocument.uri, params.range, program),
  ].filter((action): action is CodeAction => action !== null);
  actions.push(...refactors);

  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.kind ?? ''}|${action.title}|${JSON.stringify(action.edit ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

connection.onExecuteCommand(async (params) => {
  if (params.command === LuminaCommands.previewChangeSignature) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const changes = (params.arguments?.[1] as ParamChange[] | undefined) ?? [];
    if (!requestArg.uri || !requestArg.position) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = previewChangeSignature(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      changes
    );
    return result;
  }

  if (params.command === LuminaCommands.applyChangeSignature) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const changes = (params.arguments?.[1] as ParamChange[] | undefined) ?? [];
    if (!requestArg.uri || !requestArg.position) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = applyChangeSignature(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      changes
    );
    if (result.edit) {
      await connection.workspace.applyEdit(result.edit);
    }
    return result;
  }

  if (params.command === LuminaCommands.applyMoveSymbol) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      targetUri?: string;
      text?: string;
      newName?: string;
    };
    if (!requestArg.uri || !requestArg.position || !requestArg.targetUri) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = applyMoveSymbol({
      text,
      uri: requestArg.uri,
      position: requestArg.position,
      targetUri: requestArg.targetUri,
      allFiles: collectAllFileTexts(requestArg.uri, text),
      allPrograms: collectAllPrograms(requestArg.uri),
      newName: requestArg.newName,
    });
    if (result.edit) {
      await connection.workspace.applyEdit(result.edit);
    }
    return result;
  }

  if (params.command === LuminaCommands.previewChangeReturnType) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const newReturnType = String(params.arguments?.[1] ?? '').trim();
    if (!requestArg.uri || !requestArg.position || !newReturnType) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    return previewChangeReturnType(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      newReturnType
    );
  }

  if (params.command === LuminaCommands.applyChangeReturnType) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const newReturnType = String(params.arguments?.[1] ?? '').trim();
    if (!requestArg.uri || !requestArg.position || !newReturnType) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = applyChangeReturnType(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      newReturnType
    );
    if (result.edit) {
      await connection.workspace.applyEdit(result.edit);
    }
    return result;
  }

  if (params.command === LuminaCommands.previewChangeTraitSignature) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const changes = (params.arguments?.[1] as ParamChange[] | undefined) ?? [];
    if (!requestArg.uri || !requestArg.position) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    return previewChangeTraitSignature(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      changes
    );
  }

  if (params.command === LuminaCommands.applyChangeTraitSignature) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      position?: { line: number; character: number };
      text?: string;
    };
    const changes = (params.arguments?.[1] as ParamChange[] | undefined) ?? [];
    if (!requestArg.uri || !requestArg.position) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = applyChangeTraitSignature(
      {
        text,
        uri: requestArg.uri,
        position: requestArg.position,
        allFiles: collectAllFileTexts(requestArg.uri, text),
        allPrograms: collectAllPrograms(requestArg.uri),
      },
      changes
    );
    if (result.edit) {
      await connection.workspace.applyEdit(result.edit);
    }
    return result;
  }

  if (params.command === LuminaCommands.applyExtractModule) {
    const requestArg = (params.arguments?.[0] ?? {}) as {
      uri?: string;
      range?: Range;
      targetUri?: string;
      text?: string;
    };
    if (!requestArg.uri || !requestArg.range || !requestArg.targetUri) return;
    const doc = documents.get(requestArg.uri);
    const text =
      requestArg.text ??
      doc?.getText() ??
      project?.listDocuments().find((item) => item.uri === requestArg.uri)?.text;
    if (!text) return;
    const result = applyExtractModule({
      text,
      uri: requestArg.uri,
      range: requestArg.range,
      targetUri: requestArg.targetUri,
      allFiles: collectAllFileTexts(requestArg.uri, text),
      allPrograms: collectAllPrograms(requestArg.uri),
    });
    if (result.edit) {
      await connection.workspace.applyEdit(result.edit);
    }
    return result;
  }
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
  return buildSemanticTokens(doc.getText(), symbols);
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
