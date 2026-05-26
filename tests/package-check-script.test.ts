import fs from 'node:fs';
import path from 'node:path';

describe('package check script', () => {
  test('covers every published CLI bin', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as {
      bin: Record<string, string>;
    };
    const script = fs.readFileSync(path.resolve(__dirname, '../scripts/check-package.cjs'), 'utf-8');

    for (const binPath of Object.values(packageJson.bin)) {
      expect(script).toContain(path.basename(binPath));
    }
  });
});
