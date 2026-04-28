import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repo, relativePath), 'utf-8');

const importSpecifiers = (source: string): string[] => {
  const matches = source.matchAll(/from\s+['"]([^'"]+)['"]/g);
  return Array.from(matches, (match) => match[1]);
};

describe('module registry layering', () => {
  test('module registry files stay independent from runtime and parser layers', () => {
    for (const file of [
      'src/lumina/module-registry.ts',
      'src/lumina/module-registry-builders.ts',
      'src/lumina/module-registry-types.ts',
      'src/lumina/module-registry-domains.ts',
      'src/lumina/module-registry-system.ts',
      'src/lumina/module-registry-system-io.ts',
      'src/lumina/module-registry-system-browser.ts',
      'src/lumina/module-registry-system-runtime.ts',
      'src/lumina/module-registry-collections.ts',
      'src/lumina/module-registry-collections-scalars.ts',
      'src/lumina/module-registry-collections-sequences.ts',
      'src/lumina/module-registry-collections-assoc.ts',
      'src/lumina/module-registry-collections-algebraic.ts',
      'src/lumina/module-registry-collections-pipeline.ts',
      'src/lumina/module-registry-concurrency.ts',
      'src/lumina/module-registry-ui.ts',
      'src/lumina/module-registry-ui-webgpu.ts',
      'src/lumina/module-registry-ui-render.ts',
      'src/lumina/module-registry-ui-reactive.ts',
      'src/lumina/module-registry-functional.ts',
    ]) {
      const specs = importSpecifiers(read(file));
      for (const spec of specs) {
        expect(spec).not.toMatch(/\.\.\/runtime\//);
        expect(spec).not.toMatch(/\.\.\/parser\//);
        expect(spec).not.toMatch(/\.\.\/grammar\//);
        expect(spec).not.toMatch(/\.\.\/bin\//);
      }
    }
  });

  test('main module registry stays on domain helpers instead of inlining new std assembly helpers', () => {
    const source = read('src/lumina/module-registry.ts');
    expect(source).toContain("from './module-registry-domains.js'");
  });

  test('domain files depend on support layers instead of the main registry facade', () => {
    for (const file of [
      'src/lumina/module-registry-domains.ts',
      'src/lumina/module-registry-system.ts',
      'src/lumina/module-registry-system-io.ts',
      'src/lumina/module-registry-system-browser.ts',
      'src/lumina/module-registry-system-runtime.ts',
      'src/lumina/module-registry-collections.ts',
      'src/lumina/module-registry-collections-scalars.ts',
      'src/lumina/module-registry-collections-sequences.ts',
      'src/lumina/module-registry-collections-assoc.ts',
      'src/lumina/module-registry-collections-algebraic.ts',
      'src/lumina/module-registry-collections-pipeline.ts',
      'src/lumina/module-registry-concurrency.ts',
      'src/lumina/module-registry-ui.ts',
      'src/lumina/module-registry-ui-webgpu.ts',
      'src/lumina/module-registry-ui-render.ts',
      'src/lumina/module-registry-ui-reactive.ts',
      'src/lumina/module-registry-functional.ts',
    ]) {
      const specs = importSpecifiers(read(file));
      expect(specs).not.toContain('./module-registry.js');
    }
  });

  test('main module registry stays below the current growth budget', () => {
    const lineCount = read('src/lumina/module-registry.ts').split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(500);
  });

  test('domain registry files stay below the current per-domain budget', () => {
    const budgets = new Map<string, number>([
      ['src/lumina/module-registry-system.ts', 100],
      ['src/lumina/module-registry-system-io.ts', 400],
      ['src/lumina/module-registry-system-browser.ts', 950],
      ['src/lumina/module-registry-system-runtime.ts', 600],
      ['src/lumina/module-registry-collections.ts', 100],
      ['src/lumina/module-registry-collections-scalars.ts', 500],
      ['src/lumina/module-registry-collections-sequences.ts', 450],
      ['src/lumina/module-registry-collections-assoc.ts', 650],
      ['src/lumina/module-registry-collections-algebraic.ts', 300],
      ['src/lumina/module-registry-collections-pipeline.ts', 550],
      ['src/lumina/module-registry-concurrency.ts', 900],
      ['src/lumina/module-registry-ui.ts', 100],
      ['src/lumina/module-registry-ui-webgpu.ts', 400],
      ['src/lumina/module-registry-ui-render.ts', 2200],
      ['src/lumina/module-registry-ui-reactive.ts', 200],
      ['src/lumina/module-registry-functional.ts', 500],
    ]);

    for (const [file, budget] of budgets) {
      const lineCount = read(file).split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(budget);
    }
  });
});
