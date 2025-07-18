import type { Location } from './types';
import * as colors from 'colorette'; // Use colorette

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
    ? prefix + colors.red(targetLine) // Using colors.red (colorette's default red is bright)
    : prefix + targetLine;

  const pointerStr = useColor
    ? colors.yellow(pointerLine)
    : pointerLine;

  const resultLines = [];

  if (lineNum > 1) resultLines.push(`${lineNum - 1}: ${lines[lineNum - 2]}`);
  resultLines.push(lineStr);
  resultLines.push(pointerStr);
  if (lineNum < lines.length) resultLines.push(`${lineNum + 1}: ${lines[lineNum]}`);

  return resultLines.join('\n');
}

/**
 * Enhanced snippet highlighting with range support and more context
 */
export function highlightSnippetAdvanced(
  input: string,
  location: Location,
  options: {
    useColor?: boolean;
    contextLines?: number;
    showLineNumbers?: boolean;
    highlightRange?: boolean;
    maxLineLength?: number;
  } = {}
): string {
  const {
    useColor = true,
    contextLines = 1,
    showLineNumbers = true,
    highlightRange = true,
    maxLineLength = 120
  } = options;

  const lines = input.split('\n');
  const startLine = location.start.line;
  const endLine = location.end.line;
  const startCol = location.start.column;
  const endCol = location.end.column;

  if (startLine < 1 || startLine > lines.length) return '';

  const firstLine = Math.max(1, startLine - contextLines);
  const lastLine = Math.min(lines.length, endLine + contextLines);

  const resultLines: string[] = [];
  const maxLineNumWidth = lastLine.toString().length;

  for (let i = firstLine; i <= lastLine; i++) {
    const line = lines[i - 1];
    const truncatedLine = line.length > maxLineLength
      ? line.substring(0, maxLineLength) + '...'
      : line;

    const lineNumStr = showLineNumbers
      ? `${i.toString().padStart(maxLineNumWidth)}: `
      : '';

    let displayLine = truncatedLine;

    // Highlight the error range
    if (highlightRange && i >= startLine && i <= endLine) {
      if (useColor) {
        if (i === startLine && i === endLine) {
          // Single line highlight
          const before = displayLine.substring(0, startCol - 1);
          const highlight = displayLine.substring(startCol - 1, endCol - 1);
          const after = displayLine.substring(endCol - 1);
          displayLine = before + colors.bgRed(highlight) + after;
        } else if (i === startLine) {
          // First line of multi-line highlight
          const before = displayLine.substring(0, startCol - 1);
          const highlight = displayLine.substring(startCol - 1);
          displayLine = before + colors.bgRed(highlight);
        } else if (i === endLine) {
          // Last line of multi-line highlight
          const highlight = displayLine.substring(0, endCol - 1);
          const after = displayLine.substring(endCol - 1);
          displayLine = colors.bgRed(highlight) + after;
        } else {
          // Middle lines of multi-line highlight
          displayLine = colors.bgRed(displayLine);
        }
      }
    }

    const fullLine = useColor && (i >= startLine && i <= endLine)
      ? lineNumStr + displayLine
      : lineNumStr + displayLine;

    resultLines.push(fullLine);

    // Add pointer line for single-line errors
    if (i === startLine && startLine === endLine && highlightRange) {
      const pointerStart = lineNumStr.length + startCol - 1;
      const pointerLength = Math.max(1, endCol - startCol);
      const pointer = ' '.repeat(pointerStart) + '^'.repeat(pointerLength);

      resultLines.push(useColor ? colors.yellow(pointer) : pointer);
    }
  }

  return resultLines.join('\n');
}

/**
 * Highlight multiple locations in the same input
 */
