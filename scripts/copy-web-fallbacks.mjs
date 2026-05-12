import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const source = path.join(repoRoot, 'docs', '404.html');

for (const target of [
  path.join(repoRoot, 'docs', 'docs', '404.html'),
  path.join(repoRoot, 'docs', 'playground', '404.html'),
]) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}
