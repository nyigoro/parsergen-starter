import moo from 'moo';

// Core interfaces - completely language agnostic
export interface Token {
  type: string;
  value: string;
  text: string;
  offset: number;
  lineBreaks: number;
  line: number;
  col: number;
  endOffset: number;
  endLine: number;
  endCol: number;
  sourceFile?: string;
  metadata?: Record<string, unknown>;
}

export interface LexerRule {
  pattern: string | RegExp;
  keywords?: Record<string, string[]>;
  lineBreaks?: boolean;
  push?: string;
  pop?: number;
  value?: (text: string) => string;
  transform?: (token: Token) => Token;
}

export interface LexerConfig {
  [tokenType: string]: LexerRule | string | RegExp;
}

export interface LexerState {
  [stateName: string]: LexerConfig;
}

// Preprocessor for macros, includes, etc.
export interface Preprocessor {
  name: string;
  process(input: string, context: PreprocessorContext): string;
}

export interface PreprocessorContext {
  sourceFile?: string;
  includePaths?: string[];
  defines?: Map<string, string>;
}

// Language specification interface
export interface LanguageSpec {
  name: string;
  version?: string;
  states?: LexerState;
  config?: LexerConfig;
  caseSensitive?: boolean;
  ignoreTokens?: string[];
  tokenPrecedence?: string[];
  contextRules?: ContextRule[];
  plugins?: LexerPlugin[];
  preprocessors?: Preprocessor[];
  errorRecovery?: ErrorRecoveryConfig;
}

export interface ContextRule {
  condition: (tokens: Token[], currentIndex: number) => boolean;
  action: 'transform' | 'filter' | 'merge';
  transform?: (token: Token) => Token;
  mergeWith?: 'next' | 'previous';
}

// Plugin System
export interface LexerPlugin {
  name: string;
  version: string;
  beforeTokenize?: (input: string) => string;
  afterTokenize?: (tokens: Token[]) => Token[];
  transformToken?: (token: Token, context: TokenContext) => Token;
  validateSpec?: (spec: LanguageSpec) => boolean;
}

export interface TokenContext {
  previousTokens: Token[];
  nextTokens: Token[];
  currentIndex: number;
  sourceFile?: string;
}

// Error Recovery
export interface ErrorRecoveryConfig {
  strategy: 'skip' | 'insert' | 'replace' | 'none';
  maxAttempts: number;
  syncTokens: string[];
}

// Source location tracking
export interface SourceLocation {
  line: number;
  col: number;
  offset: number;
  endLine: number;
  endCol: number;
  endOffset: number;
  sourceFile?: string;
}

// Enhanced error classes
export class LexerError extends Error {
  public line: number;
  public col: number;
  public offset: number;
  public sourceFile?: string;
  public contextLine?: string;
  public suggestion?: string;

  constructor(message: string, loc: SourceLocation, contextLine?: string, suggestion?: string) {
    super(message);
    this.name = 'LexerError';
    this.line = loc.line;
    this.col = loc.col;
    this.offset = loc.offset;
    this.sourceFile = loc.sourceFile;
    this.contextLine = contextLine;
    this.suggestion = suggestion;
  }

  toString(): string {
    const location = this.sourceFile ? `${this.sourceFile}:${this.line}:${this.col}` : `${this.line}:${this.col}`;
    let output = `${this.name} at ${location}: ${this.message}`;
    
    if (this.contextLine) {
        output += `\n\n  ${this.line} | ${this.contextLine}\n`;
        output += `    | ${' '.repeat(this.col - 1)}^`;
    }
    if (this.suggestion) {
        output += `\n\n  Suggestion: ${this.suggestion}`;
    }
    return output;
  }
}

// Error Recovery Strategy
export class ErrorRecoveryStrategy {
  static skipToNext(tokenStream: TokenStream, expectedTypes: string[]): Token | null {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts && tokenStream.hasNext()) {
      const token = tokenStream.peek();
      if (token && expectedTypes.includes(token.type)) {
        return tokenStream.next();
      }
      tokenStream.next(); // Skip current token
      attempts++;
    }
    return null;
  }

  static insertMissing(tokenType: string, position: SourceLocation): Token {
    return {
      type: tokenType,
      value: '',
      text: '',
      offset: position.offset,
      lineBreaks: 0,
      line: position.line,
      col: position.col,
      endOffset: position.endOffset,
      endLine: position.endLine,
      endCol: position.endCol,
      metadata: { synthetic: true, reason: 'error_recovery' }
    };
  }
}

