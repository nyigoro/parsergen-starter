import type { Location } from './types';
import type { ParseError } from '../parser/index';
import { highlightSnippet } from './highlight';
import * as colors from 'colorette'; // Correctly imported colorette as 'colors'

// Type guard to safely check if an error is a ParseError
export function isParseError(err: unknown): err is ParseError {
    return (
        typeof err === 'object' &&
        err !== null &&
        'error' in err && // Check if 'error' property exists
        typeof (err as Record<string, unknown>).error === 'string' && // Now check its type
        'success' in err &&
        typeof (err as Record<string, unknown>).success === 'boolean'
        // Add other essential ParseError properties if they must exist for it to be a ParseError
    );
}

// Type guard to check if an error is a Peggy-style error
export function isPeggyError(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof (err as Record<string, unknown>).message === 'string' &&
        ('location' in err || 'expected' in err || 'found' in err)
    );
}

// Safe wrapper for unknown errors with enhanced Peggy support
export function toParseError(err: unknown): ParseError {
    // If already a ParseError (type guard)
    if (isParseError(err)) {
        return err;
    }

    // Peggy-style error
    if (isPeggyError(err)) {
        const peggyError = err as Record<string, unknown>;
        return {
            error: peggyError.message as string,
            location: isValidLocation(peggyError.location) ? (peggyError.location as Location) : undefined,
            success: false,
            expected: Array.isArray(peggyError.expected) ? (peggyError.expected as string[]) : undefined,
            found: typeof peggyError.found === 'string' ? (peggyError.found as string) : undefined,
            input: typeof peggyError.input === 'string' ? (peggyError.input as string) : undefined,
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

// CORRECTED isValidLocation FUNCTION
function isValidLocation(loc: unknown): loc is Location {
    if (typeof loc !== 'object' || loc === null) {
        return false;
    }

    const locationObject = loc as Record<string, unknown>; // Assert to a record for property access

    // Check for 'start' and 'end' properties
    if (!('start' in locationObject) || !('end' in locationObject)) {
        return false;
    }

    const start = locationObject.start;
    const end = locationObject.end;

    // Check if 'start' is a non-null object
    if (typeof start !== 'object' || start === null) {
        return false;
    }

    const startObject = start as Record<string, unknown>; // Assert start to a record
    // Check start properties
    if (
        !('line' in startObject) || typeof startObject.line !== 'number' ||
        !('column' in startObject) || typeof startObject.column !== 'number' ||
        !('offset' in startObject) || typeof startObject.offset !== 'number'
    ) {
        return false;
    }

    // Check if 'end' is a non-null object
    if (typeof end !== 'object' || end === null) {
        return false;
    }

    const endObject = end as Record<string, unknown>; // Assert end to a record
    // Check end properties
    if (
        !('line' in endObject) || typeof endObject.line !== 'number' ||
        !('column' in endObject) || typeof endObject.column !== 'number' ||
        !('offset' in endObject) || typeof endObject.offset !== 'number'
    ) {
        return false;
    }

    return true; // All checks passed
}
// END CORRECTED isValidLocation FUNCTION

export function formatLocation(location: Location): string {
    const { start, end } = location;
    return (start.line === end.line && start.column === end.column)
        ? `Line ${start.line}, Col ${start.column}`
        : `Line ${start.line}, Col ${start.column} → Line ${end.line}, Col ${end.column}`;
}

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
        } catch {
            parts.push('\n--- Snippet unavailable ---');
        }
    }

    return parts.join('\n');
}

export function formatErrorWithColors(error: ParseError, useColors: boolean = true): string {
    if (!useColors) {
        return formatError(error);
    }

    const errorMessage = error.error || 'Unknown error';
    const parts: string[] = [
        `${colors.red('❌ Parse Error:')} ${errorMessage}` // FIX: Use colors.red
    ];

    if (error.location) {
        parts.push(`${colors.blue('↪ at')} ${formatLocation(error.location)}`); // FIX: Use colors.blue
    }

    if (error.expected && error.expected.length > 0) {
        parts.push(`${colors.yellow('Expected:')} ${error.expected.join(', ')}`); // FIX: Use colors.yellow
    }

    if (error.found !== undefined) {
        parts.push(`${colors.yellow('Found:')} "${error.found}"`); // FIX: Use colors.yellow
    }

    if (error.snippet || (error.input && error.location)) {
        try {
            const snippet = error.snippet || highlightSnippet(error.input!, error.location!, useColors);
            parts.push('\n' + colors.dim('--- Snippet ---') + '\n' + snippet); // FIX: Use colors.dim
        } catch {
            parts.push('\n' + colors.dim('--- Snippet unavailable ---')); // FIX: Use colors.dim
        }
    }

    return parts.join('\n');
}

