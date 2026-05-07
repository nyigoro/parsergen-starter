import {
  closeProjectFile,
  createWorkspaceSnapshot,
  createRoutePreview,
  decodeSharedState,
  duplicateProjectFile,
  encodeSharedState,
  getWorkspaceSnapshot,
  parseWorkspaceExport,
  projectFromPreset,
  renameProjectFile,
  replaceRouteLocation,
  routeHrefFromLocation,
  routePreviewCanGoBack,
  routePreviewCanGoForward,
  sanitizeWorkspaceCollection,
  serializeWorkspaceExport,
  setProjectEntryFile,
  stepRoutePreview,
  upsertWorkspaceSnapshot,
} from '../playground/src/playground-state';
import { playgroundPresets } from '../playground/src/presets';

describe('playground state helpers', () => {
  test('round-trips shared multi-file project state', () => {
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');
    expect(preset).toBeTruthy();

    const encoded = encodeSharedState({
      version: 3,
      project: projectFromPreset(preset!),
      routePreview: replaceRouteLocation(
        createRoutePreview('https://example.com/', 'https://example.com/'),
        { pathname: '/settings', search: '?tab=team', hash: '#activity' }
      ),
      consoleOutput: 'route:/:dashboard',
    });

    const decoded = decodeSharedState(encoded);
    expect(decoded?.project.files).toHaveLength(2);
    expect(decoded?.project.entryUri).toBe('main.lm');
    expect(decoded?.project.openFileUris).toEqual(['main.lm']);
    expect(decoded?.project.sourcePresetId).toBe('starter-app');
    expect(decoded?.routePreview.entries[0]).toEqual({
      pathname: '/settings',
      search: '?tab=team',
      hash: '#activity',
    });
    expect(decoded?.consoleOutput).toBe('route:/:dashboard');
  });

  test('tracks route preview history transitions', () => {
    const baseHref = 'https://example.com/';
    const initial = createRoutePreview('https://example.com/dashboard', baseHref);
    const replaced = replaceRouteLocation(initial, {
      pathname: '/dashboard',
      search: '?tab=overview',
      hash: '#hero',
    });
    const pushed = {
      entries: [...replaced.entries, { pathname: '/settings', search: '?tab=team', hash: '' }],
      index: replaced.index + 1,
    };

    expect(routePreviewCanGoBack(pushed)).toBe(true);
    expect(routePreviewCanGoForward(pushed)).toBe(false);
    expect(routeHrefFromLocation(pushed.entries[pushed.index], baseHref)).toBe(
      'https://example.com/settings?tab=team'
    );

    const previous = stepRoutePreview(pushed, -1);
    expect(previous.index).toBe(0);
    expect(routePreviewCanGoForward(previous)).toBe(true);
  });

  test('supports file rename, duplication, entry promotion, and tab closing', () => {
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');
    expect(preset).toBeTruthy();
    const project = projectFromPreset(preset!);

    const renamed = renameProjectFile(project, 'routes/settings.lm', 'routes/profile/settings.lm');
    expect(renamed.files.some((file) => file.uri === 'routes/profile/settings.lm')).toBe(true);

    const duplicated = duplicateProjectFile(renamed, 'main.lm', 'routes/copy.lm');
    expect(duplicated.files.some((file) => file.uri === 'routes/copy.lm')).toBe(true);

    const reentry = setProjectEntryFile(duplicated, 'routes/copy.lm');
    expect(reentry.entryUri).toBe('routes/copy.lm');
    expect(reentry.activeFileUri).toBe('routes/copy.lm');

    const closed = closeProjectFile(
      {
        ...reentry,
        openFileUris: ['main.lm', 'routes/copy.lm'],
      },
      'routes/copy.lm'
    );
    expect(closed.activeFileUri).toBe('main.lm');
    expect(closed.openFileUris).toContain('main.lm');
  });

  test('exports and stores named workspaces', () => {
    const preset = playgroundPresets.find((entry) => entry.id === 'package-import');
    expect(preset).toBeTruthy();

    const snapshot = createWorkspaceSnapshot(
      'Packages demo',
      {
        version: 3,
        project: projectFromPreset(preset!),
        routePreview: createRoutePreview('https://example.com/packages', 'https://example.com/'),
        consoleOutput: 'ready',
      },
      'ws-1',
      123
    );

    const store = upsertWorkspaceSnapshot(sanitizeWorkspaceCollection(null), snapshot);
    expect(getWorkspaceSnapshot(store, 'ws-1')?.name).toBe('Packages demo');

    const exported = serializeWorkspaceExport(snapshot.name, snapshot.state);
    const parsed = parseWorkspaceExport(exported);
    expect(parsed?.name).toBe('Packages demo');
    expect(parsed?.state.project.sourcePresetId).toBe('package-import');
  });
});
