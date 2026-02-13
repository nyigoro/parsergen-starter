import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildModuleGraph, resolveSymbol } from '../src/lsp/module-graph.js';
import { formatHoverContents } from '../src/lsp/hover-format.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeProject(files: Record<string, string>, entry: string) {
  const project = new ProjectContext(parser);
  for (const [name, source] of Object.entries(files)) {
    project.registerVirtualFile(name, source.trim() + '\n', 1);
  }
  const entryUri = `virtual://${entry}`;
  const graph = buildModuleGraph(project, entryUri);
  return { project, graph, entryUri };
}

describe('LSP hover formatting with cross-file definitions', () => {
  test('hover includes source location and doc comment for named import', () => {
    const files = {
      'parser.lm': `
        /// Parse JSON input.
        pub fn parse(input: string) -> int {
          return 42;
        }
      `,
      'main.lm': `
        import { parse } from "./parser.lm";

        fn main() {
          let result = parse("test");
        }
      `,
    };
    const { graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveSymbol(graph, entryUri, 'parse');
    expect(def).toBeTruthy();
    const contents = formatHoverContents('parse(input: string) -> int', def ?? undefined);
    expect(contents).toContain('Defined in `parser.lm:2`');
    expect(contents).toContain('Parse JSON input.');
  });

  test('hover includes source location for namespace member', () => {
    const files = {
      'math.lm': `
        pub fn add(a: int, b: int) -> int { return a + b; }
      `,
      'main.lm': `
        import * as math from "./math.lm";

        fn main() {
          let sum = math.add(1, 2);
        }
      `,
    };
    const { graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveSymbol(graph, entryUri, 'math', 'add');
    expect(def).toBeTruthy();
    const contents = formatHoverContents('add(a: int, b: int) -> int', def ?? undefined);
    expect(contents).toContain('Defined in `math.lm:1`');
  });
});
