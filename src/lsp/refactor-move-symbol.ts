import {
  CodeAction,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import type {
  LuminaFnDecl,
  LuminaImportSpec,
  LuminaProgram,
  LuminaStatement,
  LuminaStructDecl,
  LuminaEnumDecl,
  LuminaTypeDecl,
} from '../lumina/ast.js';
import {
  addEdit,
  findImportDeclarations,
  findTopLevelDeclAtPosition,
  positionAt,
  rangeOfNode,
  textOfNode,
  sortWorkspaceEdits,
} from './ast-utils.js';
import { isDependencyUri } from './rename.js';

type DeclInfo = {
  name: string;
  kind: 'fn' | 'struct' | 'enum' | 'type' | 'const';
  public: boolean;
  start: number;
  headerEnd: number;
  end: number;
  text: string;
};

export interface MoveSymbolRequest {
  text: string;
  uri: string;
  position: Position;
  targetUri: string;
  allFiles: Map<string, string>;
  allPrograms?: Map<string, LuminaProgram>;
  newName?: string;
}

export interface MoveSymbolResult {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
  symbolName?: string;
  targetUri?: string;
  newName?: string;
}

function offsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i += 1) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < text.length; cursor += 1) {
    const ch = text[cursor];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return cursor;
  }
  return text.length;
}

function headerEndForDeclaration(text: string, start: number, end: number): number {
  const slice = text.slice(start, end);
  const brace = slice.indexOf('{');
  if (brace >= 0) return start + brace;
  const semi = slice.indexOf(';');
  if (semi >= 0) return start + semi;
  const newline = slice.indexOf('\n');
  return newline >= 0 ? start + newline : end;
}

type SupportedTopLevelDecl = LuminaFnDecl | LuminaStructDecl | LuminaEnumDecl | LuminaTypeDecl;

function isSupportedTopLevelDecl(stmt: LuminaStatement): stmt is SupportedTopLevelDecl {
  return stmt.type === 'FnDecl' || stmt.type === 'StructDecl' || stmt.type === 'EnumDecl' || stmt.type === 'TypeDecl';
}

function declInfoFromAst(stmt: SupportedTopLevelDecl, text: string): DeclInfo | null {
  if (!stmt.location) return null;
  const start = stmt.location.start.offset ?? offsetAt(text, { line: stmt.location.start.line - 1, character: stmt.location.start.column - 1 });
  const end = stmt.location.end.offset ?? offsetAt(text, { line: stmt.location.end.line - 1, character: stmt.location.end.column - 1 });
  const kind =
    stmt.type === 'FnDecl'
      ? 'fn'
      : stmt.type === 'StructDecl'
        ? 'struct'
        : stmt.type === 'EnumDecl'
          ? 'enum'
          : 'type';
  return {
    name: stmt.name,
    kind,
    public: stmt.visibility === 'public',
    start,
    headerEnd: headerEndForDeclaration(text, start, end),
    end,
    text: textOfNode(stmt, text).trimEnd(),
  };
}

function findTopLevelDeclarationAtPosition(text: string, position: Position, program?: LuminaProgram): DeclInfo | null {
  const stmt = program ? findTopLevelDeclAtPosition(program, position) : null;
  if (stmt && isSupportedTopLevelDecl(stmt)) {
    return declInfoFromAst(stmt, text);
  }

  const offset = offsetAt(text, position);
  const regex = /^(pub\s+)?(?:(async)\s+)?(fn|struct|enum|type|const)\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const kind = match[3] as DeclInfo['kind'];
    const name = match[4];
    const start = match.index;
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (kind === 'fn' || kind === 'struct' || kind === 'enum') {
      const openBrace = text.indexOf('{', start);
      if (openBrace < 0) continue;
      end = findMatchingBrace(text, openBrace) + 1;
      const headerEnd = openBrace;
      while (end < text.length && text[end] === '\n') end += 1;
      if (offset < start || offset > end) continue;
      return {
        name,
        kind,
        public: Boolean(match[1]),
        start,
        headerEnd,
        end,
        text: text.slice(start, end).trimEnd(),
      };
    }
    const semi = text.indexOf(';', start);
    if (semi > start) end = semi + 1;
    const headerEnd = end;
    while (end < text.length && text[end] === '\n') end += 1;
    if (offset < start || offset > end) continue;
    return {
      name,
      kind,
      public: Boolean(match[1]),
      start,
      headerEnd,
      end,
      text: text.slice(start, end).trimEnd(),
    };
  }
  return null;
}

function normalizeRelativeSpecifier(fromUri: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const fromPath = fileURLToPath(fromUri);
  const resolved = path.resolve(path.dirname(fromPath), spec);
  return pathToFileURL(resolved).toString();
}

