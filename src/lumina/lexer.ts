import moo from 'moo';

export type LuminaToken = moo.Token & { type: string };

export const luminaSyncTokenTypes = ['semicolon', 'rbrace'];

export function createLuminaLexer() {
  return moo.compile({
    ws: { match: /[ \t]+/, lineBreaks: false },
    comment: [
      { match: /\/\*\*[\s\S]*?\*\//, lineBreaks: true },
      { match: /\/\*[\s\S]*?\*\//, lineBreaks: true },
      { match: /\/\/.*?$/, lineBreaks: false },
    ],
    newline: { match: /\r?\n/, lineBreaks: true },
    lbrace: '{',
    rbrace: '}',
    lparen: '(',
    rparen: ')',
    lbracket: '[',
    rbracket: ']',
    comma: ',',
    semicolon: ';',
    colon: ':',
    arrow: '->',
    dot: '.',
    op: ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '=', '<', '>'],
    keyword: [
      'import', 'from', 'type', 'struct', 'enum', 'fn', 'let', 'return',
      'if', 'else', 'for', 'while', 'match', 'true', 'false',
      'pub', 'extern',
    ],
    string: [
      { match: /"(?:\\.|[^"\\])*"/, lineBreaks: false },
      { match: /'(?:\\.|[^'\\])*'/, lineBreaks: false },
    ],
    number: [
      { match: /0x[0-9a-fA-F_]+/ },
      { match: /0b[01_]+/ },
      { match: /[0-9][0-9_]*/ },
    ],
    identifier: /[A-Za-z_][A-Za-z0-9_]*/,
  });
}
