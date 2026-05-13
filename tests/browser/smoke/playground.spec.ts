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
    .toMatch(/Done|Needs attention/);
};

const waitForRunOutput = async (page: Page): Promise<void> => {
  await expect
    .poll(async () => (await page.locator('#run-output-root').textContent())?.trim() ?? '')
    .not.toBe('');
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

test.describe('playground browser smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('loads single-source examples from example and legacy preset URLs', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=basics`);
      await waitForCompile(page);
      await expect(page.locator('#examples-select')).toHaveValue('basics');
      await expect(page.locator('#status-target')).toContainText('JS');

      await page.goto(`${server.baseUrl}/playground/?example=counter`);
      await waitForCompile(page);
      await expect(page.locator('#examples-select')).toHaveValue('counter');
      await expect(page.locator('#output-tab-ui')).toHaveAttribute('data-active', 'true');
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
      await expect(page.locator('#diagnostics-root')).toContainText('error');

      await page.locator('#diagnostics-root .diagnostic').first().click();
      await expect.poll(async () => readEditorCursor(page)).toMatchObject({ line: 2 });
      await expect(page.locator('#diagnostic-explain-root')).toContainText('Fix the highlighted code');

      await setEditorText(page, 'fn main() -> int {   \n  return 7   \n\n\n}\n');
      await page.click('#format-button');
      await expect
        .poll(async () => readEditorText(page))
        .toMatch(/^fn main\(\) -> int \{\n {2}return 7\n\n?\}\n$/);
      await waitForCompile(page);
      await expect(page.locator('#diagnostics-root')).toContainText('No diagnostics.');

      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#run-output-root')).toContainText('return 7');
    } finally {
      await server.close();
    }
  });

  test('respects target switching and Phase 1 placeholder panels', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?example=wasm-hello`);
      await waitForCompile(page);
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#status-target')).toContainText('WASM');
      await expect(page.locator('#wasm-panel')).toContainText('Phase 1 shell reset');

      await page.goto(`${server.baseUrl}/playground/?example=basics`);
      await waitForCompile(page);
      await page.click('#target-both-button');
      await page.click('#run-button');
      await waitForRunOutput(page);
      await expect(page.locator('#status-target')).toContainText('BOTH');
      await expect(page.locator('#run-output-root')).toContainText('WASM execution is a Phase 1 placeholder.');
    } finally {
      await server.close();
    }
  });
});