// Performance Monitoring
export class LexerProfiler {
  private startTime: number = 0;
  private tokenCount: number = 0;
  private errorCount: number = 0;
  
  startProfiling(): void {
    this.startTime = performance.now();
    this.tokenCount = 0;
    this.errorCount = 0;
  }
  
  recordToken(): void {
    this.tokenCount++;
  }
  
  recordError(): void {
    this.errorCount++;
  }
  
  getReport(): ProfileReport {
    const duration = performance.now() - this.startTime;
    return {
      duration,
      tokenCount: this.tokenCount,
      tokensPerSecond: this.tokenCount / (duration / 1000),
      errorCount: this.errorCount,
      errorRate: this.tokenCount > 0 ? this.errorCount / this.tokenCount : 0
    };
  }
}

export interface ProfileReport {
  duration: number;
  tokenCount: number;
  tokensPerSecond: number;
  errorCount: number;
  errorRate: number;
}

// Advanced Pattern Matching
export interface TokenPattern {
  name: string;
  rules: PatternRule[];
}

export interface PatternRule {
  type: 'exact' | 'optional' | 'oneOrMore' | 'zeroOrMore' | 'choice';
  tokenType: string;
  choices?: PatternRule[];
}

export interface PatternMatch {
  tokens: Token[];
  startPosition: number;
  endPosition: number;
}

// Generic token stream with enhanced language-agnostic methods
export class TokenStream {
  private tokens: Token[];
  private position: number = 0;
  private sourceFile?: string;
  private ignoredTypes: Set<string>;
  private bookmarks: Map<string, number> = new Map();
  private profiler?: LexerProfiler;

  constructor(tokens: Token[], sourceFile?: string, ignoredTypes: string[] = [], profiler?: LexerProfiler) {
    this.tokens = tokens;
    this.sourceFile = sourceFile;
    this.ignoredTypes = new Set(ignoredTypes);
    this.profiler = profiler;
  }

  // Navigation methods
  peek(offset: number = 0): Token | null {
    let index = this.position;
    let actualOffset = 0;
    
    while (index < this.tokens.length) {
      const token = this.tokens[index];
      if (!this.ignoredTypes.has(token.type)) {
        if (actualOffset === offset) return token;
        actualOffset++;
      }
      index++;
    }
    return null;
  }

  next(): Token | null {
    while (this.position < this.tokens.length) {
      const token = this.tokens[this.position++];
      if (!this.ignoredTypes.has(token.type)) {
        this.profiler?.recordToken();
        return token;
      }
    }
    return null;
  }

  previous(): Token | null {
    let pos = this.position;
    while (pos > 0) {
      pos--;
      const token = this.tokens[pos];
      if (!this.ignoredTypes.has(token.type)) {
        this.position = pos; // Update position only when a visible token is found
        return token;
      }
    }
    return null;
  }

  hasNext(): boolean {
    let pos = this.position;
    while (pos < this.tokens.length) {
      if (!this.ignoredTypes.has(this.tokens[pos].type)) {
        return true;
      }
      pos++;
    }
    return false;
  }

  // Advanced bookmarking
  bookmark(name: string): void {
    this.bookmarks.set(name, this.position);
  }
  
  restoreBookmark(name: string): boolean {
    const position = this.bookmarks.get(name);
    if (position !== undefined) {
      this.position = position;
      return true;
    }
    return false;
  }

  clearBookmark(name: string): void {
    this.bookmarks.delete(name);
  }

  // Advanced pattern matching with backtracking
  matchPattern(pattern: TokenPattern): PatternMatch | null {
    const startPos = this.position;
    const matches: Token[] = [];
    
    for (const rule of pattern.rules) {
      const result = this.matchRule(rule);
      if (!result) {
        this.position = startPos; // Backtrack
        return null;
      }
      matches.push(...result);
    }
    
    return {
      tokens: matches,
      startPosition: startPos,
      endPosition: this.position
    };
  }
  
  private matchRule(rule: PatternRule): Token[] | null {
    switch (rule.type) {
      case 'exact': {
        const token = this.consumeType(rule.tokenType);
        return token ? [token] : null;
      }
      case 'optional': {
        const optToken = this.consumeType(rule.tokenType);
        return optToken ? [optToken] : [];
      }
      case 'oneOrMore': {
        const matches: Token[] = [];
        let t;
        while ((t = this.consumeType(rule.tokenType))) {
          matches.push(t);
        }
        return matches.length > 0 ? matches : null;
      }
      case 'zeroOrMore': {
        const matches: Token[] = [];
        let t;
        while ((t = this.consumeType(rule.tokenType))) {
          matches.push(t);
        }
        return matches;
      }
      case 'choice': {
        if (rule.choices) {
          for (const choice of rule.choices) {
            const result = this.matchRule(choice);
            if (result) return result;
          }
        }
        return null;
      }
    }
  }

