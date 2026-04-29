import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';
const benchmarkExportPath = process.env.LUMINA_DOM_RENDER_BENCHMARK_EXPORT_PATH;
const suiteVersion = '2026-04-29-benchmark-quality-v5';
const benchmarkTier =
  process.env.LUMINA_DOM_RENDER_BENCHMARK_TIER === 'local'
    ? 'local'
    : process.env.LUMINA_DOM_RENDER_BENCHMARK_TIER === 'full'
      ? 'full'
      : 'smoke';
const expectedDomShape = {
  listTag: 'ul',
  listClassName: 'bench-list',
  rowTag: 'li',
  rowClassName: 'bench-row',
  pillTag: 'span',
  pillClassName: 'bench-pill',
  pillText: 'row',
  valueTag: 'span',
  valueClassName: 'bench-value',
} as const;
const expectedTimingContract = {
  clock: 'performance.now()',
  mark: 'performance.mark()',
  measure: 'performance.measure()',
  clearMarks: 'performance.clearMarks()',
  clearMeasures: 'performance.clearMeasures()',
} as const;

const expectedManifestScenarios = [
  'whole-list patch',
  'initial mount',
  'indexed list patch',
  'stable signal list patch',
  'keyed reorder',
  'single keyed move',
  'complex keyed reorder window',
  'keyed structure diff',
  'fine-grained row update',
];

const benchmarkTierConfig = {
  smoke: {
    historyKey: 'lumina.dom.benchmark.history.v5.smoke',
    listSize: 32,
    warmupRuns: 1,
    measuredRuns: 2,
    smokeMode: true,
    localOnly: true,
    query: '?tier=smoke&measuredRuns=2&warmupRuns=1&preserveHosts=1',
    scenarioIterations: {
      wholeList: 12,
      mount: 6,
      indexList: 12,
      forList: 12,
      reorder: 12,
      singleMove: 10,
      complexReorder: 8,
      structureDiff: 8,
      fineGrained: 12,
    },
  },
  local: {
    historyKey: 'lumina.dom.benchmark.history.v5.local',
    listSize: 1000,
    warmupRuns: 1,
    measuredRuns: 3,
    smokeMode: false,
    localOnly: true,
    query: '?tier=local&warmupRuns=1&measuredRuns=3&preserveHosts=1',
    scenarioIterations: {
      wholeList: 300,
      mount: 40,
      indexList: 300,
      forList: 300,
      reorder: 300,
      singleMove: 240,
      complexReorder: 150,
      structureDiff: 150,
      fineGrained: 300,
    },
  },
  full: {
    historyKey: 'lumina.dom.benchmark.history.v5.full',
    listSize: 1000,
    warmupRuns: 1,
    measuredRuns: 3,
    smokeMode: false,
    localOnly: false,
    query: '?tier=full&warmupRuns=1&measuredRuns=3&preserveHosts=1',
    scenarioIterations: {
      wholeList: 300,
      mount: 40,
      indexList: 300,
      forList: 300,
      reorder: 300,
      singleMove: 240,
      complexReorder: 150,
      structureDiff: 150,
      fineGrained: 300,
    },
  },
} as const;

const tierConfig = benchmarkTierConfig[benchmarkTier];
const historyKey = tierConfig.historyKey;
const benchmarkListSize = tierConfig.listSize;
const warmupRuns = tierConfig.warmupRuns;
const measuredRuns = tierConfig.measuredRuns;
const benchmarkTestTimeoutMs = benchmarkTier === 'smoke' ? 60_000 : 180_000;

const expectedScenarioSuites: Record<string, string[]> = {
  wholeList: ['Lumina generic rerender', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19', 'Solid 1'])],
  mount: ['Lumina render DOM', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19', 'Solid 1'])],
  indexList: ['Lumina indexList', 'Lumina indexList (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19 memo rows', 'Solid 1 Index'])],
  forList: ['Lumina forList', 'Lumina forList (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19 memo rows', 'Solid 1 Index'])],
  reorder: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19'])],
  singleMove: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19'])],
  complexReorder: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19'])],
  structureDiff: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['React 19'])],
  fineGrained: ['Lumina signals + DOM', 'Vanilla DOM', ...(tierConfig.localOnly ? [] : ['Solid signals'])],
};

