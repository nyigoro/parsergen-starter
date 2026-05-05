import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempDirs: string[] = [];

function createWorkspace(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(process.cwd(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, source: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf-8');
}

function runCommand(argv: string[]) {
  const child = spawnSync(process.execPath, ['--import', 'tsx', './src/bin/lumina.ts', ...argv], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
  return {
    exitCode: child.status,
    logs: String(child.stdout ?? '')
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
    errors: String(child.stderr ?? '')
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina ssg', () => {
  test('renders a bundled entry and its local imports to a static HTML file', () => {
    const root = createWorkspace('.tmp-lumina-ssg-');
    const entry = path.join(root, 'main.lm');
    const part = path.join(root, 'part.lm');
    const outPath = path.join(root, 'dist', 'index.html');

    writeFile(
      part,
      `
        import { text } from "@std/render";

        pub fn title() -> VNode {
          text("Hello SSG")
        }
      `.trim() + '\n'
    );

    writeFile(
      entry,
      `
        import { vnode } from "@std/render";
        import { title } from "./part.lm";

        pub fn main() -> VNode {
          vnode("main", 0, [title()])
        }
      `.trim() + '\n'
    );

    const result = runCommand(['ssg', entry, '--out', outPath, '--title', 'Docs']);

    expect(result.exitCode).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(outPath)).toBe(true);
    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Docs</title>');
    expect(html).toContain('Hello SSG');
  });

  test('threads props into the hydration payload for client handoff', () => {
    const root = createWorkspace('.tmp-lumina-ssg-props-');
    const entry = path.join(root, 'main.lm');
    const outPath = path.join(root, 'dist', 'index.html');

    writeFile(
      entry,
      `
        import { vnode, text } from "@std/render";

        pub fn main(props: any) -> VNode {
          vnode("main", 0, [text("Props SSG")])
        }
      `.trim() + '\n'
    );

    const result = runCommand([
      'ssg',
      entry,
      '--out',
      outPath,
      '--hydrate',
      '/main.js',
      '--props',
      '{"name":"Ada"}',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.errors).toHaveLength(0);
    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('__lumina-hydration');
    expect(html).toContain('"name":"Ada"');
    expect(html).toContain('/main.js');
  });

  test('captures resources created during render in the hydration payload', () => {
    const root = createWorkspace('.tmp-lumina-ssg-resource-');
    const entry = path.join(root, 'main.lm');
    const outPath = path.join(root, 'dist', 'index.html');

    writeFile(
      entry,
      `
        import { render } from "@std";

        async fn load() -> string {
          "loaded"
        }

        pub fn main() -> VNode {
          let resource = render.createResource("ssg:resource", || load(), render.props_attr("scope", "route:ssg"));
          render.text(render.resourceData(resource))
        }
      `.trim() + '\n'
    );

    const result = runCommand(['ssg', entry, '--out', outPath, '--hydrate', '/main.js']);

    expect(result.exitCode).toBe(0);
    expect(result.errors).toHaveLength(0);
    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('"key":"ssg:resource"');
    expect(html).toContain('"scope":"route:ssg"');
  });
});
