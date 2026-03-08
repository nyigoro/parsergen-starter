import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

function getOffsetAt(text: string, pos: { line: number; character: number }): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function findUniqueVarName(text: string, base: string = 'extracted'): string {
  if (!new RegExp(`\\b${base}\\b`).test(text)) return base;
  let index = 1;
  while (new RegExp(`\\b${base}${index}\\b`).test(text)) index += 1;
  return `${base}${index}`;
}

function isNonTrivialExpression(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return false;
  if (/^\s*(let|fn|struct|enum|type|trait|impl|import|return)\b/.test(trimmed)) return false;
  if (/[;{}]/.test(trimmed)) return false;
  return true;
}

export function buildExtractVariableCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const start = getOffsetAt(text, range.start);
  const end = getOffsetAt(text, range.end);
  if (end <= start) return null;
  const selectedRaw = text.slice(start, end);
  const selected = selectedRaw.trim();
  if (!isNonTrivialExpression(selected)) return null;

  const lines = text.split(/\r?\n/);
  const lineText = lines[range.start.line] ?? '';
  const indent = (/^\s*/.exec(lineText)?.[0]) ?? '';
  const varName = findUniqueVarName(text, 'extracted');
  const declaration = `${indent}let ${varName} = ${selected};\n`;

  return {
    title: `Extract to local '${varName}'`,
    kind: CodeActionKind.RefactorExtract,
    edit: {
      changes: {
        [uri]: [
          TextEdit.insert({ line: range.start.line, character: 0 }, declaration),
          TextEdit.replace(range, varName),
        ],
      },
    },
  };
}
