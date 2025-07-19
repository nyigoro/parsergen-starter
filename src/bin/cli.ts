#!/usr/bin/env node
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { watchFile } from 'node:fs';
import { argv } from 'node:process';

import {
  compileGrammarFromFile,
  validateGrammar,
  analyzeGrammarAdvanced,
  CompiledGrammar,
} from '../grammar/index.js';

// Corrected import: Assuming parseInput, ParserUtils, and CompiledGrammar are named exports.
import { parseInput, ParserUtils, } from '../parser/index.js';
import { formatError, formatCompilationError } from '../utils/index.js';

// Define the valid format types with const assertion for type safety
const VALID_FORMATS = ['bare', 'commonjs', 'es', 'globals', 'umd'] as const;
type OutputFormat = typeof VALID_FORMATS[number];

// Color support detection
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR !== '1';
const colors = {
  red: supportsColor ? '\x1b[31m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  blue: supportsColor ? '\x1b[34m' : '',
  magenta: supportsColor ? '\x1b[35m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
  reset: supportsColor ? '\x1b[0m' : '',
  bold: supportsColor ? '\x1b[1m' : '',
  dim: supportsColor ? '\x1b[2m' : '',
};

// Enhanced logging utilities
const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ️${colors.reset}  ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  error: (msg: string) => console.error(`${colors.red}❌${colors.reset} ${msg}`),
  warn: (msg: string) => console.warn(`${colors.yellow}⚠️${colors.reset}  ${msg}`),
  debug: (msg: string) => console.log(`${colors.dim}🐛 ${msg}${colors.reset}`),
  watch: (msg: string) => console.log(`${colors.cyan}👀${colors.reset} ${msg}`),
  build: (msg: string) => console.log(`${colors.magenta}🔧${colors.reset} ${msg}`),
  analyze: (msg: string) => console.log(`${colors.yellow}📊${colors.reset} ${msg}`),
};

// Configuration interface
interface CLIConfig {
  grammarPath: string;
  testInput?: string;
  outFile?: string;
  format: OutputFormat;
  validate: boolean;
  analyze: boolean;
  ast: boolean;
  watch: boolean;
  verbose: boolean;
  interactive: boolean;
  benchmark: boolean;
  help: boolean;
}

function printHelp() {
  console.log(`
${colors.bold}parsergen${colors.reset} - Advanced PEG Grammar Parser Generator

${colors.bold}USAGE:${colors.reset}
  parsergen <grammar.peg> [options]

${colors.bold}OPTIONS:${colors.reset}
  ${colors.green}--test <input>${colors.reset}          Test grammar by parsing input string
  ${colors.green}--test-file <file>${colors.reset}      Test grammar by parsing file content
  ${colors.green}--validate${colors.reset}              Only validate grammar (no parsing)
  ${colors.green}--analyze${colors.reset}               Show detailed grammar metadata
  ${colors.green}--out <file>${colors.reset}            Output compiled parser as JS
  ${colors.green}--format <target>${colors.reset}       Format: ${VALID_FORMATS.join(' | ')} (default: es)
  ${colors.green}--ast${colors.reset}                   Print parse AST in JSON format
  ${colors.green}--watch${colors.reset}                 Watch grammar file and auto-recompile
  ${colors.green}--verbose, -v${colors.reset}           Enable verbose output
  ${colors.green}--interactive, -i${colors.reset}       Interactive mode for testing
  ${colors.green}--benchmark${colors.reset}             Benchmark parsing performance
  ${colors.green}--no-color${colors.reset}              Disable colored output
  ${colors.green}--help, -h${colors.reset}              Show this help

${colors.bold}EXAMPLES:${colors.reset}
  parsergen grammar.peg --test "hello world"
  parsergen grammar.peg --out parser.js --format commonjs --watch
  parsergen grammar.peg --analyze --verbose
  parsergen grammar.peg --interactive
  parsergen grammar.peg --benchmark --test-file input.txt

${colors.bold}FORMATS:${colors.reset}
  ${colors.cyan}bare${colors.reset}    - Bare parser function
  ${colors.cyan}commonjs${colors.reset}  - CommonJS module
  ${colors.cyan}es${colors.reset}        - ES6 module (default)
  ${colors.cyan}globals${colors.reset}   - Global variable
  ${colors.cyan}umd${colors.reset}       - Universal Module Definition
`);
}

