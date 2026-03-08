import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

function getOffsetAt(text: string, pos: { line: number; character: number }): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function negateCondition(condition: string): string {
  const trimmed = condition.trim();
  if (trimmed.startsWith('!')) return trimmed.slice(1).trim();
  if (trimmed.includes('==')) return trimmed.replace('==', '!=');
  if (trimmed.includes('!=')) return trimmed.replace('!=', '==');
  return `!${trimmed}`;
}

export function buildFlipIfElseCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const snippet = text.slice(getOffsetAt(text, range.start), getOffsetAt(text, range.end)).trim();
  const match = /^if\s+([\s\S]+?)\s*\{\s*([\s\S]*?)\s*\}\s*else\s*\{\s*([\s\S]*?)\s*\}$/.exec(snippet);
  if (!match) return null;
  const condition = negateCondition(match[1]);
  const thenBody = match[2].trim();
  const elseBody = match[3].trim();
  const replacement = `if ${condition} { ${elseBody} } else { ${thenBody} }`;
  return {
    title: 'Flip if/else branches',
    kind: CodeActionKind.RefactorRewrite,
    edit: { changes: { [uri]: [TextEdit.replace(range, replacement)] } },
  };
}
