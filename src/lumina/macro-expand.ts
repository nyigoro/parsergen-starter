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
  unsupportedCode?: string;
  bindings: Map<string, LuminaExpr[] | LuminaExpr[][]>;
}

type MacroBindingValue = LuminaExpr[] | LuminaExpr[][];
type MacroBindings = Map<string, MacroBindingValue>;

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const MACRO_PARSE_CODE = 'MACRO-001';
const MACRO_UNSUPPORTED_CODE = 'MACRO-002';
const MACRO_SEPARATOR_CODE = 'MACRO-003';
const MACRO_PATTERN_POSITION_CODE = 'MACRO-004';
const MACRO_NESTED_REPEAT_CODE = 'MACRO-005';

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
        diag(MACRO_PARSE_CODE, `Failed to parse pattern in macro '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor = patternGroup.end + 1;
    skipWsAndDelims();

    if (body.slice(cursor, cursor + 2) !== '=>') {
      diagnostics.push(
        diag(MACRO_PARSE_CODE, `Expected '=>' in macro rule for '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor += 2;
    skipWsAndDelims();

    const transcriberGroup = parseDelimitedGroup(body, cursor);
    if (!transcriberGroup) {
      diagnostics.push(
        diag(MACRO_PARSE_CODE, `Failed to parse transcriber in macro '${decl.name}'`, decl.location)
      );
      break;
    }
    cursor = transcriberGroup.end + 1;

    const patternDelimiter = openToDelimiter(patternGroup.open);
    const transcriberDelimiter = openToDelimiter(transcriberGroup.open);
    if (!patternDelimiter || !transcriberDelimiter) {
      diagnostics.push(
        diag(MACRO_PARSE_CODE, `Unsupported delimiter in macro '${decl.name}'`, decl.location)
      );
      continue;
    }

    const patternParsed = parseTemplateNodes(patternGroup.content, 'pattern');
    const transcriberParsed = parseTemplateNodes(transcriberGroup.content, 'transcriber');
    if (!patternParsed.ok || !transcriberParsed.ok) {
      diagnostics.push(
        diag(MACRO_PARSE_CODE, `Invalid macro template in '${decl.name}'`, decl.location)
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

const normalizeLiteralToken = (value: string): string => value.trim();

const normalizeInvokeSeparators = (args: LuminaExpr[], separators?: string[]): string[] => {
  if (args.length <= 1) return [];
  const normalized = (separators ?? []).map((sep) => normalizeLiteralToken(sep));
  if (normalized.length === args.length - 1) return normalized;
  return Array.from({ length: Math.max(0, args.length - 1) }, () => ',');
};

const isRepeatSeparatorSupported = (separator: string): boolean => {
  const normalized = normalizeLiteralToken(separator);
  return normalized === '' || normalized === ',' || normalized === ';' || normalized === '=>';
};

const isPassthroughLiteral = (literal: string): boolean => normalizeLiteralToken(literal) !== '';

const isNestedBindingValue = (value: MacroBindingValue): value is LuminaExpr[][] =>
  value.length > 0 && Array.isArray(value[0]);

const cloneFlatBinding = (value: LuminaExpr[]): LuminaExpr[] => value.map((item) => cloneExpr(item));

const maxRepeatDepth = (nodes: MacroTemplateNode[]): number => {
  let depth = 0;
  for (const node of nodes) {
    if (node.kind === 'repeat') {
      depth = Math.max(depth, 1 + maxRepeatDepth(node.nodes));
    }
  }
  return depth;
};

const toBindingMap = (flatBindings: Map<string, LuminaExpr[]>): MacroBindings => {
  const out: MacroBindings = new Map();
  for (const [name, values] of flatBindings) out.set(name, cloneFlatBinding(values));
  return out;
};

const appendFlatBindingValue = (out: Map<string, LuminaExpr[]>, name: string, value: LuminaExpr) => {
  const current = out.get(name) ?? [];
  current.push(cloneExpr(value));
  out.set(name, current);
};

const mergeFlatBindings = (target: Map<string, LuminaExpr[]>, source: Map<string, LuminaExpr[]>) => {
  for (const [name, values] of source) {
    const current = target.get(name) ?? [];
    current.push(...cloneFlatBinding(values));
    target.set(name, current);
  }
};

const matchFlatSequence = (
  nodes: MacroTemplateNode[],
  args: LuminaExpr[],
  separators: string[],
  startArg: number,
  startSep: number
): {
  ok: boolean;
  consumedArgs: number;
  consumedSeps: number;
  captures: Map<string, LuminaExpr[]>;
  unsupportedReason?: string;
  unsupportedCode?: string;
} => {
  let argIndex = startArg;
  let sepIndex = startSep;
  const captures = new Map<string, LuminaExpr[]>();
  for (const node of cleanTemplateNodes(nodes)) {
    if (node.kind === 'var') {
      if (argIndex >= args.length) {
        return { ok: false, consumedArgs: 0, consumedSeps: 0, captures };
      }
      appendFlatBindingValue(captures, node.name, args[argIndex]);
      argIndex += 1;
      continue;
    }
    if (node.kind === 'repeat') {
      return {
        ok: false,
        consumedArgs: 0,
        consumedSeps: 0,
        captures,
        unsupportedReason: 'Nested repeat patterns require a dedicated repetition context',
        unsupportedCode: MACRO_NESTED_REPEAT_CODE,
      };
    }
    const expected = normalizeLiteralToken(node.text);
    if (expected === '') continue;
    if (sepIndex >= separators.length) {
      return { ok: false, consumedArgs: 0, consumedSeps: 0, captures };
    }
    if (normalizeLiteralToken(separators[sepIndex] ?? '') !== expected) {
      return { ok: false, consumedArgs: 0, consumedSeps: 0, captures };
    }
    sepIndex += 1;
  }
  return {
    ok: true,
    consumedArgs: argIndex - startArg,
    consumedSeps: sepIndex - startSep,
    captures,
  };
};

const matchNestedRepeatNode = (
  node: Extract<MacroTemplateNode, { kind: 'repeat' }>,
  args: LuminaExpr[],
  separators: string[]
): PatternMatchResult => {
  const outerSep = normalizeLiteralToken(node.separator);
  if (!isRepeatSeparatorSupported(outerSep)) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_SEPARATOR_CODE,
      reason: `Unsupported repetition separator '${outerSep}'`,
      bindings: new Map(),
    };
  }

  const outerInner = cleanTemplateNodes(node.nodes);
  if (outerInner.length !== 1 || outerInner[0].kind !== 'repeat') {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_NESTED_REPEAT_CODE,
      reason: 'Nested repetitions currently support one inner repeat group per outer iteration',
      bindings: new Map(),
    };
  }

  const innerRepeat = outerInner[0];
  if (maxRepeatDepth(innerRepeat.nodes) > 0) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_NESTED_REPEAT_CODE,
      reason: 'Nested repetition depth greater than 2 is not supported',
      bindings: new Map(),
    };
  }

  const rows: Array<{ args: LuminaExpr[]; separators: string[] }> = [];
  if (args.length > 0) {
    let currentArgs: LuminaExpr[] = [args[0]];
    let currentSeps: string[] = [];
    for (let idx = 0; idx < separators.length; idx += 1) {
      const sep = normalizeLiteralToken(separators[idx] ?? '');
      const nextArg = args[idx + 1];
      if (sep === outerSep && outerSep !== '') {
        rows.push({ args: currentArgs, separators: currentSeps });
        currentArgs = [nextArg];
        currentSeps = [];
        continue;
      }
      currentSeps.push(sep);
      currentArgs.push(nextArg);
    }
    rows.push({ args: currentArgs, separators: currentSeps });
  }

  if (node.op === '+' && rows.length === 0) {
    return { matched: false, unsupported: false, bindings: new Map() };
  }
  if (node.op === '?' && rows.length > 1) {
    return { matched: false, unsupported: false, bindings: new Map() };
  }

  const nestedBindings: MacroBindings = new Map();
  for (const row of rows) {
    const rowMatch = matchFlatRepeatNode(innerRepeat, row.args, row.separators);
    if (!rowMatch.matched) {
      if (rowMatch.unsupported) return rowMatch;
      return { matched: false, unsupported: false, bindings: new Map() };
    }
    for (const [name, values] of rowMatch.bindings) {
      if (isNestedBindingValue(values)) {
        return {
          matched: false,
          unsupported: true,
          unsupportedCode: MACRO_NESTED_REPEAT_CODE,
          reason: `Nested binding rank for '${name}' exceeds supported depth`,
          bindings: new Map(),
        };
      }
      const existing = nestedBindings.get(name);
      if (!existing) {
        nestedBindings.set(name, [cloneFlatBinding(values)]);
        continue;
      }
      if (!isNestedBindingValue(existing)) {
        return {
          matched: false,
          unsupported: true,
          unsupportedCode: MACRO_NESTED_REPEAT_CODE,
          reason: `Metavariable '${name}' bound with incompatible repetition ranks`,
          bindings: new Map(),
        };
      }
      existing.push(cloneFlatBinding(values));
      nestedBindings.set(name, existing);
    }
  }

  return { matched: true, unsupported: false, bindings: nestedBindings };
};

