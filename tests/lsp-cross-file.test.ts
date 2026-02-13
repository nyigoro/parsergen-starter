import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildModuleGraph, resolveSymbol } from '../src/lsp/module-graph.js';

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

function resolveLikeLsp(
  project: ProjectContext,
  graph: ReturnType<typeof buildModuleGraph>,
  uri: string,
  identifier: string,
  member?: string
) {
  const resolved = resolveSymbol(graph, uri, identifier, member);
  if (resolved) return resolved;
  const local = project.findSymbolLocation(identifier, uri);
  if (!local) return null;
  return { uri: local.uri, location: local.location, type: 'unknown', kind: 'value' as const };
}

describe('LSP cross-file definition resolution', () => {
  test('resolves definition for named import', () => {
    const files = {
      'parser.lm': `
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
    const { project, graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveLikeLsp(project, graph, entryUri, 'parse');
    expect(def).toBeTruthy();
    expect(def?.uri).toContain('parser.lm');
  });

  test('resolves definition for aliased import', () => {
    const files = {
      'parser.lm': `
        pub fn parse(input: string) -> int { return 42; }
      `,
      'main.lm': `
        import { parse as parseInput } from "./parser.lm";

        fn main() {
          let result = parseInput("test");
        }
      `,
    };
    const { project, graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveLikeLsp(project, graph, entryUri, 'parseInput');
    expect(def).toBeTruthy();
    expect(def?.uri).toContain('parser.lm');
  });

  test('resolves definition for namespace import member', () => {
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
    const { project, graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveLikeLsp(project, graph, entryUri, 'math', 'add');
    expect(def).toBeTruthy();
    expect(def?.uri).toContain('math.lm');
  });

  test('resolves local definitions (no import)', () => {
    const files = {
      'main.lm': `
        fn helper(x: int) -> int { return x * 2; }

        fn main() {
          let result = helper(5);
        }
      `,
    };
    const { project, graph, entryUri } = makeProject(files, 'main.lm');
    const def = resolveLikeLsp(project, graph, entryUri, 'helper');
    expect(def).toBeTruthy();
    expect(def?.uri).toContain('main.lm');
  });
});
