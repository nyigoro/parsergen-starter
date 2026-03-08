import fs from 'node:fs';
import path from 'node:path';
import { runLumina } from '../src/bin/lumina-core.js';

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

async function runCompile(argv: string[]) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  let exitCode: number | null = null;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT:${exitCode}`);
  }) as typeof process.exit;

  try {
    await runLumina(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith('EXIT:')) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return { logs, errors, exitCode };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('topological compile default', () => {
  test('compiles a single-file program without extra flags', async () => {
    const root = createWorkspace('.tmp-topo-default-single-');
    const entry = path.join(root, 'main.lm');
    const outPath = path.join(root, 'out.js');
    writeFile(entry, 'fn main() -> i32 { 42 }\n');

    const result = await runCompile(['compile', entry, '--out', outPath]);

    expect(result.exitCode).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test('compiles a multi-file program without extra flags', async () => {
    const root = createWorkspace('.tmp-topo-default-multi-');
    const entry = path.join(root, 'main.lm');
    const helper = path.join(root, 'helper.lm');
    const outPath = path.join(root, 'out.js');
    writeFile(helper, 'pub fn answer() -> i32 { 42 }\n');
    writeFile(entry, 'import { answer } from "./helper";\nfn main() -> i32 { answer() }\n');

    const result = await runCompile(['compile', entry, '--out', outPath]);

    expect(result.exitCode).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, 'utf-8')).toContain('answer');
  });

  test('accepts --topo-compile as a compatibility flag', async () => {
    const root = createWorkspace('.tmp-topo-default-compat-');
    const entry = path.join(root, 'main.lm');
    const outPath = path.join(root, 'out.js');
    writeFile(entry, 'fn main() -> i32 { 7 }\n');

    const result = await runCompile(['compile', entry, '--out', outPath, '--topo-compile']);

    expect(result.exitCode).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test('reports module cycles on the default topological path', async () => {
    const root = createWorkspace('.tmp-topo-default-cycle-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    const outPath = path.join(root, 'out.js');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');
    writeFile(bPath, 'import { a } from "./a";\nfn b() { }\n');

    const result = await runCompile(['compile', aPath, '--out', outPath]);

    expect(result.exitCode).toBe(1);
    expect(result.errors.join('\n')).toContain('MODULE-CYCLE-001');
    expect(fs.existsSync(outPath)).toBe(false);
  });

  test('allows opting into the legacy bundled path with --bundled-compile', async () => {
    const root = createWorkspace('.tmp-topo-default-bundled-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    const outPath = path.join(root, 'out.js');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');
    writeFile(bPath, 'import { a } from "./a";\nfn b() { }\n');

    const result = await runCompile(['compile', aPath, '--out', outPath, '--bundled-compile']);

    expect(result.exitCode).toBeNull();
    expect(result.errors.join('\n')).not.toContain('MODULE-CYCLE-001');
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
