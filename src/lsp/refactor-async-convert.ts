import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

function findFunctionLine(text: string, lineNumber: number): { line: string; lineNumber: number } | null {
  const lines = text.split(/\r?\n/);
  for (let line = lineNumber; line >= 0; line--) {
    const value = lines[line] ?? '';
    if (/^\s*(?:pub\s+)?(?:async\s+)?fn\b/.test(value)) {
      return { line: value, lineNumber: line };
    }
  }
  return null;
}

export function buildConvertToAsyncCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const fnLine = findFunctionLine(text, range.start.line);
  if (!fnLine) return null;
  if (/\basync\s+fn\b/.test(fnLine.line)) return null;

  let rewritten = fnLine.line.replace(/^(\s*)(pub\s+)?fn\b/, '$1$2async fn');
  const returnMatch = /->\s*([^ {]+(?:<[^>]+>)?)/.exec(rewritten);
  if (returnMatch && !/^Promise\s*</.test(returnMatch[1].trim())) {
    rewritten = rewritten.replace(/->\s*([^ {]+(?:<[^>]+>)?)/, (_m, typeName) => `-> Promise<${typeName.trim()}>`);
  }

  return {
    title: 'Convert function to async',
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [
          TextEdit.replace(
            {
              start: { line: fnLine.lineNumber, character: 0 },
              end: { line: fnLine.lineNumber, character: fnLine.line.length },
            },
            rewritten
          ),
        ],
      },
    },
  };
}
