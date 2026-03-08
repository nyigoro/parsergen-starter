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

function findFunctionHeader(text: string, offset: number): { start: number; openBrace: number; end: number; header: string } | null {
  const matches = Array.from(text.matchAll(/^\s*(?:pub\s+)?(?:async\s+)?fn\b.*$/gm)).filter(
    (match) => (match.index ?? -1) <= offset
  );
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index ?? -1;
    if (start < 0) continue;
    const header = match[0];
    const openBrace = text.indexOf('{', start);
    if (openBrace < 0) continue;
    let depth = 0;
    for (let cursor = openBrace; cursor < text.length; cursor++) {
      if (text[cursor] === '{') depth += 1;
      if (text[cursor] === '}') depth -= 1;
      if (depth === 0) {
        if (offset >= start && offset <= cursor) {
          return { start, openBrace, end: cursor, header };
        }
        break;
      }
    }
  }
  return null;
}

export function buildWrapReturnResultCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const fn = findFunctionHeader(text, getOffsetAt(text, range.start));
  if (!fn) return null;
  const typeMatch = /->\s*([^ {]+(?:<[^>]+>)?)/.exec(fn.header);
  if (!typeMatch) return null;
  const currentType = typeMatch[1].trim();
  if (/^Result\s*</.test(currentType)) return null;

  const edits: TextEdit[] = [];
  const headerReplacement = fn.header.replace(/->\s*([^ {]+(?:<[^>]+>)?)/, `-> Result<${currentType}, String>`);
  edits.push(
    TextEdit.replace(
      {
        start: positionAt(text, fn.start),
        end: positionAt(text, fn.start + fn.header.length),
      },
      headerReplacement
    )
  );

  const body = text.slice(fn.openBrace + 1, fn.end);
  const returnRegex = /\breturn\s+([^;]+);/g;
  let match: RegExpExecArray | null;
  let sawReturn = false;
  while ((match = returnRegex.exec(body)) !== null) {
    sawReturn = true;
    const absoluteStart = fn.openBrace + 1 + match.index;
    edits.push(
      TextEdit.replace(
        {
          start: positionAt(text, absoluteStart),
          end: positionAt(text, absoluteStart + match[0].length),
        },
        `return Ok(${match[1].trim()});`
      )
    );
  }

  if (!sawReturn) {
    edits.push(TextEdit.insert(positionAt(text, fn.end), '\n  return Err("".to_string());\n'));
  }

  return {
    title: 'Wrap function return in Result',
    kind: CodeActionKind.RefactorRewrite,
    edit: { changes: { [uri]: edits } },
  };
}
