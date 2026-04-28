import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repo, relativePath), 'utf-8');

const importSpecifiers = (source: string): string[] => {
  const matches = source.matchAll(/from\s+['"]([^'"]+)['"]/g);
  return Array.from(matches, (match) => match[1]);
};

describe('runtime layering boundaries', () => {
  test('runtime support modules do not depend on compiler or parser layers', () => {
    const runtimeDir = path.join(repo, 'src', 'runtime');
    const files = fs.readdirSync(runtimeDir).filter((entry) => entry.endsWith('.ts'));

    for (const file of files) {
      const specs = importSpecifiers(fs.readFileSync(path.join(runtimeDir, file), 'utf-8'));
      for (const spec of specs) {
        expect(spec).not.toMatch(/\.\.\/lumina\//);
        expect(spec).not.toMatch(/\.\.\/parser\//);
        expect(spec).not.toMatch(/\.\.\/grammar\//);
        expect(spec).not.toMatch(/\.\.\/bin\//);
      }
    }
  });

  test('compiler ui passes do not depend on runtime support modules', () => {
    for (const file of ['src/lumina/render-lowering.ts', 'src/lumina/codegen-js.ts']) {
      const specs = importSpecifiers(read(file));
      for (const spec of specs) {
        expect(spec).not.toMatch(/\.\.\/runtime\//);
        expect(spec).not.toBe('../testing-dom.js');
      }
    }
  });

  test('main runtime consumes extracted support modules explicitly', () => {
    const runtimeSource = read('src/lumina-runtime.ts');
    expect(runtimeSource).toContain("from './runtime/dom-accessibility.js'");
    expect(runtimeSource).toContain("from './runtime/devtools.js'");
    expect(runtimeSource).toContain("from './runtime/ssg.js'");
    expect(runtimeSource).toContain("from './runtime/testing-facade.js'");
    expect(runtimeSource).toContain("from './runtime/node-platform.js'");
  });
});