const matchFlatRepeatNode = (
  node: Extract<MacroTemplateNode, { kind: 'repeat' }>,
  args: LuminaExpr[],
  separators: string[]
): PatternMatchResult => {
  const inner = cleanTemplateNodes(node.nodes);
  const repeatSeparator = normalizeLiteralToken(node.separator);
  if (!isRepeatSeparatorSupported(repeatSeparator)) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_SEPARATOR_CODE,
      reason: `Unsupported repetition separator '${repeatSeparator}'`,
      bindings: new Map(),
    };
  }
  if (inner.length === 0) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_UNSUPPORTED_CODE,
      reason: 'Empty repetition body is not supported',
      bindings: new Map(),
    };
  }

  let cursorArg = 0;
  let cursorSep = 0;
  let iterations = 0;
  const captures = new Map<string, LuminaExpr[]>();
  while (cursorArg < args.length) {
    if (iterations > 0 && repeatSeparator !== '') {
      const actualSep = normalizeLiteralToken(separators[cursorSep] ?? '');
      if (actualSep !== repeatSeparator) break;
      cursorSep += 1;
    }

    const attempt = matchFlatSequence(inner, args, separators, cursorArg, cursorSep);
    if (!attempt.ok) {
      if (attempt.unsupportedReason) {
        return {
          matched: false,
          unsupported: true,
          unsupportedCode: attempt.unsupportedCode ?? MACRO_UNSUPPORTED_CODE,
          reason: attempt.unsupportedReason,
          bindings: new Map(),
        };
      }
      if (iterations > 0 && repeatSeparator !== '') {
        return { matched: false, unsupported: false, bindings: new Map() };
      }
      break;
    }
    if (attempt.consumedArgs === 0 && attempt.consumedSeps === 0) break;
    mergeFlatBindings(captures, attempt.captures);
    cursorArg += attempt.consumedArgs;
    cursorSep += attempt.consumedSeps;
    iterations += 1;
    if (node.op === '?') break;
  }

  if (node.op === '+' && iterations === 0) return { matched: false, unsupported: false, bindings: new Map() };
  if (node.op === '?' && iterations > 1) return { matched: false, unsupported: false, bindings: new Map() };
  if (cursorArg !== args.length || cursorSep !== separators.length) return { matched: false, unsupported: false, bindings: new Map() };
  return { matched: true, unsupported: false, bindings: toBindingMap(captures) };
};

