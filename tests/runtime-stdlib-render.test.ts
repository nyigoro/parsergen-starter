import { render } from '../src/lumina-runtime.js';

describe('runtime render module', () => {
  test('signal + effect tracking', async () => {
    const count = render.signal(1);
    const seen: number[] = [];

    const fx = render.effect(() => {
      seen.push(render.get(count));
    });

    expect(seen).toEqual([1]);

    render.set(count, 2);
    await Promise.resolve();
    expect(seen).toEqual([1, 2]);

    expect(render.update_signal(count, (value) => value + 3)).toBe(5);
    await Promise.resolve();
    expect(seen).toEqual([1, 2, 5]);

    render.dispose_effect(fx);
  });

  test('memo is lazily recomputed', () => {
    const source = render.signal(2);
    let runs = 0;
    const doubled = render.memo(() => {
      runs += 1;
      return render.get(source) * 2;
    });

    expect(runs).toBe(0);
    expect(render.memo_get(doubled)).toBe(4);
    expect(runs).toBe(1);

    render.set(source, 3);
    expect(runs).toBe(1);
    expect(render.memo_get(doubled)).toBe(6);
    expect(runs).toBe(2);
  });

  test('signal get/set preserves deep-clone isolation for plain arrays and objects', () => {
    const source = render.signal([{ id: 'alpha', meta: { count: 1 } }]);

    const read = render.get(source) as Array<{ id: string; meta: { count: number } }>;
    read[0].meta.count = 9;
    expect((render.get(source) as Array<{ meta: { count: number } }>)[0].meta.count).toBe(1);

    const next = [{ id: 'beta', meta: { count: 2 } }];
    render.set(source, next);
    next[0].meta.count = 7;
    expect((render.get(source) as Array<{ meta: { count: number } }>)[0].meta.count).toBe(2);
  });

  test('aggregate signal updates are reference-based and rerun on structurally equal clones', async () => {
    const rows = render.signal(['alpha', 'beta']);
    const seen: string[] = [];

    const fx = render.effect(() => {
      seen.push((render.get(rows) as string[]).join(','));
    });

    expect(seen).toEqual(['alpha,beta']);
    expect(render.set(rows, ['alpha', 'beta'])).toBe(true);
    await Promise.resolve();
    expect(seen).toEqual(['alpha,beta', 'alpha,beta']);

    render.dispose_effect(fx);
  });

  test('effect cleanup runs before rerun and on dispose', async () => {
    const source = render.signal(0);
    const log: string[] = [];

    const fx = render.effect((onCleanup) => {
      const value = render.get(source);
      log.push(`run:${value}`);
      onCleanup(() => {
        log.push(`cleanup:${value}`);
      });
    });

    render.set(source, 1);
    await Promise.resolve();
    render.dispose_effect(fx);

    expect(log).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1']);
  });

  test('vnode helpers produce serializable trees', () => {
    const node = render.element(
      'div',
      { id: 'root', class: 'demo' },
      [render.text('hello'), render.fragment([render.text('world')])]
    );

    expect(render.is_vnode(node)).toBe(true);
    const serialized = render.serialize(node);
    const parsed = render.parse(serialized);

    expect(parsed).toEqual(node);
    expect(parsed.kind).toBe('element');
  });

  test('liveText snapshots to string output while staying signal-backed in DOM mode', () => {
    const value = render.signal('hello');
    expect(render.render_to_string(render.liveText(value))).toBe('hello');

    render.set(value, 'world');
    expect(render.render_to_string(render.liveText(value))).toBe('world');
  });

  test('indexList snapshots current array values for string output', () => {
    const rows = render.signal(['alpha', 'beta']);
    const node = render.indexList(rows, (row, index) =>
      render.element('li', { 'data-index': String(index) }, [render.liveText(row)])
    );

    expect(render.render_to_string(node)).toContain('data-lumina-index-list');
    expect(render.render_to_string(node)).toContain('alpha');
    expect(render.render_to_string(node)).toContain('beta');

    render.set(rows, ['alpha', 'gamma']);
    expect(render.render_to_string(node)).toContain('gamma');
  });

  test('forList snapshots keyed rows for string output', () => {
    const rows = render.signal([
      { id: 'alpha', label: 'Alpha' },
      { id: 'beta', label: 'Beta' },
    ]);
    const node = render.forList(
      rows,
      (row: { id: string }) => row.id,
      (row, index) =>
        render.element('li', { 'data-index': String(render.get(index)) }, [
          render.liveText(render.memo(() => render.get(row).label)),
        ])
    );

    expect(render.render_to_string(node)).toContain('data-lumina-for-list');
    expect(render.render_to_string(node)).toContain('Alpha');
    expect(render.render_to_string(node)).toContain('Beta');

    render.set(rows, [
      { id: 'alpha', label: 'Alpha*' },
      { id: 'beta', label: 'Beta' },
    ]);
    expect(render.render_to_string(node)).toContain('Alpha*');
  });

  test('generic keyed children serialize hydration keys for SSR', () => {
    const node = render.keyed(
      'settings-panel',
      render.element('section', { className: 'panel' }, [render.text('Settings')])
    );

    expect(render.render_to_string(node)).toBe(
      '<section class="panel" data-lumina-key="settings-panel">Settings</section>'
    );
    expect(render.renderToChunks(node).join('')).toBe(render.render_to_string(node));
    expect(render.renderToReadableStream(node)).toBeInstanceOf(ReadableStream);
  });

  test('renderer root lifecycle delegates to renderer hooks', () => {
    const events: string[] = [];
    const renderer = render.create_renderer({
      mount(node: { kind: string }) {
        events.push(`mount:${node.kind}`);
      },
      patch(prev: { kind: string }, next: { kind: string }) {
        events.push(`patch:${prev.kind}->${next.kind}`);
      },
      unmount() {
        events.push('unmount');
      },
    });

    const root = render.mount(renderer, { id: 'container' }, render.text('one'));
    render.update(root, render.element('span', null, [render.text('two')]));
    render.unmount(root);

    expect(events).toEqual(['mount:text', 'patch:text->element', 'unmount']);
  });

  test('create_renderer validates shape', () => {
    expect(() => render.create_renderer({})).toThrow('Renderer.mount must be a function');
  });

  test('DOM bridge helpers create props and resolve container', () => {
    const plus = jest.fn();
    const minus = jest.fn();
    const onChecked = jest.fn();
    const onSubmit = jest.fn();
    const combined = render.props_merge(
      render.props_class('counter'),
      render.props_on_click(() => plus())
    ) as { className?: string; onClick?: () => void };

    expect(combined.className).toBe('counter');
    expect(typeof combined.onClick).toBe('function');
    combined.onClick?.();
    expect(plus).toHaveBeenCalledTimes(1);

    const signal = render.signal(2);
    const deltaProps = render.props_on_click_delta(signal, 3) as { onClick?: () => void };
    deltaProps.onClick?.();
    expect(render.get(signal)).toBe(5);
    const incProps = render.props_on_click_inc(signal) as { onClick?: () => void };
    incProps.onClick?.();
    expect(render.get(signal)).toBe(6);
    const decProps = render.props_on_click_dec(signal) as { onClick?: () => void };
    decProps.onClick?.();
    expect(render.get(signal)).toBe(5);

    expect(render.props_checked(true)).toEqual({ checked: true });
    expect(render.props_type('checkbox')).toEqual({ type: 'checkbox' });
    expect(render.props_name('choice')).toEqual({ name: 'choice' });
    const checkedProps = render.props_on_checked_change(onChecked) as { onChange?: (event: Event) => void };
    checkedProps.onChange?.({ target: { checked: true } } as unknown as Event);
    expect(onChecked).toHaveBeenCalledWith(true);
    const preventDefault = jest.fn();
    const submitProps = render.props_on_submit(onSubmit) as { onSubmit?: (event: Event) => void };
    submitProps.onSubmit?.({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const documentLike = {
      getElementById: (id: string) => (id === 'app' ? { id, clicked: minus } : null),
    };
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = documentLike;
    try {
      expect(render.dom_get_element_by_id('app')).toEqual({ id: 'app', clicked: minus });
      expect(render.dom_get_element_by_id('missing')).toBeNull();
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  test('context tokens and composition helpers work outside DOM patching', () => {
    const theme = render.create_context('light');
    expect(theme.defaultValue).toBe('light');
    expect(theme.hasDefault).toBe(true);

    const normalized = render.children(() => [render.text('a'), render.text('b')]);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.text).toBe('a');

    const slotted = render.slot(({ label }: { label: string }) => render.text(label), { label: 'theme' });
    expect(slotted.kind).toBe('text');
    expect(slotted.text).toBe('theme');

    const fallback = render.slot(null, { label: 'ignored' }, render.text('fallback'));
    expect(fallback.kind).toBe('text');
    expect(fallback.text).toBe('fallback');
  });

  test('resource helpers deduplicate loads and revalidate stale data', async () => {
    const key = `resource:${Date.now()}:dedupe`;
    let calls = 0;
    let resolveFirst!: (value: string) => void;

    const loader = jest.fn(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve('second');
    });

    const first = render.createResource(key, loader, { ttlMs: 5 });
    const second = render.createResource(key, loader, { ttlMs: 5 });

    expect(calls).toBe(1);
    expect(render.resourceStatus(first)).toBe('loading');
    let pending: unknown = null;
    try {
      render.resourceRead(first);
    } catch (error) {
      pending = error;
    }
    expect(pending).toBeInstanceOf(Promise);

    resolveFirst('first');
    await (pending as Promise<unknown>);
    await Promise.resolve();

    expect(render.resourceStatus(second)).toBe('success');
    expect(render.resourceData(first)).toBe('first');
    expect(render.resourceRead(second)).toBe('first');

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(100);
    const stale = render.createResource(key, loader, { ttlMs: 5 });
    nowSpy.mockReturnValue(200);
    render.resourceInvalidate(stale);
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(2);
    expect(render.resourceData(stale)).toBe('second');
    expect(render.resourceStatus(stale)).toBe('success');
    nowSpy.mockRestore();
  });

  test('resource helpers invalidate by key, prefix, and tag while suppressing stale pending writes', async () => {
    const key = `resource:${Date.now()}:actions`;
    let resolveOld!: (value: string) => void;
    const loader = jest.fn(() => new Promise<string>((resolve) => {
      resolveOld = resolve;
    }));

    const resource = render.createResource(key, loader, { ttlMs: 10, tags: ['profile'], staleWhileRevalidate: true });
    expect(render.resourceStatus(resource)).toBe('loading');
    expect(render.resourceInvalidateTag('profile')).toBe(1);
    expect(render.resourceInvalidatePrefix('resource:')).toBeGreaterThanOrEqual(1);
    expect(render.resourceInvalidateKey(key)).toBe(true);

    expect(render.resourceMutate(resource, 'newer')).toBe('newer');
    resolveOld('older');
    await Promise.resolve();
    await Promise.resolve();

    expect(render.resourceData(resource)).toBe('newer');
    render.resourceClearCache();
    expect(render.resourceInvalidateKey(key)).toBe(false);
  });

  test('resource helpers scope records, track dependencies, and abort forced refreshes', async () => {
    const key = `resource:${Date.now()}:scoped`;
    const aborted: string[] = [];
    const resolvers: Array<(value: string) => void> = [];
    const loader = jest.fn((signal?: AbortSignal) => new Promise<string>((resolve, reject) => {
      resolvers.push(resolve);
      signal?.addEventListener('abort', () => {
        aborted.push('aborted');
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const resource = render.createResource(key, loader, {
      scope: 'account:1',
      dependencies: ['profile'],
      abortOnRefresh: true,
      staleWhileRevalidate: true,
    });
    expect(render.resourceStatus(resource)).toBe('loading');

    const refreshed = render.resourceRefresh(resource);
    expect(aborted).toEqual(['aborted']);
    resolvers[1]?.('fresh');
    await refreshed;
    expect(render.resourceData(resource)).toBe('fresh');

    expect(render.resourceInvalidateDependency('profile')).toBe(1);
    resolvers[2]?.('dependency');
    await Promise.resolve();
    await Promise.resolve();
    expect(render.resourceData(resource)).toBe('dependency');

    expect(render.resourceInvalidateScope('account:1')).toBe(1);
    resolvers[3]?.('scope');
    await Promise.resolve();
    await Promise.resolve();
    expect(render.resourceData(resource)).toBe('scope');

    const other = render.createResource(`${key}:other`, () => 'other', { scope: 'account:2' });
    await Promise.resolve();
    expect(render.resourceClearScope('account:1')).toBe(1);
    expect(render.resourceInvalidateKey(key)).toBe(false);
    expect(render.resourceInvalidateKey(`${key}:other`)).toBe(true);
    render.resourceClearCache();
    expect(other).toBeTruthy();
  });

  test('resource submit resets submitting and rolls back optimistic failures', async () => {
    const action = render.createResource(
      `resource:${Date.now()}:action`,
      async () => {
        throw new Error('save failed');
      },
      { enabled: false }
    );
    const target = render.createResource(`resource:${Date.now()}:target`, async () => 'server', { enabled: false });
    render.resourceMutate(target, 'previous');
    const submitting = render.signal(false);

    await expect(render.resourceSubmitOptimistic(action, submitting, target, 'optimistic', 'previous')).rejects.toThrow(
      'save failed'
    );

    expect(render.get(submitting)).toBe(false);
    expect(render.resourceStatus(action)).toBe('error');
    expect((render.resourceError(action) as Error).message).toBe('save failed');
    expect(render.resourceData(target)).toBe('previous');
    render.resourceClearCache();
  });

  test('direct resource invalidation discards stale pending work', async () => {
    const key = `resource:${Date.now()}:direct-invalidate`;
    const resolvers: Array<(value: string) => void> = [];
    let aborted = false;
    const resource = render.createResource(
      key,
      (signal?: AbortSignal) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise<string>((resolve) => {
          resolvers.push(resolve);
        });
      },
      { abortOnRefresh: false }
    );

    render.resourceInvalidate(resource);
    expect(aborted).toBe(false);
    resolvers[0]?.('stale');
    resolvers[1]?.('fresh');
    await Promise.resolve();
    await Promise.resolve();
    expect(render.resourceData(resource)).toBe('fresh');
    render.resourceClearCache();
  });

  test('suspense and error boundary helpers catch the right thrown values', () => {
    const suspenseFallback = render.suspense(render.text('Loading'), () => {
      throw Promise.resolve('pending');
    });
    expect(suspenseFallback.kind).toBe('text');
    expect(suspenseFallback.text).toBe('Loading');

    const errorFallback = render.error_boundary(
      (error: unknown) => render.text(`Error: ${String((error as Error)?.message ?? error)}`),
      () => {
        throw new Error('Boom');
      }
    );
    expect(errorFallback.kind).toBe('text');
    expect(errorFallback.text).toBe('Error: Boom');

    expect(() =>
      render.error_boundary(render.text('nope'), () => {
        throw Promise.resolve('pending');
      })
    ).toThrow();
  });

  test('show and props authoring helpers resolve conditions and merge attrs', () => {
    const visible = render.show(true, () => render.text('Visible'), render.text('Hidden'));
    expect(visible.kind).toBe('text');
    expect(visible.text).toBe('Visible');

    const hidden = render.show(render.signal(false), () => render.text('Visible'), render.text('Hidden'));
    expect(hidden.kind).toBe('text');
    expect(hidden.text).toBe('Hidden');

    const props = render.props_merge(
      render.props_attr('data_state', 'open'),
      render.props_when(true, render.props_attr('aria_label', 'Profile'))
    );
    expect(props['data-state']).toBe('open');
    expect(props['aria-label']).toBe('Profile');
  });

  test('app-level SSR helpers support stateful components', () => {
    const App = ({ label }: { label: string }) => {
      const count = render.state(1);
      return render.element('button', { id: 'counter' }, [
        render.text(`${label}:${render.get(count)}`),
      ]);
    };

    const vnode = render.renderApp(App, { label: 'Clicks' });
    expect(vnode.kind).toBe('element');
    expect(render.renderToStringApp(App, { label: 'Clicks' })).toContain('Clicks:1');
  });

  test('testing harness mounts apps and drives interactions', async () => {
    const App = ({ label }: { label: string }) => {
      const count = render.state(1);
      const value = render.state('');
      return render.element('form', { id: 'form', onSubmit: () => render.set(count, render.get(count) + 1) }, [
        render.element('button', { id: 'counter', onClick: () => render.set(count, render.get(count) + 1) }, [
          render.text(`${label}:${render.get(count)}`),
        ]),
        render.element('input', {
          id: 'name',
          value: render.get(value),
          onInput: (event: { target?: { value?: string } }) => render.set(value, event.target?.value ?? ''),
        }, []),
        render.element('p', { id: 'echo' }, [render.text(render.get(value))]),
      ]);
    };

    const harness = render.testingCreateDomHarness();
    const root = render.testingMountApp(harness, App, { label: 'Clicks' }) as ReturnType<typeof render.mount_reactive>;

    const button = render.testingGetById(harness, 'counter');
    const input = render.testingGetById(harness, 'name');
    expect(render.testingBody(harness)).toBeTruthy();
    expect(render.testingContainer(harness)).toBeTruthy();
    expect(render.testingTextContent(button)).toBe('Clicks:1');

    render.testingClick(button);
    await Promise.resolve();
    expect(render.testingTextContent(button)).toBe('Clicks:3');

    render.testingInput(input, 'Ada');
    await Promise.resolve();
    expect(render.testingTextContent(render.testingGetById(harness, 'echo'))).toBe('Ada');

    render.testingSubmit(render.testingGetById(harness, 'form'));
    await Promise.resolve();
    expect(render.testingTextContent(render.testingGetById(harness, 'counter'))).toBe('Clicks:4');

    render.dispose_reactive(root);
  });

  test('hydrateApp preserves existing host nodes and stays reactive', async () => {
    const App = ({ label }: { label: string }) => {
      const count = render.state(1);
      return render.element('button', { id: 'counter', onClick: () => render.set(count, render.get(count) + 1) }, [
        render.text(`${label}:${render.get(count)}`),
      ]);
    };

    const harness = render.testingCreateDomHarness() as { document: unknown; container: unknown };
    const renderer = render.create_dom_renderer({ document: harness.document as never });
    render.mount(renderer, harness.container, render.renderApp(App, { label: 'Hydrate' }));

    const before = render.testingGetById(harness, 'counter');
    const reactive = render.hydrateApp(renderer, harness.container, App, { label: 'Hydrate' }) as ReturnType<
      typeof render.mount_reactive
    >;
    const after = render.testingGetById(harness, 'counter');

    expect(after).toBe(before);
    render.testingClick(after);
    await Promise.resolve();
    expect(render.testingTextContent(render.testingGetById(harness, 'counter'))).toBe('Hydrate:2');

    render.dispose_reactive(reactive);
  });

  test('hydrateApp adopts generic keyed app rows without losing input state', async () => {
    const App = ({ rows }: { rows: Array<{ id: string; label: string }> }) =>
      render.element(
        'section',
        { id: 'keyed-app' },
        rows.map((row) =>
          render.keyed(
            row.id,
            render.element('article', { id: `row-${row.id}` }, [
              render.element('input', { id: `input-${row.id}` }, []),
              render.text(row.label),
            ])
          )
        )
      );

    const harness = render.testingCreateDomHarness() as { document: unknown; container: unknown };
    const renderer = render.create_dom_renderer({ document: harness.document as never });
    render.mount(renderer, harness.container, render.renderApp(App, {
      rows: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    }));

    const inputA = render.testingGetById(harness, 'input-a') as { value?: string; focus?: () => void };
    const rowA = render.testingGetById(harness, 'row-a') as {
      setAttribute?: (name: string, value: string) => void;
    };
    const rowB = render.testingGetById(harness, 'row-b') as {
      setAttribute?: (name: string, value: string) => void;
    };
    rowA.setAttribute?.('data-lumina-key', 'a');
    rowB.setAttribute?.('data-lumina-key', 'b');
    inputA.value = 'typed A';
    inputA.focus?.();

    const reactive = render.hydrateApp(renderer, harness.container, App, {
      rows: [
        { id: 'b', label: 'Beta' },
        { id: 'a', label: 'Alpha' },
      ],
    }) as ReturnType<typeof render.mount_reactive>;

    const section = render.testingGetById(harness, 'keyed-app') as { childNodes: unknown[] };
    expect(section.childNodes[0]).toBe(rowB);
    expect(section.childNodes[1]).toBe(rowA);
    expect((render.testingGetById(harness, 'input-a') as { value?: string }).value).toBe('typed A');
    expect((harness.document as { activeElement?: unknown }).activeElement).toBe(inputA);

    render.dispose_reactive(reactive);
  });

  test('custom element helpers mount and react to attribute changes', async () => {
    const App = ({ label }: { label?: string | null }) =>
      render.element('span', { id: 'value' }, [render.text(label ?? 'unset')]);

    type ShadowHost = {
      setAttribute: (name: string, value: string) => void;
      shadowRoot?: unknown;
    };
    const harness = render.testingCreateDomHarness() as {
      document: { createElement: (tag: string) => ShadowHost };
    };
    const host = harness.document.createElement('lumina-card');
    host.setAttribute('label', 'Hello');

    const controller = render.mountCustomElement(host, App, {
      observedAttributes: ['label'],
      useShadow: true,
    });

    await Promise.resolve();
    expect(render.testingTextContent(host.shadowRoot)).toContain('Hello');

    host.setAttribute('label', 'World');
    controller.syncAttributes();
    await Promise.resolve();
    expect(render.testingTextContent(host.shadowRoot)).toContain('World');

    controller.disconnect();
  });

  test('defineCustomElement wires registry lifecycle callbacks', async () => {
    const App = ({ label }: { label?: string | null }) =>
      render.element('span', { id: 'value' }, [render.text(label ?? 'unset')]);

    type ShadowNodeFactory = { createElement: (tag: string) => unknown };
    const harness = render.testingCreateDomHarness() as { document: ShadowNodeFactory };
    const registry = {
      values: new Map<string, unknown>(),
      get(name: string) {
        return this.values.get(name);
      },
      define(name: string, ctor: unknown) {
        this.values.set(name, ctor);
      },
    };

    class FakeElementHost {
      ownerDocument = harness.document;
      private readonly attrs = new Map<string, string>();
      shadowRoot: unknown = null;

      getAttribute(name: string): string | null {
        return this.attrs.get(name) ?? null;
      }

      setAttribute(name: string, value: string): void {
        this.attrs.set(name, value);
      }

      attachShadow(): unknown {
        if (!this.shadowRoot) {
          this.shadowRoot = this.ownerDocument.createElement('shadow-root');
        }
        return this.shadowRoot;
      }
    }

    const Custom = render.defineCustomElement('lumina-pill', App, {
      observedAttributes: ['label'],
      useShadow: true,
      registry,
      baseClass: FakeElementHost,
    }) as new () => FakeElementHost & {
      connectedCallback?: () => void;
      attributeChangedCallback?: () => void;
      disconnectedCallback?: () => void;
    };

    expect(registry.get('lumina-pill')).toBe(Custom);

    const element = new Custom();
    element.setAttribute('label', 'Alpha');
    element.connectedCallback?.();
    await Promise.resolve();
    expect(render.testingTextContent(element.shadowRoot)).toContain('Alpha');

    element.setAttribute('label', 'Beta');
    element.attributeChangedCallback?.();
    await Promise.resolve();
    expect(render.testingTextContent(element.shadowRoot)).toContain('Beta');

    element.disconnectedCallback?.();
  });

  test('transition presence keeps exiting content mounted until the timeout ends', async () => {
    const App = () => {
      const open = render.state(false);
      return render.element('div', {}, [
        render.element('button', { id: 'toggle', onClick: () => render.set(open, !render.get(open)) }, [render.text('toggle')]),
        render.transitionPresence(open, { id: 'panel', className: 'transition' }, 10, () => [
          render.text('Panel'),
        ]),
      ]);
    };

    const harness = render.testingCreateDomHarness();
    const root = render.testingMountApp(harness, App, null);

    expect(render.testingGetById(harness, 'panel')).toBeNull();

    render.testingClick(render.testingGetById(harness, 'toggle'));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render.testingGetById(harness, 'panel')).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 25));
    await Promise.resolve();
    expect(
      (render.testingGetById(harness, 'panel') as { getAttribute?: (name: string) => string | null } | null)
        ?.getAttribute?.('data-transition-state')
    ).toBe('entered');

    render.testingClick(render.testingGetById(harness, 'toggle'));
    await Promise.resolve();
    expect(render.testingGetById(harness, 'panel')).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(render.testingGetById(harness, 'panel')).toBeNull();

    render.dispose_reactive(root);
  });

  test('testing queries find portal content by text and role', async () => {
    const App = () => {
      const open = render.state(true);
      return render.dialogRoot(open, () => render.dialogPortal([
        render.dialogOverlay({}),
        render.dialogContent({ id: 'dialog' }, [
          render.dialogTitle({}, [render.text('Profile')]),
          render.element('button', { id: 'save' }, [render.text('Save')]),
        ]),
      ]));
    };

    const harness = render.testingCreateDomHarness();
    const root = render.testingMountApp(harness, App, null);

    expect(render.testingGetByText(harness, 'Profile')).toBeTruthy();
    expect(
      (render.testingGetByRole(harness, 'dialog') as { getAttribute?: (name: string) => string | null } | null)
        ?.getAttribute?.('id')
    ).toBe('dialog');
    expect(render.testingQueryAllByRole(harness, 'button')).toHaveLength(1);

    render.dispose_reactive(root);
  });

  test('devtools snapshot exposes roots, resources, and signals', async () => {
    const loader = jest.fn(async () => 'ready');
    const App = () => {
      const count = render.state(1);
      const resource = render.createResource('devtools:profile', loader);
      return render.element('div', { id: 'app' }, [
        render.text(render.get(count)),
        render.suspense(render.text('Loading'), () => [render.text(render.resourceRead(resource))]),
      ]);
    };

    const harness = render.testingCreateDomHarness();
    const root = render.testingMountApp(harness, App, null);
    const globalHandle = render.installDevtools() as { snapshot: () => unknown };

    await Promise.resolve();
    await Promise.resolve();
    const snapshot = render.devtoolsSnapshot() as {
      roots: Array<{ frames: Array<{ slots: Array<{ kind: string }>; children: unknown[] }> }>;
      resources: Array<{ key: string; status: string }>;
      signals: Array<{ kind: string }>;
    };
    expect(snapshot.roots.length).toBeGreaterThan(0);
    expect(snapshot.resources.some((resource) => resource.key === 'devtools:profile')).toBe(true);
    expect(snapshot.signals.some((signal) => signal.kind === 'signal')).toBe(true);
    expect((globalThis as { __LUMINA_DEVTOOLS__?: unknown }).__LUMINA_DEVTOOLS__).toBe(globalHandle);
    const event = render.devtoolsRecordEvent('resource', 'profile refreshed', { key: 'devtools:profile' });
    expect(render.devtoolsTimeline()).toEqual(expect.arrayContaining([event]));
    render.devtoolsClearTimeline();
    expect(render.devtoolsTimeline()).toEqual([]);

    render.dispose_reactive(root);
  });

  test('ssg helpers render and write HTML documents', () => {
    const App = ({ label }: { label: string }) =>
      render.element('main', {}, [render.text(label)]);

    const html = render.ssgRenderApp(App, { label: 'Hello' }, {
      title: 'Demo',
      hydrateModule: '/main.generated.js',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Demo</title>');
    expect(html).toContain('Hello');
    expect(html).toContain('/main.generated.js');
  });
});
