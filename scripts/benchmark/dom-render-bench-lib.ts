import fs from 'node:fs/promises';
import path from 'node:path';

export type BenchmarkManifest = {
  version: number;
  suiteVersion: string;
  smokeMode: boolean;
  localOnly: boolean;
  warmupRuns: number;
  measuredRuns: number;
  listSize: number;
  scenarios: string[];
};

export type BenchmarkDomShape = {
  listTag: string;
  listClassName: string;
  rowTag: string;
  rowClassName: string;
  pillTag: string;
  pillClassName: string;
  pillText: string;
  valueTag: string;
  valueClassName: string;
};

export type BenchmarkTimingContract = {
  clock: string;
  mark: string;
  measure: string;
  clearMarks: string;
  clearMeasures: string;
};

export type BenchmarkScenarioContract = {
  key: string;
  label: string;
  tableId: string;
  iterations: number;
  suites: string[];
};

export type BenchmarkContract = {
  domShape: BenchmarkDomShape;
  timing: BenchmarkTimingContract;
  scenarios: BenchmarkScenarioContract[];
};

export type ScenarioEntry = {
  name: string;
  warmupRuns: number;
  measuredRuns: number;
  iterations: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  avgMsPerIteration: number;
  samplesMs: number[];
};

export type BenchmarkRun = {
  runId: string;
  recordedAt: string;
  environment: Record<string, unknown>;
  listSize: number;
  warmupRuns: number;
  measuredRuns: number;
  manifest: BenchmarkManifest;
  scenarios: Record<string, ScenarioEntry[]>;
};

export type BenchmarkHistoryEntry = BenchmarkRun & {
  schemaVersion: number;
  suiteVersion: string;
};

export type BenchmarkExport = {
  schemaVersion: number;
  suiteVersion: string;
  manifest: BenchmarkManifest;
  environment: Record<string, unknown>;
  latest: BenchmarkRun;
  history: BenchmarkHistoryEntry[];
  historyMeta: {
    storageKey: string;
    compatibleRuns: number;
  };
};

export type BenchmarkRegression = {
  scenario: string;
  suite: string;
  baselineMedianMs: number;
  actualMedianMs: number;
  maxAllowedMedianMs: number;
  deltaMedianMs: number;
  ratioToBaseline: number;
};

export type BenchmarkRegressionReport = {
  baselinePath: string;
  maxMedianRatio: number;
  maxMedianRegressionMs: number;
  checkedEntries: number;
  passed: boolean;
  regressions: BenchmarkRegression[];
};

export const DEFAULT_OUT_DIR = path.resolve('benchmarks/dom-render-history');
const SUMMARY_EPSILON = 1e-9;
const BENCHMARK_DOM_SHAPE: BenchmarkDomShape = Object.freeze({
  listTag: 'ul',
  listClassName: 'bench-list',
  rowTag: 'li',
  rowClassName: 'bench-row',
  pillTag: 'span',
  pillClassName: 'bench-pill',
  pillText: 'row',
  valueTag: 'span',
  valueClassName: 'bench-value',
});
const BENCHMARK_TIMING_CONTRACT: BenchmarkTimingContract = Object.freeze({
  clock: 'performance.now()',
  mark: 'performance.mark()',
  measure: 'performance.measure()',
  clearMarks: 'performance.clearMarks()',
  clearMeasures: 'performance.clearMeasures()',
});

export const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const approxEqual = (left: number, right: number, epsilon = SUMMARY_EPSILON) => Math.abs(left - right) <= epsilon;

const normalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJson(entry)])
    );
  }
  return value;
};

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right));

const unique = (values: string[]) => new Set(values).size === values.length;

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

const min = (values: number[]) => values.reduce((best, value) => (value < best ? value : best), values[0]);

const max = (values: number[]) => values.reduce((best, value) => (value > best ? value : best), values[0]);

