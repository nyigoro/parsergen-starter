import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

const KEYWORDS = new Set([
  'fn',
  'let',
  'mut',
  'return',
  'if',
  'else',
  'match',
  'for',
  'while',
  'in',
  'true',
  'false',
  'struct',
  'enum',
  'trait',
  'impl',
  'type',
  'async',
  'await',
]);

function getOffsetAt(text: string, pos: { line: number; character: number }): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function findUniqueFnName(text: string, base: string = 'extracted'): string {
  if (!new RegExp(`\\b${base}\\b`).test(text)) return base;
  let index = 1;
  while (new RegExp(`\\b${base}${index}\\b`).test(text)) index += 1;
  return `${base}${index}`;
}

function collectIdentifiers(text: string): string[] {
  const ids = text.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
  return ids.filter((id) => !KEYWORDS.has(id));
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function findEnclosingFunction(text: string, offset: number): { start: number; line: number; signature: string } | null {
  const upto = text.slice(0, offset);
  const lines = upto.split(/\r?\n/);
  for (let line = lines.length - 1; line >= 0; line--) {
    const value = lines[line];
    if (/^\s*(?:pub\s+)?(?:async\s+)?fn\b/.test(value)) {
      let charOffset = 0;
      for (let i = 0; i < line; i++) charOffset += lines[i].length + 1;
      return { start: charOffset, line, signature: value };
    }
  }
  return null;
}

function dedentBlock(text: string): string {
  const lines = text.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => (/^\s*/.exec(line)?.[0].length ?? 0));
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(minIndent)).join('\n').trimEnd();
}

function collectAvailableBindings(prefix: string, signature: string): Set<string> {
  const bindings = new Set<string>();
  const params = signature.match(/\((.*)\)/)?.[1] ?? '';
  for (const entry of params.split(',')) {
    const name = entry.split(':')[0]?.trim();
    if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) bindings.add(name);
  }
  const letRegex = /\blet\s+(?:ref\s+)?(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = letRegex.exec(prefix)) !== null) bindings.add(match[1]);
  return bindings;
}

export function buildExtractFunctionCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const start = getOffsetAt(text, range.start);
  const end = getOffsetAt(text, range.end);
  if (end <= start) return null;
  const selected = text.slice(start, end);
  if (!selected.trim()) return null;

  const fnContext = findEnclosingFunction(text, start);
  if (!fnContext) return null;
  const functionPrefix = text.slice(fnContext.start, start);
  const availableBindings = collectAvailableBindings(functionPrefix, fnContext.signature);
  const selectionIds = uniquePreservingOrder(collectIdentifiers(selected));
  const localDecls = new Set(Array.from(selected.matchAll(/\blet\s+(?:ref\s+)?(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)/g)).map((m) => m[1]));
  const params = selectionIds.filter((id) => availableBindings.has(id) && !localDecls.has(id));
  const returnCandidate = Array.from(localDecls).find((name) => new RegExp(`\\b${name}\\b`).test(text.slice(end)));
  const fnName = findUniqueFnName(text, 'extracted');
  const body = dedentBlock(selected);
  const returnSuffix = returnCandidate && !/\breturn\b/.test(body) ? `\n  return ${returnCandidate};` : '';
  const fnDecl =
    `fn ${fnName}(${params.map((name) => `${name}: _`).join(', ')})${returnCandidate ? ' -> _' : ''} {\n` +
    `${body
      .split('\n')
      .map((line) => (line.trim().length > 0 ? `  ${line}` : line))
      .join('\n')}${returnSuffix}\n` +
    `}\n\n`;

  const replacementIndent = /^\s*/.exec(text.split(/\r?\n/)[range.start.line] ?? '')?.[0] ?? '';
  const replacement = returnCandidate
    ? `${replacementIndent}let ${returnCandidate} = ${fnName}(${params.join(', ')});`
    : `${replacementIndent}${fnName}(${params.join(', ')});`;

  return {
    title: `Extract function '${fnName}'`,
    kind: CodeActionKind.RefactorExtract,
    edit: {
      changes: {
        [uri]: [
          TextEdit.insert({ line: fnContext.line, character: 0 }, fnDecl),
          TextEdit.replace(range, replacement),
        ],
      },
    },
  };
}
