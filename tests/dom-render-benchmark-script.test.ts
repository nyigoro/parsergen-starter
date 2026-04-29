import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const suiteVersion = '2026-04-29-benchmark-quality-v3';
const historyKey = 'lumina.dom.benchmark.history.v3';

const makeEntry = (name: string) => ({
  name,
  warmupRuns: 1,
  measuredRuns: 2,
  iterations: 12,
  samplesMs: [4.1, 4.9],
  minMs: 4.1,
  medianMs: 4.5,
  maxMs: 4.9,
  meanMs: 4.5,
  avgMsPerIteration: 0.375,
});

const makePayload = () => {
  const manifest = {
    version: 3,
    suiteVersion,
    smokeMode: true,
    localOnly: true,
    warmupRuns: 1,
    measuredRuns: 2,
    listSize: 32,
    scenarios: [
      'whole-list patch',
      'initial mount',
      'indexed list patch',
      'stable signal list patch',
      'keyed reorder',
      'complex keyed reorder window',
      'fine-grained row update',
    ],
  };

  const latest = {
    runId: '123456-abc123',
    recordedAt: '2026-04-29T10:11:12.000Z',
    environment: {
      userAgent: 'Jest',
      hardwareConcurrency: 4,
      deviceMemory: 8,
      language: 'en-US',
      languages: ['en-US'],
      platform: 'Win32',
    },
    listSize: 32,
    warmupRuns: 1,
    measuredRuns: 2,
    manifest,
    scenarios: {
      indexList: [makeEntry('Lumina indexList')],
      forList: [makeEntry('Lumina forList (compiled)')],
      reorder: [makeEntry('Lumina keyed list (compiled)')],
    },
  };

  return {
    schemaVersion: 3,
    suiteVersion,
    manifest,
    environment: latest.environment,
    latest,
    history: [
      {
        ...latest,
        schemaVersion: 3,
        suiteVersion,
      },
    ],
    historyMeta: {
      storageKey: historyKey,
      compatibleRuns: 1,
    },
  };
};

const runImport = (inputPath: string, outDir: string) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/benchmark/dom-render-bench.ts', '--input', inputPath, '--out-dir', outDir],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    }
  );

describe('dom-render benchmark history script', () => {
  test('archives a compatible benchmark export JSON file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'export.json');
    const outDir = path.join(root, 'history');
    const payload = makePayload();

    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf-8');

    const result = runImport(inputPath, outDir);

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.schemaVersion).toBe(3);
    expect(summary.suiteVersion).toBe(suiteVersion);
    expect(summary.runId).toBe('123456-abc123');
    expect(summary.manifest.localOnly).toBe(true);
    expect(summary.historyMeta.storageKey).toBe(historyKey);
    expect(summary.historyRuns).toBe(1);
    expect(summary.measuredRuns).toBe(2);
    expect(summary.scenarios.indexList[0]).toMatchObject({
      name: 'Lumina indexList',
      measuredRuns: 2,
      sampleCount: 2,
      medianMs: 4.5,
      avgMsPerIteration: 0.375,
    });

    const storedFiles = fs.readdirSync(outDir);
    expect(storedFiles).toHaveLength(1);
    const storedPayload = JSON.parse(fs.readFileSync(path.join(outDir, storedFiles[0]), 'utf-8'));
    expect(storedPayload.historyMeta.compatibleRuns).toBe(1);
    expect(storedPayload.latest.manifest.localOnly).toBe(true);
    expect(storedPayload.latest.runId).toBe('123456-abc123');
  });

  test('rejects benchmark exports with mismatched sample history metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-dom-render-bench-'));
    const inputPath = path.join(root, 'invalid-export.json');
    const outDir = path.join(root, 'history');
    const payload = makePayload();
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
