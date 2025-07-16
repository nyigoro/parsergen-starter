import { generate } from 'peggy';
import * as peggy from 'peggy';
import { formatError } from '../utils/index.js';
export interface CompiledGrammar {
  parse: peggy.Parser['parse'];
  source: string;
  options: CompileOptions;
}

export interface CompileOptions {
  allowedStartRules?: string[];
  cache?: boolean;
  dependencies?: Record<string, any>;
  exportVar?: string;
  format?: 'bare' | 'commonjs' | 'es' | 'globals' | 'umd';
  grammarSource?: string;
  header?: string | string[];
  optimize?: 'speed' | 'size';
  output?: 'parser' | 'source';
  plugins?: any[];
  trace?: boolean;
}

/**
 * Compile a PEG grammar string into a parser
 */
export function compileGrammar(
  grammar: string, 
  options: CompileOptions = {}
): CompiledGrammar {
  try {
    const defaultOptions: CompileOptions = {
      allowedStartRules: ['*'],
      cache: false,
      format: 'bare',
      optimize: 'speed',
      output: 'parser',
      trace: false,
      ...options
    };

    const parser = generate(grammar, defaultOptions as peggy.ParserBuildOptions);
    return {
      parse: parser.parse.bind(parser),
      source: grammar,
      options: defaultOptions
    };
  } catch (error: any) {
    const formattedError = formatError(error);
    throw new Error(`Grammar compilation failed: ${formattedError}`);
  }
}

/**
 * Compile grammar from file
 */
export async function compileGrammarFromFile(
  filePath: string, 
  options: CompileOptions = {}
): Promise<CompiledGrammar> {
  try {
    const fs = await import('fs/promises');
    const grammar = await fs.readFile(filePath, 'utf-8');
    return compileGrammar(grammar, {
      ...options,
      grammarSource: filePath
    });
  } catch (error: any) {
    throw new Error(`Failed to compile grammar from file ${filePath}: ${error.message}`);
  }
}

/**
 * Validate grammar syntax without generating parser
 */
export function validateGrammar(grammar: string): { valid: boolean; error?: string } {
  try {
    generate(grammar, { output: 'source' });
    return { valid: true };
  } catch (error: any) {
    return { 
      valid: false, 
      error: formatError(error) 
    };
  }
}

/**
 * Extract grammar metadata (rules, start rule, etc.)
 */
export function analyzeGrammar(grammar: string): {
  rules: string[];
  startRule?: string;
  imports: string[];
  exports: string[];
} {
  const rules: string[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  
  // Simple regex-based extraction (could be improved with proper parsing)
  const rulePattern = /^(\w+)\s*=/gm;
  const importPattern = /import\s+(\w+)/g;
  const exportPattern = /export\s+(\w+)/g;
  
  let match;
  
  while ((match = rulePattern.exec(grammar)) !== null) {
    rules.push(match[1]);
  }
  
  while ((match = importPattern.exec(grammar)) !== null) {
    imports.push(match[1]);
  }
  
  while ((match = exportPattern.exec(grammar)) !== null) {
    exports.push(match[1]);
  }
  
  return {
    rules,
    startRule: rules[0], // First rule is typically the start rule
    imports,
    exports
  };
}

/**
 * Create a grammar builder for fluent API
 */
export class GrammarBuilder {
  private rules: string[] = [];
  private headers: string[] = [];
  private options: CompileOptions = {};
  
  rule(name: string, expression: string): this {
    this.rules.push(`${name} = ${expression}`);
    return this;
  }
  
  header(code: string): this {
    this.headers.push(code);
    return this;
  }
  
  option(key: keyof CompileOptions, value: any): this {
    this.options[key] = value;
    return this;
  }
  
  build(): CompiledGrammar {
    const grammar = [
      ...this.headers.map(h => `{ ${h} }`),
      ...this.rules
    ].join('\n\n');
    
    return compileGrammar(grammar, this.options);
  }
  
  toString(): string {
    return [
      ...this.headers.map(h => `{ ${h} }`),
      ...this.rules
    ].join('\n\n');
  }
}

/**
 * Create a new grammar builder
 */
export function createGrammarBuilder(): GrammarBuilder {
  return new GrammarBuilder();
}