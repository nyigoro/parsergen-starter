import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { extractImports } from '../src/project/imports.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar, { cache: true });

describe('extractImports', () => {
  test('collects only real import statements from the parsed program', () => {
    const source = `
      // import { fake } from "./commented";
      let banner = "import {\\"fake\\"} from './string'";
      import { foo } from "./foo";
      import "@std/router";

      pub fn main() -> void {
        let nested = "import {\\"stillFake\\"} from './inner'";
      }
    `;

    expect(extractImports(source, { parser, grammarSource: 'imports-test.lm' })).toEqual([
      './foo',
      '@std/router',
    ]);
  });

  test('keeps import discovery alive on malformed source via recovery path', () => {
    const source = `
      import { foo } from "./foo";
      import { bar } from "./bar";

      pub fn main( -> void {
        foo()
      }
    `;

    expect(extractImports(source, { parser, grammarSource: 'broken-imports.lm' })).toEqual([
      './foo',
      './bar',
    ]);
  });

  test('falls back to tolerant scanning when macro rules contain lexer-only tokens', () => {
    const source = `
      import { marker } from "./marker";

      macro_rules! one {
        ($x:expr) => ($x);
      }

      fn main() -> i32 { one!(41) + marker() }
    `;

    expect(extractImports(source)).toEqual(['./marker']);
  });

  test('falls back to tolerant scanning around derive attributes', () => {
    const source = `
      #[derive(Clone)]
      struct Point {
        x: i32
      }

      import { origin } from "./points";
    `;

    expect(extractImports(source)).toEqual(['./points']);
  });
});
