import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileLuminaTask } from '../src/bin/lumina-core.js';

describe('concurrent compile reliability', () => {
  test('compiles multiple files concurrently without worker crashes', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumina-concurrent-'));
    try {
      const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');

      const jobs = Array.from({ length: 8 }, async (_, index) => {
        const sourcePath = path.join(root, `input_${index}.lm`);
        const outPath = path.join(root, `output_${index}.js`);
        const source = `
          fn main() -> i32 {
            let base = ${index};
            base + 1
          }
        `;
        await fs.writeFile(sourcePath, source, 'utf-8');
        const result = await compileLuminaTask({
          sourcePath,
          outPath,
          target: 'esm',
          grammarPath,
          useRecovery: true,
        });
        expect(result.ok).toBe(true);
        expect(existsSync(outPath)).toBe(true);
      });

      await Promise.all(jobs);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      logSpy.mockRestore();
    }
  }, 30000);
});
