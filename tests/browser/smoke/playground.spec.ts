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
  await selectRailTab(page, 'files');
  await page.locator(`#file-list-root [data-file-uri="${uri}"]`).click();
  await expect(page.locator('#active-file-label')).toContainText(uri);
};

const selectRailTab = async (page: Page, tab: 'workspace' | 'files' | 'presets'): Promise<void> => {
  await page.locator(`#rail-tab-${tab}`).click();
  await expect(page.locator(`#rail-tab-${tab}`)).toHaveAttribute('data-active', 'true');
};

const selectDockTab = async (
  page: Page,
  tab: 'preview' | 'problems' | 'route' | 'packages' | 'graph' | 'compile' | 'inspector'
): Promise<void> => {
  await page.locator(`#dock-tab-${tab}`).click();
  await expect(page.locator(`#dock-tab-${tab}`)).toHaveAttribute('data-active', 'true');
};

const selectDrawerTab = async (page: Page, tab: 'console' | 'events' | 'js'): Promise<void> => {
  await page.locator(`#drawer-tab-${tab}`).click();
  await expect(page.locator(`#drawer-tab-${tab}`)).toHaveAttribute('data-active', 'true');
};

const seedDefaultLayout = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('lumina-playground-layout-v3');
  });
};

const ensureDockLayoutBaseline = async (page: Page): Promise<void> => {
  const body = page.locator('.playground-body');

  if ((await body.getAttribute('data-left-rail-mode')) !== 'pinned') {
    if ((await body.getAttribute('data-left-rail-visible')) !== 'true') {
      await page.locator('#edge-rail-tab-files').click({ force: true });
    }
    await page.locator('#toggle-left-rail-button').click({ force: true });
  }
  if ((await body.getAttribute('data-right-dock-mode')) !== 'pinned') {
    if ((await body.getAttribute('data-right-dock-visible')) !== 'true') {
      await page.locator('#edge-dock-tab-preview').click({ force: true });
    }
    await page.locator('#toggle-right-dock-button').click({ force: true });
  }
  if ((await body.getAttribute('data-bottom-drawer-mode')) !== 'pinned') {
    if ((await body.getAttribute('data-bottom-drawer-visible')) !== 'true') {
      await page.locator('#edge-drawer-tab-console').click({ force: true });
    }
    await page.locator('#toggle-bottom-drawer-button').click({ force: true });
  }
  if ((await body.getAttribute('data-left-rail-visible')) !== 'true') {
    await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
  }
  if ((await body.getAttribute('data-right-dock-visible')) !== 'true') {
    await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
  }
  if ((await body.getAttribute('data-bottom-drawer-visible')) !== 'true') {
    await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
  }
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

      await selectRailTab(page, 'workspace');
      await page.locator('#save-workspace-as-button').click();
      await fillDialog(page, { name: 'Starter QA' });
      await expect(page.locator('#workspace-status-pill')).toContainText('saved');
      await expect(page.locator('#recent-workspaces-root')).toContainText('Starter QA');

      await selectRailTab(page, 'files');
      await openFile(page, 'routes/settings.lm');
      await setEditorText(page, 'pub fn settingsSummary() -> string {\n  "Edited from smoke"\n}\n');
      await checkAfterEdit(page);
      await expect(page.locator('#workspace-status-pill')).toContainText('saved');

      await selectRailTab(page, 'workspace');
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
      await selectDockTab(page, 'route');
      await expect(page.locator('#route-details-root')).toContainText('/dashboard');
      await expect(page.locator('#route-details-root')).toContainText('/settings');

      await page.goto(`${server.baseUrl}/playground/?preset=package-import`);
      await waitForCompile(page);
      await selectDockTab(page, 'packages');
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

  test('supports pinned and auto-hide dock groups across the workbench', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await seedDefaultLayout(page);
      await page.reload();
      await waitForCompile(page);
      await ensureDockLayoutBaseline(page);

      await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'false');
      await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');

      await page.locator('#toggle-right-dock-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');
      await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'false');
      await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');
      await page.locator('#edge-dock-tab-problems').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');
      await expect(page.locator('#dock-tab-problems')).toHaveAttribute('data-active', 'true');
      const centerEditorBox = await page.locator('.center-editor').boundingBox();
      expect(centerEditorBox).not.toBeNull();
      await page.mouse.click((centerEditorBox?.x ?? 0) + 40, (centerEditorBox?.y ?? 0) + 40);
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'false');
      await page.locator('#edge-dock-tab-preview').click({ force: true });
      await page.locator('#toggle-right-dock-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');

      await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'false');
      await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'true');

      await page.locator('#toggle-bottom-drawer-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-mode', 'auto-hide');
      await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'false');
      await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'true');
      await page.mouse.click((centerEditorBox?.x ?? 0) + 48, (centerEditorBox?.y ?? 0) + 48);
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'false');
      await page.locator('#edge-drawer-tab-js').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'true');
      await expect(page.locator('#drawer-tab-js')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#output-root')).toContainText('createRouter("/")');
      await page.locator('#toggle-bottom-drawer-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'true');

      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'false');
      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'true');

      await page.locator('#toggle-left-rail-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-mode', 'auto-hide');
      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'false');
      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-mode', 'auto-hide');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'true');
      await page.locator('#edge-rail-tab-files').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'true');
      await expect(page.locator('#rail-tab-files')).toHaveAttribute('data-active', 'true');
      await expect(page.locator('#file-list-root')).toContainText('main.lm');
      await page.locator('#toggle-left-rail-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-mode', 'pinned');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'true');
    } finally {
      await server.close();
    }
  });

  test('keeps a compact docked workbench when collapsing panels in a narrow viewport', async ({
    page,
  }) => {
    const server = await startSmokeServer();
    try {
      await page.setViewportSize({ width: 625, height: 1200 });
      await page.goto(`${server.baseUrl}/playground/?preset=starter-app`);
      await waitForCompile(page);

      const layout = await page.evaluate(() => {
        const body = document.querySelector('.playground-body');
        const workbench = document.querySelector('.ide-workbench');
        const center = document.querySelector('.center-editor');
        const leftEdge = document.getElementById('left-edge-strip');
        const rightEdge = document.getElementById('right-edge-strip');
        return {
          leftMode: body?.getAttribute('data-left-rail-mode'),
          leftVisible: body?.getAttribute('data-left-rail-visible'),
          rightMode: body?.getAttribute('data-right-dock-mode'),
          rightVisible: body?.getAttribute('data-right-dock-visible'),
          bottomMode: body?.getAttribute('data-bottom-drawer-mode'),
          bottomVisible: body?.getAttribute('data-bottom-drawer-visible'),
          gridTemplateColumns: workbench ? getComputedStyle(workbench).gridTemplateColumns : '',
          workbenchWidth: workbench?.getBoundingClientRect().width ?? 0,
          centerWidth: center?.getBoundingClientRect().width ?? 0,
          leftEdgeDisplay: leftEdge ? getComputedStyle(leftEdge).display : '',
          rightEdgeDisplay: rightEdge ? getComputedStyle(rightEdge).display : '',
          hasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight + 6,
        };
      });

      expect(layout.leftMode).toBe('pinned');
      expect(layout.leftVisible).toBe('false');
      expect(layout.rightMode).toBe('pinned');
      expect(layout.rightVisible).toBe('false');
      expect(layout.bottomMode).toBe('pinned');
      expect(layout.bottomVisible).toBe('false');
      expect(layout.leftEdgeDisplay).toBe('flex');
      expect(layout.rightEdgeDisplay).toBe('flex');
      expect(layout.gridTemplateColumns.trim().split(/\s+/).length).toBeGreaterThanOrEqual(3);
      expect(layout.centerWidth).toBeGreaterThan(layout.workbenchWidth * 0.7);
      expect(layout.hasVerticalScroll).toBe(false);

      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'true');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'false');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'false');
      await selectRailTab(page, 'files');
      await expect(page.locator('#file-list-root')).toContainText('main.lm');
      await page.locator('#toggle-left-rail-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'false');

      await page.locator('#toggle-bottom-drawer-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'false');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'false');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'true');
      await selectDrawerTab(page, 'console');
      await expect(page.locator('#console-root')).toContainText('Run the program to see output.');

      await page.locator('#toggle-right-dock-toolbar-button').click({ force: true });
      await expect(page.locator('.playground-body')).toHaveAttribute('data-left-rail-visible', 'false');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-right-dock-visible', 'true');
      await expect(page.locator('.playground-body')).toHaveAttribute('data-bottom-drawer-visible', 'false');
    } finally {
      await server.close();
    }
  });
});
