import type { Location } from './types';
import type { ParseError } from '../parser/index';
import { highlightSnippet } from './highlight';
import chalk from 'chalk';

// Type guard to safely check if an error is a ParseError
export function isParseError(err: any): err is ParseError {
  return err && 
         typeof err === 'object' && 
         typeof err.error === 'string';
}

// Type guard to check if an error is a Peggy-style error
export function isPeggyError(err: any): boolean {
  return err && 
         typeof err === 'object' && 
         typeof err.message === 'string' &&
         (err.location || err.expected || err.found !== undefined);
}

// Safe wrapper for unknown errors with enhanced Peggy support
export function toParseError(err: any): ParseError {
  // If already a ParseError (type guard)
  if (isParseError(err)) {
    return err;
  }

  // Peggy-style error
  if (isPeggyError(err)) {
    return {
      error: err.message,
      location: isValidLocation(err.location) ? err.location : undefined,
      success: false,
      expected: Array.isArray(err.expected) ? err.expected : [],
      found: typeof err.found === 'string' ? err.found : undefined,
      input: typeof err.input === 'string' ? err.input : undefined,
      snippet: undefined
    };
  }

  // Standard JS Error
  if (err instanceof Error) {
    return {
      error: err.message,
      location: undefined,
      success: false,
      expected: undefined,
      found: undefined,
      input: undefined,
      snippet: undefined
    };
  }

  // Fallback: unknown or malformed
  return {
    error: typeof err === 'string' ? err : 'Unknown error',
    location: undefined,
    success: false,
    expected: undefined,
    found: undefined,
    input: undefined,
    snippet: undefined
  };
}

function isValidLocation(loc: any): loc is Location {
  return (
    loc &&
    typeof loc === 'object' &&
    loc.start && loc.end &&
    typeof loc.start.line === 'number' &&
    typeof loc.start.column === 'number' &&
    typeof loc.start.offset === 'number' &&
    typeof loc.end.line === 'number' &&
    typeof loc.end.column === 'number' &&
    typeof loc.end.offset === 'number'
  );
}
  
export function formatLocation(location: Location): string {
  const { start, end } = location;
  return (start.line === end.line && start.column === end.column)
    ? `Line ${start.line}, Col ${start.column}`
    : `Line ${start.line}, Col ${start.column} → Line ${end.line}, Col ${end.column}`;
}

// Enhanced formatError with better fallback handling
export function formatError(error: ParseError): string {
  const errorMessage = error.error || 'Unknown error';
  const parts: string[] = [`❌ Parse Error: ${errorMessage}`];

  if (error.location) {
    parts.push(`↪ at ${formatLocation(error.location)}`);
  }
  
  if (error.expected && error.expected.length > 0) {
    parts.push(`Expected: ${error.expected.join(', ')}`);
  }
  
  if (error.found !== undefined) {
    parts.push(`Found: "${error.found}"`);
  }
  
  if (error.snippet || (error.input && error.location)) {
    try {
      const snippet = error.snippet || highlightSnippet(error.input!, error.location!, true);
      parts.push('\n--- Snippet ---\n' + snippet);
    } catch (snippetError) {
      // Fallback if snippet generation fails
      parts.push('\n--- Snippet unavailable ---');
    }
  }

  return parts.join('\n');
}

// Enhanced error formatting with chalk colors and better error handling
export function formatErrorWithColors(error: ParseError, useColors: boolean = true): string {
  if (!useColors) {
    return formatError(error);
  }

  const errorMessage = error.error || 'Unknown error';
  const parts: string[] = [
    `${chalk.red('❌ Parse Error:')} ${errorMessage}`
  ];

  if (error.location) {
    parts.push(`${chalk.blue('↪ at')} ${formatLocation(error.location)}`);
  }
  
  if (error.expected && error.expected.length > 0) {
    parts.push(`${chalk.yellow('Expected:')} ${error.expected.join(', ')}`);
  }
  
  if (error.found !== undefined) {
    parts.push(`${chalk.yellow('Found:')} "${error.found}"`);
  }
  
  if (error.snippet || (error.input && error.location)) {
    try {
      const snippet = error.snippet || highlightSnippet(error.input!, error.location!, useColors);
      parts.push('\n' + chalk.dim('--- Snippet ---') + '\n' + snippet);
    } catch (snippetError) {
      // Fallback if snippet generation fails
      parts.push('\n' + chalk.dim('--- Snippet unavailable ---'));
    }
  }

  return parts.join('\n');
}

// Additional utility functions for consistent error styling
export function formatSuccessMessage(message: string): string {
  return chalk.green(`✅ ${message}`);
}

export function formatWarningMessage(message: string): string {
  return chalk.yellow(`⚠️  ${message}`);
}

export function formatInfoMessage(message: string): string {
  return chalk.blue(`ℹ️  ${message}`);
}

