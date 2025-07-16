// Main library exports
export { compileGrammar, type CompiledGrammar } from './grammar/index.js';
export { createLexer, type LexerConfig, type Token } from './lexer/index.js';
export {
  parseInput,
  createParser,
  parseWithRecovery,
  parseWithTimeout,
  parseMultiple,
  parseStream,
  validateSyntax,
  ParserUtils,
  type ParseResult,
  type ParseError,
  type ParseOptions
} from './parser/index.js';

export {
  formatError,
  formatLocation,
  createASTNode,
  traverseAST,
  type ASTNode,
  type Location,
  type ErrorFormatter
} from './utils/index.js';

// Re-export core Peggy types for compatibility
export type {
  Parser as PeggyParser,
  ParserOptions as PeggyParseOptions
} from 'peggy';

// Development-only CLI utilities
import { compileGrammar } from './grammar/index.js';
import { parseInput } from './parser/index.js';
import { formatError } from './utils/index.js';

/**
 * Quick parser from inline grammar (useful in tests or dev)
 */
export function createQuickParser(grammar: string) {
  try {
    const parser = compileGrammar(grammar);
    return (input: string) => parseInput(parser, input);
  } catch (error: any) {
    console.error('Grammar compilation failed:\n' + (formatError(error) || error.message));
    throw error;
  }
}

/**
 * Simple REPL for testing grammars and inputs
 */
export function runREPL() {
  import('readline').then(({ createInterface }) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'parsergen> '
    });

    console.log('📘 ParserGen REPL');
    console.log('Commands:');
    console.log('  .grammar <inline PEG grammar>');
    console.log('  .test <input>');
    console.log('  .exit');

    let currentParser: any = null;

    rl.prompt();

    rl.on('line', (line: string) => {
      const trimmed = line.trim();

      if (trimmed === '.exit') {
        rl.close();
        return;
      }

      if (trimmed.startsWith('.grammar ')) {
        const grammar = trimmed.slice(9).trim();
        try {
          currentParser = compileGrammar(grammar);
          console.log('✅ Grammar compiled');
        } catch (error: any) {
          console.error('❌ Grammar error:\n' + formatError(error));
        }
      } else if (trimmed.startsWith('.test ')) {
        const input = trimmed.slice(6).trim();
        if (!currentParser) {
          console.error('⚠️  No grammar loaded. Use .grammar <...> first.');
        } else {
          const result = parseInput(currentParser, input);
          console.log('🧾 Result:\n' + JSON.stringify(result, null, 2));
        }
      } else {
        console.log('Unknown command. Use `.grammar`, `.test`, `.exit`');
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('👋 Goodbye!');
      process.exit(0);
    });
  });
}

/**
 * Auto-run REPL if this is the main module (support both ESM and CJS)
 */
const isMain = typeof require !== 'undefined'
  ? require.main === module
  : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  runREPL();
}
