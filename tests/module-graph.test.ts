import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildModuleGraph,
  clearModuleGraphCache,
  compileInOrder,
  invalidate,
  type ExportEnv,
} from '../src/lumina/module-graph.js';

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
    cacheDir: path.join(root, '.lumina-cache'),
    maxImportDepth: 500,
  };
}

function emptyExportEnv(): ExportEnv {
  return { symbols: new Map(), types: new Map() };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('module graph / topological compile', () => {
  it('builds linear dependency order C -> B -> A', async () => {
    const root = mkTempDir('lumina-modgraph-linear-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    const cPath = path.join(root, 'c.lm');
    writeFile(cPath, 'fn c() { }\n');
    writeFile(bPath, 'import { c } from "./c";\nfn b() { }\n');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');

    const graph = await buildModuleGraph(aPath, graphOptions(root));
    expect(graph.order.indexOf(cPath)).toBeLessThan(graph.order.indexOf(bPath));
    expect(graph.order.indexOf(bPath)).toBeLessThan(graph.order.indexOf(aPath));
  });

  it('detects cycles and excludes cycle nodes from order', async () => {
    const root = mkTempDir('lumina-modgraph-cycle-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');
    writeFile(bPath, 'import { a } from "./a";\nfn b() { }\n');

    const graph = await buildModuleGraph(aPath, graphOptions(root));
    expect(graph.cycleErrors.length).toBeGreaterThan(0);
    expect(graph.order).toHaveLength(0);
    expect(graph.nodes.get(aPath)?.diagnostics.some((d) => d.code === 'MODULE-CYCLE-001')).toBe(true);
  });

  it('treats @std imports as external nodes', async () => {
    const root = mkTempDir('lumina-modgraph-std-');
    const mainPath = path.join(root, 'main.lm');
    writeFile(mainPath, 'import { push } from "@std/vec";\nfn main() { }\n');
    const graph = await buildModuleGraph(mainPath, graphOptions(root));
    expect(graph.nodes.get('std:@std/vec')?.status).toBe('external');
    expect(graph.order).toContain(mainPath);
  });

  it('reuses cache on unchanged module', async () => {
    const root = mkTempDir('lumina-modgraph-cache-hit-');
    const mainPath = path.join(root, 'main.lm');
    writeFile(mainPath, 'fn main() { }\n');
    const options = graphOptions(root);
    const graph1 = await buildModuleGraph(mainPath, options);
    const first = await compileInOrder(graph1, {
      compileNode: () => ({ ast: { type: 'Program', body: [] } as never, exportEnv: emptyExportEnv() }),
      cacheDir: options.cacheDir,
    });
    expect(first.success).toBe(true);
    expect(first.stats.compiled).toBe(1);

    const graph2 = await buildModuleGraph(mainPath, options);
    const second = await compileInOrder(graph2, {
      compileNode: () => ({ ast: { type: 'Program', body: [] } as never, exportEnv: emptyExportEnv() }),
      cacheDir: options.cacheDir,
    });
    expect(second.stats.cached).toBe(1);
  });

  it('invalidates transitive dependents', async () => {
    const root = mkTempDir('lumina-modgraph-invalidate-');
    const aPath = path.join(root, 'a.lm');
    const bPath = path.join(root, 'b.lm');
    const cPath = path.join(root, 'c.lm');
    writeFile(cPath, 'fn c() { }\n');
    writeFile(bPath, 'import { c } from "./c";\nfn b() { }\n');
    writeFile(aPath, 'import { b } from "./b";\nfn a() { }\n');
    const graph = await buildModuleGraph(aPath, graphOptions(root));
    const invalidated = invalidate(graph, [cPath]);
    expect(new Set(invalidated)).toEqual(new Set([cPath, bPath, aPath]));
  });

  it('resolves bare package imports from legacy lockfile format', async () => {
    const root = mkTempDir('lumina-modgraph-package-');
    const pkgRoot = path.join(root, 'node_modules', 'json-utils');
    writeFile(path.join(pkgRoot, 'lib.lm'), 'fn parse() { }\n');
    writeFile(path.join(root, 'main.lm'), 'import { parse } from "json-utils";\nfn main() { }\n');
    writeFile(
      path.join(root, 'lumina.lock'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          packages: {
            'json-utils': {
              version: '1.2.3',
              resolved: './node_modules/json-utils',
              integrity: 'sha256-test',
              lumina: './lib.lm',
            },
          },
        },
        null,
        2
      )
    );
    const graph = await buildModuleGraph(path.join(root, 'main.lm'), graphOptions(root));
    const packageNode = Array.from(graph.nodes.values()).find((n) => n.kind === 'package');
    expect(packageNode?.path).toBe(path.join(pkgRoot, 'lib.lm'));
  });

  it('resolves bare package imports from modern lumina.lock format', async () => {
    const root = mkTempDir('lumina-modgraph-package-modern-');
    const installDir = path.join(root, '.lumina', 'packages', 'json-utils@1.2.3');
    writeFile(path.join(installDir, 'src', 'lib.lm'), 'fn parse() { }\n');
    writeFile(path.join(root, 'main.lm'), 'import { parse } from "json-utils";\nfn main() { }\n');
    writeFile(
      path.join(root, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'json-utils@1.2.3': {
              name: 'json-utils',
              version: '1.2.3',
              resolved: 'https://registry.example/json-utils-1.2.3.tgz',
              path: './.lumina/packages/json-utils@1.2.3',
              integrity: 'sha256-test',
              lumina: './src/lib.lm',
              deps: {},
            },
          },
        },
        null,
        2
      )
    );
    const graph = await buildModuleGraph(path.join(root, 'main.lm'), graphOptions(root));
    const packageNode = Array.from(graph.nodes.values()).find((n) => n.kind === 'package');
    expect(packageNode?.path).toBe(path.join(installDir, 'src', 'lib.lm'));
  });

  it('clears module graph cache directory', async () => {
    const root = mkTempDir('lumina-modgraph-clear-cache-');
    const mainPath = path.join(root, 'main.lm');
    writeFile(mainPath, 'fn main() { }\n');
    const options = graphOptions(root);
    const graph = await buildModuleGraph(mainPath, options);
    await compileInOrder(graph, {
      compileNode: () => ({ ast: { type: 'Program', body: [] } as never, exportEnv: emptyExportEnv() }),
      cacheDir: options.cacheDir,
    });
    expect(fs.existsSync(options.cacheDir)).toBe(true);
    await clearModuleGraphCache(options.cacheDir);
    expect(fs.existsSync(options.cacheDir)).toBe(false);
  });
});
