import { TestingTextNode } from '../src/testing-dom.js';
import { createTestingFacade } from '../src/runtime/testing-facade.js';

describe('runtime testing facade', () => {
  test('creates harnesses, delegates mount flows, and proxies DOM queries/events', async () => {
    const mountCalls: Array<{ hydrate: boolean; props: unknown }> = [];
    const renderer = { kind: 'renderer' };
    const root = { kind: 'root' };
    const facade = createTestingFacade<(props: { label: string }) => unknown, typeof root>({
      createRenderer: () => renderer,
      mountApp: (harness, _componentFn, props, hydrate) => {
        mountCalls.push({ hydrate, props });
        harness.root = root;
        return root;
      },
    });

    const harness = facade.testing_create_dom_harness();
    expect(harness.renderer).toBe(renderer);

    const button = harness.document.createElement('button');
    button.setAttribute('id', 'save');
    button.setAttribute('type', 'submit');
    button.type = 'submit';
    button.appendChild(new TestingTextNode('Save'));
    const input = harness.document.createElement('input');
    input.setAttribute('id', 'name');
    input.setAttribute('type', 'text');
    const form = harness.document.createElement('form');
    form.appendChild(button);
    form.appendChild(input);
    harness.container.appendChild(form);

    const clickSpy = jest.fn();
    const inputSpy = jest.fn();
    const keySpy = jest.fn();
    const submitSpy = jest.fn();
    button.addEventListener('click', clickSpy);
    input.addEventListener('input', inputSpy);
    input.addEventListener('keydown', keySpy);
    form.addEventListener('submit', submitSpy);

    expect(facade.testing_get_by_id(harness, 'save')).toBe(button);
    expect(facade.testing_get_by_text(button, 'Save')).toBe(button);
    expect(facade.testing_get_by_text(harness, 'Save')).toBe(harness.document.body);
    expect(facade.testing_get_by_role(harness, 'button')).toBe(button);
    expect(facade.testing_query_all_by_role(harness, 'textbox')).toEqual([input]);

    facade.testing_click(button);
    facade.testing_input(input, 'Ada');
    facade.testing_keydown(input, 'Enter', true);
    facade.testing_submit(form);
    await expect(facade.testing_flush()).resolves.toBeUndefined();
    await expect(facade.testing_wait_for(() => 'ready', 2)).resolves.toBe('ready');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledTimes(2);
    expect(facade.testing_text_content(button)).toBe('Save');

    expect(facade.testing_mount_app(harness, () => null, { label: 'mount' })).toBe(root);
    expect(facade.testing_hydrate_app(harness, () => null, { label: 'hydrate' })).toBe(root);
    expect(mountCalls).toEqual([
      { hydrate: false, props: { label: 'mount' } },
      { hydrate: true, props: { label: 'hydrate' } },
    ]);
  });
});
