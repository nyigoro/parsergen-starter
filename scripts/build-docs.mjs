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
  'Why Lumina?',
  'JS vs WASM',
  'Capabilities',
  'Stdlib',
  'Web-Native Roadmap',
  'Contributing',
  'Security/Support',
  'More Docs',
];

const docConfig = new Map([
  ['GETTING_STARTED.md', { slug: 'getting-started', section: 'Getting Started' }],
  ['WHY_LUMINA.md', { slug: 'why-lumina', section: 'Why Lumina?' }],
  ['WHEN_TO_USE_JS_VS_WASM.md', { slug: 'js-vs-wasm', section: 'JS vs WASM' }],
  ['CAPABILITIES.md', { slug: 'capabilities', section: 'Capabilities' }],
  ['STDLIB.md', { slug: 'stdlib', section: 'Stdlib' }],
  ['WEB_NATIVE_ROADMAP.md', { slug: 'web-native-roadmap', section: 'Web-Native Roadmap' }],
  ['CONTRIBUTING.md', { slug: 'contributing', section: 'Contributing' }],
  ['SECURITY.md', { slug: 'security', section: 'Security/Support' }],
  ['SUPPORT.md', { slug: 'support', section: 'Security/Support' }],
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
  return index === -1 ? sectionOrder.indexOf('More Docs') : index;
};

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
    const meta = docConfig.get(baseName) ?? { slug: slugify(lookupKey), section: 'More Docs' };
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
