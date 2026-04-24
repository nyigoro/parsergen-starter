import { render } from './lumina-runtime.js';

const name = render.signal('');
const ready = render.signal(false);
const draft = render.signal('draft');
const profile = render.createResource('example:profile', () => Promise.resolve('Ada Lovelace'));

const app = () =>
  render.element('section', { className: 'profile-workspace' }, [
    render.element('h1', { className: 'profile-title' }, [render.text('Profile workspace')]),
    render.element('p', { className: 'profile-status' }, [
      render.text(`Resource status: ${render.resourceStatus(profile)}`),
    ]),
    render.suspense(render.text('Loading profile'), () =>
      render.element('p', { className: 'profile-name' }, [render.text(render.resourceRead(profile))])
    ),
    render.element(
      'form',
      {
        className: 'profile-form',
        onSubmit: () => {
          render.set(draft, render.get(name) || 'draft');
        },
      },
      [
        render.element('input', {
          className: 'profile-input',
          type: 'text',
          placeholder: 'Draft title',
          value: render.get(name),
          onInput: (event) => render.set(name, event?.target?.value ?? ''),
        }, []),
        render.element('label', { className: 'profile-ready' }, [
          render.element('input', {
            className: 'profile-checkbox',
            type: 'checkbox',
            checked: render.get(ready),
            onChange: (event) => render.set(ready, Boolean(event?.target?.checked)),
          }, []),
          render.text('Ready to publish'),
        ]),
        render.element('button', { className: 'profile-submit', type: 'submit' }, [render.text('Save draft')]),
      ]
    ),
    render.element('p', { className: 'profile-preview' }, [
      render.text(`Draft value: ${render.get(draft)} | Ready: ${render.get(ready) ? 'yes' : 'no'}`),
    ]),
  ]);

const container = document.getElementById('app');
const renderer = render.create_dom_renderer();
render.mount_reactive(renderer, container, app);