  // Generic pattern matching
  matchTypes(...types: string[]): boolean {
    for (let i = 0; i < types.length; i++) {
      const token = this.peek(i);
      if (!token || token.type !== types[i]) {
        return false;
      }
    }
    return true;
  }

  consumeType(type: string): Token | null {
    if (this.peek()?.type === type) {
      return this.next();
    }
    return null;
  }

  expectType(type: string): Token {
    const token = this.next();
    if (!token || token.type !== type) {
      this.profiler?.recordError();
      const loc = token ?? this.tokens[this.tokens.length - 1];
      const sourceLoc: SourceLocation = {
          line: loc?.line || 0,
          col: loc?.col || 0,
          offset: loc?.offset || 0,
          endLine: loc?.endLine || 0,
          endCol: loc?.endCol || 0,
          endOffset: loc?.endOffset || 0,
          sourceFile: this.sourceFile,
      };
      throw new LexerError(
        `Expected token of type '${type}', got '${token?.type || 'EOF'}'`,
        sourceLoc
      );
    }
    return token;
  }

  // Enhanced error recovery
  recover(expectedTypes: string[]): Token | null {
    return ErrorRecoveryStrategy.skipToNext(this, expectedTypes);
  }

  // Generic utility methods
  getAllTokens(): Token[] { return [...this.tokens]; }
  getVisibleTokens(): Token[] { return this.tokens.filter(token => !this.ignoredTypes.has(token.type)); }
  reset(): void { this.position = 0; this.bookmarks.clear(); }
  getPosition(): number { return this.position; }
  setPosition(pos: number): void { this.position = Math.max(0, Math.min(pos, this.tokens.length)); }
  slice(start: number, end?: number): Token[] { return this.tokens.slice(start, end); }
  
  // Serialization methods
  toJSON(): string {
    return JSON.stringify({
      tokens: this.tokens,
      sourceFile: this.sourceFile,
      ignoredTypes: Array.from(this.ignoredTypes),
    });
  }

  static fromJSON(jsonString: string): TokenStream {
    const data = JSON.parse(jsonString);
    if (!data.tokens || !data.ignoredTypes) {
        throw new Error("Invalid JSON for TokenStream reconstruction.");
    }
    return new TokenStream(data.tokens, data.sourceFile, data.ignoredTypes);
  }
}

// Language Detection
export class LanguageDetector {
  // Omitted for brevity - implementation from your original code
}

// Token Tree for Hierarchical Analysis
export class TokenTree {
  public token: Token;
  public children: TokenTree[] = [];
  public parent?: TokenTree;

  constructor(token: Token, parent?: TokenTree) {
    this.token = token;
    this.parent = parent;
  }
  
  addChild(child: TokenTree): void {
    child.parent = this;
    this.children.push(child);
  }
  
  findByType(type: string): TokenTree[] {
    const results: TokenTree[] = [];
    if (this.token.type === type) {
      results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.findByType(type));
    }
    return results;
  }
  
  getDepth(): number {
    let depth = 0;
    let current: TokenTree | undefined = this.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  toJSON(): object {
    return {
      token: this.token,
      children: this.children.map(child => child.toJSON()),
      depth: this.getDepth()
    };
  }
}

// Universal lexer with all enhancements
export class UniversalLexer {
  private lexer: moo.Lexer;
  private spec: LanguageSpec;
  private sourceFile?: string;
  private profiler: LexerProfiler;
  private plugins: LexerPlugin[];
  private preprocessors: Preprocessor[];

