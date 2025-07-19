import { compileGrammar, CompiledGrammar } from './grammar/index.js';
import { ParseError, parseInput } from './parser/index.js';
import { formatError } from './utils/index.js';

import readline from 'node:readline';

export function runREPL() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'parsergen> ',
  });

  console.log('📘 ParserGen REPL');
  console.log('Commands:\n  .grammar <PEG grammar>\n  .test <input>\n  .exit\n');

  // Use a more specific type for the parser variable.
  let currentParser: CompiledGrammar<unknown> | null = null;

  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();

    if (trimmed === '.exit') {
      rl.close();
      return;
    }

    if (trimmed.startsWith('.grammar ')) {
      const grammar = trimmed.slice(9);
      try {
        currentParser = compileGrammar(grammar);
        console.log('✓ Grammar compiled successfully');
      } catch (error) {
        console.error('✗ Grammar error:\n' + formatError(error as ParseError));
      }
    } else if (trimmed.startsWith('.test ')) {
      const input = trimmed.slice(6);
      if (!currentParser) {
        console.error('✗ No grammar loaded. Use .grammar <grammar> first');
      } else {
        try {
          // The 'as unknown' cast is no longer needed due to the correct type.
          const result = parseInput(currentParser, input);
          console.log('✓ Parse result:\n' + JSON.stringify(result, null, 2));
        } catch (error) {
          console.error('✗ Parse error:\n' + formatError(error as ParseError));
        }
      }
    } else {
      console.log('Unknown command. Use .grammar <...>, .test <...>, or .exit');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}

// If this file is run directly
if (process.argv[1]?.endsWith('repl.ts')) {
  runREPL();
}