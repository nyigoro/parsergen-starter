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

    expect(pkg.scripts?.['site:dev']).toBe('npm run web:dev');
    expect(pkg.scripts?.['site:build']).toBe('npm run web:build');
  });

  test('generated docs bundle preserves route fragments and heading ids', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../docs-site/public/docs-bundle.json'), 'utf-8')
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

    expect(importSource).not.toContain('node:fs');
    expect(importSource).not.toContain('node:path');
    expect(playgroundIndex).not.toContain(
      "Promise.all([import('./codemirror-bridge'), import('./compiler-bridge')])"
    );
    expect(compilerBridge).toContain('compileLuminaGrammar(luminaGrammarRaw, { cache: true })');
  });
});
