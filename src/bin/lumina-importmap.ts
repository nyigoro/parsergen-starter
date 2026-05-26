import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  BROWSER_LOCKFILE_FILENAME,
  generateBrowserLock,
  readBrowserLockfile,
  readLockfile,
  writeBrowserLockfile,
  type BrowserLock,
} from '../lumina/lockfile.js';

export type ImportMap = {
  imports: Record<string, string>;
  integrity: Record<string, string>;
};

export type ImportMapOptions = {
  cwd?: string;
  stdout?: Pick<Console, 'log'>;
  stderr?: Pick<Console, 'error'>;
};

const parseFlag = (argv: string[], name: string): string | null => {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
};

export function generateImportMap(browserLock: BrowserLock): ImportMap {
  const imports: Record<string, string> = {};
  const integrity: Record<string, string> = {};
  const sorted = Array.from(browserLock.packages.values()).sort((a, b) =>
    a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
  );
  const nameCounts = new Map<string, number>();
  for (const entry of sorted) {
    nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1);
  }
  for (const entry of sorted) {
    const target = entry.esm ?? entry.wasm;
    if (!target) continue;
    imports[`${entry.name}@${entry.version}`] = target;
    if (nameCounts.get(entry.name) === 1) {
      imports[entry.name] = target;
    }
    integrity[target] = entry.integrity;
  }
  return { imports, integrity };
}

export async function writeImportMap(map: ImportMap, filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(map, null, 2)}\n`, 'utf-8');
}

export async function runLuminaImportmap(argv: string[], options: ImportMapOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const stdout = options.stdout ?? console;
  const stderr = options.stderr ?? console;

  if (argv.includes('--help') || argv.includes('-h')) {
    stdout.log('Usage: lumina importmap [--out <path>] [--write-browser-lock]');
    return;
  }

  const outArg = parseFlag(argv, '--out');
  const outPath = path.resolve(cwd, outArg ?? 'dist/import-map.json');
  const browserLockPath = path.join(cwd, BROWSER_LOCKFILE_FILENAME);
  let browserLock: BrowserLock;
  if (existsSync(browserLockPath)) {
    browserLock = await readBrowserLockfile(cwd);
  } else {
    const lock = await readLockfile(cwd);
    browserLock = generateBrowserLock(lock);
    if (argv.includes('--write-browser-lock')) {
      await writeBrowserLockfile(cwd, browserLock);
      stdout.log('Wrote lumina.browser.lock');
    }
  }

  const map = generateImportMap(browserLock);
  if (Object.keys(map.imports).length === 0) {
    stderr.error('No browser-resolvable package URLs found in lock data.');
  }
  await writeImportMap(map, outPath);
  stdout.log(`Import map written: ${outPath}`);
}
