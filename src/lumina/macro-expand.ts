import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaBlock,
  type LuminaFnDecl,
  type LuminaTraitDecl,
  type LuminaImplDecl,
  type LuminaMatchPattern,
  type LuminaMacroRulesDecl,
} from './ast.js';
import { type Diagnostic, type DiagnosticRelatedInformation } from '../parser/index.js';
import { type Location } from '../utils/index.js';

type MacroDelimiter = '[]' | '()' | '{}';
type RepeatOp = '*' | '+' | '?';
type TemplateMode = 'pattern' | 'transcriber';

type MacroTemplateNode =
  | { kind: 'lit'; text: string }
  | { kind: 'var'; name: string; fragment?: string }
  | { kind: 'repeat'; nodes: MacroTemplateNode[]; separator: string; op: RepeatOp };

interface ParsedRule {
  patternDelimiter: MacroDelimiter;
  transcriberDelimiter: MacroDelimiter;
  patternSource: string;
  transcriberSource: string;
  patternNodes: MacroTemplateNode[];
  transcriberNodes: MacroTemplateNode[];
}

interface MacroDef {
  name: string;
  location?: Location;
  rules: ParsedRule[];
}

interface MacroScope {
  parent?: MacroScope;
  macros: Map<string, MacroDef>;
}

interface MacroExpansionOptions {
  maxExpansionDepth?: number;
}

interface MacroExpansionResult {
  program: LuminaProgram;
  diagnostics: Diagnostic[];
}

