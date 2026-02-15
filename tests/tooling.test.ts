import { collectStyleLintIssues, formatLuminaSource, generateLuminaDocsMarkdown } from '../src/lumina/tooling.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

describe('Lumina tooling helpers', () => {
  test('formatLuminaSource trims trailing whitespace and normalizes newline', () => {
    const input = 'fn main() {   \r\n  let x = 1; \r\n\r\n\r\n}\t \r\n';
    const output = formatLuminaSource(input);
    expect(output).toBe('fn main() {\n  let x = 1;\n\n}\n');
  });

  test('collectStyleLintIssues reports common style issues', () => {
    const input = 'let x = 1; \n\tlet y = 2;\n' + 'a'.repeat(121) + '\n';
    const issues = collectStyleLintIssues(input);
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain('LINT-TRAILING-WS');
    expect(codes).toContain('LINT-TAB-INDENT');
    expect(codes).toContain('LINT-LINE-LENGTH');
  });

  test('generateLuminaDocsMarkdown includes public declarations only when requested', () => {
    const program: LuminaProgram = {
      type: 'Program',
      body: [
        {
          type: 'FnDecl',
          name: 'public_fn',
          async: false,
          params: [],
          returnType: 'void',
          body: { type: 'Block', body: [] },
          visibility: 'public',
        },
        {
          type: 'FnDecl',
          name: 'private_fn',
          async: false,
          params: [],
          returnType: 'void',
          body: { type: 'Block', body: [] },
          visibility: 'private',
        },
      ],
    };

    const publicOnly = generateLuminaDocsMarkdown(program, 'sample.lm', { publicOnly: true });
    expect(publicOnly).toContain('public_fn');
    expect(publicOnly).not.toContain('private_fn');

    const all = generateLuminaDocsMarkdown(program, 'sample.lm', { publicOnly: false });
    expect(all).toContain('public_fn');
    expect(all).toContain('private_fn');
  });
});