const expectedScenarioIterations: Record<string, number> = tierConfig.scenarioIterations;

const expectedRelativeOrdering: Record<string, Array<{ faster: string; slower: string }>> =
  tierConfig.localOnly
    ? {
        reorder: [
          { faster: 'Lumina keyed list', slower: 'Lumina generic keyed patch' },
          { faster: 'Lumina keyed list (compiled)', slower: 'Lumina generic keyed patch' },
        ],
        singleMove: [
          { faster: 'Lumina keyed list', slower: 'Lumina generic keyed patch' },
          { faster: 'Lumina keyed list (compiled)', slower: 'Lumina generic keyed patch' },
        ],
        complexReorder: [
          { faster: 'Lumina keyed list', slower: 'Lumina generic keyed patch' },
          { faster: 'Lumina keyed list (compiled)', slower: 'Lumina generic keyed patch' },
        ],
        structureDiff: [
          { faster: 'Lumina keyed list', slower: 'Lumina generic keyed patch' },
          { faster: 'Lumina keyed list (compiled)', slower: 'Lumina generic keyed patch' },
        ],
      }
    : {};

type BenchmarkScenarioEntry = {
  name: string;
  warmupRuns: number;
  measuredRuns: number;
  iterations: number;
  samplesMs: number[];
  minMs: number;
  medianMs: number;
  maxMs: number;
  meanMs: number;
  avgMsPerIteration: number;
};

type BenchmarkRun = {
  runId: string;
  recordedAt: string;
  environment: {
    userAgent: string;
    hardwareConcurrency: number | null;
    deviceMemory: number | null;
    language: string | null;
    languages: string[];
    platform: string | null;
  };
  listSize: number;
  warmupRuns: number;
  measuredRuns: number;
  manifest: {
    version: number;
    suiteVersion: string;
    tier: string;
    smokeMode: boolean;
    localOnly: boolean;
    warmupRuns: number;
    measuredRuns: number;
    listSize: number;
    scenarios: string[];
  };
  scenarios: Record<string, BenchmarkScenarioEntry[]>;
};

type BenchmarkExportPayload = {
  schemaVersion: number;
  suiteVersion: string;
  manifest: BenchmarkRun['manifest'];
  environment: BenchmarkRun['environment'];
  latest: BenchmarkRun;
  history: Array<BenchmarkRun & { schemaVersion: number; suiteVersion: string }>;
  historyMeta: {
    storageKey: string;
    compatibleRuns: number;
  };
};

type BenchmarkContract = {
  domShape: typeof expectedDomShape;
  timing: typeof expectedTimingContract;
  scenarios: Array<{
    key: string;
    label: string;
    tableId: string;
    iterations: number;
    suites: string[];
  }>;
};

type BenchRowShape = {
  tag: string;
  className: string;
  childNodeTypes: number[];
  children: Array<{
    tag: string;
    className: string;
    text: string;
    nodeType: number;
  }>;
};

type BenchHostShape = {
  listTag: string | null;
  listClassName: string | null;
  rowCount: number;
  benchRowCount: number;
  pillCount: number;
  valueCount: number;
  pills: string[];
  values: string[];
  rowShapes: BenchRowShape[];
};

