import { Buffer } from 'node:buffer';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import * as esbuild from 'esbuild';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

declare global {
  interface Window {
    __luminaKeyedHydrationResult?: Record<string, unknown>;
  }
}

const browserShimAliases = {
  'node:fs/promises': 'demo/shims/fs-promises.ts',
  'fs/promises': 'demo/shims/fs-promises.ts',
  'node:crypto': 'demo/shims/node-crypto.ts',
  crypto: 'demo/shims/node-crypto.ts',
  'node:readline': 'demo/shims/node-readline.ts',
  readline: 'demo/shims/node-readline.ts',
  'node:worker_threads': 'demo/shims/node-worker-threads.ts',
  worker_threads: 'demo/shims/node-worker-threads.ts',
  tty: 'demo/shims/tty.ts',
  url: 'demo/shims/url.ts',
} as const;

const buildRuntimeBundle = async (): Promise<string> => {
  const aliases = new Map(
    Object.entries(browserShimAliases).map(([id, target]) => [
      id,
      path.resolve(process.cwd(), target),
    ])
  );
  const result = await esbuild.build({
    entryPoints: [path.resolve(process.cwd(), 'src/lumina-runtime.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    sourcemap: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'lumina-browser-shims',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const replacement = aliases.get(args.path);
            return replacement ? { path: replacement } : undefined;
          });
        },
      },
    ],
  });
  return result.outputFiles[0].text;
};

test.describe('keyed hydration browser smoke', () => {
  test.skip(!runSmoke, 'set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('hydrates keyed DOM and forList rows without remounting stable nodes', async ({ page }) => {
    const runtimeBundleBase64 = Buffer.from(await buildRuntimeBundle(), 'utf-8').toString('base64');
    await page.setContent(`<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <div id="generic-root">
      <section>
        <button data-lumina-key="a">A</button>
        <button data-lumina-key="b">B</button>
      </section>
    </div>
    <div id="list-root">
      <ul>
        <lumina-for-list data-lumina-for-list="true" style="display: contents;">
          <li data-lumina-key="a"><input /><span>Alpha</span></li>
          <li data-lumina-key="b"><input /><span>Beta</span></li>
        </lumina-for-list>
      </ul>
    </div>
</body>
</html>`);

    await page.evaluate(async (bundle) => {
      window.__luminaKeyedHydrationResult = { ok: false, error: null };
      let step = 'load runtime';
      try {
        const moduleUrl = URL.createObjectURL(
          new Blob([atob(bundle)], { type: 'text/javascript' })
        );
        const { render } = await import(moduleUrl);
        URL.revokeObjectURL(moduleUrl);

        step = 'hydrate generic keyed children';
        const genericContainer = document.getElementById('generic-root');
        const section = genericContainer.firstElementChild;
        const buttonA = section.children[0];
        const buttonB = section.children[1];
        buttonA.focus();
        const genericRoot = render.hydrate(
          render.create_dom_renderer({ document }),
          genericContainer,
          render.element('section', null, [
            render.element('button', { key: 'b', id: 'b' }, [render.text('B!')]),
            render.element('button', { key: 'a', id: 'a' }, [render.text('A!')]),
          ])
        );
        if (genericRoot && genericRoot.$tag === 'Err')
          throw new Error(String(genericRoot.$payload));

        step = 'hydrate forList';
        const listContainer = document.getElementById('list-root');
        const host = listContainer.querySelector('lumina-for-list');
        const rowA = host.children[0];
        const rowB = host.children[1];
        const inputA = rowA.querySelector('input');
        const inputB = rowB.querySelector('input');
        inputA.value = 'typed A';
        inputB.value = 'typed B';
        inputA.focus();
        const rows = render.signal([
          { id: 'b', label: 'Beta' },
          { id: 'a', label: 'Alpha' },
        ]);
        const listRoot = render.hydrate(
          render.create_dom_renderer({ document }),
          listContainer,
          render.element('ul', null, [
            render.forList(
              rows,
              (row) => row.id,
              (row) =>
                render.element('li', null, [
                  render.element('input', null, []),
                  render.liveText(render.memo(() => render.get(row).label)),
                ])
            ),
          ])
        );
        if (listRoot && listRoot.$tag === 'Err') throw new Error(String(listRoot.$payload));

        step = 'patch forList';
        render.set(rows, [
          { id: 'b', label: 'Beta!' },
          { id: 'a', label: 'Alpha' },
        ]);
        await Promise.resolve();

        step = 'duplicate key mount';
        const duplicate = render.mount(
          render.create_dom_renderer({ document }),
          document.createElement('div'),
          render.element('section', null, [
            render.element('span', { key: 'dup' }, [render.text('one')]),
            render.element('span', { key: 'dup' }, [render.text('two')]),
          ])
        );

        window.__luminaKeyedHydrationResult = {
          ok: true,
          genericOrder: [section.children[0].id, section.children[1].id],
          genericIdentity: section.children[0] === buttonB && section.children[1] === buttonA,
          genericFocusPreserved:
            document.activeElement === buttonA || document.activeElement === inputA,
          listOrder: [
            host.children[0].getAttribute('data-lumina-key'),
            host.children[1].getAttribute('data-lumina-key'),
          ],
          listIdentity: host.children[0] === rowB && host.children[1] === rowA,
          listValues: [inputA.value, inputB.value],
          listFocusPreserved: document.activeElement === inputA,
          rowBText: rowB.textContent,
          duplicateError: duplicate && duplicate.$tag === 'Err' ? String(duplicate.$payload) : null,
        };
      } catch (error) {
        window.__luminaKeyedHydrationResult = {
          ok: false,
          error:
            step + ': ' + (error instanceof Error ? error.stack || error.message : String(error)),
        };
      }
    }, runtimeBundleBase64);

    const result = await page.evaluate(() => window.__luminaKeyedHydrationResult);

    expect(result?.error ?? null).toBeNull();
    expect(result?.ok).toBe(true);
    expect(result.genericOrder).toEqual(['b', 'a']);
    expect(result.genericIdentity).toBe(true);
    expect(result.listOrder).toEqual(['b', 'a']);
    expect(result.listIdentity).toBe(true);
    expect(result.listValues).toEqual(['typed A', 'typed B']);
    expect(result.listFocusPreserved).toBe(true);
    expect(result.rowBText).toContain('Beta!');
    expect(result.duplicateError).toContain("Duplicate keyed child 'dup'");
  });
});
