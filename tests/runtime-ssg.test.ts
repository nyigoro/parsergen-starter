import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { coerceSsgPageOptions, createSsgApi } from '../src/runtime/ssg.js';

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
