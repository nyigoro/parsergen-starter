import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const fixturePath = path.resolve(__dirname, './benchmark/dom-render-smoke.baseline.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
  suiteVersion: string;
  historyMeta: { storageKey: string; compatibleRuns: number };
  latest: {
    runId: string;
    scenarios: Record<
      string,
      Array<{
        name: string;
        iterations: number;
        samplesMs: number[];
        minMs: number;
        medianMs: number;
        maxMs: number;
        meanMs: number;
        avgMsPerIteration: number;
      }>
    >;
  };
  history: Array<{
    scenarios: Record<
      string,
      Array<{
        name: string;
        iterations: number;
        samplesMs: number[];
        minMs: number;
        medianMs: number;
        maxMs: number;
        meanMs: number;
        avgMsPerIteration: number;
      }>
    >;
  }>;
};

const clonePayload = () => JSON.parse(JSON.stringify(fixture)) as typeof fixture;

const summarizeEntry = (samplesMs: number[], iterations: number) => {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const meanMs = samplesMs.reduce((total, value) => total + value, 0) / samplesMs.length;
  return {
    samplesMs,
    minMs,
    medianMs,
    maxMs,
    meanMs,
    avgMsPerIteration: medianMs / iterations,
  };
};

const setScenarioSamples = (
  payload: typeof fixture,
  scenarioName: string,
  suiteName: string,
  samplesMs: number[]
) => {
  const updateRun = (
    scenarios: typeof fixture.latest.scenarios
  ) => {
    const entry = scenarios[scenarioName]?.find((candidate) => candidate.name === suiteName);
    if (!entry) {
      throw new Error(`Missing ${scenarioName} -> ${suiteName}`);
    }
    Object.assign(entry, summarizeEntry(samplesMs, entry.iterations));
  };

  updateRun(payload.latest.scenarios);
  payload.history.forEach((entry) => updateRun(entry.scenarios));
};

const swapScenarioEntries = (
  payload: typeof fixture,
  scenarioName: string,
  leftIndex: number,
  rightIndex: number
) => {
  const swapRunEntries = (scenarios: typeof fixture.latest.scenarios) => {
    const entries = scenarios[scenarioName];
    if (!entries) {
      throw new Error(`Missing ${scenarioName}`);
    }
    [entries[leftIndex], entries[rightIndex]] = [entries[rightIndex], entries[leftIndex]];
  };

  swapRunEntries(payload.latest.scenarios);
  payload.history.forEach((entry) => swapRunEntries(entry.scenarios));
};

const runImport = (inputPath: string, outDir: string, extraArgs: string[] = []) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/benchmark/dom-render-bench.ts',
      '--input',
      inputPath,
      '--out-dir',
      outDir,
      ...extraArgs,
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    }
  );

describe('dom-render benchmark history script', () => {
  test('archives a compatible benchmark export JSON file and can refresh a baseline fixture', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'export.json');
    const outDir = path.join(root, 'history');
    const baselineOutPath = path.join(root, 'baseline.json');
    const payload = clonePayload();

    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir, ['--baseline-out', baselineOutPath]);

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.schemaVersion).toBe(3);
    expect(summary.suiteVersion).toBe(fixture.suiteVersion);
    expect(summary.runId).toBe(fixture.latest.runId);
    expect(summary.manifest.localOnly).toBe(true);
    expect(summary.contract.domShape.listClassName).toBe('bench-list');
    expect(summary.contract.timing.measure).toBe('performance.measure()');
    expect(summary.contract.scenarios.find((scenario: { key: string }) => scenario.key === 'reorder')).toMatchObject({
      key: 'reorder',
      label: 'keyed reorder',
      tableId: 'results-reorder',
      iterations: fixture.latest.scenarios.reorder[0].iterations,
      suites: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM'],
    });
    expect(summary.historyMeta.storageKey).toBe(fixture.historyMeta.storageKey);
    expect(summary.historyRuns).toBe(1);
    expect(summary.measuredRuns).toBe(2);
    expect(summary.baselineCheck).toBeNull();
    expect(summary.baselineWrittenTo).toBe(baselineOutPath);
    expect(summary.scenarios.reorder[1]).toMatchObject({
      name: 'Lumina keyed list',
      measuredRuns: 2,
      sampleCount: 2,
      medianMs: fixture.latest.scenarios.reorder[1].medianMs,
      avgMsPerIteration: fixture.latest.scenarios.reorder[1].avgMsPerIteration,
    });
    expect(summary.scenarios.fineGrained[0]).toMatchObject({
      name: 'Lumina signals + DOM',
      measuredRuns: 2,
      sampleCount: 2,
    });

    const storedFiles = fs.readdirSync(outDir);
    expect(storedFiles).toHaveLength(1);
    const storedPayload = JSON.parse(fs.readFileSync(path.join(outDir, storedFiles[0]), 'utf-8'));
    expect(storedPayload.historyMeta.compatibleRuns).toBe(1);
    expect(storedPayload.latest.manifest.localOnly).toBe(true);
    expect(storedPayload.latest.runId).toBe(fixture.latest.runId);

    const writtenBaseline = JSON.parse(fs.readFileSync(baselineOutPath, 'utf-8'));
    expect(writtenBaseline.latest.runId).toBe(fixture.latest.runId);
  });

  test('compares a benchmark export to the checked-in baseline fixture', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'export.json');
    const outDir = path.join(root, 'history');
    const summaryPath = path.join(root, 'summary.json');
    const payload = clonePayload();

    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir, [
      '--baseline',
      fixturePath,
      '--summary-path',
      summaryPath,
    ]);

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.baselineCheck).toMatchObject({
      baselinePath: fixturePath,
      maxMedianRatio: 5,
      maxMedianRegressionMs: 4,
      checkedEntries: Object.values(fixture.latest.scenarios).reduce(
        (total, entries) => total + entries.length,
        0
      ),
      passed: true,
      regressions: [],
    });
    expect(JSON.parse(fs.readFileSync(summaryPath, 'utf-8')).baselineCheck.passed).toBe(true);
  });

  test('fails with a regression report when a median exceeds the smoke baseline tolerance', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'regression-export.json');
    const outDir = path.join(root, 'history');
    const summaryPath = path.join(root, 'summary.json');
    const payload = clonePayload();

    setScenarioSamples(payload, 'reorder', 'Lumina keyed list', [12.0, 12.5]);
    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir, [
      '--baseline',
      fixturePath,
      '--summary-path',
      summaryPath,
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DOM render benchmark regression detected');
    const summary = JSON.parse(result.stdout);
    expect(summary.baselineCheck.passed).toBe(false);
    expect(summary.baselineCheck.regressions[0]).toMatchObject({
      scenario: 'reorder',
      suite: 'Lumina keyed list',
    });
    expect(fs.readdirSync(outDir)).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(summaryPath, 'utf-8')).baselineCheck.passed).toBe(false);
  });

  test('rejects benchmark exports when scenario suite order drifts from the benchmark contract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'contract-drift.json');
    const outDir = path.join(root, 'history');
    const payload = clonePayload();

    swapScenarioEntries(payload, 'reorder', 0, 1);
    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Benchmark export latest.scenarios.reorder suites must match');
    expect(fs.existsSync(outDir)).toBe(false);
  });

  test('rejects benchmark exports with mismatched sample history metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'invalid-export.json');
    const outDir = path.join(root, 'history');
    const payload = clonePayload();
    payload.latest.scenarios.indexList[0].samplesMs = [4.1];
    payload.historyMeta.compatibleRuns = 0;

    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('must include one sample per measured run');
    expect(fs.existsSync(outDir)).toBe(false);
  });
});
