import { expect, test, type Page } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

declare global {
  interface Window {
    getEditorCursor?: (elementId: string) => { line: number; column: number } | null;
    getEditorText?: (elementId: string) => string;
    setEditorText?: (elementId: string, value: string) => void;
  }
}

const waitForCompile = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => (await page.locator('#status-compile').textContent())?.trim() ?? '')
    .toMatch(/Checked|Done|Needs attention/);
};

const waitForRunOutput = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => (await page.locator('#status-runtime').textContent())?.trim() ?? '')
    .toMatch(/Passed|Runtime error/);
  await expect
    .poll(async () => (await page.locator('#run-output-root').textContent())?.trim() ?? '')
    .not.toBe('');
};

const expectOnlyOutputPanelVisible = async (page: Page, activePanelId: string): Promise<void> => {
  for (const panelId of ['js-panel', 'wasm-panel', 'run-panel', 'ui-panel', 'types-panel', 'diagnostics-panel']) {
    const assertion = expect(page.locator(`#${panelId}`));
    if (panelId === activePanelId) await assertion.toBeVisible();
    else await assertion.toBeHidden();
  }
};

const readEditorText = async (page: Page): Promise<string> =>
  page.evaluate(() => window.getEditorText?.('lumina-editor') ?? '');

const setEditorText = async (page: Page, value: string): Promise<void> => {
  await page.evaluate((nextValue) => {
    window.setEditorText?.('lumina-editor', nextValue);
  }, value);
};

const readEditorCursor = async (
  page: Page
): Promise<{
  line: number;
  column: number;
} | null> =>
  page.evaluate(() => window.getEditorCursor?.('lumina-editor') ?? null);

const selectExampleFromBrowser = async (page: Page, exampleId: string): Promise<void> => {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.locator('#examples-browser-root')).toBeVisible();
  await page.locator(`[data-example-id="${exampleId}"]`).click();
  await waitForCompile(page);
};