export function highlightMultipleLocations(
  input: string,
  locations: Array<{ location: Location; label?: string; color?: string }>,
  options: {
    useColor?: boolean;
    contextLines?: number;
    showLineNumbers?: boolean;
  } = {}
): string {
  const { useColor = true, contextLines = 1, showLineNumbers = true } = options;

  const lines = input.split('\n');
  const colorNames = ['red', 'blue', 'green', 'yellow', 'magenta', 'cyan'] as const;

  type ColoretteStyleName = typeof colorNames[number];

  const sortedLocations = [...locations].sort((a, b) =>
    a.location.start.line - b.location.start.line
  );

  const firstLine = Math.max(1,
    Math.min(...sortedLocations.map(l => l.location.start.line)) - contextLines
  );
  const lastLine = Math.min(lines.length,
    Math.max(...sortedLocations.map(l => l.location.end.line)) + contextLines
  );

  const resultLines: string[] = [];
  const maxLineNumWidth = lastLine.toString().length;

  for (let i = firstLine; i <= lastLine; i++) {
    const line = lines[i - 1];
    const lineNumStr = showLineNumbers
      ? `${i.toString().padStart(maxLineNumWidth)}: `
      : '';

    let displayLine = line;

    const lineLocations = sortedLocations.filter(l =>
      l.location.start.line <= i && l.location.end.line >= i
    );

    if (useColor && lineLocations.length > 0) {
      lineLocations.sort((a, b) => a.location.start.column - b.location.start.column);

      let offset = 0;
      for (const [index, { location, color }] of lineLocations.entries()) {
        const colorName = (color || colorNames[index % colorNames.length]) as ColoretteStyleName;
        // Ensure colorFn is a function that takes a string and returns a string
        const colorFn: (text: string) => string = colors[colorName] || colors.red;

        const startCol = i === location.start.line ? location.start.column - 1 : 0;
        const endCol = i === location.end.line ? location.end.column - 1 : line.length;

        const before = displayLine.substring(0, startCol + offset);
        const highlight = displayLine.substring(startCol + offset, endCol + offset);
        const after = displayLine.substring(endCol + offset);

        // FIX: Apply underline as a separate function call to the result of the color function
        displayLine = before + colors.underline(colorFn(highlight)) + after;
        // FIX: Calculate offset using colors.underline directly
        offset += colors.underline('').length;
      }
    }

    resultLines.push(lineNumStr + displayLine);

    for (const [index, { location, label }] of lineLocations.entries()) {
      if (i === location.start.line && location.start.line === location.end.line) {
        const colorName = colorNames[index % colorNames.length] as ColoretteStyleName;
        const colorFn: ((text: string) => string) | null = useColor ? (colors[colorName] || colors.red) : null;

        const pointerStart = lineNumStr.length + location.start.column - 1;
        const pointerLength = Math.max(1, location.end.column - location.start.column);
        const pointer = ' '.repeat(pointerStart) + '^'.repeat(pointerLength);
        const labelStr = label ? ` ${label}` : '';

        const pointerLine = colorFn
          ? colorFn(pointer + labelStr) // Call the color function directly
          : pointer + labelStr;

        resultLines.push(pointerLine);
      }
    }
  }

  return resultLines.join('\n');
}

/**
 * Simple function to create a snippet without full location data
 */
export function createSnippet(
  input: string,
  line: number,
  column: number,
  useColor = true
): string {
  const location = {
    start: { line, column, offset: 0 },
    end: { line, column, offset: 0 }
  };
  return highlightSnippet(input, location, useColor);
}

/**
 * Get line and column information for a given offset
 */
export function getLocationFromOffset(input: string, offset: number): {
  line: number;
  column: number;
  offset: number;
} {
  const lines = input.substring(0, offset).split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return { line, column, offset };
}

/**
 * Get offset from line and column
 */
export function getOffsetFromLocation(input: string, line: number, column: number): number {
  const lines = input.split('\n');

  if (line < 1 || line > lines.length) return -1;
  if (column < 1 || column > lines[line - 1].length + 1) return -1;

  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  offset += column - 1;

  return offset;
}