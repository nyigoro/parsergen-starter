import moo from 'moo';

export interface Token {
  type: string;
  value: string;
  text: string;
  offset: number;
  lineBreaks: number;
  line: number;
  col: number;
}

export interface LexerConfig {
  [key: string]: moo.Rules | moo.Rule | RegExp | string;
}

export interface LexerState {
  [key: string]: LexerConfig;
}

/**
 * Create a lexer using Moo
 */
export function createLexer(config: LexerConfig): moo.Lexer {
  try {
    return moo.compile(config);
  } catch (error: any) {
    throw new Error(`Lexer compilation failed: ${error.message}`);
  }
}

/**
 * Create a stateful lexer with multiple states
 */
export function createStatefulLexer(states: LexerState): moo.Lexer {
  try {
    return moo.states(states);
  } catch (error: any) {
    throw new Error(`Stateful lexer compilation failed: ${error.message}`);
  }
}

/**
 * Tokenize input string
 */
export function tokenize(lexer: moo.Lexer, input: string): Token[] {
  const tokens: Token[] = [];
  lexer.reset(input);
  
  let token;
  while ((token = lexer.next()) !== undefined) {
    tokens.push({
      type: token.type || 'unknown',
      value: token.value,
      text: token.text,
      offset: token.offset,
      lineBreaks: token.lineBreaks,
      line: token.line,
      col: token.col
    });
  }
  
  return tokens;
}

/**
 * Create a lexer for common programming language tokens
 */
export function createProgrammingLexer(): moo.Lexer {
  return createLexer({
    // Whitespace and comments
    whitespace: /[ \t]+/,
    newline: { match: /\n/, lineBreaks: true },
    comment: /\/\/.*?$/,
    multiComment: { match: /\/\*[\s\S]*?\*\//, lineBreaks: true },
    
    // Literals
    number: /\d+(?:\.\d+)?/,
    string: /"(?:[^"\\]|\\.)*"/,
    char: /'(?:[^'\\]|\\.)*'/,
    
    // Identifiers and keywords
    identifier: {
      match: /[a-zA-Z_][a-zA-Z0-9_]*/,
      type: moo.keywords({
        keyword: ['if', 'else', 'while', 'for', 'function', 'return', 'var', 'let', 'const']
      })
    },
    
    // Operators
    assign: '=',
    equals: '==',
    notEquals: '!=',
    lessEquals: '<=',
    greaterEquals: '>=',
    less: '<',
    greater: '>',
    plus: '+',
    minus: '-',
    multiply: '*',
    divide: '/',
    modulo: '%',
    and: '&&',
    or: '||',
    not: '!',
    
    // Punctuation
    semicolon: ';',
    comma: ',',
    dot: '.',
    leftParen: '(',
    rightParen: ')',
    leftBrace: '{',
    rightBrace: '}',
    leftBracket: '[',
    rightBracket: ']',
  });
}

/**
 * Create a lexer for mathematical expressions
 */
export function createMathLexer(): moo.Lexer {
  return createLexer({
    whitespace: /[ \t]+/,
    newline: { match: /\n/, lineBreaks: true },
    number: /\d+(?:\.\d+)?/,
    identifier: /[a-zA-Z_][a-zA-Z0-9_]*/,
    
    // Math operators
    plus: '+',
    minus: '-',
    multiply: '*',
    divide: '/',
    power: '^',
    modulo: '%',
    
    // Parentheses
    leftParen: '(',
    rightParen: ')',
    
    // Functions
    function: {
      match: /(?:sin|cos|tan|log|exp|sqrt|abs|floor|ceil|round)/,
      type: 'function'
    }
  });
}

/**
 * Create a lexer for JSON
 */
export function createJSONLexer(): moo.Lexer {
  return createLexer({
    whitespace: /[ \t\n\r]+/,
    string: /"(?:[^"\\]|\\.)*"/,
    number: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    true: 'true',
    false: 'false',
    null: 'null',
    leftBrace: '{',
    rightBrace: '}',
    leftBracket: '[',
    rightBracket: ']',
    comma: ',',
    colon: ':',
  });
}

/**
 * Lexer utilities
 */
export class LexerUtils {
  /**
   * Filter tokens by type
   */
  static filterTokens(tokens: Token[], types: string[]): Token[] {
    return tokens.filter(token => types.includes(token.type));
  }
  
  /**
   * Remove whitespace tokens
   */
  static removeWhitespace(tokens: Token[]): Token[] {
    return tokens.filter(token => 
      !['whitespace', 'newline', 'comment', 'multiComment'].includes(token.type)
    );
  }
  
  /**
   * Get tokens by line
   */
  static getTokensByLine(tokens: Token[], line: number): Token[] {
    return tokens.filter(token => token.line === line);
  }
  
  /**
   * Get token at position
   */
  static getTokenAtPosition(tokens: Token[], line: number, col: number): Token | null {
    for (const token of tokens) {
      if (token.line === line && col >= token.col && col < token.col + token.text.length) {
        return token;
      }
    }
    return null;
  }
  
  /**
   * Convert tokens back to string
   */
  static tokensToString(tokens: Token[]): string {
    return tokens.map(token => token.text).join('');
  }
}

/**
 * Lexer error class
 */
export class LexerError extends Error {
  public line: number;
  public col: number;
  public offset: number;
  
  constructor(message: string, line: number, col: number, offset: number) {
    super(message);
    this.name = 'LexerError';
    this.line = line;
    this.col = col;
    this.offset = offset;
  }
}

/**
 * Safe tokenization with error handling
 */
export function safeTokenize(lexer: moo.Lexer, input: string): { tokens: Token[]; error?: LexerError } {
  try {
    const tokens = tokenize(lexer, input);
    return { tokens };
  } catch (error: any) {
    const lexerError = new LexerError(
      error.message,
      error.line || 1,
      error.col || 1,
      error.offset || 0
    );
    return { tokens: [], error: lexerError };
  }
}