type BenchmarkPageState = {
  payload: BenchmarkExportPayload;
  exportJson: string;
  manifest: BenchmarkRun['manifest'];
  contract: BenchmarkContract;
  historyLength: number;
  historyCountLabel: string | null;
  exportDisabled: boolean;
  dom: {
    wholeList: {
      lumina: BenchHostShape;
      vanilla: BenchHostShape;
    };
    mount: {
      lumina: BenchHostShape;
      vanilla: BenchHostShape;
    };
    indexList: {
      lumina: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    forList: {
      lumina: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    reorder: {
      generic: BenchHostShape;
      keyed: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    singleMove: {
      generic: BenchHostShape;
      keyed: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    complexReorder: {
      generic: BenchHostShape;
      keyed: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    structureDiff: {
      generic: BenchHostShape;
      keyed: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    fineGrained: {
      lumina: BenchHostShape;
      vanilla: BenchHostShape;
    };
  };
};

const benchmarkUrl = (baseUrl: string) =>
  `${baseUrl}/dom-render/benchmark.html${tierConfig.query}`;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const expectRelativeScenarioPerformance = (
  entries: BenchmarkScenarioEntry[],
  rules: Array<{ faster: string; slower: string }>
) => {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  for (const rule of rules) {
    const faster = byName.get(rule.faster);
    const slower = byName.get(rule.slower);
    expect(faster, `Missing faster suite ${rule.faster}`).toBeDefined();
    expect(slower, `Missing slower suite ${rule.slower}`).toBeDefined();
    expect((faster as BenchmarkScenarioEntry).medianMs).toBeLessThan((slower as BenchmarkScenarioEntry).medianMs);
  }
};

const buildRows = (size: number) => Array.from({ length: size }, (_, index) => `row-${index}`);

const mutateRows = (rows: string[], step: number) => {
  const index = step % rows.length;
  const next = rows.slice();
  next[index] = `${rows[index]}*`;
  return next;
};

const swapAdjacentRows = <T>(rows: T[], step: number) => {
  const next = rows.slice();
  if (next.length < 2) return next;
  const left = step % (next.length - 1);
  const right = left + 1;
  [next[left], next[right]] = [next[right], next[left]];
  return next;
};

const moveHeadToTailRows = <T>(rows: T[]) => {
  const next = rows.slice();
  if (next.length < 2) return next;
  const [first] = next.splice(0, 1);
  next.push(first as T);
  return next;
};

const reorderMiddleWindowRows = <T>(rows: T[], windowSize = 64) => {
  const next = rows.slice();
  if (next.length < 4) return next;
  const size = Math.min(windowSize, next.length - (next.length % 2));
  if (size < 4) return next;
  const start = Math.floor((next.length - size) / 2);
  const middle = next.slice(start, start + size);
  const half = middle.length / 2;
  const left = middle.slice(0, half);
  const right = middle.slice(half);
  const reordered: T[] = [];
  for (let index = 0; index < half; index += 1) {
    reordered.push(right[index], left[index]);
  }
  next.splice(start, reordered.length, ...reordered);
  return next;
};

const restructureKeyedRows = <T extends { id: string; label: string }>(rows: T[], step: number) => {
  const next = rows.slice();
  if (next.length < 3) return next;
  const removeIndex = step % next.length;
  next.splice(removeIndex, 1);
  if (next.length > 1) {
    const from = (step * 3) % next.length;
    const [moving] = next.splice(from, 1);
    const to = (step * 5) % (next.length + 1);
    next.splice(to, 0, moving as T);
  }
  const insertIndex = (step * 7) % (next.length + 1);
  const freshId = `fresh-${step}`;
  next.splice(insertIndex, 0, { id: freshId, label: freshId } as T);
  const mutateIndex = next.findIndex((row) => row.id !== freshId);
  if (mutateIndex >= 0) {
    const row = next[mutateIndex] as T;
    next[mutateIndex] = { ...row, label: `${row.label}*` } as T;
  }
  return next;
};

const buildKeyedRows = (size: number) =>
  Array.from({ length: size }, (_, index) => ({ id: `row-${index}`, label: `row-${index}` }));

const applySteps = <T>(initial: T[], iterations: number, stepper: (rows: T[], step: number) => T[]) => {
  let current = initial;
  for (let step = 0; step < iterations; step += 1) {
    current = stepper(current, step);
  }
  return current;
};

const expectedMutatedRows = applySteps(buildRows(benchmarkListSize), expectedScenarioIterations.indexList, mutateRows);
const expectedMountedRows = buildRows(benchmarkListSize);
const expectedAdjacentSwapRows = applySteps(buildRows(benchmarkListSize), expectedScenarioIterations.reorder, swapAdjacentRows);
const expectedSingleMoveRows = applySteps(buildRows(benchmarkListSize), expectedScenarioIterations.singleMove, (rows) =>
  moveHeadToTailRows(rows)
);
const expectedComplexReorderRows = applySteps(
  buildRows(benchmarkListSize),
  expectedScenarioIterations.complexReorder,
  (rows) => reorderMiddleWindowRows(rows)
);
const expectedStructureDiffRows = applySteps(
  buildKeyedRows(benchmarkListSize),
  expectedScenarioIterations.structureDiff,
  (rows, step) => restructureKeyedRows(rows, step)
).map((row) => row.label);
const expectedContract: BenchmarkContract = {
  domShape: expectedDomShape,
  timing: expectedTimingContract,
  scenarios: [
    {
      key: 'wholeList',
      label: 'whole-list patch',
      tableId: 'results-whole-list',
      iterations: expectedScenarioIterations.wholeList,
      suites: expectedScenarioSuites.wholeList,
    },
    {
      key: 'mount',
      label: 'initial mount',
      tableId: 'results-mount',
      iterations: expectedScenarioIterations.mount,
      suites: expectedScenarioSuites.mount,
    },
    {
      key: 'indexList',
      label: 'indexed list patch',
      tableId: 'results-index-list',
      iterations: expectedScenarioIterations.indexList,
      suites: expectedScenarioSuites.indexList,
    },
    {
      key: 'forList',
      label: 'stable signal list patch',
      tableId: 'results-for-list',
      iterations: expectedScenarioIterations.forList,
      suites: expectedScenarioSuites.forList,
    },
    {
      key: 'reorder',
      label: 'keyed reorder',
      tableId: 'results-reorder',
      iterations: expectedScenarioIterations.reorder,
      suites: expectedScenarioSuites.reorder,
    },
    {
      key: 'singleMove',
      label: 'single keyed move',
      tableId: 'results-single-move',
      iterations: expectedScenarioIterations.singleMove,
      suites: expectedScenarioSuites.singleMove,
    },
    {
      key: 'complexReorder',
      label: 'complex keyed reorder window',
      tableId: 'results-complex-reorder',
      iterations: expectedScenarioIterations.complexReorder,
      suites: expectedScenarioSuites.complexReorder,
    },
    {
      key: 'structureDiff',
      label: 'keyed structure diff',
      tableId: 'results-structure-diff',
      iterations: expectedScenarioIterations.structureDiff,
      suites: expectedScenarioSuites.structureDiff,
    },
    {
      key: 'fineGrained',
      label: 'fine-grained row update',
      tableId: 'results-fine-grained',
      iterations: expectedScenarioIterations.fineGrained,
      suites: expectedScenarioSuites.fineGrained,
    },
  ],
};

const expectValidSamples = (entry: BenchmarkScenarioEntry, scenarioName: string) => {
  expect(entry.warmupRuns).toBe(warmupRuns);
  expect(entry.measuredRuns).toBe(measuredRuns);
  expect(entry.iterations).toBe(expectedScenarioIterations[scenarioName]);
  expect(entry.samplesMs).toHaveLength(measuredRuns);
  for (const sample of entry.samplesMs) {
    expect(Number.isFinite(sample)).toBe(true);
    expect(sample).toBeGreaterThanOrEqual(0);
  }

  const expectedMin = Math.min(...entry.samplesMs);
  const expectedMax = Math.max(...entry.samplesMs);
  const expectedMedian = median(entry.samplesMs);
  const expectedMean = entry.samplesMs.reduce((total, sample) => total + sample, 0) / entry.samplesMs.length;

  expect(entry.minMs).toBeCloseTo(expectedMin, 10);
  expect(entry.maxMs).toBeCloseTo(expectedMax, 10);
  expect(entry.medianMs).toBeCloseTo(expectedMedian, 10);
  expect(entry.meanMs).toBeCloseTo(expectedMean, 10);
  expect(entry.avgMsPerIteration).toBeCloseTo(entry.medianMs / entry.iterations, 10);
};

const expectBenchHostShape = (shape: BenchHostShape, expectedValues: string[]) => {
  expect(shape.listTag).toBe(expectedDomShape.listTag);
  expect(shape.listClassName).toBe(expectedDomShape.listClassName);
  expect(shape.rowCount).toBe(expectedValues.length);
  expect(shape.benchRowCount).toBe(expectedValues.length);
  expect(shape.pillCount).toBe(expectedValues.length);
  expect(shape.valueCount).toBe(expectedValues.length);
  expect(shape.pills).toEqual(Array.from({ length: expectedValues.length }, () => 'row'));
  expect(shape.values).toEqual(expectedValues);
  expect(shape.rowShapes[0]).toEqual({
    tag: expectedDomShape.rowTag,
    className: expectedDomShape.rowClassName,
    childNodeTypes: [1, 1],
    children: [
      { tag: expectedDomShape.pillTag, className: expectedDomShape.pillClassName, text: 'row', nodeType: 1 },
      {
        tag: expectedDomShape.valueTag,
        className: expectedDomShape.valueClassName,
        text: expectedValues[0],
        nodeType: 1,
      },
    ],
  });
};

const expectBenchHostParity = (actual: BenchHostShape, baseline: BenchHostShape, expectedValues: string[]) => {
  expectBenchHostShape(actual, expectedValues);
  expect(actual.values).toEqual(baseline.values);
  expect(actual.rowShapes).toEqual(baseline.rowShapes);
};

test.describe('DOM render benchmark contract', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');
  test.setTimeout(benchmarkTestTimeoutMs);

  test('exports versioned tiered benchmark JSON and keeps benchmark DOM parity', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.addInitScript(() => window.localStorage.clear());

    const server = await startSmokeServer();
    try {
      const response = await page.goto(benchmarkUrl(server.baseUrl));
      if (!response) {
        throw new Error('No response when loading benchmark harness');
      }
      if (response.status() >= 400) {
        const body = await response.text();
        throw new Error(`Benchmark harness load failed (${response.status()}): ${body}`);
      }

      await page.getByRole('button', { name: 'Run all benchmarks' }).click();
      await page.waitForFunction(() => Boolean((window as Record<string, unknown>).__luminaBenchmarkExport), {
        timeout: benchmarkTestTimeoutMs - 5_000,
      });
      await expect(page.locator('#status')).toHaveText('Done');

      const state: BenchmarkPageState = await page.evaluate(() => {
        const readBenchHost = (hostId: string) => {
          const host = document.getElementById(hostId);
          if (!host) {
            throw new Error(`Missing host ${hostId}`);
          }
          const list = host.firstElementChild;
          const rows = Array.from(host.querySelectorAll('.bench-row'));
          return {
            listTag: list?.tagName.toLowerCase() ?? null,
            listClassName: list?.className ?? null,
            rowCount: rows.length,
            benchRowCount: rows.length,
            pillCount: host.querySelectorAll('.bench-pill').length,
            valueCount: host.querySelectorAll('.bench-value').length,
            pills: Array.from(host.querySelectorAll('.bench-pill')).map((node) => node.textContent ?? ''),
            values: Array.from(host.querySelectorAll('.bench-value')).map((node) => node.textContent ?? ''),
            rowShapes: rows.slice(0, 3).map((row) => ({
              tag: row.tagName.toLowerCase(),
              className: row.className,
              childNodeTypes: Array.from(row.childNodes).map((child) => child.nodeType),
              children: Array.from(row.children).map((child) => ({
                tag: child.tagName.toLowerCase(),
                className: child.className,
                text: child.textContent ?? '',
                nodeType: child.nodeType,
              })),
            })),
          };
        };

        return {
          payload: (window as Record<string, unknown>).__luminaBenchmarkExport as BenchmarkExportPayload,
          exportJson: (window as Record<string, unknown>).__luminaBenchmarkExportJson as string,
          manifest: (window as Record<string, unknown>).__luminaBenchmarkManifest as BenchmarkRun['manifest'],
          contract: (window as Record<string, unknown>).__luminaBenchmarkContract as BenchmarkContract,
          historyLength: ((window as Record<string, unknown>).__luminaBenchmarkHistory as unknown[]).length,
          historyCountLabel: document.getElementById('history-count')?.textContent ?? null,
          exportDisabled: (document.getElementById('export-json') as HTMLButtonElement | null)?.disabled ?? true,
          dom: {
            wholeList: {
              lumina: readBenchHost('host-whole-list-lumina'),
              vanilla: readBenchHost('host-whole-list-vanilla'),
            },
            mount: {
              lumina: readBenchHost('host-mount-lumina'),
              vanilla: readBenchHost('host-mount-vanilla'),
            },
            indexList: {
              lumina: readBenchHost('host-index-list-lumina'),
              compiled: readBenchHost('host-index-list-lumina-compiled'),
              vanilla: readBenchHost('host-index-list-vanilla'),
            },
            forList: {
              lumina: readBenchHost('host-for-list-lumina'),
              compiled: readBenchHost('host-for-list-lumina-compiled'),
              vanilla: readBenchHost('host-for-list-vanilla'),
            },
    reorder: {
      generic: readBenchHost('host-reorder-lumina'),
      keyed: readBenchHost('host-reorder-lumina-keyed-list'),
      compiled: readBenchHost('host-reorder-lumina-compiled'),
      vanilla: readBenchHost('host-reorder-vanilla'),
    },
    singleMove: {
      generic: readBenchHost('host-single-move-lumina'),
      keyed: readBenchHost('host-single-move-lumina-keyed-list'),
      compiled: readBenchHost('host-single-move-lumina-compiled'),
      vanilla: readBenchHost('host-single-move-vanilla'),
    },
    complexReorder: {
      generic: readBenchHost('host-complex-reorder-lumina'),
      keyed: readBenchHost('host-complex-reorder-lumina-keyed-list'),
      compiled: readBenchHost('host-complex-reorder-lumina-compiled'),
      vanilla: readBenchHost('host-complex-reorder-vanilla'),
    },
    structureDiff: {
      generic: readBenchHost('host-structure-diff-lumina'),
      keyed: readBenchHost('host-structure-diff-lumina-keyed-list'),
      compiled: readBenchHost('host-structure-diff-lumina-compiled'),
      vanilla: readBenchHost('host-structure-diff-vanilla'),
    },
    fineGrained: {
      lumina: readBenchHost('host-fine-grained-lumina'),
      vanilla: readBenchHost('host-fine-grained-vanilla'),
            },
          },
        };
      });

      await testInfo.attach('dom-render-benchmark-export', {
        body: Buffer.from(state.exportJson, 'utf-8'),
        contentType: 'application/json',
      });
      if (benchmarkExportPath) {
        const resolvedExportPath = path.resolve(benchmarkExportPath);
        fs.mkdirSync(path.dirname(resolvedExportPath), { recursive: true });
        fs.writeFileSync(resolvedExportPath, `${state.exportJson}\n`, 'utf-8');
      }

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(state.exportDisabled).toBe(false);
      expect(state.payload.schemaVersion).toBe(4);
      expect(state.payload.suiteVersion).toBe(suiteVersion);
      expect(state.payload.manifest).toEqual({
        version: 4,
        suiteVersion,
        tier: benchmarkTier,
        smokeMode: tierConfig.smokeMode,
        localOnly: tierConfig.localOnly,
        warmupRuns,
        measuredRuns,
        listSize: benchmarkListSize,
        scenarios: expectedManifestScenarios,
      });
      expect(state.payload.environment.userAgent).toContain('Headless');
      expect(state.payload.environment.language).toBeTruthy();
      expect(state.payload.environment.languages.length).toBeGreaterThan(0);
      expect(state.manifest).toEqual(state.payload.manifest);
      expect(state.contract).toEqual(expectedContract);
      expect(state.payload.latest.manifest).toEqual(state.payload.manifest);
      expect(state.payload.latest.runId).toMatch(/^\d+-[a-z0-9]{6}$/);
      expect(state.payload.latest.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(state.payload.latest.listSize).toBe(benchmarkListSize);
      expect(state.payload.latest.warmupRuns).toBe(warmupRuns);
      expect(state.payload.latest.measuredRuns).toBe(measuredRuns);
      expect(state.payload.latest.environment).toEqual(state.payload.environment);
      expect(state.payload.history).toHaveLength(1);
      expect(state.historyLength).toBe(1);
      expect(state.payload.history[0].schemaVersion).toBe(4);
      expect(state.payload.history[0].suiteVersion).toBe(suiteVersion);
      expect(state.payload.history[0].manifest).toEqual(state.payload.manifest);
      expect(state.payload.history[0].environment).toEqual(state.payload.environment);
      expect(state.payload.history[0].runId).toBe(state.payload.latest.runId);
      expect(state.payload.historyMeta).toEqual({
        storageKey: historyKey,
        compatibleRuns: 1,
      });
      expect(state.historyCountLabel).toBe('Saved compatible runs: 1');
      expect(JSON.parse(state.exportJson)).toEqual(state.payload);

      for (const [scenarioName, expectedSuites] of Object.entries(expectedScenarioSuites)) {
        const entries = state.payload.latest.scenarios[scenarioName];
        expect(Array.isArray(entries)).toBe(true);
        expect(entries.map((entry) => entry.name)).toEqual(expectedSuites);
        for (const entry of entries) {
          expectValidSamples(entry, scenarioName);
        }
        const orderingRules = expectedRelativeOrdering[scenarioName];
        if (orderingRules) {
          expectRelativeScenarioPerformance(entries, orderingRules);
        }
      }

      expectBenchHostShape(state.dom.wholeList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.wholeList.vanilla, state.dom.wholeList.lumina, expectedMutatedRows);

      expectBenchHostShape(state.dom.mount.lumina, expectedMountedRows);
      expectBenchHostParity(state.dom.mount.vanilla, state.dom.mount.lumina, expectedMountedRows);

      expectBenchHostShape(state.dom.indexList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.indexList.compiled, state.dom.indexList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.indexList.vanilla, state.dom.indexList.lumina, expectedMutatedRows);

      expectBenchHostShape(state.dom.forList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.forList.compiled, state.dom.forList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.forList.vanilla, state.dom.forList.lumina, expectedMutatedRows);

    expectBenchHostShape(state.dom.reorder.generic, expectedAdjacentSwapRows);
    expectBenchHostParity(state.dom.reorder.keyed, state.dom.reorder.generic, expectedAdjacentSwapRows);
    expectBenchHostParity(state.dom.reorder.compiled, state.dom.reorder.generic, expectedAdjacentSwapRows);
    expectBenchHostParity(state.dom.reorder.vanilla, state.dom.reorder.generic, expectedAdjacentSwapRows);

    expectBenchHostShape(state.dom.singleMove.generic, expectedSingleMoveRows);
    expectBenchHostParity(state.dom.singleMove.keyed, state.dom.singleMove.generic, expectedSingleMoveRows);
    expectBenchHostParity(state.dom.singleMove.compiled, state.dom.singleMove.generic, expectedSingleMoveRows);
    expectBenchHostParity(state.dom.singleMove.vanilla, state.dom.singleMove.generic, expectedSingleMoveRows);

    expectBenchHostShape(state.dom.complexReorder.generic, expectedComplexReorderRows);
    expectBenchHostParity(state.dom.complexReorder.keyed, state.dom.complexReorder.generic, expectedComplexReorderRows);
    expectBenchHostParity(state.dom.complexReorder.compiled, state.dom.complexReorder.generic, expectedComplexReorderRows);
    expectBenchHostParity(state.dom.complexReorder.vanilla, state.dom.complexReorder.generic, expectedComplexReorderRows);

    expectBenchHostShape(state.dom.structureDiff.generic, expectedStructureDiffRows);
    expectBenchHostParity(state.dom.structureDiff.keyed, state.dom.structureDiff.generic, expectedStructureDiffRows);
    expectBenchHostParity(state.dom.structureDiff.compiled, state.dom.structureDiff.generic, expectedStructureDiffRows);
    expectBenchHostParity(state.dom.structureDiff.vanilla, state.dom.structureDiff.generic, expectedStructureDiffRows);

    expectBenchHostShape(state.dom.fineGrained.lumina, expectedMutatedRows);
    expectBenchHostParity(state.dom.fineGrained.vanilla, state.dom.fineGrained.lumina, expectedMutatedRows);
    } finally {
      await server.close();
    }
  });
});
