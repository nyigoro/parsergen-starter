import { findExampleBySource } from './examples-data';
import type { CompileTarget, OutputTab, PlaygroundState } from './state';

const sourceKey = 'lumina_playground_source';
const targetKey = 'lumina_playground_target';
const exampleKey = 'lumina_playground_example';
const targets = new Set<CompileTarget>(['js', 'wasm', 'both']);
const tabs = new Set<OutputTab>(['js', 'wasm', 'run', 'ui', 'types', 'diagnostics']);

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string): string | null => {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export const readUrlState = (): Partial<PlaygroundState> => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const example = url.searchParams.get('example') ?? url.searchParams.get('preset');
  const target = url.searchParams.get('target');
  const tab = url.searchParams.get('tab');
  return {
    ...(code ? { source: fromBase64Url(code) ?? '' } : {}),
    ...(!code && example ? { activeExample: example } : {}),
    ...(target && targets.has(target as CompileTarget) ? { target: target as CompileTarget } : {}),
    ...(tab && tabs.has(tab as OutputTab) ? { activeTab: tab as OutputTab } : {}),
  };
};

export const readLocalState = (): Partial<PlaygroundState> => {
  try {
    const target = window.localStorage.getItem(targetKey);
    return {
      source: window.localStorage.getItem(sourceKey) ?? undefined,
      activeExample: window.localStorage.getItem(exampleKey) ?? undefined,
      ...(target && targets.has(target as CompileTarget) ? { target: target as CompileTarget } : {}),
    };
  } catch {
    return {};
  }
};

export const saveLocalState = (state: PlaygroundState): void => {
  try {
    window.localStorage.setItem(sourceKey, state.source);
    window.localStorage.setItem(targetKey, state.target);
    if (state.activeExample) window.localStorage.setItem(exampleKey, state.activeExample);
    else window.localStorage.removeItem(exampleKey);
  } catch {
    // Persistence is optional.
  }
};

export const createShareUrl = (state: PlaygroundState): string => {
  const url = new URL(window.location.href);
  const selectedExample = findExampleBySource(state.source, state.activeExample);
  url.search = '';
  if (selectedExample) {
    url.searchParams.set('example', selectedExample.id);
  } else {
    url.searchParams.set('code', toBase64Url(state.source));
  }
  url.searchParams.set('target', state.target);
  url.searchParams.set('tab', state.activeTab);
  return url.toString();
};
