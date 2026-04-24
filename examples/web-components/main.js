import { render } from './lumina-runtime.js';

render.defineCustomElement(
  'lumina-profile-badge',
  ({ label = 'unset', tone = 'default' } = {}) =>
    render.element(
      'span',
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.65rem 0.95rem',
          borderRadius: '999px',
          background: tone === 'highlight' ? '#7c2d12' : '#fdba74',
          color: tone === 'highlight' ? '#fff7ed' : '#7c2d12',
          fontWeight: '700',
          boxShadow: tone === 'highlight' ? '0 10px 24px rgba(124,45,18,0.24)' : 'none',
        },
      },
      [render.text(label)]
    ),
  { observedAttributes: ['label', 'tone'], useShadow: true }
);

const badgeA = document.getElementById('badge-a');
const badgeB = document.getElementById('badge-b');

document.getElementById('swap')?.addEventListener('click', () => {
  const currentA = badgeA?.getAttribute('label') ?? '';
  const currentB = badgeB?.getAttribute('label') ?? '';
  badgeA?.setAttribute('label', currentB);
  badgeB?.setAttribute('label', currentA);
});

document.getElementById('highlight')?.addEventListener('click', () => {
  const active = badgeB?.getAttribute('tone') === 'highlight';
  badgeB?.setAttribute('tone', active ? 'default' : 'highlight');
});
