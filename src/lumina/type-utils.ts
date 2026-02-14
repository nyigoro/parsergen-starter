/**
 * Normalize type names for display in diagnostics and error messages.
 * Converts internal type representations to user-facing names.
 */
export function normalizeTypeNameForDisplay(typeName: string): string {
  const aliases: Record<string, string> = {
    int: 'i32',
    float: 'f64',
    unit: 'void',
  };

  return aliases[typeName] || typeName;
}

/**
 * Normalize a full type signature for display (and comparison).
 * Handles generic types by replacing aliases in-place.
 */
export function normalizeTypeForDisplay(type: string): string {
  return type
    .replace(/\bint\b/g, 'i32')
    .replace(/\bfloat\b/g, 'f64')
    .replace(/\bunit\b/g, 'void');
}

/**
 * Normalize type strings for equality/comparison checks.
 */
export function normalizeTypeForComparison(type: string): string {
  return normalizeTypeForDisplay(type);
}
