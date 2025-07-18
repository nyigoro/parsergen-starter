import type { ParserBuildOptions, LocationRange } from 'peggy';
import { formatError, formatCompilationError, formatAnyError } from '../utils/index';
import PEG from 'peggy';

const generate = PEG.generate;

// --- Corrected Type Definitions for Error Handling ---

/**
 * Represents the structure of an error expected by the formatting utilities.
 * This aligns with the user's 'ParseError' type by including `success` and `error`.
 */
export interface ParseError extends Error {
  message: string;
  location: LocationRange;
  expected?: string[];
  found?: string;
  // Properties required by the consuming formatError functions
  success: false;
  error: string;
}

/**
 * Type guard to check if an error has the shape of a Peggy-generated error.
 * @param error The error object to check.
 * @returns True if the object has the core Peggy error properties.
 */
function isParseError(error: unknown): error is ParseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'location' in error
  );
}

// --- Interfaces ---

export interface Plugin {
  use: (config: { rules: unknown[] }, options: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export interface AnalysisResult {
  errors: string[];
  warnings: string[];
}

export interface CompiledGrammar<ASTNode = unknown> {
  parse: (input: string, options?: ParserBuildOptions) => ASTNode;
  source: string;
  options: CompileOptions;
  analyze?: (ast: ASTNode) => AnalysisResult;
}

export interface CompileOptions {
  allowedStartRules?: string[];
  cache?: boolean;
  dependencies?: Record<string, unknown>;
  exportVar?: string;
  format?: 'bare' | 'commonjs' | 'es' | 'globals' | 'umd';
  grammarSource?: string | LocationRange;
  header?: string | string[];
  optimize?: 'speed' | 'size';
  output?: 'parser' | 'source';
  plugins?: Plugin[];
  trace?: boolean;
}

// --- Core Functions ---

export function compileGrammar<ASTNode = unknown>(
  grammar: string,
  options: CompileOptions = {},
  analyzer?: (ast: ASTNode) => AnalysisResult
): CompiledGrammar<ASTNode> {
  try {
    const defaultOptions: CompileOptions = {
      allowedStartRules: ['*'],
      cache: false,
      format: 'bare',
      optimize: 'speed',
      output: 'parser',
      trace: false,
      ...options,
    };

    const parser = generate(grammar, defaultOptions as ParserBuildOptions);
    return {
      parse: parser.parse.bind(parser),
      source: grammar,
      options: defaultOptions,
      analyze: analyzer,
    };
  } catch (error: unknown) {
    // Corrected logic: No longer checks for `formatCompilationError` as it's always defined.
    // The type guard now narrows to the `ParseError` interface expected by the formatters.
    const formattedError = isParseError(error)
      ? formatCompilationError(error, grammar)
      : formatAnyError(error);
    throw new Error(`Grammar compilation failed:\n${formattedError}`);
  }
}

export async function compileGrammarFromFile<ASTNode = unknown>(
  filePath: string,
  options: CompileOptions = {},
  analyzer?: (ast: ASTNode) => AnalysisResult
): Promise<CompiledGrammar<ASTNode>> {
  try {
    const fs = await import('fs/promises');
    const grammar = await fs.readFile(filePath, 'utf-8');
    return compileGrammar<ASTNode>(
      grammar,
      {
        ...options,
        grammarSource: filePath,
      },
      analyzer
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compile grammar from file ${filePath}: ${message}`);
  }
}

export function validateGrammar(grammar: string): { valid: boolean; error?: string } {
  try {
    generate(grammar, { output: 'source' });
    return { valid: true };
  } catch (error: unknown) {
    // Use the type guard to safely format the error.
    const message = isParseError(error) ? formatError(error) : formatAnyError(error);
    return {
      valid: false,
      error: String(message),
    };
  }
}

// --- Analysis Functions (unchanged) ---

export interface GrammarAnalysis {
  rules: RuleInfo[];
  startRule?: string;
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

export function analyzeGrammarAdvanced(grammar: string): GrammarAnalysis {
  const lines = grammar.split('\n');
  const rules: RuleInfo[] = [];
  const dependencies = new Map<string, string[]>();
  const warnings: string[] = [];

  const ruleDefinitionRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(".*?")?\s*=/;
  let currentRuleLines: string[] = [];
  let currentRuleInfo: Omit<RuleInfo, 'expression' | 'references' | 'isLeftRecursive'> | null = null;

  lines.forEach((line, i) => {
    const ruleMatch = line.match(ruleDefinitionRegex);
    if (ruleMatch) {
      if (currentRuleInfo && currentRuleLines.length > 0) {
        rules.push(finalizeRule(currentRuleInfo, currentRuleLines, rules.length === 0));
      }
      currentRuleInfo = {
        name: ruleMatch[1],
        line: i + 1,
        column: line.indexOf(ruleMatch[1]) + 1,
        isStartRule: false,
      };
      currentRuleLines = [line];
    } else if (currentRuleInfo) {
      currentRuleLines.push(line);
    }
  });

  if (currentRuleInfo && currentRuleLines.length > 0) {
    rules.push(finalizeRule(currentRuleInfo, currentRuleLines, rules.length === 0));
  }

  rules.forEach(rule => {
    dependencies.set(rule.name, rule.references);
  });

  const reachableRules = new Set<string>();
  const startRule = rules.find(r => r.isStartRule);
  if (startRule) {
    findReachableRules(startRule.name, dependencies, reachableRules);
  }
  const unreachableRules = rules.filter(r => !reachableRules.has(r.name)).map(r => r.name);
  const leftRecursive = rules.filter(r => r.isLeftRecursive).map(r => r.name);

  if (unreachableRules.length > 0) {
    warnings.push(`Unreachable rules found: ${unreachableRules.join(', ')}`);
  }
  if (leftRecursive.length > 0) {
    warnings.push(`Immediate left-recursive rules found: ${leftRecursive.join(', ')}. Peggy handles this, but it can signal complex logic.`);
  }

  return { rules, startRule: startRule?.name, dependencies, unreachableRules, leftRecursive, warnings };
}

function finalizeRule(info: Omit<RuleInfo, 'expression' | 'references' | 'isLeftRecursive'>, lines: string[], isStart: boolean): RuleInfo {
  const expression = lines.join('\n');
  const name = info.name;
  return { ...info, expression, references: extractReferences(expression, name), isStartRule: isStart, isLeftRecursive: checkImmediateLeftRecursion(expression, name) };
}

function extractReferences(expression: string, ruleName: string): string[] {
  const grammarOnly = expression.replace(/{[^}]*}/g, ' ').replace(/"[^"]*"/g, ' ').replace(/'[^']*'/g, ' ');
  const matches = grammarOnly.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  const references = new Set(matches.filter(m => m !== ruleName));
  return Array.from(references);
}

function checkImmediateLeftRecursion(expression: string, ruleName: string): boolean {
  const body = expression.substring(expression.indexOf('=') + 1);
  const alternatives = body.split('/');
  return alternatives.some(alt => {
    const trimmedAlt = alt.trim();
    return trimmedAlt.startsWith(ruleName) && !trimmedAlt.startsWith(ruleName + '_');
  });
}

function findReachableRules(ruleName: string, dependencies: Map<string, string[]>, reachable: Set<string>): void {
  if (reachable.has(ruleName) || !dependencies.has(ruleName)) return;
  reachable.add(ruleName);
  const deps = dependencies.get(ruleName) || [];
  for (const dep of deps) {
    findReachableRules(dep, dependencies, reachable);
  }
}

// --- Grammar Builder Class (unchanged) ---

export class GrammarBuilder<ASTNode = unknown> {
  private rules: string[] = [];
  private headers: string[] = [];
  private options: CompileOptions = {};
  private semanticAnalyzer?: (ast: ASTNode) => AnalysisResult;

  rule(name: string, expression: string): this {
    this.rules.push(`${name} = ${expression}`);
    return this;
  }

  header(code: string): this {
    this.headers.push(code);
    return this;
  }

  option<K extends keyof CompileOptions>(key: K, value: CompileOptions[K]): this {
    this.options[key] = value;
    return this;
  }

  analyzer(analyzer: (ast: ASTNode) => AnalysisResult): this {
    this.semanticAnalyzer = analyzer;
    return this;
  }

  build(): CompiledGrammar<ASTNode> {
    return compileGrammar<ASTNode>(this.toString(), this.options, this.semanticAnalyzer);
  }

  toString(): string {
    const headerBlock = this.headers.length > 0 ? `{ ${this.headers.join('\n')} }\n\n` : '';
    return headerBlock + this.rules.join('\n\n');
  }
}

export function createGrammarBuilder<ASTNode = unknown>(): GrammarBuilder<ASTNode> {
  return new GrammarBuilder<ASTNode>();
}