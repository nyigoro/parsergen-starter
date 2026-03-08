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

function getWordAtRange(text: string, range: Range): string | null {
  const start = getOffsetAt(text, range.start);
  const end = getOffsetAt(text, range.end);
  const selected = text.slice(start, end).trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(selected)) return selected;
  const cursor = start;
  const left = text.slice(0, cursor);
  const right = text.slice(cursor);
  const leftMatch = /[A-Za-z_][A-Za-z0-9_]*$/.exec(left);
  const rightMatch = /^[A-Za-z0-9_]*/.exec(right);
  const word = `${leftMatch?.[0] ?? ''}${rightMatch?.[0] ?? ''}`;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(word) ? word : null;
}

function findUniqueVarName(text: string, base: string): string {
  if (!new RegExp(`\\b${base}\\b`).test(text)) return base;
  let index = 2;
  while (new RegExp(`\\b${base}${index}\\b`).test(text)) index += 1;
  return `${base}${index}`;
}

export function buildSplitVariableCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const name = getWordAtRange(text, range);
  if (!name) return null;
  const cursorOffset = getOffsetAt(text, range.end);

  const plainAssign = new RegExp(`(?<!let\\s)(?<!let\\s+mut\\s)\\b${name}\\s*=`, 'm');
  const plainAssignIndex = text.slice(cursorOffset).search(plainAssign);
  if (plainAssignIndex >= 0) return null;

  const shadow = new RegExp(`\\blet\\s+(?:mut\\s+)?${name}\\b`, 'g');
  let shadowMatch: RegExpExecArray | null = null;
  while ((shadowMatch = shadow.exec(text)) !== null) {
    if (shadowMatch.index > cursorOffset) break;
  }
  if (!shadowMatch || shadowMatch.index <= cursorOffset) return null;

  const newName = findUniqueVarName(text, `${name}2`);
  const renameFrom = shadowMatch.index;
  const refs = new RegExp(`\\b${name}\\b`, 'g');
  const edits: TextEdit[] = [];
  let refMatch: RegExpExecArray | null;
  while ((refMatch = refs.exec(text)) !== null) {
    if (refMatch.index < renameFrom) continue;
    edits.push(
      TextEdit.replace(
        {
          start: positionAt(text, refMatch.index),
          end: positionAt(text, refMatch.index + name.length),
        },
        newName
      )
    );
  }
  if (edits.length === 0) return null;

  return {
    title: `Split variable '${name}'`,
    kind: CodeActionKind.RefactorRewrite,
    edit: { changes: { [uri]: edits } },
  };
}
