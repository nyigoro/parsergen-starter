import fs from 'node:fs';
import path from 'node:path';

describe('docs content', () => {
  test('docs bundle groups the current corpus into learning categories with a holding bucket', () => {
    const bundle = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../docs-site/public/docs-bundle.json'), 'utf-8')
    ) as {
      index: Array<{ section: string; slug: string; sourcePath: string; title: string }>;
    };

    const sections = new Set(bundle.index.map((page) => page.section));
    for (const section of [
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
    ]) {
      expect(sections.has(section)).toBe(true);
    }

    const bySlug = new Map(bundle.index.map((page) => [page.slug, page]));
    expect(bySlug.get('docs-index')?.section).toBe('Getting Started');
    expect(bySlug.get('getting-started')?.section).toBe('Getting Started');
    expect(bySlug.get('lessons')?.section).toBe('Lessons');
    expect(bySlug.get('lesson-01-basics')?.section).toBe('Lessons');
    expect(bySlug.get('lesson-07-wasm-and-tooling')?.section).toBe('Lessons');
    expect(bySlug.get('error-handling')?.section).toBe('Language');
    expect(bySlug.get('hkts')?.section).toBe('Type System');
    expect(bySlug.get('render')?.section).toBe('Runtime & Rendering');
    expect(bySlug.get('stdlib')?.section).toBe('Stdlib');
    expect(bySlug.get('editor-zed')?.section).toBe('Tooling');
    expect(bySlug.get('large-app-architecture')?.section).toBe('Architecture');
    expect(bySlug.get('web-native-roadmap')?.section).toBe('Roadmaps & Design');
    expect(bySlug.get('why-lumina')?.section).toBe('Community & Project');
    expect(bySlug.get('capabilities')?.section).toBe('Capabilities');
    expect(bySlug.get('known-issues')?.section).toBe('More / Awaiting Categorization');
    expect(bySlug.get('todo')?.section).toBe('More / Awaiting Categorization');

    expect(bundle.index.every((page) => page.slug.length > 0 && page.title.length > 0)).toBe(true);
  });

  test('docs shell keeps sidebar and article scroll regions independent on desktop', () => {
    const styles = fs.readFileSync(path.resolve(__dirname, '../docs-site/src/style.css'), 'utf-8');

    expect(styles).toContain('.docs-shell');
    expect(styles).toContain('.docs-sidebar-category');
    expect(styles).toContain('.docs-next-grid');
    expect(styles).toContain('height: 3rem');
    expect(styles).toContain('min-height: 2.65rem');
    expect(styles).toContain('height: 100dvh');
    expect(styles).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(styles).toMatch(/\.docs-sidebar\s*\{[\s\S]*overflow-y: auto/);
    expect(styles).toMatch(/\.docs-article\s*\{[\s\S]*overflow-y: auto/);
    expect(styles).toMatch(/@media \(max-width: 960px\)[\s\S]*body\s*\{[\s\S]*overflow: auto/);
  });

  test('stdlib docs cover complex-app UI modules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../docs-content/STDLIB.md'), 'utf-8');

    for (const heading of ['@std/resource', '@std/forms', '@std/testing', '@std/devtools', '@std/ui', '@std/ssg']) {
      expect(source).toContain(`## ${heading}`);
    }
    expect(source).toContain('routeModuleLoader');
    expect(source).toContain('routeNodeLayout');
    expect(source).toContain('routeTree');
    expect(source).toContain('virtual:lumina-routes');
    expect(source).toContain('routeBoundary');
    expect(source).toContain('routeLayout');
    expect(source).toContain('routeLinkProps');
    expect(source).toContain('routeRequestPolicy');
    expect(source).toContain('navigateWithTransition');
    expect(source).toContain('invalidateRouteDependency');
    expect(source).toContain('routeDataPolicy');
    expect(source).toContain('createPrefetchResource');
    expect(source).toContain('requestRouteDataPolicy');
    expect(source).toContain('invalidateRequest');
    expect(source).toContain('renderToReadableStream');
    expect(source).toContain('loaderStateOptions');
    expect(source).toContain('uploadFieldProps');
    expect(source).toContain('schemaFieldProps');
    expect(source).toContain('fieldControlProps');
    expect(source).toContain('waitFor');
    expect(source).toContain('waitForIdle');
    expect(source).toContain('actAsync');
    expect(source).toContain('settle');
    expect(source).toContain('inspectHydrationMismatch');
    expect(source).toContain('inspect:*');
    expect(source).toContain('recordRouteTransition');
    expect(source).toContain('routeInspector');
    expect(source).toContain('buttonWithState');
    expect(source).toContain('tokenDeclaration');
    expect(source).toContain('tablePaginationProps');
    expect(source).toContain('hydrationBoundaryOptions');
  });

  test('large-app architecture docs lock route, data, hydration, testing, and UI conventions', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../docs-content/LARGE_APP_ARCHITECTURE.md'),
      'utf-8'
    );

    for (const term of [
      'routeNode',
      'routeTree',
      'routeDataPolicy',
      'routeRequestPolicy',
      'requestRouteDataPolicy',
      'invalidateRequest',
      'submitActionWithRollback',
      'submitActionWithCurrentRollback',
      'fieldControlProps',
      'renderToChunks',
      'loaderStateOptions',
      'deferredHydrationProps',
      'inspectHydrationMismatch',
      'routeInspector',
      'testing.settle',
      'testing.actAsync',
      'tokenContract',
      'tablePaginationProps',
      'tableSortHeader',
      'Folder Convention',
    ]) {
      expect(source).toContain(term);
    }
  });

  test('complex-app roadmap tracks standards-backed phase gates', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../docs-content/COMPLEX_APP_ROADMAP.md'),
      'utf-8'
    );

    for (const term of [
      'Phase 1: Route Ownership',
      'routeBoundary',
      'routeLayout',
      'submitRouteAction',
      'createPrefetchResource',
      'requestRouteDataPolicy',
      'invalidateRequest',
      'renderToReadableStream',
      'Navigation API',
      'URLPattern',
      'View Transition API',
      'WAI-ARIA APG',
      'npm run verify',
    ]) {
      expect(source).toContain(term);
    }
  });
});
