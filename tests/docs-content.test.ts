import fs from 'node:fs';
import path from 'node:path';

describe('docs content', () => {
  test('stdlib docs cover complex-app UI modules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../docs-content/STDLIB.md'), 'utf-8');

    for (const heading of ['@std/resource', '@std/forms', '@std/testing', '@std/devtools', '@std/ui', '@std/ssg']) {
      expect(source).toContain(`## ${heading}`);
    }
    expect(source).toContain('routeModuleLoader');
    expect(source).toContain('invalidateRouteDependency');
    expect(source).toContain('hydrationBoundaryOptions');
  });
});
