import { expect, test, type Page } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

declare global {
  interface Window {
    getEditorText?: (elementId: string) => string;
    setEditorText?: (elementId: string, value: string) => void;
    getEditorCursor?: (elementId: string) => { line: number; column: number } | null;
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

const readEditorCursor = async (
  page: Page
): Promise<{
  line: number;
  column: number;
} | null> =>
  page.evaluate(() => window.getEditorCursor?.('editor-root') ?? null);

const fillDialog = async (page: Page, values: Record<string, string>): Promise<void> => {
  await expect(page.locator('#dialog-root')).toHaveAttribute('data-open', 'true');
  for (const [field, value] of Object.entries(values)) {
    await page.locator(`[data-dialog-field="${field}"]`).fill(value);
  }
  await page.locator('#dialog-submit-button').click();
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

  test('recovers after compile failures and returns to a clean compile state', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=basics`);
      await waitForCompile(page);

      await setEditorText(
        page,
        `fn main() -> int {\n  let answer =\n  return answer\n}\n`
      );
      await checkAfterEdit(page);
      await expect(page.locator('#run-status')).toContainText('Blocked');
      await expect(page.locator('#diagnostics-root')).toContainText('error');

      await setEditorText(page, 'fn main() -> int {\n  return 7\n}\n');
      await checkAfterEdit(page);
      await expect(page.locator('#run-status')).toContainText('Ready');
      await expect(page.locator('#diagnostics-root')).toContainText('No diagnostics.');
      await expect(page.locator('#output-root')).toContainText('return 7');
    } finally {
      await server.close();
    }
  });

  test('manages workspaces with in-app dialogs and reset flow', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);

      await page.locator('#save-workspace-as-button').click();
      await fillDialog(page, { name: 'Starter QA' });
      await expect(page.locator('#workspace-status-pill')).toContainText('saved');
      await expect(page.locator('#recent-workspaces-root')).toContainText('Starter QA');

      await openFile(page, 'routes/settings.lm');
      await setEditorText(page, 'pub fn settingsSummary() -> string {\n  "Edited from smoke"\n}\n');
      await checkAfterEdit(page);
      await expect(page.locator('#workspace-status-pill')).toContainText('saved');

      await page.locator('#rename-workspace-button').click();
      await fillDialog(page, { name: 'Starter QA Renamed' });
      await expect(page.locator('#recent-workspaces-root')).toContainText('Starter QA Renamed');

      await page.locator('#reset-workspace-button').click();
      await page.locator('#dialog-submit-button').click();
      await waitForCompile(page);
      await openFile(page, 'routes/settings.lm');
      await expect
        .poll(async () => readEditorText(page))
        .toContain('Settings module ready');
    } finally {
      await server.close();
    }
  });

  test('supports dialog-driven file actions and clickable diagnostics', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);

      await page.locator('#new-file-button').click();
      await fillDialog(page, { path: 'routes/notes.lm' });
      await expect(page.locator('#active-file-label')).toContainText('routes/notes.lm');

      await page.locator('#rename-file-button').click();
      await fillDialog(page, { path: 'routes/notes-archive.lm' });
      await expect(page.locator('#active-file-label')).toContainText('routes/notes-archive.lm');

      await page.locator('#duplicate-file-button').click();
      await fillDialog(page, { path: 'routes/notes-copy.lm' });
      await expect(page.locator('#active-file-label')).toContainText('routes/notes-copy.lm');

      await openFile(page, 'routes/settings.lm');
      await setEditorText(page, 'pub fn settingsSummary() -> string {\n  return\n}\n');
      await checkAfterEdit(page);
      await openFile(page, 'main.lm');
      await page.locator('#diagnostics-root .diagnostic.error').first().click();
      await expect(page.locator('#active-file-label')).toContainText('routes/settings.lm');
      await expect.poll(async () => readEditorCursor(page)).toMatchObject({ line: 2 });
    } finally {
      await server.close();
    }
  });

  test('renders route and package inspectors for routed and package presets', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);
      await expect(page.locator('#route-details-root')).toContainText('/dashboard');
      await expect(page.locator('#route-details-root')).toContainText('/settings');

      await page.goto(`${server.baseUrl}/playground/?preset=package-import`);
      await waitForCompile(page);
      await expect(page.locator('#package-details-root')).toContainText('json-utils@1.2.3');
      await page.locator('#package-details-root [data-package-action="focus"]').click();
      await expect(page.locator('#active-file-label')).toContainText('.lumina/packages/json-utils@1.2.3/src/lib.lm');
      const packageSource = await readEditorText(page);
      await setEditorText(page, packageSource.replace('package:ok', 'package:changed'));
      await checkAfterEdit(page);
      await expect(page.locator('#diagnostics-root')).toContainText('No diagnostics.');
    } finally {
      await server.close();
    }
  });
});
