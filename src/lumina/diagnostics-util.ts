import { type Diagnostic } from '../parser/index.js';
import { type Location } from '../utils/index.js';

export interface DiagnosticNormalized {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  sourceFile: string;
  context?: string;
}

const fallbackLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

export function normalizeDiagnostic(
  d: Diagnostic,
  sourceText: string,
  sourceFile: string = 'inline'
): DiagnosticNormalized {
  const location = d.location ?? fallbackLocation;
  const lines = sourceText.split('\n');
  const start = location.start;
  const end = location.end;
  const lineIdx = Math.max(0, start.line - 1);
  const targetLine = lines[lineIdx] ?? '';
  const indent = ' '.repeat(Math.max(0, start.column - 1));
  const pointerWidth = end.line === start.line
    ? Math.max(1, end.column - start.column)
    : 1;
  const context = [
    `${String(start.line).padStart(3)} | ${targetLine}`,
    `    | ${indent}${'^'.repeat(pointerWidth)}`,
  ].join('\n');

  return {
    code: d.code ?? 'LUM-000',
    severity: (d.severity ?? 'error') as DiagnosticNormalized['severity'],
    message: d.message,
    range: {
      start: { line: start.line, column: start.column },
      end: { line: end.line, column: end.column },
    },
    sourceFile,
    context,
  };
}
