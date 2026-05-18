import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { createHighlighter } from 'shiki';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(repoRoot, 'docs-content');
const outputPath = path.join(repoRoot, 'docs-site', 'public', 'docs-bundle.json');
const siteContentOutputPath = path.join(repoRoot, 'demo', 'public', 'site-content.json');
const luminaGrammarPath = path.join(repoRoot, 'vscode-extension', 'syntaxes', 'lumina.tmLanguage.json');
const homeSamplePath = path.join(repoRoot, 'demo', 'content', 'home-sample.lm');
const shikiTheme = 'github-dark';
const bundledLanguages = new Set([
  'bash',
  'json',
  'lua',
  'plaintext',
  'powershell',
  'rust',
  'toml',
  'ts',
  'yaml',
]);

const sectionOrder = [
  'Getting Started',
  'Lessons',
  'Language',
  'Type System',
  'Runtime & Rendering',
  'Stdlib',
  'Tooling',
  'Architecture',
  'Roadmaps & Design',
  'Community & Project',
  'Capabilities',
  'More / Awaiting Categorization',
];

const docConfig = new Map([
  ['README.md', { slug: 'docs-index', section: 'Getting Started' }],
  ['GETTING_STARTED.md', { slug: 'getting-started', section: 'Getting Started' }],
  ['LEARNING_PATH.md', { slug: 'learning-path', section: 'Getting Started' }],

  ['lessons/README.md', { slug: 'lessons', section: 'Lessons' }],
  ['lessons/01-basics.md', { slug: 'lesson-01-basics', section: 'Lessons' }],
  ['lessons/02-types-and-collections.md', { slug: 'lesson-02-types-and-collections', section: 'Lessons' }],
  ['lessons/03-control-flow-and-patterns.md', { slug: 'lesson-03-control-flow-and-patterns', section: 'Lessons' }],
  ['lessons/04-errors-and-result.md', { slug: 'lesson-04-errors-and-result', section: 'Lessons' }],
  ['lessons/05-traits-and-generics.md', { slug: 'lesson-05-traits-and-generics', section: 'Lessons' }],
  ['lessons/06-concurrency-and-async.md', { slug: 'lesson-06-concurrency-and-async', section: 'Lessons' }],
  ['lessons/07-wasm-and-tooling.md', { slug: 'lesson-07-wasm-and-tooling', section: 'Lessons' }],

  ['USING_LUMINA.md', { slug: 'using-lumina', section: 'Language' }],
  ['ERROR_HANDLING.md', { slug: 'error-handling', section: 'Language' }],
  ['ASYNC.md', { slug: 'async', section: 'Language' }],
  ['NUMERIC_TYPES.md', { slug: 'numeric-types', section: 'Language' }],
  ['MIGRATION_FROM_TS_JS.md', { slug: 'migration-from-ts-js', section: 'Language' }],

  ['GADTS.md', { slug: 'gadts', section: 'Type System' }],
  ['HKTS.md', { slug: 'hkts', section: 'Type System' }],
  ['CONST_GENERICS.md', { slug: 'const-generics', section: 'Type System' }],
  ['MONOMORPHIZATION.md', { slug: 'monomorphization', section: 'Type System' }],
  ['FUNCTOR.md', { slug: 'functor', section: 'Type System' }],
  ['APPLICATIVE.md', { slug: 'applicative', section: 'Type System' }],
  ['MONAD.md', { slug: 'monad', section: 'Type System' }],

  ['RENDER.md', { slug: 'render', section: 'Runtime & Rendering' }],
  ['UI_FRAMEWORK.md', { slug: 'ui-framework', section: 'Runtime & Rendering' }],
  ['RUNTIME_ARCHITECTURE.md', { slug: 'runtime-architecture', section: 'Runtime & Rendering' }],
  ['WEBGPU_TESTING.md', { slug: 'webgpu-testing', section: 'Runtime & Rendering' }],

  ['STDLIB.md', { slug: 'stdlib', section: 'Stdlib' }],
  ['STDLIB_PHASE1.md', { slug: 'stdlib-phase1', section: 'Stdlib' }],

  ['PACKAGE_USAGE.md', { slug: 'package-usage', section: 'Tooling' }],
  ['PACKAGE_MANAGEMENT_PHASE1.md', { slug: 'package-management-phase1', section: 'Tooling' }],
  ['editor-integration/OVERVIEW.md', { slug: 'editor-integration', section: 'Tooling' }],
  ['editor-integration/PROTOCOL.md', { slug: 'editor-protocol', section: 'Tooling' }],
  ['editor-integration/HELIX.md', { slug: 'editor-helix', section: 'Tooling' }],
  ['editor-integration/NEOVIM.md', { slug: 'editor-neovim', section: 'Tooling' }],
  ['editor-integration/ZED.md', { slug: 'editor-zed', section: 'Tooling' }],

  ['LARGE_APP_ARCHITECTURE.md', { slug: 'large-app-architecture', section: 'Architecture' }],
  ['COMPLEX_APP_ROADMAP.md', { slug: 'complex-app-roadmap', section: 'Architecture' }],
  ['BENCHMARK_ARCHITECTURE.md', { slug: 'benchmark-architecture', section: 'Architecture' }],

  ['WHEN_TO_USE_JS_VS_WASM.md', { slug: 'js-vs-wasm', section: 'Roadmaps & Design' }],
  ['WEB_NATIVE_ROADMAP.md', { slug: 'web-native-roadmap', section: 'Roadmaps & Design' }],
  ['MILESTONES.md', { slug: 'milestones', section: 'Roadmaps & Design' }],
  ['STABILITY.md', { slug: 'stability', section: 'Roadmaps & Design' }],

  ['WHY_LUMINA.md', { slug: 'why-lumina', section: 'Community & Project' }],
  ['ECOSYSTEM.md', { slug: 'ecosystem', section: 'Community & Project' }],
  ['CONTACT.md', { slug: 'contact', section: 'Community & Project' }],
  ['DISCORD_RULES.md', { slug: 'discord-rules', section: 'Community & Project' }],
  ['DISCORD_SERVER_SETUP.md', { slug: 'discord-server-setup', section: 'Community & Project' }],
  ['DOCS_MAINTENANCE.md', { slug: 'docs-maintenance', section: 'Community & Project' }],
  ['RELEASE_NOTES_v0.3.0.md', { slug: 'release-notes-v0-3-0', section: 'Community & Project' }],
  ['RELEASE_NOTES_v0.5.1.md', { slug: 'release-notes-v0-5-1', section: 'Community & Project' }],
  ['CONTRIBUTING.md', { slug: 'contributing', section: 'Community & Project' }],
  ['SECURITY.md', { slug: 'security', section: 'Community & Project' }],
  ['SUPPORT.md', { slug: 'support', section: 'Community & Project' }],

  ['CAPABILITIES.md', { slug: 'capabilities', section: 'Capabilities' }],

  ['KNOWN_ISSUES.md', { slug: 'known-issues', section: 'More / Awaiting Categorization' }],
  ['TODO.md', { slug: 'todo', section: 'More / Awaiting Categorization' }],
]);

