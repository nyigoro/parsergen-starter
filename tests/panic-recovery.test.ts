import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { parseWithPanicRecovery } from '../src/project/panic.js';
import { createLuminaLexer, luminaSyncTokenTypes } from '../src/lumina/lexer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const lexer = createLuminaLexer();

describe('Panic recovery', () => {
  test('collects multiple diagnostics from a single file', () => {
    const program = `
      fn main() {
        let x: int = ;
        let y: int = 1
        if (true { return 1; }
        return y;
      }
    `.trim() + '\n';

    const result = parseWithPanicRecovery(parser, program, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['let', 'if', 'return', 'fn'],
      lexer: (input) => {
        const stream = lexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of stream) {
              yield token;
            }
          },
        };
      },
    });

    expect(result.diagnostics.length).toBeGreaterThan(1);
  });

  test('handles mismatched braces in nested blocks', () => {
    const program = `
      fn main() {
        if (true) {
          let x: int = 1;
        else {
          let y: int = 2;
        }
        return x;
      }
    `.trim() + '\n';

    const result = parseWithPanicRecovery(parser, program, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['let', 'if', 'return', 'fn', 'else'],
      lexer: (input) => {
        const stream = lexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of stream) {
              yield token;
            }
          },
        };
      },
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test('recovers from malformed match arms', () => {
    const program = `
      enum Option { Some(int), None }
      fn main() {
        match Some(1) {
          Some(x) => { return x; }
          None => { return 0; }
          Some( => { return 2; }
        }
        return 0;
      }
    `.trim() + '\n';

    const result = parseWithPanicRecovery(parser, program, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['match', 'let', 'return', 'fn'],
      lexer: (input) => {
        const stream = lexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of stream) {
              yield token;
            }
          },
        };
      },
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test('recovers when semicolons are missing alongside malformed statements', () => {
    const program = `
      fn main() {
        let x: int = 1
        let y: int = ;
        return x + y
      }
    `.trim() + '\n';

    const result = parseWithPanicRecovery(parser, program, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['let', 'return', 'fn'],
      lexer: (input) => {
        const stream = lexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of stream) {
              yield token;
            }
          },
        };
      },
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test('recovers from nested match with missing braces', () => {
    const program = `
      enum Option { Some(int), None }
      fn main() {
        match Some(1) {
          Some(x) => {
            match None {
              None => { return x; }
            // missing closing braces for inner match and outer arm
          },
          None => { return 0; }
        }
        return 0;
      }
    `.trim() + '\n';

    const result = parseWithPanicRecovery(parser, program, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['match', 'let', 'return', 'fn', 'else'],
      lexer: (input) => {
        const stream = lexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of stream) {
              yield token;
            }
          },
        };
      },
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
