import type { PlaygroundSettings, PlaygroundTheme } from './state';

const themeKey = 'lumina_playground_theme';
const fontSizeKey = 'lumina_playground_font_size';
const tabSizeKey = 'lumina_playground_tab_size';

export const defaultSettings: PlaygroundSettings = {
  theme: 'dark',
  fontSize: 15,
  tabSize: 2,
};

const themes = new Set<PlaygroundTheme>(['dark', 'light']);
const tabSizes = new Set([2, 4, 8]);

export const sanitizeTheme = (value: unknown): PlaygroundTheme =>
  typeof value === 'string' && themes.has(value as PlaygroundTheme) ? (value as PlaygroundTheme) : defaultSettings.theme;

export const sanitizeFontSize = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultSettings.fontSize;
  return Math.min(20, Math.max(13, Math.round(parsed)));
};

export const sanitizeTabSize = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return tabSizes.has(parsed) ? parsed : defaultSettings.tabSize;
};

export const readSettings = (): PlaygroundSettings => {
  try {
    return {
      theme: sanitizeTheme(window.localStorage.getItem(themeKey)),
      fontSize: sanitizeFontSize(window.localStorage.getItem(fontSizeKey)),
      tabSize: sanitizeTabSize(window.localStorage.getItem(tabSizeKey)),
    };
  } catch {
    return { ...defaultSettings };
  }
};

export const saveSettings = (settings: PlaygroundSettings): void => {
  try {
    window.localStorage.setItem(themeKey, sanitizeTheme(settings.theme));
    window.localStorage.setItem(fontSizeKey, String(sanitizeFontSize(settings.fontSize)));
    window.localStorage.setItem(tabSizeKey, String(sanitizeTabSize(settings.tabSize)));
  } catch {
    // Settings persistence is optional.
  }
};
