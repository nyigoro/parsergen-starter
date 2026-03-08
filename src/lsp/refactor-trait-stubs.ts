import { CodeAction, CodeActionKind, TextEdit, type Range } from 'vscode-languageserver/node';

type BlockBounds = { start: number; openBrace: number; end: number };

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

function findBlock(text: string, startPattern: RegExp, offset: number): { header: string; bounds: BlockBounds } | null {
  const matches = Array.from(text.matchAll(startPattern)).filter((match) => (match.index ?? -1) <= offset);
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index ?? -1;
    if (start < 0) continue;
    const openBrace = text.indexOf('{', start);
    if (openBrace < 0 || openBrace > offset + 2000) continue;
    let depth = 0;
    for (let cursor = openBrace; cursor < text.length; cursor++) {
      const ch = text[cursor];
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      if (depth === 0) {
        if (offset >= start && offset <= cursor) {
          return {
            header: text.slice(start, openBrace).trim(),
            bounds: { start, openBrace, end: cursor },
          };
        }
        break;
      }
    }
  }
  return null;
}

function parseTraitMethods(body: string): Array<{ name: string; signature: string }> {
  const methods: Array<{ name: string; signature: string }> = [];
  const regex = /fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:->\s*[^;{]+)?\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    methods.push({ name: match[1], signature: match[0].trim() });
  }
  return methods;
}

export function buildTraitStubsCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const offset = getOffsetAt(text, range.start);
  const implMatch = findBlock(text, /\bimpl\s+[A-Za-z_][A-Za-z0-9_]*\s+for\s+[A-Za-z_][A-Za-z0-9_<>,\s.]*/g, offset);
  if (!implMatch) return null;
  const traitName = /\bimpl\s+([A-Za-z_][A-Za-z0-9_]*)\s+for\b/.exec(implMatch.header)?.[1];
  if (!traitName) return null;

  const traitDeclMatch = new RegExp(`\\btrait\\s+${traitName}\\b`).exec(text);
  if (!traitDeclMatch || traitDeclMatch.index === undefined) return null;
  const traitBlock = findBlock(text, new RegExp(`\\btrait\\s+${traitName}\\b`, 'g'), traitDeclMatch.index);
  if (!traitBlock) return null;

  const traitBody = text.slice(traitBlock.bounds.openBrace + 1, traitBlock.bounds.end);
  const implBody = text.slice(implMatch.bounds.openBrace + 1, implMatch.bounds.end);
  const methods = parseTraitMethods(traitBody);
  const missing = methods.filter((method) => !new RegExp(`\\bfn\\s+${method.name}\\b`).test(implBody));
  if (missing.length === 0) return null;

  const stubIndent = '  ';
  const stubs = missing
    .map(({ signature }) => {
      const header = signature.replace(/;\s*$/, '');
      return `${stubIndent}${header} {\n${stubIndent}  todo!()\n${stubIndent}}\n`;
    })
    .join('\n');

  return {
    title: `Generate missing trait stubs for '${traitName}'`,
    kind: CodeActionKind.RefactorRewrite,
    edit: {
      changes: {
        [uri]: [TextEdit.insert(positionAt(text, implMatch.bounds.end), `\n${stubs}`)],
      },
    },
  };
}