const matchPattern = (nodes: MacroTemplateNode[], args: LuminaExpr[], separators: string[]): PatternMatchResult => {
  const cleaned = cleanTemplateNodes(nodes);
  const repeatDepth = maxRepeatDepth(cleaned);
  if (repeatDepth > 2) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: MACRO_NESTED_REPEAT_CODE,
      reason: 'Nested repetition depth greater than 2 is not supported',
      bindings: new Map(),
    };
  }

  if (cleaned.length === 0) {
    return { matched: args.length === 0, unsupported: false, bindings: new Map() };
  }

  if (cleaned.length === 1) {
    const single = cleaned[0];
    if (single.kind === 'var') {
      if (args.length !== 1) return { matched: false, unsupported: false, bindings: new Map() };
      const out: MacroBindings = new Map();
      out.set(single.name, [cloneExpr(args[0])]);
      return { matched: true, unsupported: false, bindings: out };
    }
    if (single.kind === 'repeat') {
      if (maxRepeatDepth(single.nodes) > 0) return matchNestedRepeatNode(single, args, separators);
      return matchFlatRepeatNode(single, args, separators);
    }
  }

  if (cleaned.length % 2 === 0) {
    throw new Error('[internal] MACRO: even-length pattern nodes — parser invariant violated');
  }

  for (let idx = 0; idx < cleaned.length; idx += 2) {
    const node = cleaned[idx];
    if (node.kind !== 'var') {
      return {
        matched: false,
        unsupported: true,
        unsupportedCode: MACRO_PATTERN_POSITION_CODE,
        reason: 'Expected a metavariable in pattern position',
        bindings: new Map(),
      };
    }
  }

  const attempt = matchFlatSequence(cleaned, args, separators, 0, 0);
  if (attempt.unsupportedReason) {
    return {
      matched: false,
      unsupported: true,
      unsupportedCode: attempt.unsupportedCode ?? MACRO_UNSUPPORTED_CODE,
      reason: attempt.unsupportedReason,
      bindings: new Map(),
    };
  }
  if (!attempt.ok) return { matched: false, unsupported: false, bindings: new Map() };
  if (attempt.consumedArgs !== args.length || attempt.consumedSeps !== separators.length) {
    return { matched: false, unsupported: false, bindings: new Map() };
  }
  return { matched: true, unsupported: false, bindings: toBindingMap(attempt.captures) };
};

