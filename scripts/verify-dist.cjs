const fs = require('node:fs');
const path = require('node:path');

const distBin = path.resolve(__dirname, '..', 'dist', 'bin');
if (!fs.existsSync(distBin)) {
  console.error('dist/bin not found. Did build run?');
  process.exit(1);
}

const forbidden = [/-core\./, /-cjs\./];
const entries = fs.readdirSync(distBin);
const offenders = entries.filter((entry) => forbidden.some((re) => re.test(entry)));

if (offenders.length > 0) {
  console.error('Forbidden build artifacts found in dist/bin:');
  offenders.forEach((entry) => console.error(`  - ${entry}`));
  process.exit(1);
}
