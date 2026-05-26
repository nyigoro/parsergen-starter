import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const examplesRoot = path.join(repoRoot, 'examples');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
};

describe('example hygiene', () => {
  it('does not keep stale source maps or parsergen-era generated metadata in examples', () => {
    const files = walk(examplesRoot);
    const mapFiles = files.filter((file) => file.endsWith('.map'));
    const generatedFiles = files.filter((file) => /\.(?:js|cjs|mjs|map)$/.test(file));
    const sourceMapComments = generatedFiles.filter((file) =>
      fs.readFileSync(file, 'utf-8').includes('sourceMappingURL=')
    );
    const parsergenMetadata = generatedFiles.filter((file) =>
      fs.readFileSync(file, 'utf-8').includes('parsergen-starter')
    );

    expect(mapFiles.map((file) => path.relative(repoRoot, file))).toEqual([]);
    expect(sourceMapComments.map((file) => path.relative(repoRoot, file))).toEqual([]);
    expect(parsergenMetadata.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });

  it('does not track scratch tmp examples as maintained examples', () => {
    const scratchFiles = fs.existsSync(path.join(examplesRoot, 'scratch'))
      ? fs.readdirSync(path.join(examplesRoot, 'scratch'))
      : [];

    expect(scratchFiles.filter((name) => /^tmp(?:-|\.lm)/.test(name))).toEqual([]);
  });
});