let highlighterPromise;

const slugify = value =>
  value
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');

const collectMarkdownFiles = async directory => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
};

const readDocFiles = async () => {
  const docsFiles = await collectMarkdownFiles(docsDir);
  const rootFiles = ['CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md'].map(file => path.join(repoRoot, file));
  return [...docsFiles, ...rootFiles];
};

const extractTitle = (source, fallback) => {
  const match = source.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? fallback;
};

const slugifyHeading = value =>
  value
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&#39;/g, '')
    .replace(/&quot;/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const addHeadingIds = html => {
  const seen = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, inner) => {
    const baseId = slugifyHeading(inner) || 'section';
    const nextCount = seen.get(baseId) ?? 0;
    seen.set(baseId, nextCount + 1);
    const id = nextCount === 0 ? baseId : `${baseId}-${nextCount}`;
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
};

const buildDocRouteHref = (slug, section) => {
  if (!section) return `#/${slug}`;
  return `#/${slug}?section=${encodeURIComponent(section)}`;
};

const resolveDocHref = (currentLookupKey, href, slugByLookupKey) => {
  if (/^(?:[a-z]+:|\/)/i.test(href)) return href;

  if (href.startsWith('#/')) return href;

  if (href.startsWith('#')) {
    const currentSlug = slugByLookupKey.get(currentLookupKey);
    const section = href.slice(1).trim();
    return currentSlug ? buildDocRouteHref(currentSlug, section) : href;
  }

  const [rawTarget, rawSection] = href.split('#');
  if (!rawTarget) return href;

  const currentDir = currentLookupKey.includes('/') ? path.posix.dirname(currentLookupKey) : '.';
  const candidate = currentDir === '.'
    ? path.posix.normalize(rawTarget)
    : path.posix.normalize(path.posix.join(currentDir, rawTarget));
  const candidateKeys = [candidate];

  if (candidate.toLowerCase().endsWith('.md')) {
    // already covered
  } else {
    candidateKeys.push(`${candidate}.md`);
    candidateKeys.push(path.posix.join(candidate, 'README.md'));
  }

  const slug = candidateKeys.map(key => slugByLookupKey.get(key)).find(Boolean);
  return slug ? buildDocRouteHref(slug, rawSection?.trim()) : href;
};

const rewriteDocLinks = (html, currentLookupKey, slugByLookupKey) =>
  html.replace(/href="([^"]+)"/g, (match, href) => {
    const nextHref = resolveDocHref(currentLookupKey, href, slugByLookupKey);
    return `href="${nextHref}"`;
  });

