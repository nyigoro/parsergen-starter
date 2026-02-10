const fs = require('node:fs');
const path = require('node:path');

const binDir = path.join(__dirname, '..', 'dist', 'bin');
const bins = ['cli.js', 'lumina.js', 'lumina-lsp.js'];

let ok = true;
for (const name of bins) {
  const filePath = path.join(binDir, name);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing bin: ${filePath}`);
    ok = false;
    continue;
  }
  const firstLine = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)[0];
  if (!firstLine.startsWith('#!/usr/bin/env node')) {
    console.error(`Missing shebang in ${filePath}`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}
console.log('Package check: OK');
