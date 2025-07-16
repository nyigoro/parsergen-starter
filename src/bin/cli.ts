#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { argv } from 'node:process';

import {
  compileGrammarFromFile,
  validateGrammar,
  analyzeGrammar,
} from '../grammar/index.js';
import { parseInput, ParserUtils } from '../parser/index.js';
import { formatError } from '../utils/index.js';

function printHelp() {
  console.log(`
Usage: parsergen <grammar.peg> [--test "<input>"] [options]

Options:
  --test <input>     Test grammar by parsing input string
  --validate         Only validate grammar (no parsing)
  --analyze          Show metadata like rules, startRule, imports/exports
  --ast              Print full parse AST
  --help, -h         Show this help
`);
}

async function main() {
  const args = argv.slice(2);
  const file = args[0];

  if (!file || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  let grammarText = '';
  try {
    grammarText = await fs.readFile(file, 'utf-8');
  } catch (err: any) {
    console.error(`❌ Failed to read ${file}:\n${err.message}`);
    process.exit(1);
  }

  if (args.includes('--validate')) {
    const result = validateGrammar(grammarText);
    if (result.valid) {
      console.log('✅ Grammar is valid.');
    } else {
      console.error('❌ Grammar is invalid:\n' + result.error);
      process.exit(1);
    }
    return;
  }

  if (args.includes('--analyze')) {
    const meta = analyzeGrammar(grammarText);
    console.log('📊 Grammar Metadata:\n', meta);
    return;
  }

  let parser;
  try {
    parser = await compileGrammarFromFile(file);
    console.log(`✅ Grammar compiled: ${file}`);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

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
    console.log('ℹ️  No --test input provided. Grammar compiled successfully.');
  }
}

main();