const getFlatBinding = (bindings: MacroBindings, name: string): LuminaExpr[] | null => {
  const value = bindings.get(name);
  if (!value) return null;
  if (isNestedBindingValue(value)) return null;
  return value;
};

const getNestedBinding = (bindings: MacroBindings, name: string): LuminaExpr[][] | null => {
  const value = bindings.get(name);
  if (!value) return null;
  if (!isNestedBindingValue(value)) return null;
  return value;
};

const flattenBindingValue = (value: MacroBindingValue): LuminaExpr[] =>
  isNestedBindingValue(value) ? value.flatMap((row) => row.map((item) => cloneExpr(item))) : cloneFlatBinding(value);

const expandTemplateNodesToExprList = (
  nodes: MacroTemplateNode[],
  bindings: MacroBindings,
  depth = 1
): { ok: boolean; exprs: LuminaExpr[]; reason?: string; unsupportedCode?: string } => {
  if (maxRepeatDepth(nodes) > 2 || depth > 2) {
    return {
      ok: false,
      exprs: [],
      reason: 'Nested repetition depth greater than 2 is not supported in transcribers',
      unsupportedCode: MACRO_NESTED_REPEAT_CODE,
    };
  }
  const out: LuminaExpr[] = [];
  for (const node of cleanTemplateNodes(nodes)) {
    if (node.kind === 'lit') {
      const lit = normalizeLiteralToken(node.text);
      if (!lit) continue;
      if (isPassthroughLiteral(lit)) continue;
      return {
        ok: false,
        exprs: [],
        reason: `Unsupported literal token '${lit}' in transcriber`,
        unsupportedCode: MACRO_UNSUPPORTED_CODE,
      };
    }
    if (node.kind === 'var') {
      const values = bindings.get(node.name);
      if (!values) {
        return {
          ok: false,
          exprs: [],
          reason: `Unbound metavariable '${node.name}'`,
          unsupportedCode: MACRO_UNSUPPORTED_CODE,
        };
      }
      out.push(...flattenBindingValue(values));
      continue;
    }

    const separator = normalizeLiteralToken(node.separator);
    if (!isRepeatSeparatorSupported(separator)) {
      return {
        ok: false,
        exprs: [],
        reason: `Unsupported transcriber separator '${separator}'`,
        unsupportedCode: MACRO_SEPARATOR_CODE,
      };
    }

    const inner = cleanTemplateNodes(node.nodes);
    if (inner.length === 0) continue;
    const nestedNode = inner.find((entry) => entry.kind === 'repeat');
    if (nestedNode) {
      if (depth >= 2) {
        return {
          ok: false,
          exprs: [],
          reason: 'Nested repetition depth greater than 2 is not supported in transcribers',
          unsupportedCode: MACRO_NESTED_REPEAT_CODE,
        };
      }

      const nestedVarNames = Array.from(
        new Set(
          inner.flatMap((entry) => {
            if (entry.kind === 'var') return [entry.name];
            if (entry.kind === 'repeat') {
              return cleanTemplateNodes(entry.nodes)
                .filter((child): child is Extract<MacroTemplateNode, { kind: 'var' }> => child.kind === 'var')
                .map((child) => child.name);
            }
            return [];
          })
        )
      );
      const rowCount = nestedVarNames.reduce<number>((count, name) => {
        const nested = getNestedBinding(bindings, name);
        if (!nested) return count;
        return count === 0 ? nested.length : Math.min(count, nested.length);
      }, 0);

      if (node.op === '+' && rowCount === 0) {
        return {
          ok: false,
          exprs: [],
          reason: 'Nested repetition requires at least one row',
          unsupportedCode: MACRO_NESTED_REPEAT_CODE,
        };
      }
      if (node.op === '?' && rowCount > 1) {
        return {
          ok: false,
          exprs: [],
          reason: 'Nested optional repetition expected at most one row',
          unsupportedCode: MACRO_NESTED_REPEAT_CODE,
        };
      }

      const maxRows = node.op === '?' ? Math.min(rowCount, 1) : rowCount;
      for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
        const rowBindings: MacroBindings = new Map(bindings);
        for (const [name, value] of bindings) {
          if (!isNestedBindingValue(value)) continue;
          const row = value[rowIndex] ?? [];
          rowBindings.set(name, cloneFlatBinding(row));
        }
        const rowResult = expandTemplateNodesToExprList(inner, rowBindings, depth + 1);
        if (!rowResult.ok) return rowResult;
        out.push(...rowResult.exprs.map((expr) => cloneExpr(expr)));
      }
      continue;
    }

    const varNames = Array.from(
      new Set(
        inner
          .filter((entry): entry is Extract<MacroTemplateNode, { kind: 'var' }> => entry.kind === 'var')
          .map((entry) => entry.name)
      )
    );
    const iterationCount = varNames.reduce<number>((count, name) => {
      const values = getFlatBinding(bindings, name) ?? [];
      return count === 0 ? values.length : Math.min(count, values.length);
    }, 0);

    if (node.op === '+' && iterationCount === 0) {
      return {
        ok: false,
        exprs: [],
        reason: `Repetition requires at least one value`,
        unsupportedCode: MACRO_UNSUPPORTED_CODE,
      };
    }
    if (node.op === '?' && iterationCount > 1) {
      return {
        ok: false,
        exprs: [],
        reason: `Optional repetition expected at most one value`,
        unsupportedCode: MACRO_UNSUPPORTED_CODE,
      };
    }

    const maxIterations = node.op === '?' ? Math.min(iterationCount, 1) : iterationCount;
    for (let iterationIndex = 0; iterationIndex < maxIterations; iterationIndex += 1) {
      for (const innerNode of inner) {
        if (innerNode.kind === 'lit') {
          const literal = normalizeLiteralToken(innerNode.text);
          if (!literal) continue;
          if (isPassthroughLiteral(literal)) continue;
          return {
            ok: false,
            exprs: [],
            reason: `Unsupported literal token '${literal}' in transcriber`,
            unsupportedCode: MACRO_UNSUPPORTED_CODE,
          };
        }
        if (innerNode.kind === 'repeat') {
          return {
            ok: false,
            exprs: [],
            reason: 'Nested repetition requires dedicated nested context',
            unsupportedCode: MACRO_NESTED_REPEAT_CODE,
          };
        }
        const values = getFlatBinding(bindings, innerNode.name) ?? [];
        if (iterationIndex >= values.length) continue;
        out.push(cloneExpr(values[iterationIndex]));
      }
    }
  }
  return { ok: true, exprs: out };
};

