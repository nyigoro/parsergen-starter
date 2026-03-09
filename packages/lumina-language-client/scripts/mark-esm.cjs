const fs = require('node:fs');
const path = require('node:path');

const dir = path.join('dist', 'esm');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf-8');
