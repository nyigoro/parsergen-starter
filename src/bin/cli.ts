#!/usr/bin/env node
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { watchFile } from 'node:fs';
import { argv } from 'node:process';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import {
  compileGrammarFromFile,
  validateGrammar,
  analyzeGrammarAdvanced,
  CompiledGrammar,
} from '../grammar/index.js';

import { compileGrammar, analyzeLumina, lowerLumina, optimizeIR, generateJS } from '../index.js';

import { parseInput, parseStream, ParserUtils } from '../parser/index.js';
import { runREPLWithParser } from '../repl.js';
import { formatError, formatCompilationError } from '../utils/index.js';

// Define the valid format types with const assertion for type safety
const VALID_FORMATS = ['bare', 'commonjs', 'es', 'globals', 'umd'] as const;
type OutputFormat = typeof VALID_FORMATS[number];

// Tool version (can be dynamically loaded from package.json in a real app)
const TOOL_VERSION = '0.1.0';

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
  grammarPath?: string; // Made optional as init/version don't require it
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
  initProject: boolean;
  version: boolean;
  transformScript?: string; // New: Path to AST transformation script
  codegenScript?: string;   // New: Path to code generation script
  delimiter?: string;
  encoding?: string;
  stdin: boolean;
  luminaBuild?: string;
  luminaOut?: string;
  luminaTarget?: 'cjs' | 'esm';
}