test.describe('playground browser smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('loads single-source examples from example and legacy preset URLs', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=basics`);
      await waitForCompile(page);
      await expect(page.locator('#examples-current')).toContainText('Functions');
      await expect(page.locator('#status-target')).toContainText('JS');

      await page.goto(`${server.baseUrl}/playground/?example=counter`);
      await waitForCompile(page);
      await expect(page.locator('#examples-current')).toContainText('Counter');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');

      await page.goto(`${server.baseUrl}/playground/?example=hkt-stdlib`);
      await waitForCompile(page);
      await expect(page.locator('#examples-current')).toContainText('HKTs');
    } finally {
      await server.close();
    }
  });

  test('round-trips shared custom code and reloads from local storage', async ({ page, browser }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      const original = await readEditorText(page);
      const edited = original.replace('let x = 10;', 'let x = 11;');
      expect(edited).not.toBe(original);
      await setEditorText(page, edited);
      await waitForCompile(page);

      await page.click('#share-button');
      await expect.poll(() => page.url()).toContain('code=');
      const sharedUrl = page.url();

      const sharedPage = await browser.newPage();
      await sharedPage.goto(sharedUrl);
      await waitForCompile(sharedPage);
      await expect.poll(async () => readEditorText(sharedPage)).toContain('let x = 11;');
      await expect(sharedPage.locator('#examples-current')).toContainText('Custom');
      await sharedPage.close();

      await page.goto(`${server.baseUrl}/playground/`);
      await waitForCompile(page);
      await expect.poll(async () => readEditorText(page)).toContain('let x = 11;');
    } finally {
      await server.close();
    }
  });

  test('checks, formats, runs, and focuses diagnostics', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      await setEditorText(page, 'fn main() -> int {\n  let answer =\n  return answer\n}\n');
      await page.click('#mode-check-button');
      await waitForCompile(page);
      await expect(page.locator('#status-compile')).toContainText('Needs attention');
      await expect(page.locator('#output-tab-diagnostics')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#diagnostics-panel')).toBeVisible();
      await expect(page.locator('#diagnostics-root')).toContainText('error');

      await page.locator('#diagnostics-root .diagnostic').first().click();
      await expect.poll(async () => readEditorCursor(page)).toMatchObject({ line: 2 });
      await expect(page.locator('#diagnostic-explain-root')).toContainText('Fix the highlighted code');
      await expect(page.locator('#diagnostic-explain-root')).toContainText('What happened');
      await expect(page.locator('#diagnostic-explain-root')).toContainText('Why this happens');
      await expect(page.locator('#diagnostic-explain-root')).toContainText('How to fix');
      await expect(page.locator('#diagnostic-back-button')).toContainText('Back to diagnostics');

      await setEditorText(page, 'fn main() -> int {   \n  return 7   \n\n\n}\n');
      await page.click('#format-button');
      await expect
        .poll(async () => readEditorText(page))
        .toMatch(/^fn main\(\) -> int \{\n {2}return 7\n\n?\}\n$/);
      await waitForCompile(page);
      await expect(page.locator('#diagnostics-root')).toContainText('No diagnostics.');

      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#output-tab-run')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#run-output-root')).toContainText('return 7');
      await expect(page.locator('#status-runtime')).toContainText('Passed');
    } finally {
      await server.close();
    }
  });

  test('keeps runtime failures separate from compile diagnostics', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);
      await setEditorText(page, 'fn main() -> int {\n  let xs = [1];\n  return xs[3]\n}\n');
      await waitForCompile(page);
      await expect(page.locator('#diagnostics-count-label')).toContainText('0 errors');
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#output-tab-run')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-compile')).toContainText('Checked');
      await expect(page.locator('#status-runtime')).toContainText('Runtime error');
      await expect(page.locator('#diagnostics-count-label')).toContainText('0 errors');
      await page.click('#output-tab-diagnostics');
      await expect(page.locator('#diagnostics-root')).not.toContainText('Runtime error');
      await expect(page.locator('#diagnostics-root')).toContainText('No diagnostics.');
    } finally {
      await server.close();
    }
  });

  test('guides DOM UI examples to the UI tab instead of failing worker Run', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      for (const exampleId of ['counter', 'reactive-greeting', 'tabs', 'forms-store-resource', 'ui-showcase']) {
        await page.goto(`${server.baseUrl}/playground/?example=${exampleId}`);
        await waitForCompile(page);
        await page.click('#run-button');
        await expect(page.locator('#status-runtime')).toContainText('Run blocked');
        await expect(page.locator('#runtime-status-label')).toContainText('Run blocked');
        await expect(page.locator('#runtime-message-label')).toContainText('render it in the UI tab');
        await expect(page.locator('#run-output-root')).toContainText('This source mounts browser UI');
        await expect(page.locator('#run-output-root')).toContainText('Open the UI tab and press Refresh');
        await expect(page.locator('#run-output-root')).not.toContainText('DOM renderer requires a document-like object');

        await page.click('#output-tab-ui');
        await page.click('#preview-refresh-button');
        await expect
          .poll(async () => (await page.locator('#preview-status-label').textContent())?.trim() ?? '')
          .toBe('Rendered');
        await expect(page.locator('#preview-overlay')).toBeHidden();

        if (exampleId === 'forms-store-resource') {
          const preview = page.frameLocator('#preview-frame');
          await expect(preview.locator('body')).toContainText('Queue: draft -> review -> publish');
          await preview.getByRole('button', { name: 'Editor' }).click();
          await expect(preview.locator('body')).toContainText('Editor keeps its own keyed identity.');
          await preview.getByRole('button', { name: 'Summary' }).click();
          await expect(preview.locator('body')).toContainText('Summary stays keyed during hydration and panel swaps.');
          await preview.getByRole('button', { name: 'Rotate queue' }).click();
          await expect(preview.locator('body')).toContainText('Queue: review -> publish -> draft');
        }
      }
    } finally {
      await server.close();
    }
  });

  test('guides host worker examples away from nested Worker Run output', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      for (const exampleId of ['channels-mpsc', 'thread-channel-producer-consumer', 'thread-patterns', 'parallel-fibonacci']) {
        await page.goto(`${server.baseUrl}/playground/?example=${exampleId}`);
        await waitForCompile(page);
        await expect(page.locator('#output-tab-js')).toHaveAttribute('data-active', 'true');
        await page.click('#run-button');
        await expect(page.locator('#status-runtime')).toContainText('Run blocked');
        await expect(page.locator('#runtime-message-label')).toContainText('full host runtime');
        await expect(page.locator('#run-output-root')).toContainText('thread/channel APIs');
        await expect(page.locator('#run-output-root')).not.toContainText('NaN');
        await expect(page.locator('#run-output-root')).not.toContainText('[object Object]');
      }
    } finally {
      await server.close();
    }
  });

  test('keeps output tab bodies single-purpose', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      await page.click('#output-tab-js');
      await expectOnlyOutputPanelVisible(page, 'js-panel');
      await expect(page.locator('#js-output')).toHaveAttribute('data-highlighted', 'true');
      await expect(page.locator('#js-output .code-token')).not.toHaveCount(0);
      await expect(page.locator('#js-panel')).not.toContainText('UI Preview');
      await expect(page.locator('#js-panel')).not.toContainText('Declarations');
      await expect(page.locator('#js-panel')).not.toContainText('Diagnostics');
      await expect(page.locator('#js-panel')).not.toContainText('Run Output');

      await page.click('#output-tab-types');
      await expectOnlyOutputPanelVisible(page, 'types-panel');
      await expect(page.locator('#types-panel')).toContainText('Declarations');
      await expect(page.locator('#types-panel')).not.toContainText('UI Preview');
      await expect(page.locator('#types-panel')).not.toContainText('Run Output');
      await expect(page.locator('#types-panel')).not.toContainText('Diagnostics');

      await page.click('#output-tab-ui');
      await expectOnlyOutputPanelVisible(page, 'ui-panel');
      await expect(page.locator('#ui-panel')).toContainText('UI Preview');
      await expect(page.locator('#ui-panel')).not.toContainText('Declarations');
      await expect(page.locator('#ui-panel')).not.toContainText('Run Output');
      await expect(page.locator('#ui-panel')).not.toContainText('Diagnostics');

      await page.click('#run-button');
      await waitForRunOutput(page);
      await expectOnlyOutputPanelVisible(page, 'run-panel');
      await expect(page.locator('#run-panel')).not.toContainText('UI Preview');
      await expect(page.locator('#run-panel')).not.toContainText('Declarations');
      await expect(page.locator('#run-panel')).not.toContainText('Diagnostics');

      await page.click('#output-tab-diagnostics');
      await expectOnlyOutputPanelVisible(page, 'diagnostics-panel');
      await expect(page.locator('#diagnostics-panel')).toContainText('Diagnostics');
      await expect(page.locator('#diagnostics-panel')).not.toContainText('Run Output');
      await expect(page.locator('#diagnostics-panel')).not.toContainText('Declarations');
      await expect(page.locator('#diagnostics-panel')).not.toContainText('UI Preview');

      await page.goto(`${server.baseUrl}/playground/?example=wasm-hello`);
      await waitForCompile(page);
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#run-output-root')).toContainText('Generated WASM artifact');
      await page.click('#output-tab-wasm');
      await expectOnlyOutputPanelVisible(page, 'wasm-panel');
      await expect(page.locator('#wasm-panel')).toContainText('WebAssembly');
      await expect(page.locator('#wasm-wat-output')).toHaveAttribute('data-highlighted', 'true');
      await expect(page.locator('#wasm-wat-output .syntax-keyword')).not.toHaveCount(0);
      await expect(page.locator('#wasm-panel')).not.toContainText('UI Preview');
      await expect(page.locator('#wasm-panel')).not.toContainText('Declarations');
      await expect(page.locator('#wasm-panel')).not.toContainText('Diagnostics');
      await expect(page.locator('#wasm-panel')).not.toContainText('Run Output');
    } finally {
      await server.close();
    }
  });

  test('respects target switching and renders real WASM output', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=wasm-hello`);
      await waitForCompile(page);
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#status-target')).toContainText('WASM');
      await expect(page.locator('#status-last-target')).toContainText('WASM');
      await expect(page.locator('#output-tab-run')).toHaveAttribute('data-active', 'true');
      await page.click('#output-tab-wasm');
      await expect(page.locator('#wasm-panel')).toContainText('WebAssembly');
      await expect(page.locator('#wasm-panel')).toContainText('Section Breakdown');
      await expect(page.locator('#wasm-panel')).toContainText('WAT');
      await expect(page.locator('#wasm-panel')).toContainText('(module');
      await expect(page.locator('#wasm-wat-output')).toHaveAttribute('data-highlighted', 'true');
      await expect(page.locator('#wasm-wat-output .syntax-instruction')).not.toHaveCount(0);
      await expect(page.locator('#wasm-size-label')).not.toContainText('-');
      await expect(page.locator('#wasm-section-count-label')).not.toContainText('-');
      await expect(page.locator('#wasm-build-time-label')).toContainText('ms');
      await expect(page.locator('#wasm-sections-root')).toContainText(/Types|Code|Exports/);
      await expect(page.locator('#copy-wat-button')).toBeEnabled();
      await expect(page.locator('#download-wasm-button')).toBeEnabled();

      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);
      await page.click('#target-both-button');
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#status-target')).toContainText('BOTH');
      await expect(page.locator('#status-last-target')).toContainText('BOTH');
      await expect(page.locator('#output-tab-run')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#run-output-root')).toContainText('Generated WASM artifact');

      await page.click('#target-js-button');
      await page.click('#output-tab-wasm');
      await expect(page.locator('#wasm-empty-state')).toContainText('WASM target not selected');
    } finally {
      await server.close();
    }
  });

  test('opens concept-organized examples browser from click and keyboard', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
      await expect(page.locator('#examples-browser-root')).toBeVisible();
      await expect(page.locator('#examples-browser-root')).toContainText('Reactive UI');
      await expect(page.locator('#examples-browser-root')).toContainText('HM inference');
      await expect(page.locator('#examples-browser-root')).toContainText('Featured');
      await page.locator('[data-example-id="counter"]').click();
      await waitForCompile(page);
      await expect(page.locator('#examples-current')).toContainText('Counter');
      await expect.poll(async () => readEditorText(page)).toContain('counterView');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
      await expect(page).toHaveURL(/example=counter/);
    } finally {
      await server.close();
    }
  });

  test('loads curated examples from every concept group with intentional defaults', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      await selectExampleFromBrowser(page, 'named-defaults');
      await expect(page.locator('#examples-current')).toContainText('Named Defaults');
      await expect(page.locator('#output-tab-types')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('JS');
      await expect.poll(async () => readEditorText(page)).toContain('discount: i32 = 0');

      await selectExampleFromBrowser(page, 'type-holes');
      await expect(page.locator('#examples-current')).toContainText('Type Holes');
      await expect(page.locator('#output-tab-types')).toHaveAttribute('data-active', 'true');
      await expect.poll(async () => readEditorText(page)).toContain('value: _');

      await selectExampleFromBrowser(page, 'counter');
      await expect(page.locator('#examples-current')).toContainText('Counter');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');

      await selectExampleFromBrowser(page, 'tabs');
      await expect(page.locator('#examples-current')).toContainText('Tabs');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('JS');
      await expect.poll(async () => readEditorText(page)).toContain('render.tabsRoot');

      await selectExampleFromBrowser(page, 'forms-store-resource');
      await expect(page.locator('#examples-current')).toContainText('Forms + Resource');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('JS');
      await expect.poll(async () => readEditorText(page)).toContain('createResource');

      await selectExampleFromBrowser(page, 'ui-showcase');
      await expect(page.locator('#examples-current')).toContainText('UI Showcase');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('JS');
      await expect.poll(async () => readEditorText(page)).toContain('Styled headless workspace');

      await selectExampleFromBrowser(page, 'wasm-hello');
      await expect(page.locator('#examples-current')).toContainText('WASM');
      await expect(page.locator('#output-tab-wasm')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('WASM');

      await selectExampleFromBrowser(page, 'parallel-fibonacci');
      await expect(page.locator('#examples-current')).toContainText('Parallel Fibonacci');
      await expect(page.locator('#output-tab-js')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#status-target')).toContainText('JS');
    } finally {
      await server.close();
    }
  });

  test('renders inferred types and focuses editor from expression rows', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);
      await page.click('#output-tab-types');
      await expect(page.locator('#types-panel')).toContainText('Declarations');
      await expect(page.locator('#types-panel')).toContainText('Declarations show named program surfaces');
      await expect(page.locator('#types-declarations-root')).toContainText('main');
      await expect(page.locator('#types-footer-counts')).not.toContainText('0 declarations');

      const row = page.locator('[data-type-row="expression"]').first();
      await expect(row).toBeVisible();
      const line = Number(await row.getAttribute('data-type-line'));
      const column = Number(await row.getAttribute('data-type-col'));
      await row.click();
      await expect.poll(async () => readEditorCursor(page)).toMatchObject({ line, column });
      await expect(row).toHaveAttribute('data-selected', 'true');

      await page.click('#types-expression-filter-calls');
      await expect(page.locator('#types-expression-summary-label')).toContainText('/');
      await expect(page.locator('#types-expressions-root')).toContainText(/No expression types match|Inferred Type/);

      await page.click('#copy-types-json-button');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(JSON.parse(copied)).toMatchObject({ sourceUri: 'virtual://main.lm' });
    } finally {
      await server.close();
    }
  });

  test('renders isolated UI preview with refresh, device, and auto controls', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=counter`);
      await waitForCompile(page);
      await page.click('#output-tab-ui');
      await expect(page.locator('#preview-status-label')).toContainText('Idle');
      await expect(page.locator('#preview-overlay')).toBeVisible();
      await page.selectOption('#preview-device-select', 'mobile');
      await expect(page.locator('#preview-frame')).toHaveCSS('inline-size', '368px');
      await page.click('#preview-refresh-button');
      await expect(page.locator('#preview-status-label')).toContainText(/Rendered|Preview error/, { timeout: 15000 });
      await expect(page.locator('#preview-status-label')).toContainText('Rendered');
      await expect(page.locator('#preview-overlay')).toBeHidden();
      await expect(page.locator('#preview-frame')).toHaveAttribute('sandbox', 'allow-scripts');
      await page.click('#preview-auto-button');
      await expect(page.locator('#preview-auto-button')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#preview-auto-button')).toContainText('Auto On');

      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);
      await page.click('#output-tab-ui');
      await page.click('#preview-refresh-button');
      await expect(page.locator('#preview-status-label')).toContainText('No preview');
      await expect(page.locator('#preview-overlay')).toContainText('No previewable UI');
    } finally {
      await server.close();
    }
  });

  test('supports compact embed mode and opens full playground with state preserved', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?embed=1&example=counter`);
      await waitForCompile(page);

      await expect(page.locator('.topbar')).toHaveAttribute('data-embed', 'true');
      await expect(page.locator('#open-playground-button')).toBeVisible();
      await expect(page.locator('#docs-link')).toBeHidden();
      await expect(page.locator('#examples-toggle')).toBeHidden();
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
      await page.click('#output-tab-diagnostics');
      await expectOnlyOutputPanelVisible(page, 'diagnostics-panel');

      await page.click('#open-playground-button');
      await expect(page).toHaveURL(/example=counter/);
      expect(page.url()).not.toContain('embed=1');
      await expect(page.locator('.topbar')).toHaveAttribute('data-embed', 'false');
      await expect(page.locator('#examples-current')).toContainText('Counter');
    } finally {
      await server.close();
    }
  });

  test('applies and persists settings without disturbing playground state', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);

      await page.click('#settings-button');
      await expect(page.locator('#settings-panel')).toBeVisible();
      await page.selectOption('#setting-theme', 'light');
      await page.selectOption('#setting-font-size', '18');
      await page.selectOption('#setting-tab-size', '4');

      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--playground-code-font-size').trim()))
        .toBe('18px');
      await expect
        .poll(() =>
          page.evaluate(() => ({
            theme: localStorage.getItem('lumina_playground_theme'),
            fontSize: localStorage.getItem('lumina_playground_font_size'),
            tabSize: localStorage.getItem('lumina_playground_tab_size'),
          }))
        )
        .toEqual({ theme: 'light', fontSize: '18', tabSize: '4' });

      await page.reload();
      await waitForCompile(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.click('#share-button');
      expect(page.url()).not.toContain('theme=');
      expect(page.url()).toContain('example=basics');

      await page.goto(`${server.baseUrl}/playground/?embed=1&example=basics`);
      await waitForCompile(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('#settings-button')).toBeVisible();
    } finally {
      await server.close();
    }
  });
});