const sectionRank = section => {
  const index = sectionOrder.indexOf(section);
  return index === -1 ? sectionOrder.indexOf('More / Awaiting Categorization') : index;
};

const fallbackDocMeta = lookupKey => ({
  slug: slugify(lookupKey),
  section: 'More / Awaiting Categorization',
});

const getDocMeta = (lookupKey, baseName) =>
  docConfig.get(lookupKey) ?? docConfig.get(baseName) ?? fallbackDocMeta(lookupKey);

const normalizeCodeLanguage = lang => {
  const raw = String(lang ?? '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();

  if (!raw) return 'plaintext';
  if (raw === 'lumina' || raw === 'lm' || raw === 'lum') return 'lumina';
  if (raw === 'sh' || raw === 'shell' || raw === 'zsh') return 'bash';
  if (raw === 'yml') return 'yaml';
  if (raw === 'text' || raw === 'txt' || raw === 'plain') return 'plaintext';
  return bundledLanguages.has(raw) ? raw : 'plaintext';
};

const getHighlighter = async () => {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const luminaGrammar = JSON.parse(await fs.readFile(luminaGrammarPath, 'utf8'));
      return createHighlighter({
        themes: [shikiTheme],
        langs: [
          ...bundledLanguages,
          {
            ...luminaGrammar,
            name: 'lumina',
            aliases: ['lm', 'lum'],
          },
        ],
      });
    })();
  }

  return highlighterPromise;
};

const highlightCodeBlock = async (code, lang) => {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: normalizeCodeLanguage(lang),
    theme: shikiTheme,
  });
};

const replaceCodeTokens = async node => {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      node[index] = await replaceCodeTokens(node[index]);
    }
    return node;
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  if (node.type === 'code') {
    const html = await highlightCodeBlock(node.text ?? '', node.lang ?? '');
    return {
      type: 'html',
      block: true,
      raw: html,
      text: html,
    };
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value) || (value && typeof value === 'object')) {
      node[key] = await replaceCodeTokens(value);
    }
  }

  return node;
};

const renderMarkdown = async (source, currentLookupKey, slugByLookupKey) => {
  const tokens = marked.lexer(source);
  await replaceCodeTokens(tokens);
  const html = marked.parser(tokens);
  return rewriteDocLinks(addHeadingIds(html), currentLookupKey, slugByLookupKey);
};

const buildManifest = async () => {
  const files = await readDocFiles();
  const entries = [];

  for (const file of files) {
    const source = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
    const isDocsContentFile = file.startsWith(docsDir);
    const relativePath = isDocsContentFile ? path.relative(docsDir, file) : path.basename(file);
    const lookupKey = relativePath.replace(/\\/g, '/');
    const baseName = path.basename(file);
    const meta = getDocMeta(lookupKey, baseName);
    const sourcePath = isDocsContentFile ? `docs-content/${lookupKey}` : path.relative(repoRoot, file).replace(/\\/g, '/');
    entries.push({
      lookupKey,
      slug: meta.slug,
      section: meta.section,
      sourcePath,
      title: extractTitle(source, baseName.replace(/_/g, ' ').replace(/\.md$/i, '')),
      source,
    });
  }

  const slugByLookupKey = new Map(entries.map(entry => [entry.lookupKey, entry.slug]));
  const pages = await Promise.all(
    entries.map(async ({ lookupKey, source, ...entry }) => ({
      ...entry,
      html: await renderMarkdown(source, lookupKey, slugByLookupKey),
    }))
  );

  pages.sort((left, right) => {
    const bySection = sectionRank(left.section) - sectionRank(right.section);
    if (bySection !== 0) return bySection;
    return left.title.localeCompare(right.title);
  });

  return {
    pages,
    index: pages.map(({ slug, title, section, sourcePath }) => ({ slug, title, section, sourcePath })),
  };
};

const buildSiteContent = async () => {
  const homeCodeSample = await fs.readFile(homeSamplePath, 'utf8');
  const homeCodeSampleHtml = await highlightCodeBlock(homeCodeSample, 'lumina');

  return {
    homeCodeSampleHtml,
  };
};

const main = async () => {
  const [manifest, siteContent] = await Promise.all([buildManifest(), buildSiteContent()]);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(siteContentOutputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(siteContentOutputPath, `${JSON.stringify(siteContent, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, outputPath)} with ${manifest.pages.length} pages`);
  console.log(`Wrote ${path.relative(repoRoot, siteContentOutputPath)} with highlighted site samples`);
};

await main();
