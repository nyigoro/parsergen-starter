import { renderHighlightedJavaScript, renderHighlightedWat } from '../playground/src/output-highlighting';

describe('playground output highlighting', () => {
  test('renders generated JavaScript as escaped highlighted HTML', () => {
    const html = renderHighlightedJavaScript('import x from "<tag>";\nconst n = 42; // ok');

    expect(html).toContain('syntax-keyword');
    expect(html).toContain('syntax-string');
    expect(html).toContain('syntax-number');
    expect(html).toContain('syntax-comment');
    expect(html).toContain('&lt;tag&gt;');
    expect(html).not.toContain('"<tag>"');
  });

  test('renders WAT as escaped highlighted HTML', () => {
    const html = renderHighlightedWat('(module\n  (func $main (result i32)\n    i32.const 1))');

    expect(html).toContain('syntax-keyword');
    expect(html).toContain('syntax-variable');
    expect(html).toContain('syntax-type');
    expect(html).toContain('syntax-instruction');
    expect(html).toContain('syntax-number');
  });
});
