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

    expect(importSource).not.toContain('node:fs');
    expect(importSource).not.toContain('node:path');
    expect(playgroundIndex).not.toContain("import('./compiler-bridge')");
    expect(playgroundIndex).toContain('stateFromPreset');
    expect(playgroundIndex).toContain("document.getElementById('file-list-root')");
    expect(playgroundIndex).toContain("document.getElementById('route-apply-button')");
    expect(playgroundIndex).toContain("document.getElementById('file-tabs-root')");
    expect(playgroundIndex).toContain("document.getElementById('save-workspace-button')");
    expect(playgroundIndex).toContain("document.getElementById('stop-compile-button')");
    expect(compilerBridge).toContain('compileLuminaGrammar(luminaGrammarRaw, { cache: true })');
    expect(compilerBridge).toContain("import routerStdRaw from '../../std/router.lm?raw';");
    expect(compilerBridge).toContain('compileLuminaProject');
    expect(compilerBridge).toContain("'@std/router', routerStdRaw");
    expect(compilerBridge).toContain('importResolutions');
    expect(compilerWorker).toContain("type: 'compile-result'");
    expect(compileClient).toContain("new URL('./compiler-worker.ts', import.meta.url)");
  });

  test('playground shell uses an editor-first docked layout', () => {
    const playgroundApp = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/app.lm'),
      'utf-8'
    );
    const playgroundStyle = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/style.css'),
      'utf-8'
    );
    const playgroundIndex = fs.readFileSync(
      path.resolve(__dirname, '../playground/src/index.ts'),
      'utf-8'
    );

    expect(playgroundApp).toContain('workspace-shell');
    expect(playgroundApp).toContain('dock-layout');
    expect(playgroundApp).toContain('center-dock-stack');
    expect(playgroundApp).toContain('props_class("left-rail dock-group dock-shell")');
    expect(playgroundApp).toContain('props_class("right-dock dock-group dock-shell")');
    expect(playgroundApp).toContain('props_class("bottom-drawer dock-group")');
    expect(playgroundApp).toContain('props_id("left-edge-strip")');
    expect(playgroundApp).toContain('props_id("right-edge-strip")');
    expect(playgroundApp).toContain('props_id("bottom-edge-strip")');
    expect(playgroundApp).toContain('edge-rail-tab-workspace');
    expect(playgroundApp).toContain('edge-dock-tab-preview');
    expect(playgroundApp).toContain('edge-drawer-tab-console');
    expect(playgroundApp).toContain('div_node("center-editor"');
    expect(playgroundApp).toContain('splitter("left-rail-splitter"');
    expect(playgroundApp).toContain('splitter("right-dock-splitter"');
    expect(playgroundApp).toContain('splitter("bottom-drawer-splitter"');
    expect(playgroundApp).toContain('props_id("bottom-drawer-shell")');
    expect(playgroundApp).toContain('workspace-toolbar');
    expect(playgroundApp).toContain('console-root');
    expect(playgroundApp).toContain('diagnostics-root');
    expect(playgroundApp).toContain('route-details-root');
    expect(playgroundApp).toContain('data-tab-group');
    expect(playgroundApp).toContain('props_attr("role", "tablist")');
    expect(playgroundApp).toContain('props_attr("role", "tab")');
    expect(playgroundApp).toContain('props_attr("role", "tabpanel")');
    expect(playgroundApp).toContain('props_attr("role", "separator")');
    expect(playgroundApp).toContain('props_attr("aria-controls"');
    expect(playgroundApp).toContain('props_attr("aria-orientation", orientation)');
    expect(playgroundApp).toContain('props_attr("tabindex", "0")');
    expect(playgroundStyle).toContain('.workspace-shell');
    expect(playgroundStyle).toContain('.dock-group');
    expect(playgroundStyle).toContain('.center-dock-stack');
    expect(playgroundStyle).toContain('#bottom-edge-strip');
    expect(playgroundStyle).toContain('grid-row: 3');
    expect(playgroundStyle).toContain('.edge-strip');
    expect(playgroundStyle).toContain('--edge-strip-size');
    expect(playgroundStyle).toContain('height: 100dvh');
    expect(playgroundStyle).toContain("data-left-rail-mode='auto-hide'");
    expect(playgroundStyle).toContain("data-left-rail-visible='true'");
    expect(playgroundStyle).toContain("data-bottom-drawer-mode='auto-hide'");
    expect(playgroundStyle).toContain('position: absolute');
    expect(playgroundStyle).toContain('.ide-workbench');
    expect(playgroundStyle).toContain('var(--left-rail-width)');
    expect(playgroundStyle).toContain('.layout-splitter');
    expect(playgroundStyle).toContain('@media (max-width: 1180px)');
    expect(playgroundStyle).toContain('.layout-splitter:focus-visible');
    expect(playgroundStyle).toContain('.bottom-drawer-body');
    expect(playgroundStyle).toContain('@media (max-width: 960px)');
    expect(playgroundIndex).toContain("button.setAttribute('aria-selected'");
    expect(playgroundIndex).toContain("element.setAttribute('aria-hidden'");
    expect(playgroundIndex).toContain('setSplitterValue');
    expect(playgroundIndex).toContain('collapseWorkbenchForCompact');
    expect(playgroundIndex).toContain('clearStoredWorkspaceSession');
    expect(playgroundIndex).toContain('compactVisibleGroup');
    expect(playgroundIndex).toContain('isGroupVisible');
    expect(playgroundIndex).toContain("visible: isGroupVisible('left')");
    expect(playgroundIndex).toContain('if (!compactVisibleGroup) return;');
    expect(playgroundIndex).toContain("handle.addEventListener('keydown'");
  });
});