function printHelp() {
  console.log(`
${colors.bold}parsergen${colors.reset} - Advanced PEG Grammar Parser Generator

${colors.bold}USAGE:${colors.reset}
  parsergen <grammar.peg> [options]
  parsergen --init [options]
  parsergen --version

${colors.bold}COMMANDS:${colors.reset}
  ${colors.green}--init${colors.reset}                  Initialize a new parser project with default files.
  ${colors.green}--version${colors.reset}               Display the current version of parsergen.

${colors.bold}OPTIONS:${colors.reset}
  ${colors.green}--test <input>${colors.reset}          Test grammar by parsing input string
  ${colors.green}--test-file <file>${colors.reset}      Test grammar by parsing file content
  ${colors.green}--validate${colors.reset}              Only validate grammar (no parsing)
  ${colors.green}--analyze${colors.reset}               Show detailed grammar metadata
  ${colors.green}--out <file>${colors.reset}            Output compiled parser as JS
  ${colors.green}--format <target>${colors.reset}       Format: ${VALID_FORMATS.join(' | ')} (default: es)
  ${colors.green}--ast${colors.reset}                   Print parse AST in JSON format
  ${colors.green}--transform <script.js>${colors.reset} Apply a JS transformation script to the AST.
  ${colors.green}--codegen <script.js>${colors.reset}   Apply a JS code generation script to the AST.
  ${colors.green}--watch${colors.reset}                 Watch grammar file and auto-recompile
  ${colors.green}--verbose, -v${colors.reset}           Enable verbose output
  ${colors.green}--interactive, -i${colors.reset}       Interactive mode for testing
  ${colors.green}--benchmark${colors.reset}             Benchmark parsing performance
  ${colors.green}--stdin${colors.reset}                 Read input records from stdin
  ${colors.green}--delimiter <str>${colors.reset}       Record delimiter for stdin (default: \\n)
  ${colors.green}--encoding <enc>${colors.reset}        Text encoding for stdin (default: utf-8)
  ${colors.green}--lumina-build <file>${colors.reset}   Compile Lumina source file to JS
  ${colors.green}--lumina-out <file>${colors.reset}     Output JS file (default: lumina.out.js)
  ${colors.green}--lumina-target <cjs|esm>${colors.reset} Target module format (default: esm)
  ${colors.green}--no-color${colors.reset}              Disable colored output
  ${colors.green}--help, -h${colors.reset}              Show this help

${colors.bold}EXAMPLES:${colors.reset}
  parsergen grammar.peg --test "hello world"
  parsergen grammar.peg --out parser.js --format commonjs --watch
  parsergen grammar.peg --analyze --verbose
  parsergen grammar.peg --interactive
  parsergen mylang.peg --test "input" --transform ast-transform.js --codegen generate-js.js
  parsergen --lumina-build main.lm --lumina-out dist/main.js --lumina-target cjs
  parsergen --init
  parsergen --version

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
    grammarPath: args[0] && !args[0].startsWith('--') ? args[0] : undefined,
    format: 'es',
    validate: false,
    analyze: false,
    ast: false,
    watch: false,
    verbose: false,
    interactive: false,
    benchmark: false,
    help: false,
    initProject: false,
    version: false,
    stdin: false,
  };

  // Check for commands that don't require a grammar file first
  if (args.includes('--help') || args.includes('-h')) {
    config.help = true;
  }
  if (args.includes('--version')) {
    config.version = true;
  }
  if (args.includes('--init')) {
    config.initProject = true;
  }

  // Parse other options
  for (let i = 0; i < args.length; i++) {
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
      case '--transform': // New option parsing
        if (nextArg) {
          config.transformScript = nextArg;
          i++;
        }
        break;
      case '--codegen': // New option parsing
        if (nextArg) {
          config.codegenScript = nextArg;
          i++;
        }
        break;
      case '--delimiter':
        if (nextArg) {
          config.delimiter = nextArg;
          i++;
        }
        break;
      case '--encoding':
        if (nextArg) {
          config.encoding = nextArg;
          i++;
        }
        break;
      case '--stdin':
        config.stdin = true;
        break;
      case '--lumina-build':
        if (nextArg) {
          config.luminaBuild = nextArg;
          i++;
        }
        break;
      case '--lumina-out':
        if (nextArg) {
          config.luminaOut = nextArg;
          i++;
        }
        break;
      case '--lumina-target':
        if (nextArg === 'cjs' || nextArg === 'esm') {
          config.luminaTarget = nextArg;
          i++;
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
      // --help, --version, --init are handled above
    }
  }

  // If a grammar path was provided as the first argument, ensure it's captured
  if (args.length > 0 && !args[0].startsWith('--') && !config.grammarPath) {
    config.grammarPath = args[0];
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
  } catch (error: unknown) {
    log.error('Compilation failed');
    if (verbose) {
      console.error(error);
    }
    throw new Error('Compilation failed');
  }
}

async function initializeProject() {
  log.info('Initializing new parser project...');
  const grammarFileName = 'grammar.peg';
  const configFileName = '.parsergenrc';
  const transformFileName = 'transform.js';
  const codegenFileName = 'codegen.js';

  const templateDir = resolve(process.cwd(), 'examples', 'template');
  const readTemplate = async (fileName: string, fallback: string): Promise<string> => {
    const filePath = resolve(templateDir, fileName);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return fallback;
    }
  };

  const dummyGrammarContent = await readTemplate('grammar.peg', `// My PEG Grammar
start = "Hello" _ "World" { return { type: "Greeting", value: "Hello World" }; }
_ = [ \\t]+
`);

  const dummyConfigContent = await readTemplate('.parsergenrc', JSON.stringify({
    grammarFile: grammarFileName,
    outputFile: 'parser.js',
    format: 'es',
    verbose: true,
    transformScript: transformFileName,
    codegenScript: codegenFileName,
  }, null, 2));

  const dummyTransformContent = await readTemplate('transform.js', `
/**
 * Transforms the parsed AST.
 * @param {any} ast - The Abstract Syntax Tree parsed by the grammar.
 * @returns {any} The transformed AST.
 */
export default function transform(ast) {
  console.log('Applying AST transformation...');
  // Example: Modify the AST
  if (ast && ast.type === 'Greeting') {
    return { ...ast, transformed: true, message: 'AST transformed successfully!' };
  }
  return ast;
}
`);

  const dummyCodegenContent = await readTemplate('codegen.js', `
/**
 * Generates code from the (potentially transformed) AST.
 * @param {any} ast - The Abstract Syntax Tree (or transformed AST).
 * @returns {string} The generated code.
 */
export default function codegen(ast) {
  console.log('Generating code from AST...');
  if (ast && ast.type === 'Greeting' && ast.transformed) {
    return \`console.log("Transformed greeting: \${ast.value} - \${ast.message}");\`;
  } else if (ast && ast.type === 'Greeting') {
    return \`console.log("Original greeting: \${ast.value}");\`;
  }
  return \`console.log("Could not generate code for unknown AST type.");\`;
}
`);

  try {
    await fs.writeFile(grammarFileName, dummyGrammarContent, 'utf-8');
    log.success(`Created ${grammarFileName}`);
    await fs.writeFile(configFileName, dummyConfigContent, 'utf-8');
    log.success(`Created ${configFileName}`);
    await fs.writeFile(transformFileName, dummyTransformContent, 'utf-8');
    log.success(`Created ${transformFileName}`);
    await fs.writeFile(codegenFileName, dummyCodegenContent, 'utf-8');
    log.success(`Created ${codegenFileName}`);

    log.info('Project initialized successfully!');
    log.info(`You can now edit '${grammarFileName}', '${transformFileName}', '${codegenFileName}'`);
    log.info(`Try: 'parsergen ${grammarFileName} --test "Hello World" --transform ${transformFileName} --codegen ${codegenFileName}'`);
  } catch (error) {
    log.error(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}


async function main() {
  const config = parseArgs(argv.slice(2));

  if (config.help) {
    printHelp();
    return;
  }

  if (config.version) {
    log.info(`parsergen version: ${TOOL_VERSION}`);
    return;
  }

  if (config.initProject) {
    await initializeProject();
    return;
  }

  // If no grammarPath is provided and it's not an init/version/help command, show help
  if (!config.grammarPath) {
    log.error('No grammar file specified.');
    printHelp();
    process.exit(1);
  }

  // Assert grammarPath is a string after the check, ensuring TypeScript knows its type
  const grammarFilePath: string = config.grammarPath;

  try {
    // Check if grammar file exists
    await fs.access(grammarFilePath);
  } catch {
    log.error(`Grammar file not found: ${grammarFilePath}`);
    process.exit(1);
  }

  if (config.verbose) {
    log.debug(`Using grammar file: ${grammarFilePath}`);
  }

  try {
    const grammarText = await fs.readFile(grammarFilePath, 'utf-8');

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
      log.watch(`Watching ${grammarFilePath} for changes...`);
      await compileAndWrite(grammarFilePath, config.outFile, config.format, config.verbose);

      watchFile(grammarFilePath, { interval: 300 }, async () => {
        try {
          log.build('Detected change, recompiling...');
          await compileAndWrite(grammarFilePath, config.outFile!, config.format, config.verbose);
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
      await compileAndWrite(grammarFilePath, config.outFile, config.format, config.verbose);
      return;
    }

    // Lumina pipeline (parse -> analyze -> lower -> optimize -> codegen)
    if (config.luminaBuild) {
      try {
        const luminaParser = compileGrammar(grammarText);
        const source = await fs.readFile(config.luminaBuild, 'utf-8');
        const parsed = parseInput(luminaParser, source);
        if (ParserUtils.isParseError(parsed)) {
          console.error(formatError(parsed));
          process.exit(1);
        }
        const ast = (parsed as { result: unknown }).result;
        const analysis = analyzeLumina(ast as never);
        if (analysis.diagnostics.length > 0) {
          analysis.diagnostics.forEach(d => {
            log.error(`[${d.code ?? 'DIAG'}] ${d.message}`);
          });
        }
        const lowered = lowerLumina(ast as never);
        const optimized = optimizeIR(lowered) ?? lowered;
        const out = generateJS(optimized, {
          target: config.luminaTarget ?? 'esm',
          sourceMap: false,
        }).code;
        const outPath = config.luminaOut ?? 'lumina.out.js';
        await fs.writeFile(outPath, out, 'utf-8');
        log.success(`Lumina compiled: ${outPath}`);
        return;
      } catch (err) {
        log.error(`Lumina build failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    // Default: compile grammar in memory
    const parser = await compileGrammarFromFile(grammarFilePath);
    log.success(`Grammar compiled: ${grammarFilePath}`);

    // Interactive mode
    if (config.interactive) {
      runREPLWithParser(parser, grammarText);
      return;
    }

    // Test parsing
    if (config.stdin) {
      const webStream = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
      let recordIndex = 0;
      for await (const result of parseStream(parser, webStream, {
        streamDelimiter: config.delimiter ?? '\n',
        streamEncoding: config.encoding ?? 'utf-8',
      })) {
        recordIndex++;
        if (!ParserUtils.isParseError(result)) {
          log.success(`Record ${recordIndex} parsed`);
          let ast = result.result;

          if (config.transformScript) {
            try {
              const transformPath = resolve(process.cwd(), config.transformScript);
              log.info(`Loading AST transformation script: ${transformPath}`);
              const { default: transformFn } = await import(transformPath);
              if (typeof transformFn === 'function') {
                ast = transformFn(ast);
                log.success('AST transformed.');
              } else {
                log.warn(`Transformation script '${config.transformScript}' does not export a default function.`);
              }
            } catch (transformErr) {
              log.error(`Failed to apply AST transformation: ${transformErr instanceof Error ? transformErr.message : String(transformErr)}`);
              process.exit(1);
            }
          }

          if (config.ast) {
            log.info('Parsed AST (after transformation if applied):');
            console.log(JSON.stringify(ast, null, 2));
          }

          if (config.codegenScript) {
            try {
              const codegenPath = resolve(process.cwd(), config.codegenScript);
              log.info(`Loading code generation script: ${codegenPath}`);
              const { default: codegenFn } = await import(codegenPath);
              if (typeof codegenFn === 'function') {
                const generatedCode = codegenFn(ast);
                log.success('Code generated.');
                console.log(`${colors.bold}GENERATED CODE:${colors.reset}\n${generatedCode}`);
              } else {
                log.warn(`Code generation script '${config.codegenScript}' does not export a default function.`);
              }
            } catch (codegenErr) {
              log.error(`Failed to generate code: ${codegenErr instanceof Error ? codegenErr.message : String(codegenErr)}`);
              process.exit(1);
            }
          }
        } else {
          log.error(`Record ${recordIndex} parse failed`);
          console.error(formatError(result));
        }
      }
      return;
    }

    if (config.testInput) {
      if (config.benchmark) {
        await benchmarkParsing(parser, config.testInput);
        return;
      }

      const result = parseInput(parser, config.testInput);

      if (!ParserUtils.isParseError(result)) {
        log.success('Parse successful');
        let ast = result.result;

        // Apply AST transformation if script is provided
        if (config.transformScript) {
          try {
            const transformPath = resolve(process.cwd(), config.transformScript);
            log.info(`Loading AST transformation script: ${transformPath}`);
            const { default: transformFn } = await import(transformPath);
            if (typeof transformFn === 'function') {
              ast = transformFn(ast);
              log.success('AST transformed.');
            } else {
              log.warn(`Transformation script '${config.transformScript}' does not export a default function.`);
            }
          } catch (transformErr) {
            log.error(`Failed to apply AST transformation: ${transformErr instanceof Error ? transformErr.message : String(transformErr)}`);
            process.exit(1);
          }
        }

        // Print AST if requested (after transformation)
        if (config.ast) {
          log.info('Parsed AST (after transformation if applied):');
          console.log(JSON.stringify(ast, null, 2));
        }

        // Apply code generation if script is provided
        if (config.codegenScript) {
          try {
            const codegenPath = resolve(process.cwd(), config.codegenScript);
            log.info(`Loading code generation script: ${codegenPath}`);
            const { default: codegenFn } = await import(codegenPath);
            if (typeof codegenFn === 'function') {
              const generatedCode = codegenFn(ast);
              log.success('Code generated.');
              console.log(`${colors.bold}GENERATED CODE:${colors.reset}\n${generatedCode}`);
            } else {
              log.warn(`Code generation script '${config.codegenScript}' does not export a default function.`);
            }
          } catch (codegenErr) {
            log.error(`Failed to generate code: ${codegenErr instanceof Error ? codegenErr.message : String(codegenErr)}`);
            process.exit(1);
          }
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