export function formatSuccessMessage(message: string): string {
    return colors.green(`✅ ${message}`); // FIX: Use colors.green
}

export function formatWarningMessage(message: string): string {
    return colors.yellow(`⚠️  ${message}`); // FIX: Use colors.yellow
}

export function formatInfoMessage(message: string): string {
    return colors.blue(`ℹ️  ${message}`); // FIX: Use colors.blue
}

export function formatMultipleErrors(errors: ParseError[], useColors: boolean = true): string {
    if (!errors || errors.length === 0) return '';

    const header = useColors
        ? colors.red(colors.bold(`Found ${errors.length} error${errors.length > 1 ? 's' : ''}:`)) // FIX: Nest colors.red and colors.bold
        : `Found ${errors.length} error${errors.length > 1 ? 's' : ''}:`;

    const formattedErrors = errors.map((error, index) => {
        const errorNum = useColors
            ? colors.dim(`[${index + 1}/${errors.length}]`) // FIX: Use colors.dim
            : `[${index + 1}/${errors.length}]`;

        return `${errorNum}\n${formatErrorWithColors(error, useColors)}`;
    });

    return [header, ...formattedErrors].join('\n\n');
}

export function formatAnyError(err: unknown, useColors: boolean = true): string {
    const parseError = toParseError(err);
    return formatErrorWithColors(parseError, useColors);
}

export function formatAnyErrors(errors: unknown[], useColors: boolean = true): string {
    if (!errors || errors.length === 0) return '';

    const parseErrors = errors.map(toParseError);
    return formatMultipleErrors(parseErrors, useColors);
}

export function wrapCompilationError(err: unknown, context: string = 'Grammar compilation'): Error {
    const parseError = toParseError(err);
    const formattedError = formatErrorWithColors(parseError, true);
    return new Error(`${context} failed:\n${formattedError}`);
}

export function isGrammarError(err: unknown): boolean {
    if (typeof err === 'object' && err !== null) {
        const message = ('message' in err && typeof (err as Record<string, unknown>).message === 'string')
            ? (err as Record<string, unknown>).message
            : ('error' in err && typeof (err as Record<string, unknown>).error === 'string'
                ? (err as Record<string, unknown>).error
                : '');
        return typeof message === 'string' && /expected.+found/i.test(message);
    }

    if (err instanceof Error) {
        return /expected.+found/i.test(err.message);
    }

    return false;
}

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

export function formatErrorWithSuggestions(error: ParseError, useColors: boolean = true): string {
    const baseFormatted = formatErrorWithColors(error, useColors);
    const suggestions = getErrorSuggestions(error);

    if (suggestions.length === 0) {
        return baseFormatted;
    }

    const suggestionHeader = useColors
        ? colors.cyan('\n💡 Suggestions:') // FIX: Use colors.cyan
        : '\n💡 Suggestions:';

    const formattedSuggestions = suggestions.map((suggestion, index) => {
        const bullet = useColors ? colors.dim(`  ${index + 1}.`) : `  ${index + 1}.`; // FIX: Use colors.dim
        return `${bullet} ${suggestion}`;
    }).join('\n');

    return `${baseFormatted}${suggestionHeader}\n${formattedSuggestions}`;
}

export function formatCompilationError(err: unknown, grammarSource?: string): string {
    const parseError = toParseError(err);

    if (grammarSource && !parseError.input) {
        parseError.input = grammarSource;
    }

    return formatErrorWithSuggestions(parseError, true);
}

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

export function formatDebugError(err: unknown): string {
    const parseError = toParseError(err);
    const context = getErrorContext(parseError);

    const parts = [
        `🐛 Debug Error Information:`,
        `  Message: ${context.message}`,
        `  Location: ${context.location || 'Unknown'}`,
        `  Expected: ${context.expected?.join(', ') || 'Unknown'}`,
        `  Found: ${context.found || 'Unknown'}`,
        `  Original Error Type: ${
            typeof err === 'object' && err !== null && 'constructor' in err
                ? (err as { constructor: { name: string } }).constructor.name
                : typeof err
        }`,
        `  Has Location: ${!!parseError.location}`,
        `  Has Input: ${!!parseError.input}`
    ];

    if (parseError.input && parseError.location) {
        parts.push(`  Input Length: ${parseError.input.length}`);
        parts.push(`  Error Position: ${parseError.location.start.line}:${parseError.location.start.column}`);
    }

    return parts.join('\n');
}