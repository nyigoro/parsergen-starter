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

describe('docs playground previews', () => {
  test('selected high-value docs pages include intentional playground preview links', () => {
    const expectedPreviews = new Map([
      ['GETTING_STARTED.md', 'basics'],
      ['UI_FRAMEWORK.md', 'counter'],
      ['STDLIB.md', 'safe-index'],
      ['CAPABILITIES.md', 'hkt-stdlib'],
      ['ERROR_HANDLING.md', 'safe-index'],
      ['RENDER.md', 'tabs'],
      ['WHEN_TO_USE_JS_VS_WASM.md', 'wasm-hello'],
    ]);

    for (const [fileName, exampleId] of expectedPreviews) {
      const source = fs.readFileSync(path.join(docsContentDir, fileName), 'utf-8');
      expect(source).toContain(`data-playground-doc-preview="${exampleId}"`);
      expect(source).toContain(`href="../playground/?example=${exampleId}`);
      expect(source).toContain(`data-playground-example="${exampleId}"`);
      expect(source).toContain('data-playground-link');
      expect(source).toContain('class="docs-playground-open"');
      expect(source).toContain('docs-playground-card-header');
      expect(source).toContain('docs-playground-card-grid');
      expect(source).not.toContain('<iframe');
    }
  });

  test('docs preview links point to curated playground example ids', () => {
    const ids = curatedExampleIds();
    const previewMatches = collectMarkdownFiles(docsContentDir).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf-8');
      return Array.from(source.matchAll(/data-playground-example="([^"]+)"/g)).map((match) => ({
        file,
        exampleId: match[1],
      }));
    });

    expect(previewMatches.length).toBeGreaterThanOrEqual(7);
    for (const { file, exampleId } of previewMatches) {
      expect(ids.has(exampleId)).toBe(true);
      const source = fs.readFileSync(file, 'utf-8');
      expect(source).toContain(`?example=${exampleId}`);
      expect(source).not.toContain('embed=1&amp;example=');
    }
  });

  test('docs site normalizes playground links for local docs dev and published docs', () => {
    const bridge = fs.readFileSync(path.join(repoRoot, 'docs-site', 'src', 'docs-bridge.ts'), 'utf-8');
    const styles = fs.readFileSync(path.join(repoRoot, 'docs-site', 'src', 'style.css'), 'utf-8');

    expect(bridge).toContain('enhancePlaygroundLinks');
    expect(bridge).toContain('playgroundLinkUrl');
    expect(bridge).toContain('link.dataset.playgroundExample');
    expect(bridge).not.toContain("url.searchParams.set('embed', '1')");
    expect(styles).toContain('.docs-playground-card');
    expect(styles).toContain('.docs-playground-card-grid');
    expect(styles).toContain('.docs-playground-shot');
    expect(styles).toContain('.docs-playground-open');
  });

  test('generated docs bundle includes playground preview markup', () => {
    const bundle = fs.readFileSync(path.join(repoRoot, 'docs-site', 'public', 'docs-bundle.json'), 'utf-8');

    for (const exampleId of ['basics', 'counter', 'safe-index', 'hkt-stdlib', 'tabs', 'wasm-hello']) {
      expect(bundle).toContain(`data-playground-doc-preview=\\"${exampleId}\\"`);
      expect(bundle).toContain(`data-playground-example=\\"${exampleId}\\"`);
    }
    expect(bundle).toContain('What this shows:');
    expect(bundle).toContain('Try this:');
    expect(bundle).toContain('Open in Playground');
    expect(bundle).not.toContain('docs-playground-frame');
  });
});
