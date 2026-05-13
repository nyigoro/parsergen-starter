import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { BrowserProjectContext } from '../src/project/browser-context.js';
import { buildRunnableModuleGraph } from '../playground/src/runnable-module-graph';

const repoRoot = path.resolve(__dirname, '..');
const grammar = fs.readFileSync(path.join(repoRoot, 'src', 'grammar', 'lumina.peg'), 'utf-8');
const prelude = fs.readFileSync(path.join(repoRoot, 'std', 'prelude.lm'), 'utf-8');

describe('playground runnable module graph', () => {
  test('single-source playground entry emits a runnable main module', () => {
    const parser = compileGrammar(grammar, { cache: true });
    const source = `
      import { io } from "@std";

      fn main() -> int {
        io.println("ready");
        return 1
      }
    `;
    const project = new BrowserProjectContext(parser, {
      preludeText: prelude,
      virtualFiles: {
        'main.lm': source,
      },
    });

    project.addOrUpdateDocument('main.lm', source, 1);
    expect(project.getDiagnostics('main.lm').filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);

    const graph = buildRunnableModuleGraph({
      project,
      entryUri: 'main.lm',
      runtimeUrl: 'https://example.com/lumina-runtime.js',
    });

    expect(graph.entryUri).toBe('main.lm');
    expect(graph.modules.some((module) => module.uri === 'main.lm')).toBe(true);
  }, 20000);
});
