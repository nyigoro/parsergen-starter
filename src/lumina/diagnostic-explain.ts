export interface DiagnosticExplanation {
  code: string;
  title: string;
  summary: string;
  why: string;
  howToFix: string[];
}

const EXPLANATIONS: Record<string, DiagnosticExplanation> = {
  'LUM-001': {
    code: 'LUM-001',
    title: 'Type mismatch',
    summary: 'An expression does not match the type expected by its context.',
    why: 'Lumina uses static typing and rejects operations where input and expected types do not unify.',
    howToFix: [
      'Check both sides of assignments, returns, and function arguments for type compatibility.',
      'Add an explicit conversion using `as` when conversion is intentional.',
      'Adjust function signatures if the expected type is too strict.',
    ],
  },
  'LUM-002': {
    code: 'LUM-002',
    title: 'Arity mismatch',
    summary: 'A function was called with the wrong number of arguments.',
    why: 'Lumina enforces exact arity for function calls.',
    howToFix: [
      'Match the call-site argument count to the function declaration.',
      'If this is a method-call rewrite, ensure the receiver/first parameter is not duplicated.',
    ],
  },
  'LUM-003': {
    code: 'LUM-003',
    title: 'Non-exhaustive match',
    summary: 'A `match` expression does not cover all enum variants.',
    why: 'Pattern matching must be exhaustive for safety and determinism.',
    howToFix: [
      'Add missing variant arms.',
      'Add a wildcard arm `_ => ...` when a catch-all branch is acceptable.',
    ],
  },
  'TYPE-CAST': {
    code: 'TYPE-CAST',
    title: 'Invalid cast',
    summary: 'A cast operation cannot convert between the source and target type.',
    why: 'Only numeric-to-numeric conversions are allowed by the current cast rules.',
    howToFix: [
      'Ensure both source and target are numeric types.',
      'Convert through an intermediate representation if needed.',
    ],
  },
  'LOSSY-CAST': {
    code: 'LOSSY-CAST',
    title: 'Lossy cast warning',
    summary: 'A cast may lose precision or truncate values.',
    why: 'Narrowing integer casts and float-to-int casts can discard information.',
    howToFix: [
      'Use a wider target type where possible.',
      'Add range checks before conversion when correctness depends on bounds.',
    ],
  },
  'MEMBER-NOT-FOUND': {
    code: 'MEMBER-NOT-FOUND',
    title: 'Unknown member access',
    summary: 'A field/method/module member does not exist for the receiver.',
    why: 'Member resolution checks namespaces, struct fields, enum variants, and trait methods in order.',
    howToFix: [
      'Verify the receiver type or namespace import.',
      'Check for typos and use available code actions for suggested replacements.',
    ],
  },
  'AWAIT_OUTSIDE_ASYNC': {
    code: 'AWAIT_OUTSIDE_ASYNC',
    title: 'await used outside async context',
    summary: '`await` is only valid inside `async fn`.',
    why: 'Await requires async control flow transformation.',
    howToFix: [
      'Wrap the containing function with `async`.',
      'Or remove `await` and handle the promise explicitly.',
    ],
  },
  'CONST-SIZE-MISMATCH': {
    code: 'CONST-SIZE-MISMATCH',
    title: 'Const generic size mismatch',
    summary: 'A fixed-size array or const-generic argument does not match expected size.',
    why: 'Const expressions are evaluated and compared as part of type compatibility.',
    howToFix: [
      'Align array literal length with the declared const size.',
      'Verify computed const expressions (for example `R * C`).',
    ],
  },
  'ARRAY-SIZE-MISMATCH': {
    code: 'ARRAY-SIZE-MISMATCH',
    title: 'Array literal length mismatch',
    summary: 'An array literal does not have the expected number of elements.',
    why: 'Fixed-size arrays require exact element count.',
    howToFix: [
      'Add or remove elements to match the declared size.',
      'If dynamic size is intended, use `Vec<T>` instead of fixed-size arrays.',
    ],
  },
  'MISSING_SEMICOLON': {
    code: 'MISSING_SEMICOLON',
    title: 'Missing semicolon',
    summary: 'A statement is missing a terminating semicolon.',
    why: 'Statement termination is required in this context.',
    howToFix: [
      'Insert `;` at the end of the statement.',
      'Use LSP quick fix: "Insert missing semicolon".',
    ],
  },
};

const genericExplanation = (code: string): DiagnosticExplanation => ({
  code,
  title: 'Diagnostic',
  summary: 'No dedicated explanation has been added for this diagnostic code yet.',
  why: 'Diagnostics are versioned and coverage expands over time.',
  howToFix: [
    'Read the primary diagnostic message and related information.',
    'Run with recovery enabled to surface additional errors near the same site.',
    'Report this code to improve explanation coverage.',
  ],
});

export function getDiagnosticExplanation(code?: string | number): DiagnosticExplanation {
  if (code === undefined || code === null) {
    return genericExplanation('UNKNOWN');
  }
  const key = String(code);
  return EXPLANATIONS[key] ?? genericExplanation(key);
}

export function formatDiagnosticExplanation(code?: string | number): string {
  const explanation = getDiagnosticExplanation(code);
  const lines = [
    `${explanation.code}: ${explanation.title}`,
    '',
    explanation.summary,
    '',
    `Why this happens: ${explanation.why}`,
    '',
    'How to fix:',
    ...explanation.howToFix.map((step, index) => `${index + 1}. ${step}`),
  ];
  return lines.join('\n');
}