function parseArgs(args: string[]): CLIConfig {
  const config: CLIConfig = {
    grammarPath: args[0] || '',
    format: 'es',
    validate: false,
    analyze: false,
    ast: false,
    watch: false,
    verbose: false,
    interactive: false,
    benchmark: false,
    help: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--test':
        if (nextArg) {
          config.testInput = nextArg;
          i++;
        }
        break;
      case '--test-file':
        if (nextArg) {
          try {
            config.testInput = readFileSync(nextArg, 'utf-8');
            i++;
          } catch {
            log.error(`Could not read test file: ${nextArg}`);
            process.exit(1);
          }
        }
        break;
      case '--out':
        if (nextArg) {
          config.outFile = nextArg;
          i++;
        }
        break;
      case '--format':
        if (nextArg && isValidFormat(nextArg)) {
          config.format = nextArg;
          i++;
        } else {
          log.error(`Invalid format: ${nextArg}. Valid formats: ${VALID_FORMATS.join(', ')}`);
          process.exit(1);
        }
        break;
      case '--validate':
        config.validate = true;
        break;
      case '--analyze':
        config.analyze = true;
        break;
      case '--ast':
        config.ast = true;
        break;
      case '--watch':
        config.watch = true;
        break;
      case '--verbose':
      case '-v':
        config.verbose = true;
        break;
      case '--interactive':
      case '-i':
        config.interactive = true;
        break;
      case '--benchmark':
        config.benchmark = true;
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
    }
  }

  return config;
}

function isValidFormat(format: string): format is OutputFormat {
  return VALID_FORMATS.includes(format as OutputFormat);
}

