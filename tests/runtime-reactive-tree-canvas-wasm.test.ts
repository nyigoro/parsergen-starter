import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadWASM, callWASMFunction } from '../src/wasm-runtime.js';
import { createSignal, get, set, createMemo, mount_reactive, render, text } from '../src/lumina-runtime.js';

type ExplorerNode = {
  name: string;
  kind: 'dir' | 'file';
  children?: ExplorerNode[];
};

const tempDir = path.join(__dirname, '../.tmp-wasm');

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const compileWatAndLoad = async (wat: string) => {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'reactive-tree.wat');
  const wasmPath = path.join(tempDir, 'reactive-tree.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

const sortNodes = (
  nodes: ExplorerNode[],
  runtime: Awaited<ReturnType<typeof loadWASM>>,
  calls: { visible: number; rank: number }
): ExplorerNode[] => {
  return nodes.slice().sort((left, right) => {
    calls.rank += 2;
    const leftRank = callWASMFunction(runtime, 'rank', left.kind === 'dir' ? 0 : 1);
    const rightRank = callWASMFunction(runtime, 'rank', right.kind === 'dir' ? 0 : 1);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name);
  });
};

const filterNode = (
  node: ExplorerNode,
  queryCode: number,
  runtime: Awaited<ReturnType<typeof loadWASM>>,
  calls: { visible: number; rank: number }
): ExplorerNode | null => {
  const firstCode = node.name.length > 0 ? node.name[0].toLowerCase().charCodeAt(0) : 0;
  const hidden = node.name.startsWith('.') ? 1 : 0;
  calls.visible += 1;
  const directVisible = callWASMFunction(runtime, 'visible', hidden, queryCode, firstCode) === 1;

  if (node.kind === 'file') {
    return directVisible ? { ...node } : null;
  }

  const children = sortNodes(
    (node.children ?? [])
      .map((child) => filterNode(child, queryCode, runtime, calls))
      .filter((child): child is ExplorerNode => child !== null),
    runtime,
    calls
  );

  if (directVisible || children.length > 0 || queryCode === 0) {
    if (hidden === 1) return null;
    return { ...node, children };
  }
  return null;
};

const filterTree = (
  nodes: ExplorerNode[],
  query: string,
  runtime: Awaited<ReturnType<typeof loadWASM>>,
  calls: { visible: number; rank: number }
): ExplorerNode[] => {
  const queryCode = query.trim().toLowerCase().charCodeAt(0) || 0;
  return sortNodes(
    nodes
      .map((node) => filterNode(node, queryCode, runtime, calls))
      .filter((node): node is ExplorerNode => node !== null),
    runtime,
    calls
  );
};

const nodeToLines = (node: ExplorerNode, depth: number): string[] => {
  const prefix = '  '.repeat(depth);
  const marker = node.kind === 'dir' ? '[D]' : '[F]';
  const current = `${prefix}${marker} ${node.name}`;
  const childLines = (node.children ?? []).flatMap((child) => nodeToLines(child, depth + 1));
  return [current, ...childLines];
};

describe('reactive recursive tree (WASM logic + Signals + Canvas renderer)', () => {
  test('filters/sorts recursively via WASM and rerenders via signal updates', async () => {
    if (!hasWabt()) return;

    const wat = `
(module
  (func (export "visible") (param $hidden i32) (param $query i32) (param $first i32) (result i32)
    (if (result i32)
      (i32.eq (local.get $hidden) (i32.const 1))
      (then
        (i32.const 0)
      )
      (else
        (if (result i32)
          (i32.eqz (local.get $query))
          (then
            (i32.const 1)
          )
          (else
            (i32.eq (local.get $first) (local.get $query))
          )
        )
      )
    )
  )
  (func (export "rank") (param $kind i32) (result i32)
    (if (result i32)
      (i32.eq (local.get $kind) (i32.const 0))
      (then
        (i32.const 0)
      )
      (else
        (i32.const 1)
      )
    )
  )
)
`.trim();

    const runtime = await compileWatAndLoad(wat);
    const wasmCalls = { visible: 0, rank: 0 };
    const tree: ExplorerNode[] = [
      {
        name: 'src',
        kind: 'dir',
        children: [
          { name: 'app.lm', kind: 'file' },
          { name: 'zeta.lm', kind: 'file' },
          { name: '.private.lm', kind: 'file' },
        ],
      },
      {
        name: 'assets',
        kind: 'dir',
        children: [
          { name: 'icon.png', kind: 'file' },
          { name: 'avatar.png', kind: 'file' },
        ],
      },
      { name: 'README.md', kind: 'file' },
      { name: '.env', kind: 'file' },
    ];

    const query = createSignal('');
    const processed = createMemo(() => filterTree(tree, get(query), runtime, wasmCalls));

    const toView = () => {
      const lines = render.memo_get(processed).flatMap((node) => nodeToLines(node, 0));
      return render.fragment(lines.map((line) => text(line)));
    };

    const commands: string[] = [];
    const ctx = {
      canvas: { width: 480, height: 320 },
      clearRect: () => commands.push('clear'),
      fillText: (value: string) => commands.push(`text:${value}`),
    };

    const renderer = render.create_canvas_renderer({ context: ctx as never });
    const root = mount_reactive(renderer, ctx as never, toView);

    const firstFrame = [...commands];
    expect(firstFrame).toEqual([
      'clear',
      'text:[D] assets',
      'text:  [F] avatar.png',
      'text:  [F] icon.png',
      'text:[D] src',
      'text:  [F] app.lm',
      'text:  [F] zeta.lm',
      'text:[F] README.md',
    ]);

    set(query, 'a');
    await Promise.resolve();

    const secondFrame = commands.slice(firstFrame.length);
    expect(secondFrame).toEqual([
      'clear',
      'text:[D] assets',
      'text:  [F] avatar.png',
      'text:[D] src',
      'text:  [F] app.lm',
    ]);

    expect(wasmCalls.visible).toBeGreaterThan(0);
    expect(wasmCalls.rank).toBeGreaterThan(0);

    render.dispose_reactive(root);
  });
});