interface PatternMatchResult {
  matched: boolean;
  unsupported: boolean;
  reason?: string;
  bindings: Map<string, LuminaExpr[]>;
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const openToDelimiter = (open: string): MacroDelimiter | null => {
  if (open === '[') return '[]';
  if (open === '(') return '()';
  if (open === '{') return '{}';
  return null;
};

const delimiterPair = (delimiter: MacroDelimiter): { open: string; close: string } => {
  if (delimiter === '[]') return { open: '[', close: ']' };
  if (delimiter === '()') return { open: '(', close: ')' };
  return { open: '{', close: '}' };
};

const cloneExpr = <T extends LuminaExpr>(expr: T): T => JSON.parse(JSON.stringify(expr)) as T;

const diag = (
  code: string,
  message: string,
  location?: Location,
  relatedInformation?: DiagnosticRelatedInformation[]
): Diagnostic => ({
  severity: 'error',
  code,
  message,
  source: 'lumina',
  location: location ?? defaultLocation,
  relatedInformation,
});

const parseDelimitedGroup = (
  source: string,
  start: number
): { open: string; close: string; content: string; end: number } | null => {
  const opens = new Map<string, string>([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ]);
  const open = source[start];
  const close = opens.get(open);
  if (!close) return null;

  const stack: string[] = [open];
  let cursor = start + 1;
  while (cursor < source.length) {
    const ch = source[cursor];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      cursor += 1;
      while (cursor < source.length) {
        const q = source[cursor];
        if (q === '\\') {
          cursor += 2;
          continue;
        }
        if (q === quote) {
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      continue;
    }

    if (opens.has(ch)) {
      stack.push(ch);
      cursor += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack[stack.length - 1];
      const expected = opens.get(top);
      if (expected === ch) {
        stack.pop();
        if (stack.length === 0) {
          return {
            open,
            close,
            content: source.slice(start + 1, cursor),
            end: cursor,
          };
        }
      }
      cursor += 1;
      continue;
    }
    cursor += 1;
  }
  return null;
};

const parseTemplateNodes = (
  source: string,
  mode: TemplateMode
): { nodes: MacroTemplateNode[]; ok: boolean } => {
  let cursor = 0;
  const len = source.length;

  const parseIdent = (): string | null => {
    const start = cursor;
    if (cursor >= len) return null;
    const first = source[cursor];
    if (!/[A-Za-z_]/.test(first)) return null;
    cursor += 1;
    while (cursor < len && /[A-Za-z0-9_]/.test(source[cursor])) cursor += 1;
    return source.slice(start, cursor);
  };

  const parseNodes = (stopChar?: string): { nodes: MacroTemplateNode[]; ok: boolean } => {
    const out: MacroTemplateNode[] = [];
    let lit = '';
    while (cursor < len) {
      const ch = source[cursor];
      if (stopChar && ch === stopChar) break;
      if (ch !== '$') {
        lit += ch;
        cursor += 1;
        continue;
      }

      if (lit.length > 0) {
        out.push({ kind: 'lit', text: lit });
        lit = '';
      }

      if (source[cursor + 1] === '(') {
        cursor += 2;
        const inner = parseNodes(')');
        if (!inner.ok) return { nodes: out, ok: false };
        if (source[cursor] !== ')') return { nodes: out, ok: false };
        cursor += 1;

        let separator = '';
        while (cursor < len && source[cursor] !== '*' && source[cursor] !== '+' && source[cursor] !== '?') {
          separator += source[cursor];
          cursor += 1;
        }
        const op = source[cursor] as RepeatOp | undefined;
        if (op !== '*' && op !== '+' && op !== '?') {
          return { nodes: out, ok: false };
        }
        cursor += 1;
        out.push({ kind: 'repeat', nodes: inner.nodes, separator: separator.trim(), op });
        continue;
      }

      cursor += 1;
      const name = parseIdent();
      if (!name) return { nodes: out, ok: false };
      let fragment: string | undefined;
      if (mode === 'pattern' && source[cursor] === ':') {
        cursor += 1;
        const frag = parseIdent();
        if (!frag) return { nodes: out, ok: false };
        fragment = frag;
      }
      out.push({ kind: 'var', name, fragment });
    }
    if (lit.length > 0) out.push({ kind: 'lit', text: lit });
    return { nodes: out, ok: true };
  };

  const parsed = parseNodes(undefined);
  return parsed;
};

const parseMacroRules = (decl: LuminaMacroRulesDecl, diagnostics: Diagnostic[]): ParsedRule[] => {
  const body = decl.body ?? '';
  const rules: ParsedRule[] = [];
  let cursor = 0;

  const skipWsAndDelims = () => {
    while (cursor < body.length) {
      const ch = body[cursor];
      if (/\s/.test(ch) || ch === ';' || ch === ',') {
        cursor += 1;
        continue;
      }
      break;
    }
  };

  while (cursor < body.length) {
    skipWsAndDelims();
    if (cursor >= body.length) break;

    const patternGroup = parseDelimitedGroup(body, cursor);
    if (!patternGroup) {
      diagnostics.push(
        diag('MACRO_PARSE', `Failed to parse pattern in macro '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor = patternGroup.end + 1;
    skipWsAndDelims();

    if (body.slice(cursor, cursor + 2) !== '=>') {
      diagnostics.push(
        diag('MACRO_PARSE', `Expected '=>' in macro rule for '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor += 2;
    skipWsAndDelims();

    const transcriberGroup = parseDelimitedGroup(body, cursor);
    if (!transcriberGroup) {
      diagnostics.push(
        diag('MACRO_PARSE', `Failed to parse transcriber in macro '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor = transcriberGroup.end + 1;

    const patternDelimiter = openToDelimiter(patternGroup.open);
    const transcriberDelimiter = openToDelimiter(transcriberGroup.open);
    if (!patternDelimiter || !transcriberDelimiter) {
      diagnostics.push(
        diag('MACRO_PARSE', `Unsupported delimiter in macro '${decl.name}'`, decl.location)
      );
      continue;
    }

    const patternParsed = parseTemplateNodes(patternGroup.content, 'pattern');
    const transcriberParsed = parseTemplateNodes(transcriberGroup.content, 'transcriber');
    if (!patternParsed.ok || !transcriberParsed.ok) {
      diagnostics.push(
        diag('MACRO_PARSE', `Invalid macro template in '${decl.name}'`, decl.location)
      );
      continue;
    }

    rules.push({
      patternDelimiter,
      transcriberDelimiter,
      patternSource: patternGroup.content,
      transcriberSource: transcriberGroup.content,
      patternNodes: patternParsed.nodes,
      transcriberNodes: transcriberParsed.nodes,
    });
  }

  return rules;
};

const scopeDefineMacro = (scope: MacroScope, macro: MacroDef): void => {
  scope.macros.set(macro.name, macro);
};

const scopeLookupMacro = (scope: MacroScope, name: string): MacroDef | null => {
  if (scope.macros.has(name)) return scope.macros.get(name) ?? null;
  if (!scope.parent) return null;
  return scopeLookupMacro(scope.parent, name);
};

const createChildScope = (parent: MacroScope): MacroScope => ({ parent, macros: new Map() });

const cleanTemplateNodes = (nodes: MacroTemplateNode[]): MacroTemplateNode[] =>
  nodes.filter((node) => !(node.kind === 'lit' && node.text.trim() === ''));

const hasNestedRepeat = (nodes: MacroTemplateNode[]): boolean =>
  nodes.some((node) => node.kind === 'repeat' && node.nodes.some((inner) => inner.kind === 'repeat'));

const isCommaLiteral = (node: MacroTemplateNode): boolean =>
  node.kind === 'lit' && node.text.trim() === ',';

const matchRepeatNode = (
  node: Extract<MacroTemplateNode, { kind: 'repeat' }>,
  args: LuminaExpr[]
): PatternMatchResult => {
  const inner = cleanTemplateNodes(node.nodes);
  if (inner.length !== 1 || inner[0].kind !== 'var') {
    return {
      matched: false,
      unsupported: true,
      reason: 'Only $($x:expr),* style repetitions are currently supported in patterns',
      bindings: new Map(),
    };
  }
  if (node.separator && node.separator !== ',') {
    return {
      matched: false,
      unsupported: true,
      reason: `Unsupported repetition separator '${node.separator}'`,
      bindings: new Map(),
    };
  }

  const varName = inner[0].name;
  if (node.op === '+' && args.length === 0) {
    return { matched: false, unsupported: false, bindings: new Map() };
  }
  if (node.op === '?' && args.length > 1) {
    return { matched: false, unsupported: false, bindings: new Map() };
  }

  const out = new Map<string, LuminaExpr[]>();
  out.set(varName, args.map((arg) => cloneExpr(arg)));
  return { matched: true, unsupported: false, bindings: out };
};

const matchPattern = (nodes: MacroTemplateNode[], args: LuminaExpr[]): PatternMatchResult => {
  if (hasNestedRepeat(nodes)) {
    return {
      matched: false,
      unsupported: true,
      reason: 'Nested repetitions are not yet supported',
      bindings: new Map(),
    };
  }

  const cleaned = cleanTemplateNodes(nodes);
  for (const node of cleaned) {
    if (node.kind === 'lit' && !isCommaLiteral(node)) {
      return {
        matched: false,
        unsupported: true,
        reason: `Unsupported literal token '${node.text.trim()}' in macro pattern`,
        bindings: new Map(),
      };
    }
  }

  if (cleaned.length === 0) {
    return { matched: args.length === 0, unsupported: false, bindings: new Map() };
  }

  if (cleaned.length === 1) {
    const single = cleaned[0];
    if (single.kind === 'var') {
      if (args.length !== 1) return { matched: false, unsupported: false, bindings: new Map() };
      const out = new Map<string, LuminaExpr[]>();
      out.set(single.name, [cloneExpr(args[0])]);
      return { matched: true, unsupported: false, bindings: out };
    }
    if (single.kind === 'repeat') {
      return matchRepeatNode(single, args);
    }
  }

  if (cleaned.length % 2 === 0) {
    return {
      matched: false,
      unsupported: true,
      reason: 'Unsupported pattern shape',
      bindings: new Map(),
    };
  }

  const out = new Map<string, LuminaExpr[]>();
  let argIndex = 0;
  for (let idx = 0; idx < cleaned.length; idx += 1) {
    const node = cleaned[idx];
    if (idx % 2 === 0) {
      if (node.kind !== 'var') {
        return {
          matched: false,
          unsupported: true,
          reason: 'Only comma-separated variables are supported in this pattern',
          bindings: new Map(),
        };
      }
      if (argIndex >= args.length) return { matched: false, unsupported: false, bindings: new Map() };
      out.set(node.name, [cloneExpr(args[argIndex])]);
      argIndex += 1;
    } else if (!isCommaLiteral(node)) {
      return {
        matched: false,
        unsupported: true,
        reason: `Expected comma separator, found '${node.kind === 'lit' ? node.text.trim() : node.kind}'`,
        bindings: new Map(),
      };
    }
  }
  if (argIndex !== args.length) return { matched: false, unsupported: false, bindings: new Map() };
  return { matched: true, unsupported: false, bindings: out };
};

const expandTemplateNodesToExprList = (
  nodes: MacroTemplateNode[],
  bindings: Map<string, LuminaExpr[]>
): { ok: boolean; exprs: LuminaExpr[]; reason?: string } => {
  if (hasNestedRepeat(nodes)) {
    return { ok: false, exprs: [], reason: 'Nested repetitions are not yet supported in transcribers' };
  }
  const out: LuminaExpr[] = [];
  for (const node of cleanTemplateNodes(nodes)) {
    if (node.kind === 'lit') {
      const lit = node.text.trim();
      if (lit === '' || lit === ',' || lit === ';') continue;
      return { ok: false, exprs: [], reason: `Unsupported literal token '${lit}' in transcriber` };
    }
    if (node.kind === 'var') {
      const values = bindings.get(node.name);
      if (!values || values.length === 0) {
        return { ok: false, exprs: [], reason: `Unbound metavariable '${node.name}'` };
      }
      for (const value of values) out.push(cloneExpr(value));
      continue;
    }
    const inner = cleanTemplateNodes(node.nodes);
    if (inner.length !== 1 || inner[0].kind !== 'var') {
      return { ok: false, exprs: [], reason: 'Only simple repetition transcribers are supported' };
    }
    if (node.separator && node.separator !== ',') {
      return { ok: false, exprs: [], reason: `Unsupported transcriber separator '${node.separator}'` };
    }
    const values = bindings.get(inner[0].name) ?? [];
    if (node.op === '+' && values.length === 0) {
      return { ok: false, exprs: [], reason: `Metavariable '${inner[0].name}' requires at least one repetition` };
    }
    if (node.op === '?' && values.length > 1) {
      return { ok: false, exprs: [], reason: `Metavariable '${inner[0].name}' expected at most one repetition` };
    }
    for (const value of values) out.push(cloneExpr(value));
  }
  return { ok: true, exprs: out };
};

const tryExpandToScalarExpr = (
  source: string,
  bindings: Map<string, LuminaExpr[]>,
  location?: Location
): LuminaExpr | null => {
  const trimmed = source.trim();
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    const key = trimmed.slice(1);
    const values = bindings.get(key);
    if (!values || values.length !== 1) return null;
    const value = cloneExpr(values[0]);
    value.location = location ?? value.location;
    return value;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return { type: 'Number', value: Number(trimmed), raw: trimmed, isFloat: false, location };
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return { type: 'Boolean', value: trimmed === 'true', location };
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return { type: 'String', value: trimmed.slice(1, -1), location };
  }
  return null;
};

const tryExpandToMacroInvokeExpr = (
  source: string,
  bindings: Map<string, LuminaExpr[]>,
  location?: Location
): LuminaExpr | null => {
  const match = source.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*!\s*(\[|\(|\{)([\s\S]*)(\]|\)|\})$/);
  if (!match) return null;
  const name = match[1];
  const open = match[2];
  const inner = match[3];
  const close = match[4];
  const expectedClose = delimiterPair(openToDelimiter(open) ?? '()').close;
  if (close !== expectedClose) return null;
  const delimiter = openToDelimiter(open);
  if (!delimiter) return null;
  const parsed = parseTemplateNodes(inner, 'transcriber');
  if (!parsed.ok) return null;
  const expanded = expandTemplateNodesToExprList(parsed.nodes, bindings);
  if (!expanded.ok) return null;
  return {
    type: 'MacroInvoke',
    name,
    args: expanded.exprs.map((expr) => cloneExpr(expr)),
    delimiter,
    location,
  };
};

const makeRelatedDef = (macro: MacroDef | null): DiagnosticRelatedInformation[] | undefined => {
  if (!macro?.location) return undefined;
  return [
    {
      location: macro.location,
      message: `Macro '${macro.name}' defined here`,
    },
  ];
};

const applyMacroRule = (
  macro: MacroDef,
  rule: ParsedRule,
  invoke: Extract<LuminaExpr, { type: 'MacroInvoke' }>
): { ok: boolean; expr?: LuminaExpr; unsupportedReason?: string } => {
  const matched = matchPattern(rule.patternNodes, invoke.args);
  if (!matched.matched) {
    if (matched.unsupported) return { ok: false, unsupportedReason: matched.reason };
    return { ok: false };
  }

  const scalar = tryExpandToScalarExpr(rule.transcriberSource, matched.bindings, invoke.location);
  if (scalar) return { ok: true, expr: scalar };

  const recurseCall = tryExpandToMacroInvokeExpr(rule.transcriberSource, matched.bindings, invoke.location);
  if (recurseCall) return { ok: true, expr: recurseCall };

  const transcribed = expandTemplateNodesToExprList(rule.transcriberNodes, matched.bindings);
  if (!transcribed.ok) {
    return { ok: false, unsupportedReason: transcribed.reason };
  }

  const exprs = transcribed.exprs;
  if (rule.transcriberDelimiter === '[]') {
    return { ok: true, expr: { type: 'ArrayLiteral', elements: exprs, location: invoke.location } };
  }
  if (rule.transcriberDelimiter === '()') {
    if (exprs.length === 1) return { ok: true, expr: exprs[0] };
    return { ok: true, expr: { type: 'TupleLiteral', elements: exprs, location: invoke.location } };
  }
  if (exprs.length === 1) return { ok: true, expr: exprs[0] };
  return { ok: true, expr: { type: 'TupleLiteral', elements: exprs, location: invoke.location } };
};

const expandMacroInvoke = (
  invoke: Extract<LuminaExpr, { type: 'MacroInvoke' }>,
  scope: MacroScope,
  diagnostics: Diagnostic[],
  stack: string[],
  maxDepth: number
): LuminaExpr => {
  if (stack.length >= maxDepth) {
    diagnostics.push(
      diag(
        'MACRO_RECURSION_LIMIT',
        `Macro expansion depth exceeded limit (${maxDepth}) while expanding '${invoke.name}!'`,
        invoke.location
      )
    );
    invoke.expansionError = true;
    return invoke;
  }
  if (stack.includes(invoke.name)) {
    diagnostics.push(
      diag('MACRO_CYCLE', `Detected macro expansion cycle for '${invoke.name}!'`, invoke.location)
    );
    invoke.expansionError = true;
    return invoke;
  }

  const macro = scopeLookupMacro(scope, invoke.name);
  if (!macro) {
    if (invoke.name === 'vec') {
      return { type: 'ArrayLiteral', elements: invoke.args.map((arg) => cloneExpr(arg)), location: invoke.location };
    }
    diagnostics.push(diag('MACRO_UNKNOWN', `Unknown macro '${invoke.name}!'`, invoke.location));
    invoke.expansionError = true;
    return invoke;
  }

  const related = makeRelatedDef(macro);
  let unsupportedReason: string | null = null;
  for (const rule of macro.rules) {
    if (rule.patternDelimiter !== invoke.delimiter) continue;
    const applied = applyMacroRule(macro, rule, invoke);
    if (applied.ok && applied.expr) {
      return applied.expr;
    }
    if (applied.unsupportedReason) unsupportedReason = applied.unsupportedReason;
  }

  if (unsupportedReason) {
    diagnostics.push(
      diag(
        'MACRO_UNSUPPORTED_PATTERN',
        `Unsupported macro pattern/transcriber for '${invoke.name}!': ${unsupportedReason}`,
        invoke.location,
        related
      )
    );
  } else {
    diagnostics.push(
      diag(
        'MACRO_NO_MATCH',
        `No macro rule matched invocation '${invoke.name}${invoke.delimiter[0]}...${invoke.delimiter[1]}'`,
        invoke.location,
        related
      )
    );
  }
  invoke.expansionError = true;
  return invoke;
};

const expandPattern = (pattern: LuminaMatchPattern, scope: MacroScope, diagnostics: Diagnostic[], stack: string[], maxDepth: number): LuminaMatchPattern => {
  switch (pattern.type) {
    case 'TuplePattern':
      pattern.elements = pattern.elements.map((element) => expandPattern(element, scope, diagnostics, stack, maxDepth));
      return pattern;
    case 'StructPattern':
      pattern.fields = pattern.fields.map((field) => ({
        ...field,
        pattern: expandPattern(field.pattern, scope, diagnostics, stack, maxDepth),
      }));
      return pattern;
    case 'EnumPattern':
      if (pattern.patterns && pattern.patterns.length > 0) {
        pattern.patterns = pattern.patterns.map((inner) => expandPattern(inner, scope, diagnostics, stack, maxDepth));
      }
      return pattern;
    default:
      return pattern;
  }
};

const expandExpr = (
  expr: LuminaExpr,
  scope: MacroScope,
  diagnostics: Diagnostic[],
  stack: string[],
  maxDepth: number
): LuminaExpr => {
  switch (expr.type) {
    case 'Binary':
      expr.left = expandExpr(expr.left, scope, diagnostics, stack, maxDepth);
      expr.right = expandExpr(expr.right, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'Lambda': {
      const child = createChildScope(scope);
      expr.body = expandBlock(expr.body, child, diagnostics, stack, maxDepth);
      return expr;
    }
    case 'Member':
      expr.object = expandExpr(expr.object, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'Call':
      if (expr.receiver) expr.receiver = expandExpr(expr.receiver, scope, diagnostics, stack, maxDepth);
      expr.args = expr.args.map((arg) => expandExpr(arg, scope, diagnostics, stack, maxDepth));
      return expr;
    case 'Move':
      expr.target = expandExpr(expr.target, scope, diagnostics, stack, maxDepth) as never;
      return expr;
    case 'Await':
      expr.value = expandExpr(expr.value, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'Try':
      expr.value = expandExpr(expr.value, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'Cast':
      expr.expr = expandExpr(expr.expr, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'StructLiteral':
      expr.fields = expr.fields.map((field) => ({
        ...field,
        value: expandExpr(field.value, scope, diagnostics, stack, maxDepth),
      }));
      return expr;
    case 'Range':
      if (expr.start) expr.start = expandExpr(expr.start, scope, diagnostics, stack, maxDepth);
      if (expr.end) expr.end = expandExpr(expr.end, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'ArrayLiteral':
      expr.elements = expr.elements.map((element) => expandExpr(element, scope, diagnostics, stack, maxDepth));
      return expr;
    case 'ArrayRepeatLiteral':
      expr.value = expandExpr(expr.value, scope, diagnostics, stack, maxDepth);
      expr.count = expandExpr(expr.count, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'TupleLiteral':
      expr.elements = expr.elements.map((element) => expandExpr(element, scope, diagnostics, stack, maxDepth));
      return expr;
    case 'Index':
      expr.object = expandExpr(expr.object, scope, diagnostics, stack, maxDepth);
      expr.index = expandExpr(expr.index, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'IsExpr':
      expr.value = expandExpr(expr.value, scope, diagnostics, stack, maxDepth);
      return expr;
    case 'MatchExpr':
      expr.value = expandExpr(expr.value, scope, diagnostics, stack, maxDepth);
      expr.arms = expr.arms.map((arm) => ({
        ...arm,
        pattern: expandPattern(arm.pattern, scope, diagnostics, stack, maxDepth),
        guard: arm.guard ? expandExpr(arm.guard, scope, diagnostics, stack, maxDepth) : arm.guard,
        body: expandExpr(arm.body, scope, diagnostics, stack, maxDepth),
      }));
      return expr;
    case 'SelectExpr':
      expr.arms = expr.arms.map((arm) => ({
        ...arm,
        value: expandExpr(arm.value, scope, diagnostics, stack, maxDepth),
        body: expandExpr(arm.body, scope, diagnostics, stack, maxDepth),
      }));
      return expr;
    case 'MacroInvoke': {
      expr.args = expr.args.map((arg) => expandExpr(arg, scope, diagnostics, stack, maxDepth));
      const expanded = expandMacroInvoke(expr, scope, diagnostics, stack, maxDepth);
      if (expanded === expr) return expr;
      return expandExpr(expanded, scope, diagnostics, [...stack, expr.name], maxDepth);
    }
    default:
      return expr;
  }
};

const expandFnBody = (
  fnDecl: LuminaFnDecl,
  scope: MacroScope,
  diagnostics: Diagnostic[],
  stack: string[],
  maxDepth: number
): LuminaFnDecl => {
  fnDecl.body = expandBlock(fnDecl.body, createChildScope(scope), diagnostics, stack, maxDepth);
  return fnDecl;
};

const expandBlock = (
  block: LuminaBlock,
  scope: MacroScope,
  diagnostics: Diagnostic[],
  stack: string[],
  maxDepth: number
): LuminaBlock => {
  block.body = expandStatements(block.body, scope, diagnostics, stack, maxDepth);
  return block;
};

const expandStatements = (
  statements: LuminaStatement[],
  scope: MacroScope,
  diagnostics: Diagnostic[],
  stack: string[],
  maxDepth: number
): LuminaStatement[] => {
  const out: LuminaStatement[] = [];

  for (const stmt of statements) {
    switch (stmt.type) {
      case 'MacroRulesDecl': {
        const rules = parseMacroRules(stmt, diagnostics);
        scopeDefineMacro(scope, {
          name: stmt.name,
          location: stmt.location,
          rules,
        });
        out.push(stmt);
        break;
      }
      case 'FnDecl':
        out.push(expandFnBody(stmt, scope, diagnostics, stack, maxDepth));
        break;
      case 'TraitDecl': {
        const traitStmt: LuminaTraitDecl = stmt;
        traitStmt.methods = traitStmt.methods.map((method) => {
          if (!method.body) return method;
          const child = createChildScope(scope);
          method.body = expandBlock(method.body, child, diagnostics, stack, maxDepth);
          return method;
        });
        out.push(traitStmt);
        break;
      }
      case 'ImplDecl': {
        const implStmt: LuminaImplDecl = stmt;
        implStmt.methods = implStmt.methods.map((method) => expandFnBody(method, scope, diagnostics, stack, maxDepth));
        out.push(implStmt);
        break;
      }
      case 'Let':
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'LetTuple':
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'LetElse':
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        stmt.elseBlock = expandBlock(stmt.elseBlock, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'Return':
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'If':
        stmt.condition = expandExpr(stmt.condition, scope, diagnostics, stack, maxDepth);
        stmt.thenBlock = expandBlock(stmt.thenBlock, createChildScope(scope), diagnostics, stack, maxDepth);
        if (stmt.elseBlock) stmt.elseBlock = expandBlock(stmt.elseBlock, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'IfLet':
        stmt.pattern = expandPattern(stmt.pattern, scope, diagnostics, stack, maxDepth);
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        stmt.thenBlock = expandBlock(stmt.thenBlock, createChildScope(scope), diagnostics, stack, maxDepth);
        if (stmt.elseBlock) stmt.elseBlock = expandBlock(stmt.elseBlock, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'While':
        stmt.condition = expandExpr(stmt.condition, scope, diagnostics, stack, maxDepth);
        stmt.body = expandBlock(stmt.body, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'WhileLet':
        stmt.pattern = expandPattern(stmt.pattern, scope, diagnostics, stack, maxDepth);
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        stmt.body = expandBlock(stmt.body, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'For':
        stmt.iterable = expandExpr(stmt.iterable, scope, diagnostics, stack, maxDepth);
        stmt.body = expandBlock(stmt.body, createChildScope(scope), diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'Assign':
        stmt.target = expandExpr(stmt.target as LuminaExpr, scope, diagnostics, stack, maxDepth) as never;
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'MatchStmt':
        stmt.value = expandExpr(stmt.value, scope, diagnostics, stack, maxDepth);
        stmt.arms = stmt.arms.map((arm) => ({
          ...arm,
          pattern: expandPattern(arm.pattern, scope, diagnostics, stack, maxDepth),
          guard: arm.guard ? expandExpr(arm.guard, scope, diagnostics, stack, maxDepth) : arm.guard,
          body: expandBlock(arm.body, createChildScope(scope), diagnostics, stack, maxDepth),
        }));
        out.push(stmt);
        break;
      case 'ExprStmt':
        stmt.expr = expandExpr(stmt.expr, scope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      case 'Block': {
        const blockScope = createChildScope(scope);
        stmt.body = expandStatements(stmt.body, blockScope, diagnostics, stack, maxDepth);
        out.push(stmt);
        break;
      }
      default:
        out.push(stmt);
        break;
    }
  }

  return out;
};

export function expandMacrosInProgram(program: LuminaProgram, options: MacroExpansionOptions = {}): MacroExpansionResult {
  const diagnostics: Diagnostic[] = [];
  const maxDepth = Math.max(1, Math.trunc(options.maxExpansionDepth ?? 64));
  const rootScope: MacroScope = { macros: new Map() };
  program.body = expandStatements(program.body, rootScope, diagnostics, [], maxDepth);
  return { program, diagnostics };
}
