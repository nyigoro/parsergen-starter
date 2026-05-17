import { defaultState, type PlaygroundState } from '../playground/src/state';

jest.mock('../playground/src/examples-data', () => ({
  findExampleBySource: jest.fn(() => null),
}));

import { createEmbedSnippet, createOpenPlaygroundUrl, readUrlState } from '../playground/src/share';
import {
  defaultSettings,
  readSettings,
  sanitizeFontSize,
  sanitizeTabSize,
  sanitizeTheme,
  saveSettings,
} from '../playground/src/settings';

const installWindow = (href: string, initialStorage: Record<string, string> = {}) => {
  const storage = new Map(Object.entries(initialStorage));
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: new URL(href),
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: (globalThis.window as { localStorage: Storage }).localStorage,
  });
  return storage;
};

const codeParam = (source: string): string =>
  Buffer.from(source, 'utf8').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');

describe('playground embed and settings helpers', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('reads embed mode without disturbing code-over-example precedence', () => {
    const source = 'fn main() -> int { 42 }';
    installWindow(`https://example.test/playground/?embed=1&example=counter&code=${codeParam(source)}&target=wasm&tab=types`);

    expect(readUrlState()).toMatchObject({
      embedMode: true,
      source,
      target: 'wasm',
      activeTab: 'types',
    });
    expect(readUrlState()).not.toHaveProperty('activeExample');
  });

  test('open playground URL strips embed and preserves meaningful state', () => {
    installWindow('https://example.test/playground/?embed=1&example=counter');
    const state: PlaygroundState = {
      ...defaultState,
      embedMode: true,
      source: 'fn main() -> int { 7 }',
      activeExample: null,
      target: 'both',
      activeTab: 'types',
    };

    const url = new URL(createOpenPlaygroundUrl(state));
    expect(url.searchParams.get('embed')).toBeNull();
    expect(url.searchParams.get('code')).toBeTruthy();
    expect(url.searchParams.get('target')).toBe('both');
    expect(url.searchParams.get('tab')).toBe('types');
  });

  test('embed snippet uses embed URL and iframe contract', () => {
    installWindow('https://example.test/playground/');
    const snippet = createEmbedSnippet({ ...defaultState, source: 'fn main() -> int { 7 }', activeExample: null });
    expect(snippet).toContain('<iframe');
    expect(snippet).toContain('embed=1');
    expect(snippet).toContain('Lumina Playground');
  });

  test('sanitizes and persists lightweight settings', () => {
    const storage = installWindow('https://example.test/playground/', {
      lumina_playground_theme: 'solarized',
      lumina_playground_font_size: '99',
      lumina_playground_tab_size: '3',
    });

    expect(readSettings()).toEqual({
      theme: defaultSettings.theme,
      fontSize: 20,
      tabSize: defaultSettings.tabSize,
    });
    expect(sanitizeTheme('light')).toBe('light');
    expect(sanitizeFontSize('12')).toBe(13);
    expect(sanitizeTabSize('4')).toBe(4);

    saveSettings({ theme: 'light', fontSize: 17, tabSize: 4 });
    expect(storage.get('lumina_playground_theme')).toBe('light');
    expect(storage.get('lumina_playground_font_size')).toBe('17');
    expect(storage.get('lumina_playground_tab_size')).toBe('4');
  });
});
