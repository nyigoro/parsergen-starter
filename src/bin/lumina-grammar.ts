import fs from 'node:fs/promises';

import {
  analyzeGrammarAdvanced,
  compileGrammarFromFile,
  validateGrammar,
} from '../grammar/index.js';
import { parseInput, ParserUtils } from '../parser/index.js';
import { formatCompilationError, formatError } from '../utils/index.js';

const VALID_FORMATS = ['bare', 'commonjs', 'es', 'globals', 'umd'] as const;
type OutputFormat = typeof VALID_FORMATS[number];
const VALID_OPTIMIZE_MODES = ['speed', 'size'] as const;
type OptimizeMode = typeof VALID_OPTIMIZE_MODES[number];

type GrammarCommandConfig = {
  grammarPath?: string;
  testInput?: string;
  outFile?: string;
  format: OutputFormat;
  optimize: OptimizeMode;
  validate: boolean;
  analyze: boolean;
  ast: boolean;
  help: boolean;
};

const isValidFormat = (format: string): format is OutputFormat =>
  VALID_FORMATS.includes(format as OutputFormat);

const isValidOptimizeMode = (optimize: string): optimize is OptimizeMode =>
  VALID_OPTIMIZE_MODES.includes(optimize as OptimizeMode);

function printGrammarHelp(): void {
  console.log(`
lumina grammar <grammar.peg> [options]

Options:
  --test <input>          Test the grammar by parsing an input string
  --test-file <file>      Test the grammar by parsing file content
  --validate              Validate grammar syntax only
  --analyze               Print grammar metadata as JSON
  --out <file>            Emit a compiled JavaScript parser
  --format <target>       Parser format: ${VALID_FORMATS.join(' | ')} (default: es)
  --optimize <mode>       Parser optimize mode: ${VALID_OPTIMIZE_MODES.join(' | ')} (default: speed)
  --ast                   Print parse output as JSON when used with --test
  --help, -h              Show this help

Examples:
  lumina grammar src/grammar/lumina.peg --validate
  lumina grammar grammar.peg --test "input" --ast
  lumina grammar grammar.peg --out parser.js --format es
`);
}

function failGrammarCommand(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

async function parseGrammarArgs(args: string[]): Promise<GrammarCommandConfig> {
  const config: GrammarCommandConfig = {
    grammarPath: args[0] && !args[0].startsWith('--') ? args[0] : undefined,
    format: 'es',
    optimize: 'speed',
    validate: false,
    analyze: false,
    ast: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        config.help = true;
        break;
      case '--test':
        if (!nextArg) throw new Error('Missing value for --test');
        config.testInput = nextArg;
        i++;
        break;
      case '--test-file':
        if (!nextArg) throw new Error('Missing value for --test-file');
        config.testInput = await fs.readFile(nextArg, 'utf-8');
        i++;
        break;
      case '--out':
        if (!nextArg) throw new Error('Missing value for --out');
        config.outFile = nextArg;
        i++;
        break;
      case '--format':
        if (!nextArg || !isValidFormat(nextArg)) {
          throw new Error(`Invalid parser format. Use one of: ${VALID_FORMATS.join(', ')}`);
        }
        config.format = nextArg;
        i++;
        break;
      case '--optimize':
        if (!nextArg || !isValidOptimizeMode(nextArg)) {
          throw new Error(`Invalid optimize mode. Use one of: ${VALID_OPTIMIZE_MODES.join(', ')}`);
        }
        config.optimize = nextArg;
        i++;
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
      default:
        if (!arg.startsWith('--')) continue;
        throw new Error(`Unknown lumina grammar option: ${arg}`);
    }
  }

  return config;
}

async function compileAndWrite(
  grammarPath: string,
  outFile: string,
  format: OutputFormat,
  optimize: OptimizeMode
): Promise<void> {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const PEG = await import('peggy');
  const baseOptions = {
    allowedStartRules: ['*'],
    cache: false,
    optimize,
    output: 'source' as const,
  };
  let compiledSource: string;

  switch (format) {
    case 'bare':
      compiledSource = PEG.generate(grammarText, { ...baseOptions, format: 'bare' as const });
      break;
    case 'commonjs':
      compiledSource = PEG.generate(grammarText, { ...baseOptions, format: 'commonjs' as const });
      break;
    case 'es':
      compiledSource = PEG.generate(grammarText, { ...baseOptions, format: 'es' as const });
      break;
    case 'globals':
      compiledSource = PEG.generate(grammarText, {
        ...baseOptions,
        format: 'globals' as const,
        exportVar: 'LuminaGrammarParser',
      });
      break;
    case 'umd':
      compiledSource = PEG.generate(grammarText, {
        ...baseOptions,
        format: 'umd' as const,
        exportVar: 'LuminaGrammarParser',
      });
      break;
    default:
      throw new Error(`Unsupported parser format: ${format satisfies never}`);
  }

  await fs.writeFile(outFile, compiledSource, 'utf-8');
  console.log(`Grammar parser written: ${outFile}`);
}

export async function runLuminaGrammar(args: string[]): Promise<void> {
  const config = await parseGrammarArgs(args);
  if (config.help) {
    printGrammarHelp();
    return;
  }
  if (!config.grammarPath) {
    printGrammarHelp();
    throw new Error('Missing grammar file for lumina grammar.');
  }

  const grammarText = await fs.readFile(config.grammarPath, 'utf-8');

  try {
    if (config.validate) {
      const result = validateGrammar(grammarText);
      if (!result.valid) {
        failGrammarCommand(`Grammar validation failed:\n${result.error}`);
        return;
      }
      console.log('Grammar is valid');
      return;
    }

    if (config.analyze) {
      console.log(JSON.stringify(analyzeGrammarAdvanced(grammarText), null, 2));
      return;
    }

    if (config.outFile) {
      await compileAndWrite(config.grammarPath, config.outFile, config.format, config.optimize);
      return;
    }

    const parser = await compileGrammarFromFile(config.grammarPath, { optimize: config.optimize });
    console.log(`Grammar compiled: ${config.grammarPath}`);

    if (config.testInput !== undefined) {
      const result = parseInput(parser, config.testInput);
      if (ParserUtils.isParseError(result)) {
        failGrammarCommand(formatError(result));
        return;
      }
      console.log('Parse successful');
      if (config.ast) console.log(JSON.stringify(result.result, null, 2));
    }
  } catch (error) {
    failGrammarCommand(error instanceof Error ? error.message : formatCompilationError(error, grammarText));
  }
}
