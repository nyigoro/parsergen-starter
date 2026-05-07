import { expect, test, type Page } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

declare global {
  interface Window {
    getEditorText?: (elementId: string) => string;
    setEditorText?: (elementId: string, value: string) => void;
  }
}

const waitForCompile = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const text = document.getElementById('compile-status')?.textContent ?? '';
    return text.includes('Compiled') || text.includes('Needs attention') || text.includes('Load failed');
  });
};

const waitForRunSettled = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const text = document.getElementById('run-status')?.textContent ?? '';
    return ['Done', 'Error', 'Stopped', 'Timed out', 'Blocked'].some((value) => text.includes(value));
  });
};

const readEditorText = async (page: Page): Promise<string> =>
  page.evaluate(() => window.getEditorText?.('editor-root') ?? '');

const setEditorText = async (page: Page, value: string): Promise<void> => {
  await page.evaluate((nextValue) => {
    window.setEditorText?.('editor-root', nextValue);
  }, value);
};

const checkAfterEdit = async (page: Page): Promise<void> => {
  await page.click('#check-button');
  await waitForCompile(page);
};

const openFile = async (page: Page, uri: string): Promise<void> => {
  await page.locator(`#file-list-root [data-file-uri="${uri}"]`).click();
  await expect(page.locator('#active-file-label')).toContainText(uri);
};

test.describe('playground browser smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('preserves multi-file edits and round-trips shared URLs', async ({ page, browser }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);

      await openFile(page, 'routes/settings.lm');
      const original = await readEditorText(page);
      const edited = original.replace('Settings module ready', 'Settings module edited');
      expect(edited).not.toBe(original);
      await setEditorText(page, edited);
      await checkAfterEdit(page);

      await openFile(page, 'main.lm');
      await openFile(page, 'routes/settings.lm');
      await expect
        .poll(async () => readEditorText(page))
        .toContain('Settings module edited');

      await page.click('#share-button');
      await expect.poll(() => page.url()).toContain('?project=');
      const sharedUrl = page.url();

      const sharedPage = await browser.newPage();
      await sharedPage.goto(sharedUrl);
      await waitForCompile(sharedPage);
      await expect(sharedPage.locator('#active-file-label')).toContainText('routes/settings.lm');
      await expect
        .poll(async () => readEditorText(sharedPage))
        .toContain('Settings module edited');
      await sharedPage.close();
    } finally {
      await server.close();
    }
  });

  test('syncs route preview controls with routed app navigation and history', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);

      await page.fill('#route-path-input', '/settings');
      await page.fill('#route-search-input', '?tab=team');
      await page.fill('#route-hash-input', '#focus');
      await page.click('#route-push-button');
      await waitForRunSettled(page);
      await expect(page.locator('#route-preview-url')).toContainText('/settings?tab=team#focus');

      await page.click('#route-back-button');
      await waitForRunSettled(page);
      await expect(page.locator('#route-preview-url')).toContainText('/dashboard?tab=team#activity');

      await page.click('#route-forward-button');
      await waitForRunSettled(page);
      await expect(page.locator('#route-preview-url')).toContainText('/settings?tab=team#focus');

      const source = await readEditorText(page);
      const withNavigateImport = source.replace(
        '  createRouter,\n  linkWithProps,\n  prefetchRoute,\n  routeLoader,',
        '  createRouter,\n  linkWithProps,\n  navigate,\n  prefetchRoute,\n  routeLoader,'
      );
      const withNavigateCall = withNavigateImport.replace(
        '  let _settingsPrefetch = prefetchRoute(appRouter, "/settings", "dashboard", || loadDashboard());',
        '  let _settingsPrefetch = prefetchRoute(appRouter, "/settings", "dashboard", || loadDashboard());\n  navigate(appRouter, "/settings");'
      );
      await setEditorText(page, withNavigateCall);
      await checkAfterEdit(page);
      await page.click('#run-button');
      await waitForRunSettled(page);

      await expect(page.locator('#route-preview-url')).toContainText('/settings');
      await expect(page.locator('#route-events-root')).toContainText('push');
    } finally {
      await server.close();
    }
  });

  test('recovers after stopping long-running programs and supports package editing', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=basics`);
      await waitForCompile(page);

      await setEditorText(
        page,
        `fn main() -> int {\n  let mut i = 0;\n  while (true) {\n    i = i + 1;\n  }\n  return i\n}\n`
      );
      await checkAfterEdit(page);
      await page.click('#run-button');
      await expect(page.locator('#run-status')).toContainText('Running');
      await page.click('#stop-run-button');
      await expect(page.locator('#run-status')).toContainText('Stopped');

      await setEditorText(page, 'fn main() -> int {\n  return 7\n}\n');
      await checkAfterEdit(page);
      await page.click('#run-button');
      await waitForRunSettled(page);
      await expect(page.locator('#console-root')).toContainText('return 7');

      await page.goto(`${server.baseUrl}/playground/?preset=package-import`);
      await waitForCompile(page);
      await openFile(page, '.lumina/packages/json-utils@1.2.3/src/lib.lm');
      const packageSource = await readEditorText(page);
      await setEditorText(page, packageSource.replace('package:ok', 'package:changed'));
      await checkAfterEdit(page);
      await page.click('#run-button');
      await waitForRunSettled(page);
      await expect(page.locator('#console-root')).toContainText('package:changed');
    } finally {
      await server.close();
    }
  });
});
