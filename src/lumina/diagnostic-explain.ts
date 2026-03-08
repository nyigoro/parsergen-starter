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
  'LUM-004': {
    code: 'LUM-004',
    title: 'Unreachable match arm',
    summary: 'A pattern can never match because earlier arms or type indices already exclude it.',
    why: 'GADT index refinement and match ordering can make later patterns impossible to reach.',
    howToFix: [
      'Remove the unreachable arm.',
      'Reorder match arms if the current ordering is accidental.',
      'Check index constraints in enum variant result types.',
    ],
  },
  'HKT-001': {
    code: 'HKT-001',
    title: 'Kind mismatch',
    summary: 'A type constructor is used with the wrong constructor kind (arity).',
    why: 'Higher-kinded type parameters require constructors of a specific shape, for example `* -> *`.',
    howToFix: [
      'Match the expected constructor kind in the position where the type is used.',
      'If a constructor is too concrete, use partial application such as `Result<_, E>`.',
      'Apply enough type arguments when a concrete type (`*`) is required.',
    ],
  },
  'MACRO-001': {
    code: 'MACRO-001',
    title: 'Macro parse failure',
    summary: 'A `macro_rules!` declaration could not be parsed into valid pattern/transcriber rules.',
    why: 'Macro rules require balanced delimiters and a valid `pattern => transcriber` structure.',
    howToFix: [
      'Check delimiter pairs in both pattern and transcriber blocks.',
      'Ensure each rule includes `=>` between pattern and transcriber.',
      'Remove malformed tokens and re-run with diagnostics enabled.',
    ],
  },
  'MACRO-002': {
    code: 'MACRO-002',
    title: 'Unsupported macro pattern or transcriber',
    summary: 'The macro invocation matched a rule that uses a pattern/transcriber form not supported yet.',
    why: 'Macro expansion currently supports a bounded matcher/transcriber subset with deterministic lowering.',
    howToFix: [
      'Simplify the macro rule to supported repetition/literal forms.',
      'Split complex rules into smaller helper macros.',
      'Check the detailed unsupported reason attached to this diagnostic.',
    ],
  },
  'MACRO-003': {
    code: 'MACRO-003',
    title: 'Unsupported repetition separator',
    summary: 'The repetition separator token is not supported by the current macro matcher/transcriber.',
    why: 'Only a constrained separator set is supported for deterministic macro argument splitting.',
    howToFix: [
      'Use `,`, `;`, or `=>` as repetition separators.',
      'Avoid separators that require token-level parsing beyond expression boundaries.',
      'Refactor the macro to consume explicit grouped expressions.',
    ],
  },
  'MACRO-004': {
    code: 'MACRO-004',
    title: 'Invalid matcher position',
    summary: 'A non-metavariable token appeared where the matcher requires a metavariable capture.',
    why: 'The matcher expects capture positions to be metavariables so arguments can be bound deterministically.',
    howToFix: [
      'Replace the token at the capture position with a metavariable like `$x:expr`.',
      'Move fixed literal tokens into separator/literal positions between captures.',
      'Check rule structure for accidental token ordering issues.',
    ],
  },
  'MACRO-005': {
    code: 'MACRO-005',
    title: 'Nested repetition depth exceeded',
    summary: 'The macro rule uses nested repetition deeper than the supported depth.',
    why: 'Macro expansion currently supports nested repetition only up to two levels.',
    howToFix: [
      'Reduce repetition nesting depth to at most two levels.',
      'Break deep nested loops into helper macros.',
      'Flatten repeated structures before macro expansion when possible.',
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
  'GADT-006': {
    code: 'GADT-006',
    title: 'Escaped existential type',
    summary: 'A value bound from an existential GADT pattern escapes the scope where it is valid.',
    why: 'Existential type parameters are local witnesses introduced by a specific pattern arm.',
    howToFix: [
      'Consume the existential value inside the same arm.',
      'Return a concrete erased value instead of the existential itself.',
      'Move logic into a trait method constrained by the existential bound.',
    ],
  },
  'GADT-008': {
    code: 'GADT-008',
    title: 'Recursive GADT refinement limit reached',
    summary: 'Pattern refinement stopped because recursive GADT constraints exceeded the refinement safety guard.',
    why: 'Deep or cyclic recursive constraints can otherwise cause non-terminating branch refinement.',
    howToFix: [
      'Break very deep nested patterns into smaller helper matches.',
      'Refactor mutually recursive pattern constraints into explicit intermediate bindings.',
      'Keep recursive constructors but avoid unbounded nested destructuring in a single pattern.',
    ],
  },
  'WASM-GADT-001': {
    code: 'WASM-GADT-001',
    title: 'WASM GADT lowering limit',
    summary: 'The current WASM backend cannot lower this GADT/enum payload form.',
    why: 'WASM codegen supports simple payload constructors/matches, but advanced pattern forms are still restricted.',
    howToFix: [
      'Use the JavaScript backend for complex GADT patterns.',
      'Keep WASM-targeted matches in the simple enum-pattern subset.',
      'Refactor deeply nested/destructuring pattern logic into explicit steps.',
    ],
  },
  'WASM-IS-001': {
    code: 'WASM-IS-001',
    title: '`is` narrowing is not supported in the WASM target',
    summary: 'The `is` operator performs runtime type narrowing, which the WASM backend cannot lower. Use `match` instead.',
    why: 'The WASM backend lowers enum checks to explicit pattern matches. It does not preserve the runtime information needed for `is` narrowing, so `match` is the supported form.',
    howToFix: [
      'Replace `x is Foo` with a match expression.',
      'Before: if x is Foo { ... }',
      'After:  match x { Foo(_) => { ... }, _ => {} }',
      'For boolean checks: match x { Foo(_) => true, _ => false }',
      'If you need `is` narrowing, compile with the JS or ESM target instead of WASM.',
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
