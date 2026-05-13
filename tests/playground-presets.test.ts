import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const examplesDataPath = path.join(repoRoot, 'playground', 'src', 'examples-data.ts');

describe('playground examples data', () => {
  test('keeps the Phase 1 examples grouped by product area', () => {
    const source = fs.readFileSync(examplesDataPath, 'utf-8');

    for (const group of ['LANGUAGE_CORE', 'TYPE_SYSTEM', 'REACTIVE_UI', 'WEB_NATIVE', 'ADVANCED']) {
      expect(source).toContain(`id: '${group}'`);
    }

    for (const exampleId of [
      'basics',
      'safe-index',
      'counter',
      'dom-render',
      'tabs',
      'forms-store-resource',
      'ui-showcase',
      'gadts',
      'hkt-stdlib',
      'const-generics',
      'traits-demo',
      'wasm-hello',
      'web-components',
      'channels-mpsc',
      'thread-patterns',
      'async-json-validator',
      'json-parser',
      'github-demo',
      'http-demo',
    ]) {
      expect(source).toContain(`'${exampleId}'`);
    }
  });

  test('mines real example files instead of invented snippets', () => {
    const source = fs.readFileSync(examplesDataPath, 'utf-8');
    const rawImports = Array.from(source.matchAll(/import\s+\w+Source\s+from\s+'([^']+)\?raw'/g)).map(
      (match) => match[1]
    );

    expect(rawImports.length).toBeGreaterThanOrEqual(16);
    for (const specifier of rawImports) {
      const resolved = path.resolve(path.dirname(examplesDataPath), specifier);
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });
});
