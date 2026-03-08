import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildModuleGraph,
  clearModuleGraphCache,
  compileInOrder,
  recompileAffected,
  type ExportEnv,
  type ModuleNode,
} from '../src/lumina/module-graph.js';
import { createWatchSessionController } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];

function mkTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, source: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf-8');
}

function graphOptions(root: string) {
  return {
    stdPath: path.join(root, 'std'),
    fileExtensions: ['.lm'],
    lockfileRoot: root,
    cacheDir: path.join(root, '.lumina-cache', 'modules'),
    maxImportDepth: 500,
  };
}

function exportEnvFromSource(source: string): ExportEnv {
  const symbols = new Map<string, { name: string; kind: string }>();
  const types = new Map<string, { name: string }>();
  for (const match of source.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    symbols.set(match[1], { name: match[1], kind: 'FnDecl' });
  }
  for (const match of source.matchAll(/\b(struct|enum|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    types.set(match[2], { name: match[2] });
  }
  return { symbols, types };
}

function createCompileNodeTracker() {
  const counts = new Map<string, number>();
  return {
    counts,
    compileNode: async ({ node }: { node: ModuleNode }) => {
      if (!node.path) return { skipCacheWrite: true };
      const source = await fs.promises.readFile(node.path, 'utf-8');
      counts.set(node.key, (counts.get(node.key) ?? 0) + 1);
      return {
        ast: { type: 'Program', body: [] } as never,
        exportEnv: exportEnvFromSource(source),
      };
    },
  };
}

async function buildCompiledGraph(entryPath: string, root: string) {
  const options = graphOptions(root);
  const graph = await buildModuleGraph(entryPath, options);
  const tracker = createCompileNodeTracker();
  const result = await compileInOrder(graph, { compileNode: tracker.compileNode, cacheDir: options.cacheDir });
  expect(result.success).toBe(true);
  tracker.counts.clear();
  return { graph, options, tracker };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(async () => {
  jest.useRealTimers();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await clearModuleGraphCache(path.join(dir, '.lumina-cache', 'modules'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('watch invalidation', () => {
  test('skips recompilation when touched content is unchanged', async () => {
    const root = mkTempDir('lumina-watch-touch-');
    const mainPath = path.join(root, 'main.lm');
    writeFile(mainPath, 'fn main() -> i32 { 42 }\n');

    const { graph, options, tracker } = await buildCompiledGraph(mainPath, root);
    writeFile(mainPath, 'fn main() -> i32 { 42 }\n');

    const result = await recompileAffected(graph, [mainPath], {
      compileNode: tracker.compileNode,
      cacheDir: options.cacheDir,
    });

    expect(result.success).toBe(true);
    expect(result.stats.compiled).toBe(0);
    expect(tracker.counts.size).toBe(0);
  });

  test('stops propagation when only internal implementation changes', async () => {
    const root = mkTempDir('lumina-watch-internal-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    writeFile(aPath, 'fn value() -> i32 { 1 }\n');
    writeFile(bPath, 'import { value } from "./a";\nfn main() -> i32 { value() }\n');

    const { graph, options, tracker } = await buildCompiledGraph(bPath, root);
    writeFile(aPath, 'fn value() -> i32 { 2 }\n');

    const result = await recompileAffected(graph, [aPath], {
      compileNode: tracker.compileNode,
      cacheDir: options.cacheDir,
    });

    expect(result.success).toBe(true);
    expect(result.stats.compiled).toBe(1);
    expect(tracker.counts.get(aPath)).toBe(1);
    expect(tracker.counts.get(bPath) ?? 0).toBe(0);
    expect(graph.nodes.get(bPath)?.status).toBe('cached');
  });

  test('recompiles dependents when a module export surface changes', async () => {
    const root = mkTempDir('lumina-watch-export-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    writeFile(aPath, 'fn value() -> i32 { 1 }\n');
    writeFile(bPath, 'import { value } from "./a";\nfn main() -> i32 { value() }\n');

    const { graph, options, tracker } = await buildCompiledGraph(bPath, root);
    writeFile(aPath, 'fn value() -> i32 { 1 }\nfn other() -> i32 { 2 }\n');

    const result = await recompileAffected(graph, [aPath], {
      compileNode: tracker.compileNode,
      cacheDir: options.cacheDir,
    });

    expect(result.success).toBe(true);
    expect(result.stats.compiled).toBe(2);
    expect(tracker.counts.get(aPath)).toBe(1);
    expect(tracker.counts.get(bPath)).toBe(1);
    expect(graph.nodes.get(bPath)?.status).toBe('compiled');
  });

  test('reports a cycle cleanly after an edit', async () => {
    const root = mkTempDir('lumina-watch-cycle-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');
    writeFile(bPath, 'fn b() { }\n');

    const { graph, options, tracker } = await buildCompiledGraph(aPath, root);
    writeFile(bPath, 'import { a } from "./a";\nfn b() { }\n');

    const result = await recompileAffected(graph, [bPath], {
      compileNode: tracker.compileNode,
      cacheDir: options.cacheDir,
    });

    expect(result.success).toBe(false);
    expect(Array.from(result.diagnostics.values()).flat().some((diag) => diag.code === 'MODULE-CYCLE-001')).toBe(true);
  });

  test('reports missing-file errors cleanly on unlink', async () => {
    const root = mkTempDir('lumina-watch-unlink-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    writeFile(aPath, 'fn value() -> i32 { 1 }\n');
    writeFile(bPath, 'import { value } from "./a";\nfn main() -> i32 { value() }\n');

    const { graph, options, tracker } = await buildCompiledGraph(bPath, root);
    fs.rmSync(aPath);

    const result = await recompileAffected(graph, [aPath], {
      compileNode: tracker.compileNode,
      cacheDir: options.cacheDir,
    });

    expect(result.success).toBe(false);
    expect(
      Array.from(result.diagnostics.values())
        .flat()
        .some((diag) => diag.code === 'MODULE-READ-001' || diag.code === 'MODULE-RESOLVE-001')
    ).toBe(true);
  });

  test('batches multiple reports into one rebuild pass', async () => {
    jest.useFakeTimers();
    const builds: string[][] = [];
    const controller = createWatchSessionController({
      delay: 100,
      hashFile: async (filePath) => `hash:${path.basename(filePath)}`,
      runIncrementalBuild: async (changed) => {
        builds.push(changed.slice().sort());
      },
    });

    await Promise.all([
      controller.report('a.lm'),
      controller.report('b.lm'),
      controller.report('c.lm'),
      controller.report('d.lm'),
      controller.report('e.lm'),
    ]);
    jest.advanceTimersByTime(100);
    await flushMicrotasks();

    expect(builds).toHaveLength(1);
    expect(builds[0]).toEqual([
      path.resolve('a.lm'),
      path.resolve('b.lm'),
      path.resolve('c.lm'),
      path.resolve('d.lm'),
      path.resolve('e.lm'),
    ]);
  });

  test('queues a rerun when a new change arrives mid-build', async () => {
    jest.useFakeTimers();
    const builds: string[][] = [];
    let releaseBuild: (() => void) | null = null;
    const controller = createWatchSessionController({
      delay: 100,
      hashFile: async (filePath) => `hash:${path.basename(filePath)}:${builds.length}`,
      runIncrementalBuild: async (changed) => {
        builds.push(changed.slice().sort());
        await new Promise<void>((resolve) => {
          releaseBuild = resolve;
        });
      },
    });

    await controller.report('first.lm');
    jest.advanceTimersByTime(100);
    await flushMicrotasks();

    expect(builds).toHaveLength(1);

    await controller.report('second.lm');
    jest.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(builds).toHaveLength(1);

    releaseBuild?.();
    await flushMicrotasks();
    jest.advanceTimersByTime(0);
    await flushMicrotasks();

    expect(builds).toHaveLength(2);
    expect(builds[1]).toEqual([path.resolve('second.lm')]);
  });
});
