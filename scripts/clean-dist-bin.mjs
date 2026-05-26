/* global process */
import fs from 'node:fs/promises';
import path from 'node:path';

const distBin = path.resolve(process.cwd(), 'dist', 'bin');
const keep = new Set([
  'lumina.js',
  'lumina.js.map',
  'lumina.d.ts',
  'lumina.cjs',
  'lumina.cjs.map',
  'lumina.d.cts',
  'lumina-lsp.js',
  'lumina-lsp.js.map',
  'lumina-lsp.d.ts',
  'lumina-lsp.cjs',
  'lumina-lsp.cjs.map',
  'lumina-lsp.d.cts',
  'lumina-repl.js',
  'lumina-repl.js.map',
  'lumina-repl.d.ts',
  'lumina-repl.cjs',
  'lumina-repl.cjs.map',
  'lumina-repl.d.cts',
]);

async function run() {
  let entries = [];
  try {
    entries = await fs.readdir(distBin);
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    if (keep.has(entry)) return;
    await fs.rm(path.join(distBin, entry), { force: true });
  }));
}

run();
