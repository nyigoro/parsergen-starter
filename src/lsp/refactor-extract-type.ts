import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

function getOffsetAt(text: string, pos: { line: number; character: number }): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function positionAt(text: string, offset: number): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

function findInsertLine(text: string): number {
  const lines = text.split(/\r?\n/);
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) insertLine = i + 1;
  }
  return insertLine;
}

function findUniqueAliasName(text: string, base: string = 'ExtractedType'): string {
  if (!new RegExp(`\\b${base}\\b`).test(text)) return base;
  let idx = 1;
  while (new RegExp(`\\b${base}${idx}\\b`).test(text)) idx += 1;
  return `${base}${idx}`;
}

function looksLikeTypeExpression(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/[\n;]/.test(trimmed)) return false;
  return /^[A-Za-z0-9_<>,\s+\-*/:|&()]+$/.test(trimmed);
}

function hasLikelyFreeTypeVariables(value: string): boolean {
  // Conservative v1 rule: single-letter uppercase vars likely require local generic scope.
  const tokens = value.match(/\b[A-Z]\b/g) ?? [];
  return tokens.length > 0;
}

export function buildExtractTypeAliasCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const start = getOffsetAt(text, range.start);
  const end = getOffsetAt(text, range.end);
  if (end <= start) return null;
  const selectedRaw = text.slice(start, end);
  const selected = selectedRaw.trim();
  if (!looksLikeTypeExpression(selected)) return null;
  if (hasLikelyFreeTypeVariables(selected)) return null;

  const aliasName = findUniqueAliasName(text);
  const insertLine = findInsertLine(text);
  const aliasDecl = `type ${aliasName} = ${selected};\n`;

  const edits: TextEdit[] = [];
  edits.push(TextEdit.insert({ line: insertLine, character: 0 }, aliasDecl));

  const escaped = selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(escaped, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    edits.push(
      TextEdit.replace(
        {
          start: positionAt(text, match.index),
          end: positionAt(text, match.index + match[0].length),
        },
        aliasName
      )
    );
  }

  return {
    title: `Extract type alias '${aliasName}'`,
    kind: CodeActionKind.RefactorExtract,
    edit: { changes: { [uri]: edits } },
  };
}