// Use the directly imported CompiledGrammar type
async function benchmarkParsing(parser: CompiledGrammar<unknown>, input: string, iterations: number = 1000) {
  log.build(`Running benchmark with ${iterations} iterations...`);

  const start = performance.now();
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < iterations; i++) {
    try {
      // Use the directly imported parseInput and ParserUtils
      const result = parseInput(parser, input);
      if (!ParserUtils.isParseError(result)) {
        successCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;

  console.log(`
${colors.bold}BENCHMARK RESULTS:${colors.reset}
  Total time: ${totalTime.toFixed(2)}ms
  Average per parse: ${avgTime.toFixed(4)}ms
  Successful parses: ${colors.green}${successCount}${colors.reset}
  Failed parses: ${colors.red}${errorCount}${colors.reset}
  Throughput: ${((iterations / totalTime) * 1000).toFixed(2)} parses/second
`);
}

// Use the directly imported CompiledGrammar type
async function interactiveMode(parser: CompiledGrammar<unknown>, verbose: boolean) {
  log.info('Entering interactive mode. Type "exit" to quit, "help" for commands.');

  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  while (true) {
    try {
      const input = await askQuestion(`${colors.cyan}parser>${colors.reset} `);

      if (input.toLowerCase() === 'exit') {
        break;
      }

      if (input.toLowerCase() === 'help') {
        console.log(`
Interactive Commands:
  exit          - Exit interactive mode
  help          - Show this help
  benchmark <n> - Run benchmark with n iterations
  ast on/off    - Toggle AST output
  <input>       - Parse the input string
`);
        continue;
      }

      if (input.startsWith('benchmark ')) {
        const iterations = parseInt(input.split(' ')[1]) || 1000;
        await benchmarkParsing(parser, 'test', iterations);
        continue;
      }

      // Use the directly imported parseInput and ParserUtils
      const result = parseInput(parser, input);

      if (!ParserUtils.isParseError(result)) {
        log.success('Parse successful');
        if (verbose) {
          console.log(JSON.stringify(result.result, null, 2));
        }
      } else {
        log.error('Parse failed');
        console.error(formatError(result));
      }
    } catch {
      log.error(`Unexpected error occurred`);
    }
  }

  rl.close();
}

async function compileAndWrite(grammarPath: string, outFile: string, format: OutputFormat, verbose: boolean = false) {
  try {
    const grammarText = await fs.readFile(grammarPath, 'utf-8');

    if (verbose) {
      log.debug(`Reading grammar from: ${grammarPath}`);
      log.debug(`Output format: ${format}`);
    }

    // Import Peggy directly to generate source code
    const PEG = await import('peggy');

    // Create format-specific options for Peggy
    const baseOptions = {
      allowedStartRules: ['*'],
      cache: false,
      optimize: 'speed' as const,
      output: 'source' as const,
      trace: verbose,
    };

    let compiledSource: string;

    // Handle each format with proper typing
    switch (format) {
      case 'bare':
        compiledSource = PEG.generate(grammarText, {
          ...baseOptions,
          format: 'bare' as const,
        });
        break;
      case 'commonjs':
        compiledSource = PEG.generate(grammarText, {
          ...baseOptions,
          format: 'commonjs' as const,
        });
        break;
      case 'es':
        compiledSource = PEG.generate(grammarText, {
          ...baseOptions,
          format: 'es' as const,
        });
        break;
      case 'globals':
        compiledSource = PEG.generate(grammarText, {
          ...baseOptions,
          format: 'globals' as const,
          exportVar: 'Parser',
        });
        break;
      case 'umd':
        compiledSource = PEG.generate(grammarText, {
          ...baseOptions,
          format: 'umd' as const,
          exportVar: 'Parser',
        });
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    await fs.writeFile(outFile, compiledSource, 'utf-8');
    log.success(`Parser compiled: ${outFile}`);

    if (verbose) {
      const stats = await fs.stat(outFile);
      log.debug(`Output file size: ${stats.size} bytes`);
    }
  } catch (error: unknown) { // Catch as 'any' or 'unknown' and then assert if needed
    log.error('Compilation failed');
    if (verbose) {
      console.error(error); // Log the actual error for verbose mode
    }
    throw new Error('Compilation failed');
  }
}

async function main() {
  const config = parseArgs(argv.slice(2));

  if (!config.grammarPath || config.help) {
    printHelp();
    return;
  }

  try {
    // Check if grammar file exists
    await fs.access(config.grammarPath);
  } catch {
    log.error(`Grammar file not found: ${config.grammarPath}`);
    process.exit(1);
  }

  if (config.verbose) {
    log.debug(`Using grammar file: ${config.grammarPath}`);
  }

  try {
    const grammarText = await fs.readFile(config.grammarPath, 'utf-8');

    // Validate grammar
    if (config.validate) {
      const result = validateGrammar(grammarText);
      if (result.valid) {
        log.success('Grammar is valid');
      } else {
        log.error(`Grammar validation failed:\n${result.error}`);
        process.exit(1);
      }
      return;
    }

    // Analyze grammar
    if (config.analyze) {
      const metadata = analyzeGrammarAdvanced(grammarText);
      log.analyze('Grammar Analysis:');
      console.log(JSON.stringify(metadata, null, 2));
      return;
    }

    // Watch mode
    if (config.watch && config.outFile) {
      log.watch(`Watching ${config.grammarPath} for changes...`);
      await compileAndWrite(config.grammarPath, config.outFile, config.format, config.verbose);

      watchFile(config.grammarPath, { interval: 300 }, async () => {
        try {
          log.build('Detected change, recompiling...');
          await compileAndWrite(config.grammarPath, config.outFile!, config.format, config.verbose);
        } catch (err: unknown) {
          log.error('Rebuild failed');
          if (config.verbose) {
            console.error(formatCompilationError(err, grammarText));
          }
        }
      });

      // Keep process alive
      process.on('SIGINT', () => {
        log.info('Stopping watch mode...');
        process.exit(0);
      });
      return;
    }

    // Compile to file
    if (config.outFile) {
      await compileAndWrite(config.grammarPath, config.outFile, config.format, config.verbose);
      return;
    }

    // Default: compile grammar in memory
    const parser = await compileGrammarFromFile(config.grammarPath);
    log.success(`Grammar compiled: ${config.grammarPath}`);

    // Interactive mode
    if (config.interactive) {
      await interactiveMode(parser, config.ast || config.verbose);
      return;
    }

    // Test parsing
    if (config.testInput) {
      if (config.benchmark) {
        await benchmarkParsing(parser, config.testInput);
        return;
      }

      // Use the directly imported parseInput and ParserUtils
      const result = parseInput(parser, config.testInput);

      if (!ParserUtils.isParseError(result)) {
        log.success('Parse successful');
        if (config.ast) {
          console.log(JSON.stringify(result.result, null, 2));
        }
      } else {
        log.error('Parse failed');
        console.error(formatError(result));
        process.exit(1);
      }
    } else {
      log.info('No test input provided. Grammar compiled successfully.');
      if (config.verbose) {
        log.info('Use --test <input> to test parsing or --interactive for interactive mode.');
      }
    }
  } catch (err: unknown) {
    log.error('An error occurred');
    if (config.verbose) {
      console.error(err);
    } else {
      console.error(formatCompilationError(err, ''));
    }
    process.exit(1);
  }
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

main();
