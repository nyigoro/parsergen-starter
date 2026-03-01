import { render } from '../../dist/lumina-runtime.js';

const appContainer = document.getElementById('app');
if (!appContainer) {
  throw new Error('Missing #app container');
}

const renderer = render.create_dom_renderer();

const count = render.signal(0);
const todos = render.signal([
  { id: 1, text: 'Ship @std/render core', done: true },
  { id: 2, text: 'Implement DOM target', done: true },
]);
const todoInput = render.signal('');
const nextTodoId = render.signal(3);

const requestId = render.signal(0);
const asyncStatus = render.signal('idle');
const asyncData = render.signal('No request yet');
const asyncError = render.signal('');

const completedCount = render.memo(() => render.get(todos).filter((item) => item.done).length);

render.effect((onCleanup) => {
  const id = render.get(requestId);
  if (id === 0) return;
  let cancelled = false;
  onCleanup(() => {
    cancelled = true;
  });

  render.set(asyncStatus, 'loading');
  render.set(asyncError, '');
  const startedAt = Date.now();

  setTimeout(() => {
    if (cancelled) return;
    if (id % 3 === 0) {
      render.set(asyncStatus, 'error');
      render.set(asyncError, `Request ${id} failed (simulated).`);
      return;
    }
    render.set(asyncStatus, 'ready');
    render.set(asyncData, `Payload #${id} resolved in ${Date.now() - startedAt}ms`);
  }, 500 + (id % 5) * 120);
});

const addTodo = () => {
  const text = render.get(todoInput).trim();
  if (!text) return;
  render.batch(() => {
    const id = render.get(nextTodoId);
    render.update_signal(todos, (items) => [...items, { id, text, done: false }]);
    render.set(nextTodoId, id + 1);
    render.set(todoInput, '');
  });
};

const toggleTodo = (id) => {
  render.update_signal(todos, (items) =>
    items.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
  );
};

const removeTodo = (id) => {
  render.update_signal(todos, (items) => items.filter((item) => item.id !== id));
};

const view = () => {
  const todoItems = render.get(todos);
  const status = render.get(asyncStatus);
  const error = render.get(asyncError);
  const data = render.get(asyncData);
  const value = render.get(todoInput);

  return render.fragment([
    render.element('section', { className: 'card' }, [
      render.element('h2', null, [render.text('Counter (signal + memo)')]),
      render.element('p', null, [render.text(`Count: ${render.get(count)}`)]),
      render.element('div', { className: 'row' }, [
        render.element('button', { onClick: () => render.set(count, render.get(count) - 1) }, [render.text('-')]),
        render.element('button', { onClick: () => render.set(count, render.get(count) + 1) }, [render.text('+')]),
        render.element('button', { className: 'secondary', onClick: () => render.set(count, 0) }, [render.text('reset')]),
      ]),
    ]),
    render.element('section', { className: 'card' }, [
      render.element('h2', null, [render.text('Todo List (list patching)')]),
      render.element('p', null, [
        render.text(`Total: ${todoItems.length}, completed: ${render.memo_get(completedCount)}`),
      ]),
      render.element('div', { className: 'row' }, [
        render.element('input', {
          value,
          placeholder: 'Add todo',
          onInput: (event) => {
            const target = event.target;
            render.set(todoInput, target && typeof target.value === 'string' ? target.value : '');
          },
          onKeydown: (event) => {
            if (event.key === 'Enter') addTodo();
          },
        }),
        render.element('button', { onClick: addTodo }, [render.text('Add')]),
      ]),
      render.element(
        'ul',
        null,
        todoItems.map((item) =>
          render.element('li', { key: item.id, className: 'row' }, [
            render.element('input', {
              type: 'checkbox',
              checked: item.done,
              onChange: () => toggleTodo(item.id),
            }),
            render.element(
              'span',
              { style: { textDecoration: item.done ? 'line-through' : 'none', flex: '1' } },
              [render.text(item.text)]
            ),
            render.element('button', { className: 'secondary', onClick: () => removeTodo(item.id) }, [render.text('remove')]),
          ])
        )
      ),
    ]),
    render.element('section', { className: 'card' }, [
      render.element('h2', null, [render.text('Async Data (effect + cleanup)')]),
      render.element('div', { className: 'row' }, [
        render.element('button', { onClick: () => render.set(requestId, render.get(requestId) + 1) }, [render.text('Fetch Data')]),
      ]),
      render.element('p', null, [render.text(`Status: ${status}`)]),
      status === 'error'
        ? render.element('p', { style: { color: '#fca5a5' } }, [render.text(error)])
        : render.element('p', null, [render.text(data)]),
    ]),
  ]);
};

render.mount_reactive(renderer, appContainer, view);
