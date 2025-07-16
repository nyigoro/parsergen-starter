import type { Location } from './types.js';
import type { ParseError } from '../parser/index.js';
import { highlightSnippet } from './highlight.js';

export function formatLocation(location: Location): string {
  const { start, end } = location;
  return (start.line === end.line && start.column === end.column)
    ? `Line ${start.line}, Col ${start.column}`
    : `Line ${start.line}, Col ${start.column} → Line ${end.line}, Col ${end.column}`;
}

export function formatError(error: ParseError): string {
  const parts: string[] = [`❌ Parse Error: ${error.error}`];

  if (error.location) parts.push(`↪ at ${formatLocation(error.location)}`);
  if (error.expected) parts.push(`Expected: ${error.expected.join(', ')}`);
  if (error.found !== undefined) parts.push(`Found: "${error.found}"`);
  if (error.snippet || error.input) {
    const snippet = error.snippet || highlightSnippet(error.input!, error.location!, true);
    parts.push('\n--- Snippet ---\n' + snippet);
  };

  return parts.join('\n');
}