const buildExpectedScenarioDefinitions = (localOnly: boolean) =>
  [
    {
      key: 'wholeList',
      label: 'whole-list patch',
      tableId: 'results-whole-list',
      suites: ['Lumina generic rerender', 'Vanilla DOM', ...(localOnly ? [] : ['React 19', 'Solid 1'])],
    },
    {
      key: 'mount',
      label: 'initial mount',
      tableId: 'results-mount',
      suites: ['Lumina render DOM', 'Vanilla DOM', ...(localOnly ? [] : ['React 19', 'Solid 1'])],
    },
    {
      key: 'indexList',
      label: 'indexed list patch',
      tableId: 'results-index-list',
      suites: ['Lumina indexList', 'Lumina indexList (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19 memo rows', 'Solid 1 Index'])],
    },
    {
      key: 'forList',
      label: 'stable signal list patch',
      tableId: 'results-for-list',
      suites: ['Lumina forList', 'Lumina forList (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19 memo rows', 'Solid 1 Index'])],
    },
    {
      key: 'reorder',
      label: 'keyed reorder',
      tableId: 'results-reorder',
      suites: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19'])],
    },
    {
      key: 'singleMove',
      label: 'single keyed move',
      tableId: 'results-single-move',
      suites: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19'])],
    },
    {
      key: 'complexReorder',
      label: 'complex keyed reorder window',
      tableId: 'results-complex-reorder',
      suites: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19'])],
    },
    {
      key: 'structureDiff',
      label: 'keyed structure diff',
      tableId: 'results-structure-diff',
      suites: ['Lumina generic keyed patch', 'Lumina keyed list', 'Lumina keyed list (compiled)', 'Vanilla DOM', ...(localOnly ? [] : ['React 19'])],
    },
    {
      key: 'fineGrained',
      label: 'fine-grained row update',
      tableId: 'results-fine-grained',
      suites: ['Lumina signals + DOM', 'Vanilla DOM', ...(localOnly ? [] : ['Solid signals'])],
    },
  ] as const;

const buildExpectedContract = (manifest: BenchmarkManifest) => ({
  domShape: BENCHMARK_DOM_SHAPE,
  timing: BENCHMARK_TIMING_CONTRACT,
  scenarios: buildExpectedScenarioDefinitions(manifest.localOnly),
});

const validateManifest = (
  rawManifest: unknown,
  schemaVersion: number,
  suiteVersion: string
): BenchmarkManifest => {
  assert(isRecord(rawManifest), 'Benchmark export is missing manifest');

  const manifest = rawManifest as Partial<BenchmarkManifest>;
  assert(manifest.version === schemaVersion, 'Benchmark manifest.version must match schemaVersion');
  assert(manifest.suiteVersion === suiteVersion, 'Benchmark manifest.suiteVersion must match suiteVersion');
  assert(isBoolean(manifest.smokeMode), 'Benchmark manifest.smokeMode must be a boolean');
  assert(isBoolean(manifest.localOnly), 'Benchmark manifest.localOnly must be a boolean');
  assert(isPositiveInteger(manifest.warmupRuns), 'Benchmark manifest.warmupRuns must be a positive integer');
  assert(isPositiveInteger(manifest.measuredRuns), 'Benchmark manifest.measuredRuns must be a positive integer');
  assert(isPositiveInteger(manifest.listSize), 'Benchmark manifest.listSize must be a positive integer');
  assert(
    Array.isArray(manifest.scenarios) &&
      manifest.scenarios.length > 0 &&
      manifest.scenarios.every(isNonEmptyString) &&
      unique(manifest.scenarios),
    'Benchmark manifest.scenarios must be a non-empty string array'
  );

  return manifest as BenchmarkManifest;
};

