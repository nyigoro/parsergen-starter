import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');
const docsRoot = path.join(repoRoot, 'docs');

const removeIfExists = async (target) => {
  await fs.rm(target, { force: true, recursive: true });
};

await Promise.all([
  removeIfExists(path.join(docsRoot, 'assets')),
  removeIfExists(path.join(docsRoot, 'index.html')),
  removeIfExists(path.join(docsRoot, '404.html')),
  removeIfExists(path.join(docsRoot, 'CNAME')),
]);
