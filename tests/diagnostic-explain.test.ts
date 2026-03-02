import { formatDiagnosticExplanation, getDiagnosticExplanation } from '../src/lumina/diagnostic-explain.js';

describe('diagnostic explanations', () => {
  test('returns specific explanation for known code', () => {
    const info = getDiagnosticExplanation('LUM-001');
    expect(info.code).toBe('LUM-001');
    expect(info.title.length).toBeGreaterThan(0);
    expect(info.howToFix.length).toBeGreaterThan(0);
  });

  test('returns generic explanation for unknown code', () => {
    const info = getDiagnosticExplanation('NON-EXISTENT');
    expect(info.code).toBe('NON-EXISTENT');
    expect(info.summary).toContain('No dedicated explanation');
  });

  test('formats explanation for CLI output', () => {
    const output = formatDiagnosticExplanation('LUM-002');
    expect(output).toContain('LUM-002');
    expect(output).toContain('How to fix:');
  });

  test('includes HKT kind-mismatch explanation', () => {
    const info = getDiagnosticExplanation('HKT-001');
    expect(info.code).toBe('HKT-001');
    expect(info.summary).toContain('kind');
  });
});