const validateScenarioEntry = (
  rawEntry: unknown,
  scenarioName: string,
  expectedWarmupRuns: number,
  expectedMeasuredRuns: number
): ScenarioEntry => {
  assert(isRecord(rawEntry), `Benchmark export entry for ${scenarioName} must be an object`);

  const entry = rawEntry as Partial<ScenarioEntry>;
  assert(isNonEmptyString(entry.name), `Benchmark export entry for ${scenarioName} is missing a name`);
  assert(entry.warmupRuns === expectedWarmupRuns, `Benchmark export entry ${entry.name} has mismatched warmupRuns`);
  assert(entry.measuredRuns === expectedMeasuredRuns, `Benchmark export entry ${entry.name} has mismatched measuredRuns`);
  assert(isPositiveInteger(entry.iterations), `Benchmark export entry ${entry.name} must have positive iterations`);
  assert(
    Array.isArray(entry.samplesMs) && entry.samplesMs.length === expectedMeasuredRuns,
    `Benchmark export entry ${entry.name} must include one sample per measured run`
  );
  assert(entry.samplesMs.every(isFiniteNumber), `Benchmark export entry ${entry.name} contains a non-finite sample`);
  assert(isFiniteNumber(entry.minMs), `Benchmark export entry ${entry.name} is missing minMs`);
  assert(isFiniteNumber(entry.medianMs), `Benchmark export entry ${entry.name} is missing medianMs`);
  assert(isFiniteNumber(entry.maxMs), `Benchmark export entry ${entry.name} is missing maxMs`);
  assert(isFiniteNumber(entry.meanMs), `Benchmark export entry ${entry.name} is missing meanMs`);
  assert(isFiniteNumber(entry.avgMsPerIteration), `Benchmark export entry ${entry.name} is missing avgMsPerIteration`);
  assert(
    entry.minMs <= entry.medianMs && entry.medianMs <= entry.maxMs,
    `Benchmark export entry ${entry.name} has invalid min/median/max ordering`
  );
  assert(entry.minMs <= entry.meanMs && entry.meanMs <= entry.maxMs, `Benchmark export entry ${entry.name} has invalid mean ordering`);
  assert(approxEqual(entry.minMs, min(entry.samplesMs)), `Benchmark export entry ${entry.name} minMs does not match samples`);
  assert(approxEqual(entry.maxMs, max(entry.samplesMs)), `Benchmark export entry ${entry.name} maxMs does not match samples`);
  assert(approxEqual(entry.medianMs, median(entry.samplesMs)), `Benchmark export entry ${entry.name} medianMs does not match samples`);
  assert(approxEqual(entry.meanMs, mean(entry.samplesMs)), `Benchmark export entry ${entry.name} meanMs does not match samples`);
  assert(
    approxEqual(entry.avgMsPerIteration, entry.medianMs / entry.iterations),
    `Benchmark export entry ${entry.name} avgMsPerIteration does not match medianMs / iterations`
  );

  return entry as ScenarioEntry;
};

const validateRun = (
  rawRun: unknown,
  manifest: BenchmarkManifest,
  expectedContract: ReturnType<typeof buildExpectedContract>,
  label: string
): BenchmarkRun => {
  assert(isRecord(rawRun), `Benchmark export is missing ${label}`);

  const run = rawRun as Partial<BenchmarkRun>;
  assert(typeof run.runId === 'string' && run.runId.length > 0, `Benchmark export ${label}.runId must be a non-empty string`);
  assert(
    typeof run.recordedAt === 'string' && Number.isFinite(Date.parse(run.recordedAt)),
    `Benchmark export ${label}.recordedAt must be a valid ISO timestamp`
  );
  assert(isRecord(run.environment), `Benchmark export ${label}.environment must be an object`);
  assert(run.listSize === manifest.listSize, `Benchmark export ${label}.listSize must match manifest.listSize`);
  assert(run.warmupRuns === manifest.warmupRuns, `Benchmark export ${label}.warmupRuns must match manifest.warmupRuns`);
  assert(run.measuredRuns === manifest.measuredRuns, `Benchmark export ${label}.measuredRuns must match manifest.measuredRuns`);
  assert(sameJson(run.manifest, manifest), `Benchmark export ${label}.manifest must match the top-level manifest`);
  assert(isRecord(run.scenarios), `Benchmark export ${label}.scenarios must be an object`);

  const expectedScenarioKeys = expectedContract.scenarios.map((scenario) => scenario.key);
  const actualScenarioKeys = Object.keys(run.scenarios);
  assert(
    sameJson(actualScenarioKeys, expectedScenarioKeys),
    `Benchmark export ${label}.scenarios keys must match ${expectedScenarioKeys.join(', ')}`
  );

  for (const scenario of expectedContract.scenarios) {
    const entries = run.scenarios[scenario.key];
    assert(
      Array.isArray(entries) && entries.length === scenario.suites.length,
      `Benchmark export ${label}.scenarios.${scenario.key} must include ${scenario.suites.length} suites`
    );

    const validatedEntries = entries.map((entry) =>
      validateScenarioEntry(entry, scenario.key, manifest.warmupRuns, manifest.measuredRuns)
    );
    assert(
      sameJson(
        validatedEntries.map((entry) => entry.name),
        scenario.suites
      ),
      `Benchmark export ${label}.scenarios.${scenario.key} suites must match ${scenario.suites.join(', ')}`
    );
    assert(
      validatedEntries.every((entry) => entry.iterations === validatedEntries[0].iterations),
      `Benchmark export ${label}.scenarios.${scenario.key} must use one shared iteration count`
    );
  }

  return run as BenchmarkRun;
};

