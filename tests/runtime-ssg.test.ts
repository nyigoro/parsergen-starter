import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { coerceSsgPageOptions, createSsgApi, serializeHydrationState } from '../src/runtime/ssg.js';

describe('runtime ssg api', () => {
  test('normalizes options and renders pages/apps', () => {
    expect(coerceSsgPageOptions({ title: 'Demo', head: '<meta name="x" content="1">' })).toEqual({
      title: 'Demo',
      lang: 'en',
      head: ['<meta name="x" content="1">'],
      bodyClassName: '',
      appClassName: '',
      appId: 'app',
      hydrateModule: '',
      hydrationState: null,
      hydrationStateId: '__lumina-hydration',
      hydrationBoundary: 'root',
      scriptNonce: '',
    });

    const api = createSsgApi<string, (props: { label: string }) => string>({
      isVNode: (value): value is string => typeof value === 'string' && value.startsWith('<'),
      renderToString: (node) => node,
      coerceRenderableToVNode: (value) => `<p>${String(value)}</p>`,
      escapeHtml: (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      resolvePath: (value) => path.resolve(value),
      dirnamePath: (value) => path.dirname(value),
      getNodeBuiltinModule: (id) => (id === 'node:fs' ? fs : null),
      renderApp: (componentFn, props) => componentFn(props as { label: string }),
    });

    const html = api.renderPage('<main>Body</main>', { title: 'Demo', hydrateModule: '/app.js' });
    expect(html).toContain('<title>Demo</title>');
    expect(html).toContain('<main>Body</main>');
    expect(html).toContain('/app.js');

    const appHtml = api.renderAppPage((props) => `<main>${props.label}</main>`, { label: 'Hello' }, { appId: 'root' });
    expect(appHtml).toContain('<div id="root"><main>Hello</main></div>');
  });

  test('serializes hydration state safely before module hydration script', () => {
    const api = createSsgApi<string, (props: { label: string }) => string>({
      isVNode: (value): value is string => typeof value === 'string' && value.startsWith('<'),
      renderToString: (node) => node,
      coerceRenderableToVNode: (value) => `<p>${String(value)}</p>`,
      escapeHtml: (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      resolvePath: (value) => path.resolve(value),
      dirnamePath: (value) => path.dirname(value),
      getNodeBuiltinModule: (id) => (id === 'node:fs' ? fs : null),
      renderApp: (componentFn, props) => componentFn(props as { label: string }),
    });

    const html = api.renderPage('<main>Body</main>', {
      hydrateModule: '/app.js',
      hydrationState: { props: { title: '</script><img>' } },
      hydrationBoundary: 'route:/dashboard',
      scriptNonce: 'nonce-1',
    });

    expect(html).toContain('data-lumina-hydration="route:/dashboard"');
    expect(html).toContain('data-lumina-state="__lumina-hydration"');
    expect(html).toContain('type="application/json" nonce="nonce-1" id="__lumina-hydration"');
    expect(html).toContain('type="module" nonce="nonce-1" src="/app.js"');
    expect(html).toContain('\\u003c/script>');
    expect(html.indexOf('__lumina-hydration')).toBeLessThan(html.indexOf('/app.js'));
    expect(serializeHydrationState({ text: '<script>\u2028' })).toBe('{"text":"\\u003cscript>\\u2028"}');
  });

  test('writes rendered pages to disk', () => {
    const api = createSsgApi<string, (props: { label: string }) => string>({
      isVNode: (value): value is string => typeof value === 'string' && value.startsWith('<'),
      renderToString: (node) => node,
      coerceRenderableToVNode: (value) => `<p>${String(value)}</p>`,
      escapeHtml: (value) => value,
      resolvePath: (value) => path.resolve(value),
      dirnamePath: (value) => path.dirname(value),
      getNodeBuiltinModule: (id) => (id === 'node:fs' ? fs : null),
      renderApp: (componentFn, props) => componentFn(props as { label: string }),
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-ssg-api-'));
    const filePath = path.join(tempDir, 'index.html');
    const written = api.writeAppPage(filePath, (props) => `<main>${props.label}</main>`, { label: 'Ship' });

    expect(written).toBe(path.resolve(filePath));
    expect(fs.readFileSync(written, 'utf-8')).toContain('<main>Ship</main>');
  });
});
