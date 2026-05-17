import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const cjsRequire = createRequire(__filename);

const { computeRedirectUrl } = cjsRequire('../scripts/build-404.cjs') as {
  computeRedirectUrl: (input: {
    hash?: string;
    origin: string;
    pathname: string;
    search?: string;
  }) => string;
};

type DocsBundle = {
  pages: Array<{
    html: string;
    slug: string;
  }>;
};

const collectAssetRefs = (html: string): string[] =>
  Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
    .map((match) => match[1])
    .filter((value) => value.startsWith('./assets/') || value.startsWith('assets/'));

describe('site routing and playground integration', () => {
  test('404 redirect keeps docs deep links inside the docs app', () => {
    expect(
      computeRedirectUrl({
        origin: 'https://example.com',
        pathname: '/lumina-lang/docs/why-lumina',
      })
    ).toBe('https://example.com/lumina-lang/docs/#/why-lumina');

    expect(
      computeRedirectUrl({
        origin: 'https://example.com',
        pathname: '/lumina-lang/playground/missing',
        search: '?preset=basics',
      })
    ).toBe('https://example.com/lumina-lang/playground/?preset=basics');

    expect(
      computeRedirectUrl({
        origin: 'https://example.com',
        pathname: '/lumina-lang/missing-page',
      })
    ).toBe('https://example.com/lumina-lang/');
  });

  test('root site scripts start and build the full web stack', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const demoPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../demo/package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['site:dev']).toBe('npm run web:dev');
    expect(pkg.scripts?.['site:build']).toBe('npm run web:build');
    expect(pkg.scripts?.['web:build']).toBe('node scripts/build-web.mjs');
    expect(demoPkg.scripts?.build).toBe('node ../scripts/build-web.mjs');
    expect(demoPkg.scripts?.['build:shell']).toContain('node ../scripts/clean-root-web-output.mjs');
    expect(demoPkg.scripts?.['build:shell']).toContain('node ../scripts/copy-web-fallbacks.mjs');
    expect(demoPkg.scripts?.['build:shell']).toContain('vite build --config vite.config.ts');

    const buildWeb = fs.readFileSync(path.resolve(__dirname, '../scripts/build-web.mjs'), 'utf-8');
    expect(buildWeb).toContain("run(process.execPath, ['scripts/copy-web-fallbacks.mjs'])");

    const demoViteConfig = fs.readFileSync(path.resolve(__dirname, '../demo/vite.config.ts'), 'utf-8');
    expect(demoViteConfig).toContain("outDir: '../docs'");
    expect(demoViteConfig).toContain('emptyOutDir: false');
  });

  test('ci and release workflows exercise the full web publish build', () => {
    const ci = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/ci.yml'), 'utf-8');
    const release = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/release.yml'), 'utf-8');

    expect(ci).toContain('- run: npm run web:build');
    expect(release).toContain('- run: npm run web:build');
  });

  test('published docs bundle preserves route fragments and heading ids', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../docs/docs/docs-bundle.json'), 'utf-8')
    ) as DocsBundle;

    const gettingStarted = bundle.pages.find((page) => page.slug === 'getting-started');
    const errorHandling = bundle.pages.find((page) => page.slug === 'error-handling');
    const stdlib = bundle.pages.find((page) => page.slug === 'stdlib');

    expect(gettingStarted?.html).toContain('<h2 id="1-prerequisites">');
    expect(gettingStarted?.html).toContain(
      'https://github.com/nyigoro/lumina-lang/tree/main/vscode-extension'
    );
    expect(errorHandling?.html).toContain('#/stdlib?section=result');
    expect(stdlib?.html).toContain('<h2 id="result">Result</h2>');
  });

  test('published docs and playground artifacts exist with live asset references', () => {
    const docsRoot = path.resolve(__dirname, '../docs');
    const rootIndexPath = path.join(docsRoot, 'index.html');
    const rootFallbackPath = path.join(docsRoot, '404.html');
    const docsIndexPath = path.join(docsRoot, 'docs', 'index.html');
    const docsFallbackPath = path.join(docsRoot, 'docs', '404.html');
    const docsBundlePath = path.join(docsRoot, 'docs', 'docs-bundle.json');
    const playgroundIndexPath = path.join(docsRoot, 'playground', 'index.html');
    const playgroundFallbackPath = path.join(docsRoot, 'playground', '404.html');

    for (const filePath of [
      rootIndexPath,
      rootFallbackPath,
      docsIndexPath,
      docsFallbackPath,
      docsBundlePath,
      playgroundIndexPath,
      playgroundFallbackPath,
    ]) {
      expect(fs.existsSync(filePath)).toBe(true);
    }

    const rootIndex = fs.readFileSync(rootIndexPath, 'utf-8');
    const docsIndex = fs.readFileSync(docsIndexPath, 'utf-8');
    const playgroundIndex = fs.readFileSync(playgroundIndexPath, 'utf-8');
    const rootFallback = fs.readFileSync(rootFallbackPath, 'utf-8');
    const playgroundFallback = fs.readFileSync(playgroundFallbackPath, 'utf-8');

    for (const assetRef of collectAssetRefs(rootIndex)) {
      expect(fs.existsSync(path.resolve(docsRoot, assetRef))).toBe(true);
    }
    for (const assetRef of collectAssetRefs(docsIndex)) {
      expect(fs.existsSync(path.resolve(path.join(docsRoot, 'docs'), assetRef))).toBe(true);
    }
    for (const assetRef of collectAssetRefs(playgroundIndex)) {
      expect(fs.existsSync(path.resolve(path.join(docsRoot, 'playground'), assetRef))).toBe(true);
    }

    expect(rootFallback).toContain('Redirecting...');
    expect(playgroundFallback).toContain('Redirecting...');
  });

  test('playground compiler path stays browser-safe and lazy on startup', () => {
    const importSource = fs.readFileSync(
      path.resolve(__dirname, '../src/project/imports.ts'),
      'utf-8'
    );
    const playgroundIndex = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/index.ts'),
      'utf-8'
    );
    const compilerBridge = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/compiler-bridge.ts'),
      'utf-8'
    );
    const compilerWorker = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/compiler-worker.ts'),
      'utf-8'
    );
    const compileClient = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/compile-client.ts'),
      'utf-8'
    );
    const playgroundController = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/playground-controller.ts'),
      'utf-8'
    );
    const playgroundShare = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/share.ts'),
      'utf-8'
    );

    expect(importSource).not.toContain('node:fs');
    expect(importSource).not.toContain('node:path');
    expect(playgroundIndex).not.toContain("import('./compiler-bridge')");
    expect(playgroundIndex).toContain('startPlayground');
    expect(playgroundController).toContain('createPlaygroundSignal');
    expect(playgroundController).toContain("document.getElementById('examples-toggle')");
    expect(playgroundController).toContain('[data-example-id]');
    expect(playgroundController).toContain("document.getElementById('run-button')");
    expect(playgroundController).toContain("document.getElementById('format-button')");
    expect(playgroundController).toContain("document.getElementById('diagnostics-toggle')");
    expect(playgroundController).toContain('sourceProjectInput');
    expect(playgroundShare).toContain("searchParams.get('code')");
    expect(playgroundShare).toContain("searchParams.get('example')");
    expect(compilerBridge).toContain('compileLuminaGrammar(luminaGrammarRaw, { cache: true })');
    expect(compilerBridge).toContain("import routerStdRaw from '../../std/router.lm?raw';");
    expect(compilerBridge).toContain('compileLuminaProject');
    expect(compilerBridge).toContain("input.action === 'check'");
    expect(compilerBridge).toContain('generateWasmTextModuleFromAst');
    expect(compilerBridge).toContain('emitWasmBinary');
    expect(compilerBridge).toContain("'@std/router', routerStdRaw");
    expect(compilerBridge).toContain('importResolutions');
    expect(compilerWorker).toContain("type: 'warm-result'");
    expect(compilerWorker).toContain("type: 'compile-result'");
    expect(compileClient).toContain('warmCompilerWorker');
    expect(compileClient).toContain("new URL('./compiler-worker.ts', import.meta.url)");
  });

  test('playground shell uses a focused single-source layout', () => {
    const playgroundApp = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/app.lm'),
      'utf-8'
    );
    const playgroundIndex = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/index.ts'),
      'utf-8'
    );
    const playgroundController = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/playground-controller.ts'),
      'utf-8'
    );
    const playgroundDiagnostics = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/diagnostics-panel.lm'),
      'utf-8'
    );
    const playgroundShare = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/share.ts'),
      'utf-8'
    );
    const playgroundState = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/state.ts'),
      'utf-8'
    );

    expect(playgroundApp).toContain('single-source-main');
    expect(playgroundApp).toContain('topbar()');
    expect(playgroundApp).toContain('editor_zone()');
    expect(playgroundApp).toContain('output_tabs()');
    expect(playgroundApp).toContain('diagnostics_panel()');
    expect(playgroundApp).toContain('statusbar()');
    expect(playgroundApp).not.toContain('left-rail');
    expect(playgroundApp).not.toContain('right-dock');
    expect(playgroundApp).not.toContain('route-details-root');
    expect(playgroundIndex).toContain('startPlayground');
    expect(playgroundController).toContain('lumina-editor');
    expect(playgroundController).toContain('compileProjectInWorker');
    expect(playgroundController).toContain('formatSourceInWorker');
    expect(playgroundShare).toContain("searchParams.get('code')");
    expect(playgroundShare).toContain("searchParams.get('example')");
    expect(playgroundController).toContain('setTimeout(() =>');
    expect(playgroundController).toContain('compile(\'check\')');
    expect(playgroundController).toContain('lastCompiledTarget');
    expect(playgroundController).toContain('runtimeStatus');
    expect(playgroundController).toContain('refreshPreview');
    expect(playgroundController).toContain('renderTypesPanel');
    expect(playgroundController).toContain('copy-types-json-button');
    expect(playgroundController).toContain('createRuntimeModuleSession');
    expect(playgroundController).toContain('status-last-target');
    expect(playgroundController).toContain('status-runtime');
    expect(playgroundController).toContain('status-preview');
    expect(playgroundController).toContain("setHidden('run-panel'");
    expect(playgroundController).toContain("setHidden('ui-panel'");
    expect(playgroundController).toContain("setHidden('types-panel'");
    expect(playgroundDiagnostics).toContain('diagnostics-root');
    expect(playgroundApp).toContain('statusbar');
    expect(playgroundState).toContain('typeInfo');
    expect(playgroundState).not.toContain('PlaygroundProject');
    expect(playgroundState).not.toContain('Workspace');
    expect(playgroundState).not.toContain('RoutePreview');
  });
});
