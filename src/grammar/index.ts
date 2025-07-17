import type { Parser, ParserBuildOptions } from 'peggy';
import {  formatError, formatCompilationError, formatAnyError } from '../utils/index';
import PEG from 'peggy';

const generate = PEG.generate;
export interface CompiledGrammar {
  parse: Parser['parse'];
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

    const parser = generate(grammar, defaultOptions as ParserBuildOptions);
    return {
      parse: parser.parse.bind(parser),
      source: grammar,
      options: defaultOptions
    };
  } catch (error: any) {
    // Use the enhanced error formatting - fallback to formatAnyError if formatCompilationError not available
    const formattedError = formatCompilationError ? 
      formatCompilationError(error, grammar) : 
      formatAnyError(error);
    throw new Error(`Grammar compilation failed:\n${formattedError}`);
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

export interface GrammarAnalysis {
  rules: RuleInfo[];
  startRule?: string;
  imports: string[];
  exports: string[];
  dependencies: Map<string, string[]>;
  unreachableRules: string[];
  leftRecursive: string[];
  warnings: string[];
}

export interface RuleInfo {
  name: string;
  line: number;
  column: number;
  expression: string;
  references: string[];
  isStartRule: boolean;
  isLeftRecursive: boolean;
}

/**
 * Enhanced grammar analysis with dependency tracking
 */
export function analyzeGrammarAdvanced(grammar: string): GrammarAnalysis {
  const lines = grammar.split('\n');
  const rules: RuleInfo[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  const dependencies = new Map<string, string[]>();
  const warnings: string[] = [];
  
  // More robust rule parsing
  let currentRule: RuleInfo | null = null;
  let inRule = false;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || !trimmed) {
      continue;
    }
    
    // Check for rule definition
    const ruleMatch = trimmed.match(/^(\w+)\s*=/);
    if (ruleMatch && !inRule) {
      if (currentRule) {
        rules.push(currentRule);
      }
      
      currentRule = {
        name: ruleMatch[1],
        line: i + 1,
        column: line.indexOf(ruleMatch[1]) + 1,
        expression: '',
        references: [],
        isStartRule: rules.length === 0,
        isLeftRecursive: false
      };
      inRule = true;
    }
    
    if (inRule && currentRule) {
      currentRule.expression += line + '\n';
      
      // Track braces to know when rule ends
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      // Rule ends when we hit a new rule or end of input
      if (i === lines.length - 1 || 
          (i < lines.length - 1 && lines[i + 1].trim().match(/^\w+\s*=/) && braceCount === 0)) {
        
        // Extract references from the rule
        const references = extractReferences(currentRule.expression);
        currentRule.references = references;
        dependencies.set(currentRule.name, references);
        
        // Check for left recursion
        currentRule.isLeftRecursive = checkLeftRecursion(currentRule.expression, currentRule.name);
        
        rules.push(currentRule);
        inRule = false;
        braceCount = 0;
      }
    }
    
    // Check for imports/exports
    const importMatch = trimmed.match(/import\s+(\w+)/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }
    
    const exportMatch = trimmed.match(/export\s+(\w+)/);
    if (exportMatch) {
      exports.push(exportMatch[1]);
    }
  }
  
  // Find unreachable rules
  const reachableRules = new Set<string>();
  const startRule = rules.find(r => r.isStartRule);
  
  if (startRule) {
    findReachableRules(startRule.name, dependencies, reachableRules);
  }
  
  const unreachableRules = rules
    .filter(r => !reachableRules.has(r.name))
    .map(r => r.name);
  
  const leftRecursive = rules
    .filter(r => r.isLeftRecursive)
    .map(r => r.name);
  
  // Generate warnings
  if (unreachableRules.length > 0) {
    warnings.push(`Unreachable rules: ${unreachableRules.join(', ')}`);
  }
  
  if (leftRecursive.length > 0) {
    warnings.push(`Left-recursive rules: ${leftRecursive.join(', ')}`);
  }
  
  return {
    rules,
    startRule: startRule?.name,
    imports,
    exports,
    dependencies,
    unreachableRules,
    leftRecursive,
    warnings
  };
}

function extractReferences(expression: string): string[] {
  const references: string[] = [];
  // Match rule references (identifiers that aren't keywords)
  const matches = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
  
  if (matches) {
    const keywords = new Set(['return', 'if', 'else', 'while', 'for', 'function', 'var', 'let', 'const']);
    const uniqueRefs = new Set(matches.filter(m => !keywords.has(m)));
    references.push(...uniqueRefs);
  }
  
  return references;
}

function checkLeftRecursion(expression: string, ruleName: string): boolean {
  // Simple check for immediate left recursion
  const firstAlternative = expression.split('|')[0];
  const trimmed = firstAlternative.replace(/\s+/g, ' ').trim();
  return trimmed.startsWith(`${ruleName} `) || trimmed.startsWith(`${ruleName}/`);
}

function findReachableRules(
  ruleName: string,
  dependencies: Map<string, string[]>,
  reachable: Set<string>
): void {
  if (reachable.has(ruleName)) {
    return;
  }
  
  reachable.add(ruleName);
  const deps = dependencies.get(ruleName) || [];
  
  for (const dep of deps) {
    if (dependencies.has(dep)) {
      findReachableRules(dep, dependencies, reachable);
    }
  }
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