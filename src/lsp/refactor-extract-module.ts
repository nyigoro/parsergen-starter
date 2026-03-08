import { CodeAction, CodeActionKind, type Range, type WorkspaceEdit } from 'vscode-languageserver/node';
import { LuminaCommands } from 'lumina-language-client';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import type { LuminaProgram, LuminaStatement } from '../lumina/ast.js';
import { addEdit, positionAt, rangeOfNode, textOfNode, sortWorkspaceEdits } from './ast-utils.js';
import { isDependencyUri } from './rename.js';

export interface ExtractModuleRequest {
  text: string;
  uri: string;
  range: Range;
  targetUri: string;
  allFiles: Map<string, string>;
  allPrograms?: Map<string, LuminaProgram>;
}

export interface ExtractModuleResult {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
  movedSymbols?: string[];
  targetUri?: string;
}

type NamedTopLevelDecl = LuminaStatement & { name: string; visibility?: 'public' | 'private' };

function moduleSpecifier(fromUri: string, toUri: string): string {
  const fromPath = fileURLToPath(fromUri);
  const toPath = fileURLToPath(toUri);
  let rel = path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function overlaps(range: Range, stmt: LuminaStatement): boolean {
  const location = stmt.location;
  if (!location) return false;
  const stmtStart = { line: location.start.line - 1, character: location.start.column - 1 };
  const stmtEnd = { line: location.end.line - 1, character: location.end.column - 1 };
  const afterStart = stmtEnd.line > range.start.line || (stmtEnd.line === range.start.line && stmtEnd.character >= range.start.character);
  const beforeEnd = stmtStart.line < range.end.line || (stmtStart.line === range.end.line && stmtStart.character <= range.end.character);
  return afterStart && beforeEnd;
}

function isNamedTopLevelDecl(stmt: LuminaStatement): stmt is NamedTopLevelDecl {
  return 'name' in stmt && (
    stmt.type === 'FnDecl' ||
    stmt.type === 'StructDecl' ||
    stmt.type === 'EnumDecl' ||
    stmt.type === 'TypeDecl' ||
    stmt.type === 'TraitDecl'
  );
}

function selectedDecls(program: LuminaProgram, range: Range): NamedTopLevelDecl[] {
  return program.body.filter((stmt): stmt is NamedTopLevelDecl => isNamedTopLevelDecl(stmt) && overlaps(range, stmt));
}

function resolveImportSource(importerUri: string, source: string): string | null {
  if (!source.startsWith('.')) return null;
  const importerPath = fileURLToPath(importerUri);
  const resolved = path.resolve(path.dirname(importerPath), source);
  return pathToFileURL(resolved).toString();
}

function updateImportsForExtractModule(
  edit: WorkspaceEdit,
  importerUri: string,
  importerText: string,
  importerProgram: LuminaProgram,
  sourceUri: string,
  targetUri: string,
  movedNames: string[]
) {
  const sourceSpecifier = moduleSpecifier(importerUri, sourceUri);
  const targetSpecifier = moduleSpecifier(importerUri, targetUri);
  let hasTargetImport = false;

  for (const stmt of importerProgram.body) {
    if (stmt.type !== 'Import' || !Array.isArray(stmt.spec)) continue;
    const resolved = resolveImportSource(importerUri, stmt.source.value);
    const rendered = stmt.spec.map((item) => (typeof item === 'string' ? item : item.alias ? `${item.name} as ${item.alias}` : item.name));
    if (resolved === targetUri) {
      hasTargetImport = movedNames.every((name) => rendered.includes(name) || rendered.includes(`${name} as ${name}`)) || hasTargetImport;
    }
    if (resolved !== sourceUri) continue;
    const nextSpecs = stmt.spec.filter((item) => {
      const local = typeof item === 'string' ? item : item.alias ?? item.name;
      return !movedNames.includes(local);
    });
    if (nextSpecs.length !== stmt.spec.length) {
      addEdit(
        edit,
        importerUri,
        rangeOfNode(stmt, importerText),
        nextSpecs.length > 0 ? `import { ${nextSpecs.map((item) => (typeof item === 'string' ? item : item.alias ? `${item.name} as ${item.alias}` : item.name)).join(', ')} } from "${sourceSpecifier}";` : ''
      );
      if (!hasTargetImport) {
        addEdit(
          edit,
          importerUri,
          { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          `import { ${movedNames.join(', ')} } from "${targetSpecifier}";\n`
        );
        hasTargetImport = true;
      }
    }
  }
}

export function buildExtractModuleCodeAction(
  text: string,
  uri: string,
  range: Range,
  program?: LuminaProgram
): CodeAction | null {
  if (!program) return null;
  const decls = selectedDecls(program, range);
  if (decls.length < 2) return null;
  return {
    title: `Extract ${decls.length} declarations to module`,
    kind: CodeActionKind.RefactorExtract,
    command: {
      title: `Extract ${decls.length} declarations to module`,
      command: LuminaCommands.extractModule,
      arguments: [
        {
          uri,
          range,
          symbols: decls.map((decl) => decl.name),
          kind: 'extract-module',
        },
      ],
    },
  };
}

export function applyExtractModule(request: ExtractModuleRequest): ExtractModuleResult {
  if (isDependencyUri(request.uri) || isDependencyUri(request.targetUri)) {
    return { ok: false, error: 'Cannot extract modules across package boundaries.' };
  }
  const sourceProgram = request.allPrograms?.get(request.uri);
  if (!sourceProgram) return { ok: false, error: 'Current file AST is unavailable.' };
  const decls = selectedDecls(sourceProgram, request.range);
  if (decls.length < 2) {
    return { ok: false, error: 'Select at least two top-level declarations to extract a module.' };
  }

  const movedNames = decls.map((decl) => decl.name);
  const targetText = request.allFiles.get(request.targetUri) ?? '';
  const edit: WorkspaceEdit = { changes: {} };

  for (const decl of decls) {
    addEdit(edit, request.uri, rangeOfNode(decl, request.text), '');
  }

  const movedText = decls.map((decl) => textOfNode(decl, request.text).trimEnd()).join('\n\n');
  addEdit(
    edit,
    request.targetUri,
    {
      start: positionAt(targetText, targetText.length),
      end: positionAt(targetText, targetText.length),
    },
    `${targetText.endsWith('\n') || targetText.length === 0 ? '' : '\n'}${movedText}\n`
  );

  const importSpecifier = moduleSpecifier(request.uri, request.targetUri);
  addEdit(
    edit,
    request.uri,
    { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    `import { ${movedNames.join(', ')} } from "${importSpecifier}";\n`
  );

  for (const [uri, text] of request.allFiles.entries()) {
    if (uri === request.uri || uri === request.targetUri || isDependencyUri(uri)) continue;
    const program = request.allPrograms?.get(uri);
    if (!program) continue;
    updateImportsForExtractModule(edit, uri, text, program, request.uri, request.targetUri, movedNames);
  }

  sortWorkspaceEdits(edit);
  return {
    ok: true,
    edit,
    movedSymbols: movedNames,
    targetUri: request.targetUri,
  };
}
