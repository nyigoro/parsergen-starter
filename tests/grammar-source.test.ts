import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
};

describe('canonical grammar source', () => {
  it('uses src/grammar/lumina.peg instead of an examples fallback', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/grammar/lumina.peg'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'examples/lumina.peg'))).toBe(false);

    const searchableRoots = ['src', 'scripts', 'tests'].map((segment) => path.join(repoRoot, segment));
    const offenders = searchableRoots
      .flatMap(walk)
      .filter((file) => /\.(?:ts|js|cjs|mjs)$/.test(file))
      .filter((file) => path.resolve(file) !== path.resolve(__filename))
      .filter((file) => fs.readFileSync(file, 'utf-8').includes('examples/lumina.peg'));

    expect(offenders.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });
});
