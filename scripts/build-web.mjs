import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const npmCommand =
  process.platform === 'win32'
    ? { command: process.execPath, prefixArgs: [path.join(repoRoot, 'node_modules/npm/bin/npm-cli.js')] }
    : { command: 'npm', prefixArgs: [] };

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const ensureFile = async (filePath, label) => {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${path.relative(repoRoot, filePath)}`);
  }
};

run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'demo', 'run', 'build:shell']);
run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'docs-site', 'run', 'build']);
run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'playground', 'run', 'build']);
run(process.execPath, ['scripts/copy-web-fallbacks.mjs']);

await Promise.all([
  ensureFile(path.join(repoRoot, 'docs', 'index.html'), 'root site shell'),
  ensureFile(path.join(repoRoot, 'docs', '404.html'), 'root site fallback'),
  ensureFile(path.join(repoRoot, 'docs', 'docs', 'index.html'), 'docs app shell'),
  ensureFile(path.join(repoRoot, 'docs', 'docs', '404.html'), 'docs app fallback'),
  ensureFile(path.join(repoRoot, 'docs', 'docs', 'docs-bundle.json'), 'docs bundle'),
  ensureFile(path.join(repoRoot, 'docs', 'playground', 'index.html'), 'playground shell'),
  ensureFile(path.join(repoRoot, 'docs', 'playground', '404.html'), 'playground fallback'),
]);
