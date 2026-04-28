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
    expect(runtimeSource).toContain("from './runtime/app-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/algebra-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/browser-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/channel-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/collections-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/core-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/concurrency-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/dom-renderer.js'");
    expect(runtimeSource).toContain("from './runtime/devtools.js'");
    expect(runtimeSource).toContain("from './runtime/frame-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/headless-primitives-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/headless-ui-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/props-core.js'");
    expect(runtimeSource).toContain("from './runtime/resource-core.js'");
    expect(runtimeSource).toContain("from './runtime/reactive-core.js'");
    expect(runtimeSource).toContain("from './runtime/render-api.js'");
    expect(runtimeSource).toContain("from './runtime/render-core.js'");
    expect(runtimeSource).toContain("from './runtime/root-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/render-targets.js'");
    expect(runtimeSource).toContain("from './runtime/ssr-renderer.js'");
    expect(runtimeSource).toContain("from './runtime/system-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/transition-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/value-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/webgpu-runtime.js'");
    expect(runtimeSource).toContain("from './runtime/node-platform.js'");
    expect(runtimeSource).toContain("from './runtime/vnode-core.js'");
  });

  test('custom-element support stays below the main runtime facade', () => {
    expect(read('src/lumina-runtime.ts')).not.toContain("from './runtime/custom-elements.js'");
    expect(read('src/runtime/app-runtime.ts')).toContain("from './custom-elements.js'");
    expect(read('src/runtime/render-api.ts')).toContain("from './custom-elements.js'");
  });
});
