import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { BrowserProjectContext } from '../src/project/browser-context.js';
import { playgroundPresets } from '../playground/src/presets';
import { buildRunnableModuleGraph } from '../playground/src/runnable-module-graph';

const repoRoot = path.resolve(__dirname, '..');
const grammar = fs.readFileSync(path.join(repoRoot, 'src', 'grammar', 'lumina.peg'), 'utf-8');
const prelude = fs.readFileSync(path.join(repoRoot, 'std', 'prelude.lm'), 'utf-8');
const routerStd = fs.readFileSync(path.join(repoRoot, 'std', 'router.lm'), 'utf-8');

describe('playground runnable module graph', () => {
  test('starter-app preset emits a runnable source-backed router module', () => {
    const parser = compileGrammar(grammar, { cache: true });
    const project = new BrowserProjectContext(parser, {
      preludeText: prelude,
      virtualFiles: {
        '@std/router': routerStd,
      },
    });
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');

    expect(preset).toBeTruthy();

    project.addOrUpdateDocument('main.lm', `${preset!.source.trim()}\n`, 1);

    const errors = project.getDiagnostics('main.lm').filter((diagnostic) => diagnostic.severity === 'error');
    expect(errors).toHaveLength(0);

    const routerUri = project.resolveImportUri('main.lm', '@std/router');
    const graph = buildRunnableModuleGraph({
      project,
      entryUri: 'main.lm',
      runtimeUrl: 'https://example.com/lumina-runtime.js',
    });

    expect(graph.entryUri).toBe('main.lm');
    expect(graph.modules.some((module) => module.uri === 'main.lm')).toBe(true);
    expect(graph.modules.some((module) => module.uri === routerUri)).toBe(true);

    const entryModule = graph.modules.find((module) => module.uri === 'main.lm');
    const routerModule = graph.modules.find((module) => module.uri === routerUri);

    expect(entryModule?.sourceImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resolvedUri: routerUri,
        }),
      ])
    );
    expect(routerModule?.code).toContain('createRouter');
    expect(routerModule?.code).toContain('export {');
  }, 20000);
});