// Format multiple errors in a batch
export function formatMultipleErrors(errors: ParseError[], useColors: boolean = true): string {
  if (!errors || errors.length === 0) return '';
  
  const header = useColors 
    ? chalk.red.bold(`Found ${errors.length} error${errors.length > 1 ? 's' : ''}:`)
    : `Found ${errors.length} error${errors.length > 1 ? 's' : ''}:`;

  const formattedErrors = errors.map((error, index) => {
    const errorNum = useColors 
      ? chalk.dim(`[${index + 1}/${errors.length}]`)
      : `[${index + 1}/${errors.length}]`;
    
    return `${errorNum}\n${formatErrorWithColors(error, useColors)}`;
  });

  return [header, ...formattedErrors].join('\n\n');
}

// Safe error formatting that handles any error type
export function formatAnyError(err: any, useColors: boolean = true): string {
  const parseError = toParseError(err);
  return formatErrorWithColors(parseError, useColors);
}

// Safe batch error formatting
export function formatAnyErrors(errors: any[], useColors: boolean = true): string {
  if (!errors || errors.length === 0) return '';
  
  const parseErrors = errors.map(toParseError);
  return formatMultipleErrors(parseErrors, useColors);
}

// Utility for wrapping compilation errors with enhanced context
export function wrapCompilationError(err: any, context: string = 'Grammar compilation'): Error {
  const parseError = toParseError(err);
  const formattedError = formatErrorWithColors(parseError, true);
  return new Error(`${context} failed:\n${formattedError}`);
}

// New utility functions for better error handling

// Check if an error looks like a grammar/syntax error
export function isGrammarError(err: any): boolean {
  if (typeof err === 'object' && err !== null) {
    const message = err.message || err.error || '';
    return typeof message === 'string' && /expected.+found/i.test(message);
  }

  if (err instanceof Error) {
    return /expected.+found/i.test(err.message);
  }

  return false;
}


// Get error suggestions based on error content
export function getErrorSuggestions(error: ParseError): string[] {
  const suggestions: string[] = [];
  const errorMsg = error.error?.toLowerCase() || '';
  
  if (errorMsg.includes('expected') && errorMsg.includes('but')) {
    suggestions.push('Check for missing or incorrect syntax near the error location');
  }
  
  if (errorMsg.includes('rule') || errorMsg.includes('undefined')) {
    suggestions.push('Verify all referenced rules are defined');
  }
  
  if (errorMsg.includes('end of input')) {
    suggestions.push('Check for missing closing brackets, quotes, or semicolons');
  }
  
  if (errorMsg.includes('duplicate')) {
    suggestions.push('Remove duplicate rule definitions');
  }
  
  if (error.expected && error.expected.length > 0) {
    const expectedItems = error.expected.slice(0, 3).join(', ');
    suggestions.push(`Try using one of: ${expectedItems}`);
  }
  
  return suggestions;
}

// Enhanced error formatting with suggestions
export function formatErrorWithSuggestions(error: ParseError, useColors: boolean = true): string {
  const baseFormatted = formatErrorWithColors(error, useColors);
  const suggestions = getErrorSuggestions(error);
  
  if (suggestions.length === 0) {
    return baseFormatted;
  }
  
  const suggestionHeader = useColors 
    ? chalk.cyan('\n💡 Suggestions:')
    : '\n💡 Suggestions:';
  
  const formattedSuggestions = suggestions.map((suggestion, index) => {
    const bullet = useColors ? chalk.dim(`  ${index + 1}.`) : `  ${index + 1}.`;
    return `${bullet} ${suggestion}`;
  }).join('\n');
  
  return `${baseFormatted}${suggestionHeader}\n${formattedSuggestions}`;
}

// Format compilation errors specifically (wrapper for grammar compilation)
export function formatCompilationError(err: any, grammarSource?: string): string {
  const parseError = toParseError(err);
  
  // Add grammar source if available and not already present
  if (grammarSource && !parseError.input) {
    parseError.input = grammarSource;
  }
  
  return formatErrorWithSuggestions(parseError, true);
}

// Utility to extract error context for logging
export function getErrorContext(error: ParseError): {
  message: string;
  location?: string;
  line?: number;
  column?: number;
  expected?: string[];
  found?: string;
} {
  return {
    message: error.error || 'Unknown error',
    location: error.location ? formatLocation(error.location) : undefined,
    line: error.location?.start?.line,
    column: error.location?.start?.column,
    expected: error.expected,
    found: error.found
  };
}

// Debug-friendly error formatter (includes all available information)
export function formatDebugError(err: any): string {
  const parseError = toParseError(err);
  const context = getErrorContext(parseError);
  
  const parts = [
    `🐛 Debug Error Information:`,
    `  Message: ${context.message}`,
    `  Location: ${context.location || 'Unknown'}`,
    `  Expected: ${context.expected?.join(', ') || 'Unknown'}`,
    `  Found: ${context.found || 'Unknown'}`,
    `  Original Error Type: ${err?.constructor?.name || typeof err}`,
    `  Has Location: ${!!parseError.location}`,
    `  Has Input: ${!!parseError.input}`
  ];
  
  if (parseError.input && parseError.location) {
    parts.push(`  Input Length: ${parseError.input.length}`);
    parts.push(`  Error Position: ${parseError.location.start.line}:${parseError.location.start.column}`);
  }
  
  return parts.join('\n');
}