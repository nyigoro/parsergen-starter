import {
  CodeAction,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { addEdit, isDependencyUri, sortWorkspaceEdits } from './rename.js';

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
}

export interface MoveSymbolResult {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
}

function getOffsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function positionAt(text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < text.length; cursor++) {
    const ch = text[cursor];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return cursor;
  }
  return text.length;
}

function findTopLevelDeclarationAtPosition(text: string, position: Position): DeclInfo | null {
  const offset = getOffsetAt(text, position);
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
    } else {
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

function detectSimpleCycle(allFiles: Map<string, string>, sourceUri: string, targetUri: string): boolean {
  const sourceText = allFiles.get(sourceUri) ?? '';
  const targetText = allFiles.get(targetUri) ?? '';
  const sourceToTarget = moduleSpecifier(sourceUri, targetUri);
  const targetToSource = moduleSpecifier(targetUri, sourceUri);
  return sourceText.includes(`from "${sourceToTarget}"`) || targetText.includes(`from "${targetToSource}"`);
}

function updateImportEdits(
  edit: WorkspaceEdit,
  importerUri: string,
  importerText: string,
  sourceUri: string,
  targetUri: string,
  symbolName: string
) {
  const lines = findImportLines(importerText);
  const sourceSpecifier = moduleSpecifier(importerUri, sourceUri);
  const targetSpecifier = moduleSpecifier(importerUri, targetUri);
  let addedTargetImport = false;

  for (const { lineIndex, line } of lines) {
    const match = /^\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+"([^"]+)";\s*$/.exec(line);
    if (!match) continue;
    const resolved = resolveImportSource(importerUri, match[2]);
    if (!resolved) continue;
    if (resolved === targetUri && match[1].split(',').map((item) => item.trim()).includes(symbolName)) {
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
        if (!existingNames.includes(symbolName)) {
          addEdit(
            edit,
            importerUri,
            {
              start: { line: existingTarget.lineIndex, character: 0 },
              end: { line: existingTarget.lineIndex, character: existingTarget.line.length },
            },
            `import { ${[...existingNames, symbolName].join(', ')} } from "${targetSpecifier}";`
          );
        }
      } else {
        addEdit(edit, importerUri, { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, `import { ${symbolName} } from "${targetSpecifier}";\n`);
      }
      addedTargetImport = true;
    }
  }
}

export function buildMoveSymbolCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const decl = findTopLevelDeclarationAtPosition(text, range.start);
  if (!decl) return null;
  const offset = getOffsetAt(text, range.start);
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
  const decl = findTopLevelDeclarationAtPosition(request.text, request.position);
  if (!decl) return { ok: false, error: 'Only top-level symbols can be moved.' };

  const targetText = allFiles.get(request.targetUri) ?? '';
  if (new RegExp(`^(?:pub\\s+)?(?:async\\s+)?(?:fn|struct|enum|type|const)\\s+${decl.name}\\b`, 'm').test(targetText)) {
    return { ok: false, error: `Target file already defines '${decl.name}'.` };
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

  const insertionText = `${targetText.endsWith('\n') || targetText.length === 0 ? '' : '\n'}${decl.text}\n`;
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
    updateImportEdits(edit, uri, text, request.uri, request.targetUri, decl.name);
  }

  sortWorkspaceEdits(edit);
  return { ok: true, edit };
}
