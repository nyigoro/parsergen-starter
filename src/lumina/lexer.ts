import moo from 'moo';

export type TokenKind =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'keyword'
  | 'newline'
  | 'whitespace'
  | 'comment'
  | 'punctuation';

export type TokenType =
  | 'ws'
  | 'comment'
  | 'newline'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'semicolon'
  | 'colon'
  | 'arrow'
  | 'dot'
  | 'op'
  | 'keyword'
  | 'string'
  | 'number'
  | 'identifier';

interface BaseToken {
  type: TokenType;
  kind: TokenKind;
  offset: number;
  line: number;
  col: number;
  text: string;
}

export interface NumberToken extends BaseToken {
  kind: 'number';
  value: number;
}

export interface StringToken extends BaseToken {
  kind: 'string';
  value: string;
}

export interface IdentToken extends BaseToken {
  kind: 'identifier';
  name: string;
}

export interface KeywordToken extends BaseToken {
  kind: 'keyword';
  keyword: string;
}

export interface OperatorToken extends BaseToken {
  kind: 'operator';
  op: string;
}

export interface WhitespaceToken extends BaseToken {
  kind: 'whitespace';
}

export interface NewlineToken extends BaseToken {
  kind: 'newline';
}

export interface CommentToken extends BaseToken {
  kind: 'comment';
}

export interface PunctuationToken extends BaseToken {
  kind: 'punctuation';
}

export type LuminaToken =
  | NumberToken
  | StringToken
  | IdentToken
  | KeywordToken
  | OperatorToken
  | WhitespaceToken
  | NewlineToken
  | CommentToken
  | PunctuationToken;

export const luminaSyncTokenTypes: TokenType[] = ['semicolon', 'rbrace'];

type MooToken = moo.Token & { type: TokenType };

export interface LuminaLexer {
  reset(input: string): LuminaLexer;
  [Symbol.iterator](): Iterator<LuminaToken>;
}

export function createLuminaLexer(): LuminaLexer {
  const lexer = moo.compile({
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
      { match: /0x[0-9a-fA-F_]+(?:i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64)?/ },
      { match: /0b[01_]+(?:i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64)?/ },
      { match: /[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?(?:i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64)?/ },
    ],
    identifier: /[A-Za-z_][A-Za-z0-9_]*/,
  });

  let iterator: Iterable<MooToken> | null = null;
  const wrapper: LuminaLexer = {
    reset(input: string) {
      iterator = lexer.reset(input) as Iterable<MooToken>;
      return wrapper;
    },
    [Symbol.iterator]() {
      const source = iterator ?? (lexer.reset('') as Iterable<MooToken>);
      const gen = function* () {
        for (const token of source) {
          yield toLuminaToken(token);
        }
      };
      return gen();
    },
  };
  return wrapper;
}

function toLuminaToken(token: MooToken): LuminaToken {
  const text = token.value ?? '';
  const base = {
    type: token.type,
    kind: kindFromType(token.type),
    offset: token.offset ?? 0,
    line: token.line ?? 1,
    col: token.col ?? 1,
    text,
  };

  switch (token.type) {
    case 'number':
      return { ...base, kind: 'number', value: parseNumber(text) };
    case 'string':
      return { ...base, kind: 'string', value: unescapeString(text) };
    case 'identifier':
      return { ...base, kind: 'identifier', name: text };
    case 'keyword':
      return { ...base, kind: 'keyword', keyword: text };
    case 'op':
      return { ...base, kind: 'operator', op: text };
    case 'ws':
      return { ...base, kind: 'whitespace' };
    case 'newline':
      return { ...base, kind: 'newline' };
    case 'comment':
      return { ...base, kind: 'comment' };
    default:
      return { ...base, kind: 'punctuation' };
  }
}

function kindFromType(type: TokenType): TokenKind {
  if (type === 'number') return 'number';
  if (type === 'string') return 'string';
  if (type === 'identifier') return 'identifier';
  if (type === 'keyword') return 'keyword';
  if (type === 'op') return 'operator';
  if (type === 'ws') return 'whitespace';
  if (type === 'newline') return 'newline';
  if (type === 'comment') return 'comment';
  return 'punctuation';
}

function parseNumber(text: string): number {
  const clean = text.replace(/_/g, '');
  const suffixMatch = clean.match(/^(.*?)(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64)$/);
  const numeric = suffixMatch ? suffixMatch[1] : clean;
  if (numeric.startsWith('0x') || numeric.startsWith('0X')) {
    return Number.parseInt(numeric.slice(2), 16);
  }
  if (numeric.startsWith('0b') || numeric.startsWith('0B')) {
    return Number.parseInt(numeric.slice(2), 2);
  }
  if (numeric.includes('.') || numeric.includes('e') || numeric.includes('E')) {
    return Number.parseFloat(numeric);
  }
  return Number.parseInt(numeric, 10);
}

function unescapeString(text: string): string {
  if (text.length < 2) return text;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) return text;
  const inner = text.slice(1, -1);
  return inner.replace(/\\./g, (match) => {
    switch (match[1]) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '"':
        return '"';
      case "'":
        return "'";
      case '\\':
        return '\\';
      default:
        return match[1];
    }
  });
}
