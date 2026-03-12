import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';
import { offsetAt } from './ast-utils.js';


function snippetFor(text: string, range: Range): string {
  return text.slice(offsetAt(text, range.start), offsetAt(text, range.end)).trim();
}

export function buildIfLetToMatchCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const snippet = snippetFor(text, range);
  const match = /^if\s+let\s+([\s\S]+?)\s*=\s*([\s\S]+?)\s*\{\s*([\s\S]*?)\s*\}\s*else\s*\{\s*([\s\S]*?)\s*\}$/.exec(snippet);
  if (!match) return null;
  const replacement = `match ${match[2].trim()} {\n  ${match[1].trim()} => { ${match[3].trim()} },\n  _ => { ${match[4].trim()} }\n}`;
  return {
    title: 'Convert if let to match',
    kind: CodeActionKind.RefactorRewrite,
    edit: { changes: { [uri]: [TextEdit.replace(range, replacement)] } },
  };
}

export function buildMatchToIfLetCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const snippet = snippetFor(text, range);
  const arrowCount = (snippet.match(/=>/g) ?? []).length;
  if (arrowCount !== 2) return null;
  const match = /^match\s+([\s\S]+?)\s*\{\s*([^,]+?)\s*=>\s*\{\s*([\s\S]*?)\s*\}\s*,\s*_\s*=>\s*\{\s*([\s\S]*?)\s*\}\s*\}$/.exec(snippet);
  if (!match) return null;
  const replacement = `if let ${match[2].trim()} = ${match[1].trim()} { ${match[3].trim()} } else { ${match[4].trim()} }`;
  return {
    title: 'Convert match to if let',
    kind: CodeActionKind.RefactorRewrite,
    edit: { changes: { [uri]: [TextEdit.replace(range, replacement)] } },
  };
}


