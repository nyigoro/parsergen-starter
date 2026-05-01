import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
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

const copyIfExists = async (fromFile, toFile) => {
  try {
    await fs.mkdir(path.dirname(toFile), { recursive: true });
    await fs.copyFile(fromFile, toFile);
  } catch {
    // Ignore missing files so the build script stays resilient during scaffolding.
  }
};

run(process.execPath, ['scripts/build-docs.mjs']);
run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'demo', 'run', 'build']);
run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'docs-site', 'run', 'build']);
run(npmCommand.command, [...npmCommand.prefixArgs, '--prefix', 'playground', 'run', 'build']);

await copyIfExists(path.join(repoRoot, 'docs', '404.html'), path.join(repoRoot, 'docs', 'docs', '404.html'));
await copyIfExists(path.join(repoRoot, 'docs', '404.html'), path.join(repoRoot, 'docs', 'playground', '404.html'));