  constructor(spec: LanguageSpec, sourceFile?: string) {
    this.spec = spec;
    this.sourceFile = sourceFile;
    this.profiler = new LexerProfiler();
    this.plugins = spec.plugins || [];
    this.preprocessors = spec.preprocessors || [];
    
    for (const plugin of this.plugins) {
      if (plugin.validateSpec && !plugin.validateSpec(spec)) {
        const loc: SourceLocation = { line: 0, col: 0, offset: 0, endLine: 0, endCol: 0, endOffset: 0, sourceFile };
        throw new LexerError(`Plugin ${plugin.name} validation failed`, loc);
      }
    }
    
    try {
      if (spec.states) {
        const stateRules = this.convertStates(spec.states);
        this.lexer = moo.states(stateRules);
      } else if (spec.config) {
        const configRules = this.convertConfig(spec.config);
        this.lexer = moo.compile(configRules);
      } else {
        throw new Error('Language specification must include either states or config');
      }
    } catch (error: unknown) {
      const loc: SourceLocation = { line: 0, col: 0, offset: 0, endLine: 0, endCol: 0, endOffset: 0, sourceFile };
      throw new LexerError(
        `Lexer compilation failed: ${error instanceof Error ? error.message : String(error)}`,
        loc
      );
    }
  }

  private convertConfig(config: LexerConfig): moo.Rules {
    const rules: moo.Rules = {};
    for (const [tokenType, rule] of Object.entries(config)) {
        if (typeof rule === 'string' || rule instanceof RegExp) {
            rules[tokenType] = this.spec.caseSensitive === false && rule instanceof RegExp
                ? new RegExp(rule.source, rule.flags + (rule.flags.includes('i') ? '' : 'i'))
                : rule;
        } else {
            const mooRule: moo.Rule = { match: rule.pattern };
            if (rule.keywords) mooRule.type = moo.keywords(rule.keywords);
            if (rule.lineBreaks) mooRule.lineBreaks = true;
            if (rule.push) mooRule.push = rule.push;
            if (rule.pop) mooRule.pop = rule.pop;
            if (rule.value) mooRule.value = rule.value;
            rules[tokenType] = mooRule;
        }
    }
    return rules;
  }

  private convertStates(states: LexerState): { [x: string]: moo.Rules } {
    const convertedStates: { [x: string]: moo.Rules } = {};
    for (const [stateName, config] of Object.entries(states)) {
      convertedStates[stateName] = this.convertConfig(config);
    }
    return convertedStates;
  }

  tokenize(input: string): TokenStream {
    this.profiler.startProfiling();
    
    // 1. Preprocessing Stage
    let processedInput = input;
    const preprocessorContext: PreprocessorContext = { sourceFile: this.sourceFile };
    for (const preprocessor of this.preprocessors) {
        processedInput = preprocessor.process(processedInput, preprocessorContext);
    }

    // 2. Plugin "beforeTokenize" Hook
    for (const plugin of this.plugins) {
      processedInput = plugin.beforeTokenize?.(processedInput) ?? processedInput;
    }
    
    // 3. Core Tokenization
    let tokens = this.performTokenization(processedInput);
    
    // 4. Post-processing Stages
    if (this.spec.tokenPrecedence) {
      tokens = this.applyTokenPrecedence(tokens);
    }

    if (this.spec.contextRules) {
      tokens = this.applyContextRules(tokens);
    }
    
    // 5. Plugin "afterTokenize" Hook
    for (const plugin of this.plugins) {
        tokens = plugin.afterTokenize?.(tokens) ?? tokens;
    }
    
    return new TokenStream(tokens, this.sourceFile, this.spec.ignoreTokens, this.profiler);
  }

  async tokenizeAsync(stream: AsyncIterable<string>): Promise<TokenStream> {
    let input = '';
    for await (const chunk of stream) {
        input += chunk;
    }
    return this.tokenize(input);
  }

  private performTokenization(input: string): Token[] {
    const tokens: Token[] = [];
    this.lexer.reset(input);
    
    let mooToken;
    try {
      while ((mooToken = this.lexer.next()) !== undefined) {
        let enhancedToken = this.enhanceToken(mooToken);
        
        // Apply single-token plugin transforms
        for (const plugin of this.plugins) {
            if (plugin.transformToken) {
                enhancedToken = plugin.transformToken(enhancedToken, {
                    previousTokens: tokens,
                    nextTokens: [], // Note: lookahead is harder here
                    currentIndex: tokens.length,
                    sourceFile: this.sourceFile
                });
            }
        }
        
        // Apply rule-specific transforms
        const rule = this.findRule(enhancedToken.type);
        if (rule && typeof rule === 'object' && !(rule instanceof RegExp) && rule.transform) {
            enhancedToken = rule.transform(enhancedToken);
        }
        
        tokens.push(enhancedToken);
      }
    } catch (err: unknown) {
        this.profiler.recordError();
        const error = err as moo.Token; // Moo throws the invalid token
        const contextLine = input.split('\n')[error.line - 1];
        const loc: SourceLocation = { 
            line: error.line, col: error.col, offset: error.offset, 
            endLine: error.line, endCol: error.col, endOffset: error.offset,
            sourceFile: this.sourceFile 
        };
        throw new LexerError(
            `Invalid token: ${error.text}`,
            loc,
            contextLine,
            "Check the tokenization rules for this pattern."
        );
    }
    return tokens;
  }

