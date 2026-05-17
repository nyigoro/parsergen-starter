import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const examplesDataPath = path.join(repoRoot, 'playground', 'src', 'examples-data.ts');

describe('playground examples data', () => {
  test('keeps examples grouped as a curated language tour', () => {
    const source = fs.readFileSync(examplesDataPath, 'utf-8');

    for (const group of ['LANGUAGE_CORE', 'TYPE_SYSTEM', 'REACTIVE_UI', 'WEB_NATIVE', 'ADVANCED']) {
      expect(source).toContain(`id: '${group}'`);
    }

    expect(source).toContain('description:');
    expect(source).toContain('groupId: string');
    expect(source).toContain('featured?: boolean');

    for (const exampleId of [
      'basics',
      'control-flow',
      'safe-index',
      'pattern-match',
      'string-interpolation',
      'named-defaults',
      'list-comprehension',
      'counter',
      'reactive-greeting',
      'algebraic-data',
      'hkt-stdlib',
      'type-holes',
      'wasm-hello',
      'dom-list',
      'channels-mpsc',
      'thread-channel-producer-consumer',
      'thread-patterns',
      'parallel-fibonacci',
    ]) {
      expect(source).toContain(`'${exampleId}'`);
    }
  });

  test('mines real example files instead of invented snippets', () => {
    const source = fs.readFileSync(examplesDataPath, 'utf-8');
    const rawImports = Array.from(source.matchAll(/import\s+\w+Source\s+from\s+'([^']+)\?raw'/g)).map(
      (match) => match[1]
    );

    expect(rawImports.length).toBeGreaterThanOrEqual(7);
    for (const specifier of rawImports) {
      const resolved = path.resolve(path.dirname(examplesDataPath), specifier);
      expect(fs.existsSync(resolved)).toBe(true);
    }
  });
});
