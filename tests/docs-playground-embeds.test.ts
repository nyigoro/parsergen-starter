import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const docsContentDir = path.join(repoRoot, 'docs-content');
const examplesDataPath = path.join(repoRoot, 'playground', 'src', 'examples-data.ts');

const collectMarkdownFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
};

const curatedExampleIds = (): Set<string> => {
  const source = fs.readFileSync(examplesDataPath, 'utf-8');
  return new Set(Array.from(source.matchAll(/example\('[^']+',\s+'([^']+)'/g)).map((match) => match[1]));
};

describe('docs playground embeds', () => {
  test('selected high-value docs pages include intentional live playground embeds', () => {
    const expectedEmbeds = new Map([
      ['GETTING_STARTED.md', 'basics'],
      ['UI_FRAMEWORK.md', 'counter'],
      ['STDLIB.md', 'safe-index'],
      ['CAPABILITIES.md', 'hkt-stdlib'],
    ]);

    for (const [fileName, exampleId] of expectedEmbeds) {
      const source = fs.readFileSync(path.join(docsContentDir, fileName), 'utf-8');
      expect(source).toContain(`data-playground-doc-embed="${exampleId}"`);
      expect(source).toContain(`src="../playground/?embed=1&amp;example=${exampleId}"`);
      expect(source).toContain(`data-playground-example="${exampleId}"`);
      expect(source).toContain('class="docs-playground-frame"');
    }
  });

  test('docs embed URLs point to curated playground example ids', () => {
    const ids = curatedExampleIds();
    const embedMatches = collectMarkdownFiles(docsContentDir).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      return Array.from(source.matchAll(/data-playground-example="([^"]+)"/g)).map((match) => ({
        file,
        exampleId: match[1],
      }));
    });

    expect(embedMatches.length).toBeGreaterThanOrEqual(4);
    for (const { file, exampleId } of embedMatches) {
      expect(ids.has(exampleId)).toBe(true);
      const source = fs.readFileSync(file, 'utf-8');
      expect(source).toContain(`embed=1&amp;example=${exampleId}`);
    }
  });

  test('docs site normalizes playground embed URLs for local docs dev and published docs', () => {
    const bridge = fs.readFileSync(path.join(repoRoot, 'docs-site', 'src', 'docs-bridge.ts'), 'utf-8');
    const styles = fs.readFileSync(path.join(repoRoot, 'docs-site', 'src', 'style.css'), 'utf-8');

    expect(bridge).toContain('enhancePlaygroundEmbeds');
    expect(bridge).toContain("url.searchParams.set('embed', '1')");
    expect(bridge).toContain("frame.dataset.playgroundExample");
    expect(styles).toContain('.docs-live-example');
    expect(styles).toContain('.docs-playground-frame');
  });

  test('generated docs bundle includes the live playground embed markup', () => {
    const bundle = fs.readFileSync(path.join(repoRoot, 'docs-site', 'public', 'docs-bundle.json'), 'utf-8');

    for (const exampleId of ['basics', 'counter', 'safe-index', 'hkt-stdlib']) {
      expect(bundle).toContain(`data-playground-doc-embed=\\"${exampleId}\\"`);
      expect(bundle).toContain(`data-playground-example=\\"${exampleId}\\"`);
    }
  });
});
