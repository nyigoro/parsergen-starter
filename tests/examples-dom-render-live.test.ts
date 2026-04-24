import fs from 'node:fs';
import path from 'node:path';

const benchmarkPath = path.resolve(__dirname, '../examples/dom-render/benchmark.js');
const benchmarkSource = fs.readFileSync(benchmarkPath, 'utf-8');
const benchmarkHtmlPath = path.resolve(__dirname, '../examples/dom-render/benchmark.html');
const benchmarkHtml = fs.readFileSync(benchmarkHtmlPath, 'utf-8');
const benchmarkCompiledPath = path.resolve(__dirname, '../examples/dom-render/benchmark-compiled.generated.js');
const mainPath = path.resolve(__dirname, '../examples/dom-render/main.js');
const mainSource = fs.readFileSync(mainPath, 'utf-8');
const targetsPath = path.resolve(__dirname, '../examples/dom-render/targets.js');
const targetsSource = fs.readFileSync(targetsPath, 'utf-8');
const runtimePath = path.resolve(__dirname, '../examples/dom-render/lumina-runtime.js');

describe('dom-render live assets', () => {
  test('browser demos use the local runtime asset', () => {
    expect(mainSource).toContain("./lumina-runtime.js");
    expect(targetsSource).toContain("./lumina-runtime.js");
    expect(benchmarkSource).toContain("./lumina-runtime.js");
    expect(fs.existsSync(runtimePath)).toBe(true);
    expect(fs.existsSync(benchmarkCompiledPath)).toBe(true);
  });

  test('benchmark page exposes deeper scenario sections', () => {
    expect(benchmarkHtml).toContain('rel="icon"');
    expect(benchmarkHtml).toContain('Whole-list patch');
    expect(benchmarkHtml).toContain('Indexed list patch');
    expect(benchmarkHtml).toContain('Keyed signal list patch');
    expect(benchmarkHtml).toContain('Initial mount');
    expect(benchmarkHtml).toContain('Keyed reorder');
    expect(benchmarkHtml).toContain('Fine-grained row update');
    expect(benchmarkHtml).toContain('results-whole-list');
    expect(benchmarkHtml).toContain('results-index-list');
    expect(benchmarkHtml).toContain('results-for-list');
    expect(benchmarkHtml).toContain('results-fine-grained');
  });

  test('benchmark script runs multiple scenario suites', () => {
    expect(benchmarkSource).toContain('benchmarkLuminaWholeList');
    expect(benchmarkSource).toContain('benchmarkLuminaCompiledWholeList');
    expect(benchmarkSource).toContain('benchmarkLuminaIndexList');
    expect(benchmarkSource).toContain('benchmarkLuminaCompiledIndexList');
    expect(benchmarkSource).toContain('benchmarkLuminaForList');
    expect(benchmarkSource).toContain('benchmarkLuminaCompiledForList');
    expect(benchmarkSource).toContain('benchmarkLuminaCompiledReorder');
    expect(benchmarkSource).toContain('benchmarkReactMemoList');
    expect(benchmarkSource).toContain('benchmarkReactMemoKeyedList');
    expect(benchmarkSource).toContain('benchmarkSolidIndexList');
    expect(benchmarkSource).toContain('benchmarkSolidKeyedIndexList');
    expect(benchmarkSource).toContain('benchmarkLuminaReorder');
    expect(benchmarkSource).toContain('benchmarkLuminaFineGrained');
    expect(benchmarkSource).toContain('luminaRender.indexList');
    expect(benchmarkSource).toContain('luminaRender.forList');
    expect(benchmarkSource).toContain('luminaRender.liveText');
    expect(benchmarkSource).toContain("./benchmark-compiled.generated.js");
    expect(benchmarkSource).toContain('compiledWholeList');
    expect(benchmarkSource).toContain('compiledReorder');
    expect(benchmarkSource).toContain("results-mount");
    expect(benchmarkSource).toContain("results-index-list");
    expect(benchmarkSource).toContain("results-for-list");
    expect(benchmarkSource).toContain("results-reorder");
  });
});
