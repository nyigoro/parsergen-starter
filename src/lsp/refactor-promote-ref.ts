import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';

function lineTextAt(text: string, lineNumber: number): string {
  return text.split(/\r?\n/)[lineNumber] ?? '';
}

function findLetBinding(line: string): RegExpExecArray | null {
  return new RegExp(
    `^(\\s*)let\\s+(mut\\s+)?(${IDENTIFIER_PATTERN})\\s*=\\s*(${IDENTIFIER_PATTERN}(?:\\.${IDENTIFIER_PATTERN})*)\\s*;\\s*$`
  ).exec(line);
}

export function buildPromoteToRefCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const line = range.start.line;
  const sourceLine = lineTextAt(text, line);
  const match = findLetBinding(sourceLine);
  if (!match) return null;
  const indent = match[1] ?? '';
  const mutable = match[2] ?? '';
  const name = match[3];
  const initializer = match[4];
  const rewritten = `${indent}let ref ${mutable}${name} = ${initializer};`;

  return {
    title: `Promote '${name}' to ref binding`,
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [
          TextEdit.replace(
            {
              start: { line, character: 0 },
              end: { line, character: sourceLine.length },
            },
            rewritten
          ),
        ],
      },
    },
  };
}
