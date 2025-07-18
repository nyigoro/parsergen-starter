#!/usr/bin/env node
import fs from 'node:fs/promises';
import { watchFile } from 'node:fs';
import { argv } from 'node:process';

import {
  compileGrammar,
  compileGrammarFromFile,
  validateGrammar,
  analyzeGrammarAdvanced,
} from '../grammar/index.js';
import { parseInput, ParserUtils } from '../parser/index.js';
import { formatError } from '../utils/index.js';

// Define the valid format types with const assertion for type safety
const VALID_FORMATS = ['bare', 'commonjs', 'es', 'globals', 'umd'] as const;
type OutputFormat = typeof VALID_FORMATS[number];

function printHelp() {
  console.log(`
Usage: parsergen <grammar.peg> [options]

Options:
  --test <input>         Test grammar by parsing input string
  --validate             Only validate grammar (no parsing)
  --analyze              Show grammar metadata
  --out <file>           Output compiled parser as JS
  --format <target>      Format for output: ${VALID_FORMATS.join(' | ')} (default: es)
  --ast                  Print parse AST
  --watch                Watch grammar file and auto-recompile
  --help, -h             Show help
`);
}

function isValidFormat(format: string): format is OutputFormat {
  return VALID_FORMATS.includes(format as OutputFormat);
}

async function compileAndWrite(grammarPath: string, outFile: string, format: OutputFormat) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  
  // Import Peggy directly to generate source code
  const PEG = await import('peggy');
  
  // Create format-specific options for Peggy
  const baseOptions = {
    allowedStartRules: ['*'],
    cache: false,
    optimize: 'speed' as const,
    output: 'source' as const,
    trace: false,
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
        exportVar: 'Parser', // Required for globals format
      });
      break;
    case 'umd':
      compiledSource = PEG.generate(grammarText, {
        ...baseOptions,
        format: 'umd' as const,
        exportVar: 'Parser', // Also required for UMD format
      });
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  await fs.writeFile(outFile, compiledSource, 'utf-8');
  console.log(`✅ Rebuilt parser: ${outFile}`);
}

async function main() {
  const args = argv.slice(2);
  const grammarPath = args[0];

  if (!grammarPath || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const grammarText = await fs.readFile(grammarPath, 'utf-8');

  // Validate
  if (args.includes('--validate')) {
    const result = validateGrammar(grammarText);
    if (result.valid) {
  console.log('✅ Grammar is valid.');
} else {
  console.error('❌ Grammar is invalid:\n' + result.error);
}
process.exit(result.valid ? 0 : 1);
  }

  // Analyze
  if (args.includes('--analyze')) {
    console.log('📊 Metadata:', analyzeGrammarAdvanced(grammarText));
    return;
  }

  const outIndex = args.indexOf('--out');
  const outFile = outIndex !== -1 ? args[outIndex + 1] : null;

  const formatIndex = args.indexOf('--format');
  const formatArg = formatIndex !== -1 ? args[formatIndex + 1] : 'es';
  
  // Validate format argument
  if (!isValidFormat(formatArg)) {
    console.error(`❌ Invalid format: ${formatArg}. Valid formats: ${VALID_FORMATS.join(', ')}`);
    process.exit(1);
  }
  
  const format: OutputFormat = formatArg;

  // Watch mode
  if (args.includes('--watch') && outFile) {
    console.log(`👀 Watching ${grammarPath}...`);
    await compileAndWrite(grammarPath, outFile, format);
    watchFile(grammarPath, { interval: 300 }, async () => {
      try {
        await compileAndWrite(grammarPath, outFile, format);
      } catch (err: any) {
        console.error('❌ Error during rebuild:\n' + err.message);
      }
    });
    return;
  }

  // Normal out compile
  if (outFile) {
    await compileAndWrite(grammarPath, outFile, format);
    return;
  }

  // Default: compile and optionally test
  const parser = await compileGrammarFromFile(grammarPath);
  console.log(`✅ Grammar compiled: ${grammarPath}`);

  const testIndex = args.indexOf('--test');
  if (testIndex !== -1 && args[testIndex + 1]) {
    const input = args[testIndex + 1];
    const result = parseInput(parser, input);
    if (ParserUtils.isSuccess(result)) {
      console.log('✅ Parse Success');
      if (args.includes('--ast')) {
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      console.error('❌ Parse Error:\n' + formatError(result));
      process.exit(1);
    }
  } else {
    console.log('ℹ️  No --test provided. Grammar OK.');
  }
}

main();