  private isLexerRule(rule: LexerRule | string | RegExp): rule is LexerRule {
    return typeof rule === 'object' && rule !== null && !(rule instanceof RegExp) && 'pattern' in rule;
  }

  private findRule(tokenType: string): LexerRule | string | RegExp | undefined {
    if (this.spec.config && this.spec.config[tokenType]) {
        return this.spec.config[tokenType];
    }
    if (this.spec.states) {
        for (const state of Object.values(this.spec.states)) {
            if (state[tokenType]) {
                return state[tokenType];
            }
        }
    }
    return undefined;
  }
  
  private enhanceToken(token: moo.Token): Token {
    return {
        type: token.type || 'unknown',
        value: token.value, text: token.text,
        offset: token.offset, lineBreaks: token.lineBreaks || 0,
        line: token.line, col: token.col,
        endOffset: token.offset + token.text.length,
        endLine: token.line + (token.lineBreaks || 0),
        endCol: token.lineBreaks ? token.text.length - token.text.lastIndexOf('\n') - 1 : token.col + token.text.length -1,
        sourceFile: this.sourceFile,
        metadata: {}
    };
  }

  private applyContextRules(tokens: Token[]): Token[] {
    if (!this.spec.contextRules) return tokens;
    const processed: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        let skip = false;
        for (const rule of this.spec.contextRules) {
            if (rule.condition(tokens, i)) {
                if (rule.action === 'transform' && rule.transform) {
                    token = rule.transform(token);
                } else if (rule.action === 'filter') {
                    skip = true;
                    break;
                } else if (rule.action === 'merge') {
                    if (rule.mergeWith === 'next' && i + 1 < tokens.length) {
                        token = this.mergeTokens(token, tokens[i + 1]);
                        i++; // Skip next token
                    } else if (rule.mergeWith === 'previous' && processed.length > 0) {
                        const prevToken = processed.pop()!;
                        token = this.mergeTokens(prevToken, token);
                    }
                }
            }
        }
        if (!skip) {
            processed.push(token);
        }
    }
    return processed;
  }

  private mergeTokens(first: Token, second: Token): Token {
    return {
        ...first,
        text: first.text + second.text,
        value: first.value + second.value,
        endOffset: second.endOffset,
        endLine: second.endLine,
        endCol: second.endCol,
        lineBreaks: first.lineBreaks + second.lineBreaks
    };
  }

  private applyTokenPrecedence(tokens: Token[]): Token[] {
    if (!this.spec.tokenPrecedence) return tokens;
    return tokens.sort((a, b) => {
        if (a.offset !== b.offset) return 0;
        const aIndex = this.spec.tokenPrecedence!.indexOf(a.type);
        const bIndex = this.spec.tokenPrecedence!.indexOf(b.type);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
  }

  getProfileReport(): ProfileReport {
    return this.profiler.getReport();
  }
}

// Language specification builder
export class LanguageSpecBuilder {
    // Omitted for brevity - implementation from your original code
}

// Language Registry with inheritance support
export class LanguageRegistry {
    // Omitted for brevity - implementation from your original code
}

// Enhanced token analyzer
export class TokenAnalyzer {
  // Omitted for brevity - implementation from your original code
  static buildTokenTree(_tokens: Token[], _openTypes: string[] = ['{', '(', '['], _closeTypes: string[] = ['}', ')', ']']): TokenTree | null {
      // Placeholder for full implementation
      return null;
  }
}

// Example Plugin: Indentation Handler
export class IndentationPlugin implements LexerPlugin {
  name = "IndentationHandler";
  version = "1.0.0";
  afterTokenize(tokens: Token[]): Token[] { 
    // Example: A real implementation would go here
    return tokens;
  }
}

// Example Context Rule: Automatic Semicolon Insertion
export const asiRule: ContextRule = {
    condition: (_tokens, _currentIndex) => {
        // Example: A real implementation would go here
        return false;
    },
    action: 'transform',
    transform: (token) => ({
        ...token,
        type: 'SEMICOLON',
        value: ';',
        text: ';',
        metadata: { ...token.metadata, synthetic: true, reason: 'ASI' }
    }),
};