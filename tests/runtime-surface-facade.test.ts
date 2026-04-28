import { __set, createSignal, get, reactive, render, text } from '../src/lumina-runtime.js';

describe('runtime surface facade', () => {
  test('re-exports compact aliases through the public runtime entrypoint', () => {
    const signal = createSignal(1);
    expect(get(signal)).toBe(1);
    expect(render.signal).toBe(createSignal);
    expect(render.text).toBe(text);
    expect(reactive.createSignal).toBe(createSignal);
    expect(reactive.get).toBe(get);

    const target: Record<string, unknown> = {};
    expect(__set(target, 'label', 'Inbox')).toBe('Inbox');
    expect(target).toEqual({ label: 'Inbox' });
  });
});