export const buildBenchmarkContract = (manifest: BenchmarkManifest, run: BenchmarkRun): BenchmarkContract => {
  const expectedContract = buildExpectedContract(manifest);
  return {
    domShape: expectedContract.domShape,
    timing: expectedContract.timing,
    scenarios: expectedContract.scenarios.map((scenario) => ({
      key: scenario.key,
      label: scenario.label,
      tableId: scenario.tableId,
      iterations: run.scenarios[scenario.key][0]?.iterations ?? 0,
      suites: [...scenario.suites],
    })),
  };
};

export const validatePayload = (payload: unknown): BenchmarkExport => {
  assert(isRecord(payload), 'Benchmark export must be a JSON object');
  const typed = payload as BenchmarkExport;
  assert(isPositiveInteger(typed.schemaVersion), 'Benchmark export is missing schemaVersion');
  assert(typeof typed.suiteVersion === 'string' && typed.suiteVersion.length > 0, 'Benchmark export is missing suiteVersion');
  assert(isRecord(typed.environment), 'Benchmark export is missing environment');

  const manifest = validateManifest(typed.manifest, typed.schemaVersion, typed.suiteVersion);
  const expectedContract = buildExpectedContract(manifest);
  assert(
    sameJson(
      manifest.scenarios,
      expectedContract.scenarios.map((scenario) => scenario.label)
    ),
    'Benchmark manifest.scenarios must match the DOM render benchmark contract'
  );
  const latest = validateRun(typed.latest, manifest, expectedContract, 'latest');
  assert(sameJson(typed.environment, latest.environment), 'Benchmark export environment must match latest.environment');
  assert(Array.isArray(typed.history) && typed.history.length > 0, 'Benchmark export history must be a non-empty array');
  typed.history.forEach((entry, index) => {
    assert(entry.schemaVersion === typed.schemaVersion, `Benchmark export history[${index}].schemaVersion must match schemaVersion`);
    assert(entry.suiteVersion === typed.suiteVersion, `Benchmark export history[${index}].suiteVersion must match suiteVersion`);
    validateRun(entry, manifest, expectedContract, `history[${index}]`);
  });
  assert(isRecord(typed.historyMeta), 'Benchmark export is missing historyMeta');
  assert(
    typeof typed.historyMeta.storageKey === 'string' && typed.historyMeta.storageKey.length > 0,
    'Benchmark export historyMeta.storageKey must be a non-empty string'
  );
  assert(typed.historyMeta.compatibleRuns === typed.history.length, 'Benchmark export historyMeta.compatibleRuns must match history length');

  const latestHistoryEntry = typed.history[typed.history.length - 1];
  assert(latestHistoryEntry.runId === latest.runId, 'Benchmark export latest.runId must match the latest history entry');
  assert(latestHistoryEntry.recordedAt === latest.recordedAt, 'Benchmark export latest.recordedAt must match the latest history entry');
  assert(
    sameJson(latestHistoryEntry, {
      ...latest,
      schemaVersion: typed.schemaVersion,
      suiteVersion: typed.suiteVersion,
      manifest,
    }),
    'Benchmark export latest must match the latest compatible history entry'
  );

  return typed;
};

export const summarizeScenarios = (run: BenchmarkRun) =>
  Object.fromEntries(
    Object.entries(run.scenarios).map(([name, entries]) => [
      name,
      entries.map((entry) => ({
        name: entry.name,
        iterations: entry.iterations,
        measuredRuns: entry.measuredRuns,
        medianMs: entry.medianMs,
        minMs: entry.minMs,
        maxMs: entry.maxMs,
        meanMs: entry.meanMs,
        avgMsPerIteration: entry.avgMsPerIteration,
        sampleCount: entry.samplesMs.length,
      })),
    ])
  );

