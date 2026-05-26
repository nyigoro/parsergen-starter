import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDirs: string[] = [];
const repoRoot = path.resolve(__dirname, '..');
const distPluginUrl = pathToFileURL(path.join(repoRoot, 'dist', 'vite-plugin.js')).href;

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vite-plugin-'));
  tempDirs.push(dir);
  return dir;
};

const runDistPluginProbe = (workspace: string, scriptBody: string): void => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import { luminaPlugin } from ${JSON.stringify(distPluginUrl)};
        const workspace = ${JSON.stringify(workspace)};
        const plugin = luminaPlugin();
        plugin.configResolved?.({ root: workspace });
        ${scriptBody}
      `,
    ],
    {
      cwd: workspace,
      encoding: 'utf-8',
      env: { ...process.env, JEST_WORKER_ID: undefined },
    }
  );
  if (result.status !== 0) {
    throw new Error(`${result.stderr}\n${result.stdout}`.trim());
  }
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina Vite plugin', () => {
  test('built plugin resolves package assets when the consumer cwd is outside the repository', () => {
    const workspace = createTempDir();
    const entryPath = path.join(workspace, 'main.lm');
    const expected = path.join(repoRoot, 'std', 'render.lm');
    fs.writeFileSync(entryPath, 'import { text } from "@std/render";\nfn main() { }\n', 'utf-8');

    runDistPluginProbe(
      workspace,
      `
        const resolved = plugin.resolveId?.('@std/render', ${JSON.stringify(entryPath)});
        if (resolved !== ${JSON.stringify(expected)}) {
          throw new Error('Unexpected @std/render resolution: ' + resolved);
        }
      `
    );
  });

  test('built plugin resolves transitive package imports from exact dependency metadata', () => {
    const workspace = createTempDir();
    const entryPath = path.join(workspace, 'main.lm');
    const fooEntry = path.join(workspace, '.lumina', 'packages', 'foo@1.0.0', 'src', 'foo.lm');
    const barEntry = path.join(workspace, '.lumina', 'packages', 'bar@1.0.0', 'src', 'bar.lm');
    const newerBarEntry = path.join(workspace, '.lumina', 'packages', 'bar@1.2.0', 'src', 'bar.lm');
    fs.mkdirSync(path.dirname(fooEntry), { recursive: true });
    fs.mkdirSync(path.dirname(barEntry), { recursive: true });
    fs.mkdirSync(path.dirname(newerBarEntry), { recursive: true });
    fs.writeFileSync(entryPath, 'import { foo } from "foo";\nfn main() -> int { foo() }\n', 'utf-8');
    fs.writeFileSync(fooEntry, 'import { bar } from "bar";\npub fn foo() -> int { bar() }\n', 'utf-8');
    fs.writeFileSync(barEntry, 'pub fn bar() -> int { 7 }\n', 'utf-8');
    fs.writeFileSync(newerBarEntry, 'pub fn bar() -> int { 12 }\n', 'utf-8');
    fs.writeFileSync(
      path.join(workspace, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'foo@1.0.0': {
              name: 'foo',
              version: '1.0.0',
              resolved: 'https://registry.example.dev/foo-1.0.0.tgz',
              path: './.lumina/packages/foo@1.0.0',
              integrity: 'sha256:foo',
              lumina: './src/foo.lm',
              deps: { bar: '^1.0.0' },
              resolvedDeps: { bar: 'bar@1.0.0' },
            },
            'bar@1.0.0': {
              name: 'bar',
              version: '1.0.0',
              resolved: 'https://registry.example.dev/bar-1.0.0.tgz',
              path: './.lumina/packages/bar@1.0.0',
              integrity: 'sha256:bar1',
              lumina: './src/bar.lm',
              deps: {},
            },
            'bar@1.2.0': {
              name: 'bar',
              version: '1.2.0',
              resolved: 'https://registry.example.dev/bar-1.2.0.tgz',
              path: './.lumina/packages/bar@1.2.0',
              integrity: 'sha256:bar12',
              lumina: './src/bar.lm',
              deps: {},
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    runDistPluginProbe(
      workspace,
      `
        const foo = plugin.resolveId?.('foo', ${JSON.stringify(entryPath)});
        const bar = plugin.resolveId?.('bar', ${JSON.stringify(fooEntry)});
        if (foo !== ${JSON.stringify(fooEntry)}) throw new Error('Unexpected foo resolution: ' + foo);
        if (bar !== ${JSON.stringify(barEntry)}) throw new Error('Unexpected bar resolution: ' + bar);
      `
    );
  });
});
