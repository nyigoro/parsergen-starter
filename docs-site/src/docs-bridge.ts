type DocsPage = {
  slug: string;
  title: string;
  section: string;
  html: string;
  sourcePath: string;
};

type DocsBundle = {
  pages: DocsPage[];
  index: Array<Pick<DocsPage, 'slug' | 'title' | 'section' | 'sourcePath'>>;
};

let bundlePromise: Promise<DocsBundle> | null = null;

const defaultSlug = 'getting-started';
const isDirectDocsDev = import.meta.env.DEV && window.location.port === '5174';

const devAppUrl = (port: string, path: string): string =>
  `${window.location.protocol}//${window.location.hostname}:${port}${path}`;

const homeHref = (): string => (isDirectDocsDev ? devAppUrl('5173', '/') : '../');
const playgroundHref = (): string => (isDirectDocsDev ? devAppUrl('5175', '/playground/') : '../playground/');

const loadBundle = async (): Promise<DocsBundle> => {
  if (!bundlePromise) {
    bundlePromise = fetch(new URL('./docs-bundle.json', window.location.href)).then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to load docs bundle: ${response.status}`);
      }
      return response.json() as Promise<DocsBundle>;
    });
  }
  return bundlePromise;
};

const routeFromLocation = (): { section: string | null; slug: string } => {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (hash.length > 0) {
    const [slugPart, query = ''] = hash.split('?');
    const slug = slugPart.replace(/^\/+|\/+$/g, '');
    const section = new URLSearchParams(query).get('section');
    return { slug: slug.length > 0 ? slug : defaultSlug, section };
  }

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    if (last !== '404.html' && last !== 'docs' && last !== 'index.html') {
      return { slug: last, section: null };
    }
  }

  return { slug: defaultSlug, section: null };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderSidebar = (items: DocsBundle['index'], activeSlug: string): string => {
  let currentSection = '';
  const htmlParts: string[] = [];

  for (const item of items) {
    if (item.section !== currentSection) {
      currentSection = item.section;
      htmlParts.push(`<div class="docs-sidebar-section">${escapeHtml(currentSection)}</div>`);
    }

    const activeClass = item.slug === activeSlug ? ' is-active' : '';
    htmlParts.push(
      `<a class="docs-sidebar-link${activeClass}" id="doc-link-${item.slug}" href="#/${item.slug}">${escapeHtml(item.title)}</a>`
    );
  }

  return htmlParts.join('');
};

const playgroundEmbedUrl = (frame: HTMLIFrameElement): string => {
  const url = new URL(playgroundHref(), window.location.href);
  url.searchParams.set('embed', '1');

  const example = frame.dataset.playgroundExample;
  const target = frame.dataset.playgroundTarget;
  const tab = frame.dataset.playgroundTab;

  if (example) url.searchParams.set('example', example);
  if (target) url.searchParams.set('target', target);
  if (tab) url.searchParams.set('tab', tab);

  return url.toString();
};

const enhancePlaygroundEmbeds = (root: HTMLElement): void => {
  for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe[data-playground-example]')) {
    frame.src = playgroundEmbedUrl(frame);
  }
};

const renderCurrentDoc = async (): Promise<void> => {
  const bundle = await loadBundle();
  const route = routeFromLocation();
  const slug = route.slug;
  const page = bundle.pages.find(candidate => candidate.slug === slug) ?? bundle.pages.find(candidate => candidate.slug === defaultSlug);
  if (!page) return;

  const root = document.getElementById('docs-root');
  if (root) {
    root.innerHTML = `
      <div class="docs-shell">
        <header class="docs-header">
          <div class="docs-brand">Lumina Docs</div>
          <nav class="docs-top-nav">
            <a class="docs-top-link" href="${homeHref()}">Home</a>
            <a class="docs-top-link" href="${playgroundHref()}">Playground</a>
            <a class="docs-top-link" href="https://github.com/nyigoro/lumina-lang">GitHub</a>
          </nav>
        </header>
        <main class="docs-main">
          <aside class="docs-sidebar">
            <h2 class="docs-sidebar-title">Docs</h2>
            <div class="docs-sidebar-group">${renderSidebar(bundle.index, page.slug)}</div>
          </aside>
          <article class="docs-article">
            <p class="docs-eyebrow">${escapeHtml(page.section)}</p>
            <h1 class="docs-page-title" id="docs-page-title">${escapeHtml(page.title)}</h1>
            <div class="docs-prose" id="docs-content">${page.html}</div>
          </article>
        </main>
      </div>
    `;
    enhancePlaygroundEmbeds(root);
  }

  document.title = `${page.title} | Lumina Docs`;

  if (route.section) {
    window.requestAnimationFrame(() => {
      document.getElementById(route.section!)?.scrollIntoView({ block: 'start' });
    });
  }
};

const listDocPages = async (): Promise<DocsBundle['index']> => {
  const bundle = await loadBundle();
  return bundle.index;
};

const getDocPage = async (slug: string): Promise<DocsPage | undefined> => {
  const bundle = await loadBundle();
  return bundle.pages.find(page => page.slug === slug);
};

(globalThis as Record<string, unknown>).listDocPages = listDocPages;
(globalThis as Record<string, unknown>).getDocPage = getDocPage;

window.addEventListener('load', () => {
  void renderCurrentDoc();
});
window.addEventListener('hashchange', () => {
  void renderCurrentDoc();
});