export const writeBenchmarkArchive = async (payload: BenchmarkExport, outDir: string) => {
  await fs.mkdir(outDir, { recursive: true });

  const recordedTag = payload.latest.recordedAt.replace(/[:.]/g, '-');
  const fileName = `${recordedTag}-${payload.latest.runId}.json`;
  const outputPath = path.join(outDir, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return outputPath;
};

export const writeJsonFile = async (targetPath: string, value: unknown) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

export const compareAgainstBaseline = (
  actual: BenchmarkExport,
  baseline: BenchmarkExport,
  options: {
    baselinePath: string;
    maxMedianRatio: number;
    maxMedianRegressionMs: number;
  }
): BenchmarkRegressionReport => {
  assert(actual.schemaVersion === baseline.schemaVersion, 'Benchmark export schemaVersion does not match the baseline fixture');
  assert(actual.suiteVersion === baseline.suiteVersion, 'Benchmark export suiteVersion does not match the baseline fixture');
  assert(sameJson(actual.manifest, baseline.manifest), 'Benchmark export manifest does not match the baseline fixture');
  assert(
    actual.historyMeta.storageKey === baseline.historyMeta.storageKey,
    'Benchmark export historyMeta.storageKey does not match the baseline fixture'
  );

  const actualScenarioNames = Object.keys(actual.latest.scenarios);
  const baselineScenarioNames = Object.keys(baseline.latest.scenarios);
  assert(sameJson(actualScenarioNames, baselineScenarioNames), 'Benchmark export scenario keys do not match the baseline fixture');

  let checkedEntries = 0;
  const regressions: BenchmarkRegression[] = [];

  for (const scenarioName of baselineScenarioNames) {
    const actualEntries = actual.latest.scenarios[scenarioName];
    const baselineEntries = baseline.latest.scenarios[scenarioName];
    assert(actualEntries.length === baselineEntries.length, `Benchmark export scenario ${scenarioName} entry count does not match the baseline fixture`);

    for (let index = 0; index < baselineEntries.length; index += 1) {
      const actualEntry = actualEntries[index];
      const baselineEntry = baselineEntries[index];
      assert(
        actualEntry.name === baselineEntry.name,
        `Benchmark export scenario ${scenarioName} entry ${index} changed from ${baselineEntry.name} to ${actualEntry.name}`
      );
      assert(
        actualEntry.iterations === baselineEntry.iterations,
        `Benchmark export scenario ${scenarioName} entry ${actualEntry.name} changed iterations from ${baselineEntry.iterations} to ${actualEntry.iterations}`
      );

      checkedEntries += 1;
      const maxAllowedMedianMs = Math.max(
        baselineEntry.medianMs * options.maxMedianRatio,
        baselineEntry.medianMs + options.maxMedianRegressionMs
      );

      if (actualEntry.medianMs > maxAllowedMedianMs) {
        regressions.push({
          scenario: scenarioName,
          suite: actualEntry.name,
          baselineMedianMs: baselineEntry.medianMs,
          actualMedianMs: actualEntry.medianMs,
          maxAllowedMedianMs,
          deltaMedianMs: actualEntry.medianMs - baselineEntry.medianMs,
          ratioToBaseline: baselineEntry.medianMs === 0 ? Number.POSITIVE_INFINITY : actualEntry.medianMs / baselineEntry.medianMs,
        });
      }
    }
  }

  return {
    baselinePath: options.baselinePath,
    maxMedianRatio: options.maxMedianRatio,
    maxMedianRegressionMs: options.maxMedianRegressionMs,
    checkedEntries,
    passed: regressions.length === 0,
    regressions,
  };
};

export const formatRegressionReport = (report: BenchmarkRegressionReport) => {
  if (report.passed) {
    return `DOM render benchmark matched the baseline within the configured tolerance across ${report.checkedEntries} entries.`;
  }

  const details = report.regressions
    .map(
      (regression) =>
        `${regression.scenario} -> ${regression.suite}: ${regression.actualMedianMs.toFixed(3)}ms ` +
        `> ${regression.maxAllowedMedianMs.toFixed(3)}ms allowed (baseline ${regression.baselineMedianMs.toFixed(3)}ms)`
    )
    .join('\n');

  return `DOM render benchmark regression detected against ${report.baselinePath}.\n${details}`;
};