const tryExpandToScalarExpr = (
  source: string,
  bindings: MacroBindings,
  location?: Location
): LuminaExpr | null => {
  const trimmed = source.trim();
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    const key = trimmed.slice(1);
    const values = getFlatBinding(bindings, key);
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
  bindings: MacroBindings,
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
    separators: [],
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
  _macro: MacroDef,
  rule: ParsedRule,
  invoke: Extract<LuminaExpr, { type: 'MacroInvoke' }>
): { ok: boolean; expr?: LuminaExpr; unsupportedReason?: string; unsupportedCode?: string } => {
  const invokeSeparators = normalizeInvokeSeparators(invoke.args ?? [], invoke.separators);
  const matched = matchPattern(rule.patternNodes, invoke.args, invokeSeparators);
  if (!matched.matched) {
    if (matched.unsupported) {
      return {
        ok: false,
        unsupportedReason: matched.reason,
        unsupportedCode: matched.unsupportedCode,
      };
    }
    return { ok: false };
  }

  const scalar = tryExpandToScalarExpr(rule.transcriberSource, matched.bindings, invoke.location);
  if (scalar) return { ok: true, expr: scalar };

  const recurseCall = tryExpandToMacroInvokeExpr(rule.transcriberSource, matched.bindings, invoke.location);
  if (recurseCall) return { ok: true, expr: recurseCall };

  const transcribed = expandTemplateNodesToExprList(rule.transcriberNodes, matched.bindings);
  if (!transcribed.ok) {
    return {
      ok: false,
      unsupportedReason: transcribed.reason,
      unsupportedCode: transcribed.unsupportedCode,
    };
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
  let unsupportedCode: string | null = null;
  for (const rule of macro.rules) {
    if (rule.patternDelimiter !== invoke.delimiter) continue;
    const applied = applyMacroRule(macro, rule, invoke);
    if (applied.ok && applied.expr) {
      return applied.expr;
    }
    if (applied.unsupportedReason) {
      unsupportedReason = applied.unsupportedReason;
      unsupportedCode = applied.unsupportedCode ?? MACRO_UNSUPPORTED_CODE;
    }
  }

  if (unsupportedReason) {
    diagnostics.push(
      diag(
        unsupportedCode ?? MACRO_UNSUPPORTED_CODE,
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
      expr.args = expr.args.map((arg) => ({
        ...arg,
        value: expandExpr(arg.value, scope, diagnostics, stack, maxDepth),
      }));
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
    case 'ListComprehension': {
      const comp = expr as unknown as {
        body: LuminaExpr;
        source: LuminaExpr;
        filter: LuminaExpr | null;
        source2?: LuminaExpr;
      };
      comp.source = expandExpr(comp.source, scope, diagnostics, stack, maxDepth);
      if (comp.source2) comp.source2 = expandExpr(comp.source2, scope, diagnostics, stack, maxDepth);
      if (comp.filter) comp.filter = expandExpr(comp.filter, scope, diagnostics, stack, maxDepth);
      comp.body = expandExpr(comp.body, scope, diagnostics, stack, maxDepth);
      return expr;
    }
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
