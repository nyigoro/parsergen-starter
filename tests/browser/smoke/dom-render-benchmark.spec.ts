import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';
const benchmarkExportPath = process.env.LUMINA_DOM_RENDER_BENCHMARK_EXPORT_PATH;
const suiteVersion = '2026-04-29-benchmark-quality-v3';
const historyKey = 'lumina.dom.benchmark.history.v3';
const smokeListSize = 32;
const measuredRuns = 2;

const expectedManifestScenarios = [
  'whole-list patch',
  'initial mount',
  'indexed list patch',
  'stable signal list patch',
  'keyed reorder',
  'complex keyed reorder window',
  'fine-grained row update',
];

const expectedScenarioSuites: Record<string, string[]> = {
  wholeList: ['Lumina generic rerender', 'Vanilla DOM'],
  mount: ['Lumina render DOM', 'Vanilla DOM'],
  indexList: ['Lumina indexList', 'Lumina indexList (compiled)', 'Vanilla DOM'],
  forList: ['Lumina forList', 'Lumina forList (compiled)', 'Vanilla DOM'],
  reorder: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM'],
  complexReorder: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM'],
  fineGrained: ['Lumina signals + DOM', 'Vanilla DOM'],
};

const expectedScenarioIterations: Record<string, number> = {
  wholeList: 12,
  mount: 6,
  indexList: 12,
  forList: 12,
  reorder: 12,
  complexReorder: 8,
  fineGrained: 12,
};

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

type BenchRowShape = {
  tag: string;
  className: string;
  children: Array<{
    tag: string;
    className: string;
    text: string;
  }>;
};

type BenchHostShape = {
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
  historyLength: number;
  historyCountLabel: string | null;
  exportDisabled: boolean;
  dom: {
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
      lumina: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
    complexReorder: {
      lumina: BenchHostShape;
      compiled: BenchHostShape;
      vanilla: BenchHostShape;
    };
  };
};

const benchmarkUrl = (baseUrl: string) =>
  `${baseUrl}/dom-render/benchmark.html?smoke=1&localOnly=1&measuredRuns=${measuredRuns}&warmupRuns=1&listSize=${smokeListSize}`;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

const applySteps = <T>(initial: T[], iterations: number, stepper: (rows: T[], step: number) => T[]) => {
  let current = initial;
  for (let step = 0; step < iterations; step += 1) {
    current = stepper(current, step);
  }
  return current;
};

const expectedMutatedRows = applySteps(buildRows(smokeListSize), expectedScenarioIterations.indexList, mutateRows);
const expectedAdjacentSwapRows = applySteps(buildRows(smokeListSize), expectedScenarioIterations.reorder, swapAdjacentRows);
const expectedComplexReorderRows = applySteps(
  buildRows(smokeListSize),
  expectedScenarioIterations.complexReorder,
  (rows) => reorderMiddleWindowRows(rows)
);

