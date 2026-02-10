const fs = require('node:fs');
const path = require('node:path');

const distBin = path.resolve(__dirname, '..', 'dist', 'bin');
const pairs = [
  ['cli-cjs', 'cli'],
  ['lumina-cjs', 'lumina'],
];

const exts = ['.cjs', '.cjs.map', '.d.cts'];

for (const [fromBase, toBase] of pairs) {
  for (const ext of exts) {
    const from = path.join(distBin, `${fromBase}${ext}`);
    const to = path.join(distBin, `${toBase}${ext}`);
    if (!fs.existsSync(from)) continue;
    fs.renameSync(from, to);
  }
}
