import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runLumina } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];
const originalCwd = process.cwd();

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-search-'));
  tempDirs.push(dir);
  return dir;
}

function captureConsoleLogs() {
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  });
  return { lines, spy };
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  jest.restoreAllMocks();
});

describe('lumina search command', () => {
  it('prints rich search output with metadata and next-page hint', async () => {
    const cwd = createTempDir();
    process.chdir(cwd);
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-08T00:00:00.000Z').getTime());
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 47,
          results: [
            {
              name: 'json-utils',
              version: '1.2.3',
              description: 'JSON helpers',
              downloads: 12345,
              dependents: 27,
              updatedAt: '2026-03-01T00:00:00.000Z',
              tags: ['wasm-ready', 'browser-native'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );
    const { lines } = captureConsoleLogs();

    await runLumina(['search', 'json', '--limit', '1', '--offset', '0', '--sort', 'downloads', '--tags', 'wasm-ready']);

    const output = lines.join('\n');
    expect(output).toContain('Found 47 package(s) - showing 1-1:');
    expect(output).toContain('json-utils@1.2.3  [wasm-ready, browser-native]');
    expect(output).toContain('JSON helpers');
    expect(output).toContain('↓ 12,345');
    expect(output).toContain('27 dependents');
    expect(output).toContain('updated 7d ago');
    expect(output).toContain('-> More results: lumina search "json" --offset 1 --limit 1 --sort downloads --tags wasm-ready');
  });

  it('prints a usage hint for empty query instead of throwing', async () => {
    const cwd = createTempDir();
    process.chdir(cwd);
    const { lines } = captureConsoleLogs();

    await expect(runLumina(['search'])).resolves.toBeUndefined();

    expect(lines.join('\n')).toContain('Usage: lumina search <query>');
  });

  it('prints full search result shape in json mode', async () => {
    const cwd = createTempDir();
    process.chdir(cwd);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 2,
          results: [
            {
              name: 'vec-tools',
              version: '0.4.0',
              description: null,
              downloads: 50,
              dependents: 2,
              updatedAt: '2026-03-05T00:00:00.000Z',
              tags: ['collections'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );
    const { lines } = captureConsoleLogs();

    await runLumina(['search', 'vec', '--limit', '1', '--json']);

    const payload = JSON.parse(lines.join('\n')) as {
      total: number;
      hasMore: boolean;
      nextOffset: number | null;
      results: Array<{ downloads: number | null; dependents: number | null; tags: string[] }>;
    };
    expect(payload.total).toBe(2);
    expect(payload.hasMore).toBe(true);
    expect(payload.nextOffset).toBe(1);
    expect(payload.results[0].downloads).toBe(50);
    expect(payload.results[0].dependents).toBe(2);
    expect(payload.results[0].tags).toEqual(['collections']);
  });
});
