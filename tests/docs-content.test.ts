import fs from 'node:fs';
import path from 'node:path';

describe('docs content', () => {
  test('stdlib docs cover complex-app UI modules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../docs-content/STDLIB.md'), 'utf-8');

    for (const heading of ['@std/resource', '@std/forms', '@std/testing', '@std/devtools', '@std/ui', '@std/ssg']) {
      expect(source).toContain(`## ${heading}`);
    }
    expect(source).toContain('routeModuleLoader');
    expect(source).toContain('routeNodeLayout');
    expect(source).toContain('routeTree');
    expect(source).toContain('navigateWithTransition');
    expect(source).toContain('invalidateRouteDependency');
    expect(source).toContain('routeDataPolicy');
    expect(source).toContain('renderToReadableStream');
    expect(source).toContain('waitFor');
    expect(source).toContain('inspectHydrationMismatch');
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
      'submitActionWithRollback',
      'renderToChunks',
      'deferredHydrationProps',
      'inspectHydrationMismatch',
      'testing.waitFor',
      'tokenContract',
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
      'submitRouteAction',
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
