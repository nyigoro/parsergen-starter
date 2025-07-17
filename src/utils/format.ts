import type { Location } from './types';
import type { ParseError } from '../parser/index';
import { highlightSnippet } from './highlight';

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
  }

  return parts.join('\n');
}

// Enhanced error formatting with color support
export function formatErrorWithColors(error: ParseError, useColors: boolean = true): string {
  const red = useColors ? '\x1b[31m' : '';
  const yellow = useColors ? '\x1b[33m' : '';
  const blue = useColors ? '\x1b[34m' : '';
  const reset = useColors ? '\x1b[0m' : '';
  
  const parts: string[] = [`${red}❌ Parse Error:${reset} ${error.error}`];

  if (error.location) parts.push(`${blue}↪ at ${formatLocation(error.location)}${reset}`);
  if (error.expected) parts.push(`${yellow}Expected:${reset} ${error.expected.join(', ')}`);
  if (error.found !== undefined) parts.push(`${yellow}Found:${reset} "${error.found}"`);
  if (error.snippet || error.input) {
    const snippet = error.snippet || highlightSnippet(error.input!, error.location!, true);
    parts.push('\n--- Snippet ---\n' + snippet);
  }

  return parts.join('\n');
}