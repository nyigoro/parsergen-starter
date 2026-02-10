import moo from 'moo';

export type LuminaToken = moo.Token & { type: string };

export const luminaSyncTokenTypes = ['semicolon', 'rbrace'];

export function createLuminaLexer() {
  return moo.compile({
    ws: { match: /[ \t]+/, lineBreaks: false },
    comment: { match: /\/\/.*?$/, lineBreaks: false },
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
      'import', 'from', 'type', 'fn', 'let', 'return',
      'if', 'else', 'for', 'while', 'true', 'false',
    ],
    string: [
      { match: /"(?:\\.|[^"\\])*"/, lineBreaks: false },
      { match: /'(?:\\.|[^'\\])*'/, lineBreaks: false },
    ],
    number: /0|[1-9][0-9]*/,
    identifier: /[A-Za-z_][A-Za-z0-9_]*/,
  });
}