function moduleSpecifier(fromUri: string, toUri: string): string {
  const fromPath = fileURLToPath(fromUri);
  const toPath = fileURLToPath(toUri);
  let rel = path.relative(path.dirname(fromPath), toPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function findImportLines(text: string): Array<{ lineIndex: number; line: string }> {
  return text.split(/\r?\n/).map((line, lineIndex) => ({ lineIndex, line }));
}

function resolveImportSource(importerUri: string, source: string): string | null {
  return normalizeRelativeSpecifier(importerUri, source);
}

function rewriteDeclarationName(text: string, oldName: string, newName: string): string {
  if (oldName === newName) return text;
  return text.replace(new RegExp(`\\b${oldName}\\b`), newName);
}

function formatImportedName(exportedName: string, localName: string): string {
  return exportedName === localName ? exportedName : `${exportedName} as ${localName}`;
}

function detectSimpleCycle(allFiles: Map<string, string>, sourceUri: string, targetUri: string): boolean {
  const sourceText = allFiles.get(sourceUri) ?? '';
  const targetText = allFiles.get(targetUri) ?? '';
  const sourceToTarget = moduleSpecifier(sourceUri, targetUri);
  const targetToSource = moduleSpecifier(targetUri, sourceUri);
  return sourceText.includes(`from "${sourceToTarget}"`) || targetText.includes(`from "${targetToSource}"`);
}

function importBindingLabel(binding: string | LuminaImportSpec): string {
  if (typeof binding === 'string') return binding;
  const local = binding.alias ?? binding.name;
  return binding.name === local ? local : `${binding.name} as ${local}`;
}

function importBindingLocal(binding: string | LuminaImportSpec): string {
  if (typeof binding === 'string') return binding;
  return binding.alias ?? binding.name;
}

function renderImportStatement(specs: Array<string | LuminaImportSpec>, source: string): string {
  const rendered = specs.map(importBindingLabel).join(', ');
  return `import { ${rendered} } from "${source}";`;
}

function updateImportEditsAst(
  edit: WorkspaceEdit,
  importerUri: string,
  importerText: string,
  sourceUri: string,
  targetUri: string,
  symbolName: string,
  movedName: string,
  program: LuminaProgram
): boolean {
  const sourceSpecifier = moduleSpecifier(importerUri, sourceUri);
  const targetSpecifier = moduleSpecifier(importerUri, targetUri);
  const imports = findImportDeclarations(program);
  let addedTargetImport = false;
  let changed = false;
  const importedName = formatImportedName(movedName, symbolName);
  const targetImport = imports.find((item) => item.source.value === targetSpecifier);

  for (const imp of imports) {
    const resolved = resolveImportSource(importerUri, imp.source.value);
    if (resolved === targetUri && Array.isArray(imp.spec)) {
      const existing = imp.spec.map(importBindingLabel);
      if (existing.includes(importedName)) addedTargetImport = true;
    }
    if (resolved !== sourceUri) continue;
    if (!Array.isArray(imp.spec)) continue;
    const nextSpecs = imp.spec.filter((item) => importBindingLocal(item) !== symbolName);
    if (nextSpecs.length === imp.spec.length) continue;
    changed = true;
    addEdit(edit, importerUri, rangeOfNode(imp, importerText), nextSpecs.length > 0 ? renderImportStatement(nextSpecs, sourceSpecifier) : '');
    if (!addedTargetImport) {
      if (targetImport && Array.isArray(targetImport.spec)) {
        const nextTarget = [...targetImport.spec];
        if (!nextTarget.map(importBindingLabel).includes(importedName)) {
          nextTarget.push(movedName === symbolName ? movedName : { name: movedName, alias: symbolName });
          addEdit(
            edit,
            importerUri,
            rangeOfNode(targetImport, importerText),
            renderImportStatement(nextTarget, targetSpecifier)
          );
        }
      } else {
        addEdit(
          edit,
          importerUri,
          { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          `import { ${importedName} } from "${targetSpecifier}";\n`
        );
      }
      addedTargetImport = true;
    }
  }
  return changed;
}

function updateImportEditsFallback(
  edit: WorkspaceEdit,
  importerUri: string,
  importerText: string,
  sourceUri: string,
  targetUri: string,
  symbolName: string,
  movedName: string
) {
  const lines = findImportLines(importerText);
  const sourceSpecifier = moduleSpecifier(importerUri, sourceUri);
  const targetSpecifier = moduleSpecifier(importerUri, targetUri);
  let addedTargetImport = false;
  const importedName = formatImportedName(movedName, symbolName);

  for (const { lineIndex, line } of lines) {
    const match = /^\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+"([^"]+)";\s*$/.exec(line);
    if (!match) continue;
    const resolved = resolveImportSource(importerUri, match[2]);
    if (!resolved) continue;
    if (
      resolved === targetUri &&
      match[1]
        .split(',')
        .map((item) => item.trim())
        .includes(importedName)
    ) {
      addedTargetImport = true;
    }
    if (resolved !== sourceUri) continue;
    const names = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!names.includes(symbolName)) continue;
    const nextNames = names.filter((name) => name !== symbolName);
    if (nextNames.length === 0) {
      addEdit(
        edit,
        importerUri,
        {
          start: { line: lineIndex, character: 0 },
          end: { line: lineIndex + 1, character: 0 },
        },
        ''
      );
    } else {
      addEdit(
        edit,
        importerUri,
        {
          start: { line: lineIndex, character: 0 },
          end: { line: lineIndex, character: line.length },
        },
        `import { ${nextNames.join(', ')} } from "${sourceSpecifier}";`
      );
    }
    if (!addedTargetImport) {
      const existingTarget = lines.find(({ line: candidate }) =>
        new RegExp(`^\\s*import\\s+\\{\\s*([^}]+)\\s*\\}\\s+from\\s+"${targetSpecifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(
          candidate
        )
      );
      if (existingTarget) {
        const existingMatch = /^\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+"([^"]+)";\s*$/.exec(existingTarget.line);
        const existingNames = existingMatch?.[1]
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean) ?? [];
        if (!existingNames.includes(importedName)) {
          addEdit(
            edit,
            importerUri,
            {
              start: { line: existingTarget.lineIndex, character: 0 },
              end: { line: existingTarget.lineIndex, character: existingTarget.line.length },
            },
            `import { ${[...existingNames, importedName].join(', ')} } from "${targetSpecifier}";`
          );
        }
      } else {
        addEdit(
          edit,
          importerUri,
          { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          `import { ${importedName} } from "${targetSpecifier}";\n`
        );
      }
      addedTargetImport = true;
    }
  }
}

export function buildMoveSymbolCodeAction(
  text: string,
  uri: string,
  range: Range,
  program?: LuminaProgram
): CodeAction | null {
  const decl = findTopLevelDeclarationAtPosition(text, range.start, program);
  if (!decl) return null;
  const offset = offsetAt(text, range.start);
  if (offset > decl.headerEnd) return null;
  return {
    title: `Move symbol '${decl.name}'`,
    kind: 'refactor.move',
    command: {
      title: `Move symbol '${decl.name}'`,
      command: 'lumina.moveSymbol',
      arguments: [{ uri, position: range.start, symbol: decl.name }],
    },
  };
}

export function applyMoveSymbol(request: MoveSymbolRequest): MoveSymbolResult {
  if (!request.targetUri) return { ok: false, error: 'Target file is required.' };
  if (request.uri === request.targetUri) return { ok: false, error: 'Target file must differ from the source file.' };
  if (isDependencyUri(request.uri) || isDependencyUri(request.targetUri)) {
    return { ok: false, error: 'Cannot move symbols across package boundaries.' };
  }
  const allFiles = new Map(request.allFiles);
  if (!allFiles.has(request.uri)) allFiles.set(request.uri, request.text);
  if (!allFiles.has(request.targetUri)) {
    return { ok: false, error: 'Target file is not available in the current workspace.' };
  }
  if (detectSimpleCycle(allFiles, request.uri, request.targetUri)) {
    return { ok: false, error: 'MODULE-CYCLE-001: moving this symbol would introduce a module cycle.' };
  }
  const decl = findTopLevelDeclarationAtPosition(
    request.text,
    request.position,
    request.allPrograms?.get(request.uri)
  );
  if (!decl) return { ok: false, error: 'Only top-level symbols can be moved.' };
  const movedName = request.newName?.trim() || decl.name;

  const targetText = allFiles.get(request.targetUri) ?? '';
  if (
    new RegExp(`^(?:pub\\s+)?(?:async\\s+)?(?:fn|struct|enum|type|const)\\s+${movedName}\\b`, 'm').test(targetText)
  ) {
    return { ok: false, error: `Target file already defines '${movedName}'.` };
  }

  const edit: WorkspaceEdit = { changes: {} };
  addEdit(
    edit,
    request.uri,
    {
      start: positionAt(request.text, decl.start),
      end: positionAt(request.text, decl.end),
    },
    ''
  );

  const insertionText = `${targetText.endsWith('\n') || targetText.length === 0 ? '' : '\n'}${rewriteDeclarationName(decl.text, decl.name, movedName)}\n`;
  addEdit(
    edit,
    request.targetUri,
    {
      start: positionAt(targetText, targetText.length),
      end: positionAt(targetText, targetText.length),
    },
    insertionText
  );

  for (const [uri, text] of allFiles.entries()) {
    if (uri === request.uri || uri === request.targetUri || isDependencyUri(uri)) continue;
    const program = request.allPrograms?.get(uri);
    if (program) {
      updateImportEditsAst(edit, uri, text, request.uri, request.targetUri, decl.name, movedName, program);
      continue;
    }
    updateImportEditsFallback(edit, uri, text, request.uri, request.targetUri, decl.name, movedName);
  }

  sortWorkspaceEdits(edit);
  return {
    ok: true,
    edit,
    symbolName: decl.name,
    targetUri: request.targetUri,
    newName: movedName,
  };
}
