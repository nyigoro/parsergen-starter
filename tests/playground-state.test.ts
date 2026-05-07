import {
  createRoutePreview,
  decodeSharedState,
  encodeSharedState,
  projectFromPreset,
  replaceRouteLocation,
  routeHrefFromLocation,
  routePreviewCanGoBack,
  routePreviewCanGoForward,
  stepRoutePreview,
} from '../playground/src/playground-state';
import { playgroundPresets } from '../playground/src/presets';

describe('playground state helpers', () => {
  test('round-trips shared multi-file project state', () => {
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');
    expect(preset).toBeTruthy();

    const encoded = encodeSharedState({
      version: 2,
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
});
