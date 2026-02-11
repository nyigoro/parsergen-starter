const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, 'CNAME');
const targetDir = path.join(repoRoot, 'docs');
const target = path.join(targetDir, 'CNAME');

if (!fs.existsSync(source)) {
  console.error('CNAME not found at repo root.');
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('Copied CNAME to docs/CNAME');
