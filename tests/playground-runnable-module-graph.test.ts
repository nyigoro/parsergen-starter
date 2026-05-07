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
  test('starter-app preset emits source-backed router and sibling modules', () => {
    const parser = compileGrammar(grammar, { cache: true });
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');

    expect(preset).toBeTruthy();

    const project = new BrowserProjectContext(parser, {
      preludeText: prelude,
      virtualFiles: Object.fromEntries([
        ['@std/router', routerStd],
        ...preset!.files.map((file) => [file.uri, `${file.source.trim()}\n`]),
      ]),
    });

    for (const file of preset!.files) {
      if (file.uri.endsWith('.lm')) {
        project.addOrUpdateDocument(file.uri, `${file.source.trim()}\n`, 1);
      }
    }

    const errors = preset!.files
      .filter((file) => file.uri.endsWith('.lm'))
      .flatMap((file) =>
        project.getDiagnostics(file.uri).filter((diagnostic) => diagnostic.severity === 'error')
      );
    expect(errors).toHaveLength(0);

    const routerUri = project.resolveImportUri('main.lm', '@std/router');
    const siblingUri = project.resolveImportUri('main.lm', './routes/settings.lm');
    const graph = buildRunnableModuleGraph({
      project,
      entryUri: 'main.lm',
      runtimeUrl: 'https://example.com/lumina-runtime.js',
    });

    expect(graph.modules.some((module) => module.uri === 'main.lm')).toBe(true);
    expect(graph.modules.some((module) => module.uri === routerUri)).toBe(true);
    expect(graph.modules.some((module) => module.uri === siblingUri)).toBe(true);
  }, 20000);

  test('package-import preset resolves bare package modules through lumina.lock', () => {
    const parser = compileGrammar(grammar, { cache: true });
    const preset = playgroundPresets.find((entry) => entry.id === 'package-import');

    expect(preset).toBeTruthy();

    const project = new BrowserProjectContext(parser, {
      preludeText: prelude,
      virtualFiles: Object.fromEntries(preset!.files.map((file) => [file.uri, `${file.source.trim()}\n`])),
    });

    for (const file of preset!.files) {
      if (file.uri.endsWith('.lm')) {
        project.addOrUpdateDocument(file.uri, `${file.source.trim()}\n`, 1);
      }
    }

    const packageUri = project.resolveImportUri('main.lm', 'json-utils');
    const graph = buildRunnableModuleGraph({
      project,
      entryUri: 'main.lm',
      runtimeUrl: 'https://example.com/lumina-runtime.js',
    });

    expect(graph.modules.some((module) => module.uri === packageUri)).toBe(true);
  }, 20000);
});
