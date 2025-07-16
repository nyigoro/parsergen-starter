import type { Location } from './types.js';
import chalk from 'chalk';

/**
 * Highlight the source input with a caret (^) and optional colorization
 */
export function highlightSnippet(input: string, location: Location, useColor = true): string {
  const lines = input.split('\n');
  const lineNum = location.start.line;
  const colNum = location.start.column;

  if (lineNum < 1 || lineNum > lines.length) return '';

  const targetLine = lines[lineNum - 1];

  const prefix = `${lineNum}: `;
  const pointerLine = ' '.repeat(prefix.length + colNum - 1) + '^';

  const lineStr = useColor
    ? prefix + chalk.redBright(targetLine)
    : prefix + targetLine;

  const pointerStr = useColor
    ? chalk.yellow(pointerLine)
    : pointerLine;

  const resultLines = [];

  if (lineNum > 1) resultLines.push(`${lineNum - 1}: ${lines[lineNum - 2]}`);
  resultLines.push(lineStr);
  resultLines.push(pointerStr);
  if (lineNum < lines.length) resultLines.push(`${lineNum + 1}: ${lines[lineNum]}`);

  return resultLines.join('\n');
}
