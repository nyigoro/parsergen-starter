import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_OUT_DIR,
  assert,
  compareAgainstBaseline,
  formatRegressionReport,
  summarizeScenarios,
  validatePayload,
  writeBenchmarkArchive,
  writeJsonFile,
} from './dom-render-bench-lib.js';

type CliOptions = {
  inputPath: string;
  outDir: string;
  baselinePath: string;
  baselineOutPath: string;
  summaryPath: string;
  maxMedianRatio: number;
  maxMedianRegressionMs: number;
};

const parsePositiveNumber = (value: string, flag: string) => {
  const parsed = Number.parseFloat(value);
  assert(Number.isFinite(parsed) && parsed > 0, `${flag} must be a positive number`);
  return parsed;
};

const parseArgs = (argv: string[]): CliOptions => {
  let inputPath = '';
  let outDir = DEFAULT_OUT_DIR;
  let baselinePath = '';
  let baselineOutPath = '';
  let summaryPath = '';
  let maxMedianRatio = 5;
  let maxMedianRegressionMs = 4;

  const readValue = (index: number, flag: string) => {
    const value = argv[index + 1] ?? '';
    assert(value.length > 0, `${flag} requires a value`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      inputPath = path.resolve(readValue(index, '--input'));
      index += 1;
      continue;
    }
    if (arg === '--out-dir') {
      outDir = path.resolve(readValue(index, '--out-dir'));
      index += 1;
      continue;
    }
    if (arg === '--baseline') {
      baselinePath = path.resolve(readValue(index, '--baseline'));
      index += 1;
      continue;
    }
    if (arg === '--baseline-out') {
      baselineOutPath = path.resolve(readValue(index, '--baseline-out'));
      index += 1;
      continue;
    }
    if (arg === '--summary-path') {
      summaryPath = path.resolve(readValue(index, '--summary-path'));
      index += 1;
      continue;
    }
    if (arg === '--max-median-ratio') {
      maxMedianRatio = parsePositiveNumber(readValue(index, '--max-median-ratio'), '--max-median-ratio');
      index += 1;
      continue;
    }
    if (arg === '--max-median-regression-ms') {
      maxMedianRegressionMs = parsePositiveNumber(
        readValue(index, '--max-median-regression-ms'),
        '--max-median-regression-ms'
      );
      index += 1;
      continue;
    }
  }

  if (!inputPath) {
    throw new Error(
      'Usage: tsx scripts/benchmark/dom-render-bench.ts --input <export.json> ' +
        '[--out-dir <dir>] [--baseline <baseline.json>] [--baseline-out <baseline.json>] ' +
        '[--summary-path <summary.json>] [--max-median-ratio <n>] [--max-median-regression-ms <n>]'
    );
  }

  return {
    inputPath,
    outDir,
    baselinePath,
    baselineOutPath,
    summaryPath,
    maxMedianRatio,
    maxMedianRegressionMs,
  };
};

const readValidatedPayload = async (filePath: string) => {
  const raw = await fs.readFile(filePath, 'utf-8');
  return validatePayload(JSON.parse(raw));
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const payload = await readValidatedPayload(options.inputPath);
  const baseline =
    options.baselinePath.length > 0 ? await readValidatedPayload(options.baselinePath) : null;

  const storedAt = await writeBenchmarkArchive(payload, options.outDir);

  if (options.baselineOutPath.length > 0) {
    await writeJsonFile(options.baselineOutPath, payload);
  }

  const baselineCheck =
    baseline && options.baselinePath.length > 0
      ? compareAgainstBaseline(payload, baseline, {
          baselinePath: options.baselinePath,
          maxMedianRatio: options.maxMedianRatio,
          maxMedianRegressionMs: options.maxMedianRegressionMs,
        })
      : null;

  const summary = {
    storedAt,
    schemaVersion: payload.schemaVersion,
    suiteVersion: payload.suiteVersion,
    runId: payload.latest.runId,
    recordedAt: payload.latest.recordedAt,
    manifest: payload.manifest,
    historyMeta: payload.historyMeta,
    historyRuns: payload.history.length,
    listSize: payload.latest.listSize,
    warmupRuns: payload.latest.warmupRuns,
    measuredRuns: payload.latest.measuredRuns,
    scenarios: summarizeScenarios(payload.latest),
    baselineCheck,
    baselineWrittenTo: options.baselineOutPath || null,
  };

  if (options.summaryPath.length > 0) {
    await writeJsonFile(options.summaryPath, summary);
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (baselineCheck && !baselineCheck.passed) {
    process.stderr.write(`${formatRegressionReport(baselineCheck)}\n`);
    process.exit(1);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