const expectValidSamples = (entry: BenchmarkScenarioEntry, scenarioName: string) => {
  expect(entry.warmupRuns).toBe(1);
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
  expect(shape.rowCount).toBe(expectedValues.length);
  expect(shape.benchRowCount).toBe(expectedValues.length);
  expect(shape.pillCount).toBe(expectedValues.length);
  expect(shape.valueCount).toBe(expectedValues.length);
  expect(shape.pills).toEqual(Array.from({ length: expectedValues.length }, () => 'row'));
  expect(shape.values).toEqual(expectedValues);
  expect(shape.rowShapes[0]).toEqual({
    tag: 'li',
    className: 'bench-row',
    children: [
      { tag: 'span', className: 'bench-pill', text: 'row' },
      { tag: 'span', className: 'bench-value', text: expectedValues[0] },
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

  test('exports versioned local-only benchmark JSON and keeps specialized host DOM parity', async ({ page }, testInfo) => {
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
      await page.waitForFunction(() => Boolean((window as Record<string, unknown>).__luminaBenchmarkExport));
      await expect(page.locator('#status')).toHaveText('Done');

      const state: BenchmarkPageState = await page.evaluate(() => {
        const readBenchHost = (hostId: string) => {
          const host = document.getElementById(hostId);
          if (!host) {
            throw new Error(`Missing host ${hostId}`);
          }
          const rows = Array.from(host.querySelectorAll('.bench-row'));
          return {
            rowCount: rows.length,
            benchRowCount: rows.length,
            pillCount: host.querySelectorAll('.bench-pill').length,
            valueCount: host.querySelectorAll('.bench-value').length,
            pills: Array.from(host.querySelectorAll('.bench-pill')).map((node) => node.textContent ?? ''),
            values: Array.from(host.querySelectorAll('.bench-value')).map((node) => node.textContent ?? ''),
            rowShapes: rows.slice(0, 3).map((row) => ({
              tag: row.tagName.toLowerCase(),
              className: row.className,
              children: Array.from(row.children).map((child) => ({
                tag: child.tagName.toLowerCase(),
                className: child.className,
                text: child.textContent ?? '',
              })),
            })),
          };
        };

        return {
          payload: (window as Record<string, unknown>).__luminaBenchmarkExport as BenchmarkExportPayload,
          exportJson: (window as Record<string, unknown>).__luminaBenchmarkExportJson as string,
          manifest: (window as Record<string, unknown>).__luminaBenchmarkManifest as BenchmarkRun['manifest'],
          historyLength: ((window as Record<string, unknown>).__luminaBenchmarkHistory as unknown[]).length,
          historyCountLabel: document.getElementById('history-count')?.textContent ?? null,
          exportDisabled: (document.getElementById('export-json') as HTMLButtonElement | null)?.disabled ?? true,
          dom: {
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
              lumina: readBenchHost('host-reorder-lumina-keyed-list'),
              compiled: readBenchHost('host-reorder-lumina-compiled'),
              vanilla: readBenchHost('host-reorder-vanilla'),
            },
            complexReorder: {
              lumina: readBenchHost('host-complex-reorder-lumina-keyed-list'),
              compiled: readBenchHost('host-complex-reorder-lumina-compiled'),
              vanilla: readBenchHost('host-complex-reorder-vanilla'),
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
      expect(state.payload.schemaVersion).toBe(3);
      expect(state.payload.suiteVersion).toBe(suiteVersion);
      expect(state.payload.manifest).toEqual({
        version: 3,
        suiteVersion,
        smokeMode: true,
        localOnly: true,
        warmupRuns: 1,
        measuredRuns,
        listSize: smokeListSize,
        scenarios: expectedManifestScenarios,
      });
      expect(state.payload.environment.userAgent).toContain('Headless');
      expect(state.payload.environment.language).toBeTruthy();
      expect(state.payload.environment.languages.length).toBeGreaterThan(0);
      expect(state.manifest).toEqual(state.payload.manifest);
      expect(state.payload.latest.manifest).toEqual(state.payload.manifest);
      expect(state.payload.latest.runId).toMatch(/^\d+-[a-z0-9]{6}$/);
      expect(state.payload.latest.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(state.payload.latest.listSize).toBe(smokeListSize);
      expect(state.payload.latest.warmupRuns).toBe(1);
      expect(state.payload.latest.measuredRuns).toBe(measuredRuns);
      expect(state.payload.latest.environment).toEqual(state.payload.environment);
      expect(state.payload.history).toHaveLength(1);
      expect(state.historyLength).toBe(1);
      expect(state.payload.history[0].schemaVersion).toBe(3);
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
      }

      expectBenchHostShape(state.dom.indexList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.indexList.compiled, state.dom.indexList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.indexList.vanilla, state.dom.indexList.lumina, expectedMutatedRows);

      expectBenchHostShape(state.dom.forList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.forList.compiled, state.dom.forList.lumina, expectedMutatedRows);
      expectBenchHostParity(state.dom.forList.vanilla, state.dom.forList.lumina, expectedMutatedRows);

      expectBenchHostShape(state.dom.reorder.lumina, expectedAdjacentSwapRows);
      expectBenchHostParity(state.dom.reorder.compiled, state.dom.reorder.lumina, expectedAdjacentSwapRows);
      expectBenchHostParity(state.dom.reorder.vanilla, state.dom.reorder.lumina, expectedAdjacentSwapRows);

      expectBenchHostShape(state.dom.complexReorder.lumina, expectedComplexReorderRows);
      expectBenchHostParity(state.dom.complexReorder.compiled, state.dom.complexReorder.lumina, expectedComplexReorderRows);
      expectBenchHostParity(state.dom.complexReorder.vanilla, state.dom.complexReorder.lumina, expectedComplexReorderRows);
    } finally {
      await server.close();
    }
  });
});
