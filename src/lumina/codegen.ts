import { type IRNode } from './ir.js';
import { SourceMapGenerator, type RawSourceMap } from 'source-map';

export interface CodegenResult {
  code: string;
  map?: RawSourceMap;
}

export interface CodegenOptions {
  target?: 'esm' | 'cjs';
  includeRuntime?: boolean;
  sourceMap?: boolean;
  sourceFile?: string;
  sourceContent?: string;
}

export function generateJS(ir: IRNode, options: CodegenOptions = {}): CodegenResult {
  const target = options.target ?? 'esm';
  const includeRuntime = options.includeRuntime !== false;
  const builder = new CodeBuilder(options.sourceMap === true);
  const tryFunctions = collectTryFunctions(ir);
  const usesTry = tryFunctions.size > 0;

  if (includeRuntime) {
    if (target === 'cjs') {
      builder.append(
        `const { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic } = require("./lumina-runtime.cjs");`,
        'Runtime'
      );
      builder.append('\n');
    } else {
      builder.append(
        `import { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic } from "./lumina-runtime.js";`,
        'Runtime'
      );
      builder.append('\n');
    }
  } else {
    builder.append(
      `const io = { println: (...args) => console.log(...args), print: (...args) => console.log(...args), eprint: (...args) => console.error(...args), eprintln: (...args) => console.error(...args) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `const str = { length: (value) => value.length, concat: (a, b) => a + b, split: (value, sep) => value.split(sep), trim: (value) => value.trim(), contains: (haystack, needle) => haystack.includes(needle) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `const math = { abs: (value) => Math.trunc(Math.abs(value)), min: (a, b) => Math.trunc(Math.min(a, b)), max: (a, b) => Math.trunc(Math.max(a, b)), absf: (value) => Math.abs(value), minf: (a, b) => Math.min(a, b), maxf: (a, b) => Math.max(a, b), sqrt: (value) => Math.sqrt(value), pow: (base, exp) => Math.pow(base, exp), floor: (value) => Math.floor(value), ceil: (value) => Math.ceil(value), round: (value) => Math.round(value), pi: Math.PI, e: Math.E };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `const fs = { readFile: async () => ({ $tag: "Err", $payload: "No fs runtime" }), writeFile: async () => ({ $tag: "Err", $payload: "No fs runtime" }) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(`const http = { fetch: async () => ({ $tag: "Err", $payload: "No http runtime" }) };`, 'Runtime');
    builder.append('\n');
    builder.append(
      `const time = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString(), instantNow: () => Date.now(), elapsedMs: (since) => Math.max(0, Date.now() - since), sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.trunc(ms)))) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `const regex = { isValid: () => false, test: async () => ({ $tag: "Err", $payload: "No regex runtime" }), find: () => ({ $tag: "None" }), findAll: async () => ({ $tag: "Err", $payload: "No regex runtime" }), replace: async () => ({ $tag: "Err", $payload: "No regex runtime" }) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `const crypto = { isAvailable: async () => false, sha256: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), hmacSha256: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), randomBytes: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), randomInt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), aesGcmEncrypt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), aesGcmDecrypt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }) };`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(`function __set(obj, prop, value) { obj[prop] = value; return value; }`, 'Runtime');
    builder.append('\n');
    builder.append(`function __lumina_stringify(value) { return String(value); }`, 'Runtime');
    builder.append('\n');
    builder.append(
      `function __lumina_range(start, end, inclusive, hasStart, hasEnd) { return { start: hasStart ? Number(start) : null, end: hasEnd ? Number(end) : null, inclusive: !!inclusive }; }`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `function __lumina_slice(str, start, end, inclusive) { const actualStart = start ?? 0; const actualEnd = end ?? str.length; const finalEnd = inclusive ? actualEnd + 1 : actualEnd; if (actualStart < 0 || actualStart > str.length) { throw new Error(\`String slice start index \${actualStart} out of bounds\`); } if (finalEnd < 0 || finalEnd > str.length) { throw new Error(\`String slice end index \${finalEnd} out of bounds\`); } return str.substring(actualStart, finalEnd); }`,
      'Runtime'
    );
    builder.append('\n');
    builder.append(
      `function __lumina_index(target, index) { if (typeof target === "string" && index && typeof index === "object" && "start" in index) { const start = index.start == null ? 0 : Math.max(0, index.start); const endBase = index.end == null ? target.length : Math.max(0, index.end); return __lumina_slice(target, start, endBase, index.inclusive); } return target ? target[index] : undefined; }`,
      'Runtime'
    );
    builder.append('\n');
  }
  if (usesTry) {
    builder.append(tryHelperSource(), 'Runtime');
    builder.append('\n');
  }

  const hoistSsa = ir.kind === 'Program' && ir.ssa === true;
  emit(ir, 0, builder, { hoistSsa, tryFunctions });

  let code = builder.toString().trimEnd() + '\n';
  if (includeRuntime) {
    if (target === 'cjs') {
      code +=
        'module.exports = { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic };\n';
    } else {
      code +=
        'export { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic };\n';
    }
  } else {
    if (target === 'cjs') {
      code += 'module.exports = { io, str, math, fs, http, time, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index };\n';
    } else {
      code += 'export { io, str, math, fs, http, time, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index };\n';
    }
  }

  const map = options.sourceMap ? buildSourceMap(builder, options) : undefined;
  return { code, map };
}

type EmitContext = {
  hoistSsa: boolean;
  ssaNames?: Set<string> | null;
  tryFunctions?: Set<string>;
};

const SSA_NAME_PATTERN = /_\d+$/;

function collectSsaNames(nodes: IRNode[], out: Set<string>): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'Let':
        if (SSA_NAME_PATTERN.test(node.name)) out.add(node.name);
        collectSsaNames([node.value], out);
        break;
      case 'Phi':
        if (SSA_NAME_PATTERN.test(node.name)) out.add(node.name);
        collectSsaNames([node.condition, node.thenValue, node.elseValue], out);
        break;
      case 'If':
        collectSsaNames([node.condition], out);
        collectSsaNames(node.thenBody, out);
        if (node.elseBody) collectSsaNames(node.elseBody, out);
        break;
      case 'While':
        collectSsaNames([node.condition], out);
        collectSsaNames(node.body, out);
        break;
      case 'Return':
        collectSsaNames([node.value], out);
        break;
      case 'ExprStmt':
        collectSsaNames([node.expr], out);
        break;
      case 'Binary':
        collectSsaNames([node.left, node.right], out);
        break;
      case 'Cast':
        collectSsaNames([node.expr], out);
        break;
      case 'Call':
        collectSsaNames(node.args, out);
        break;
      case 'StructLiteral':
        collectSsaNames(node.fields.map((field) => field.value), out);
        break;
      case 'Member':
        collectSsaNames([node.object], out);
        break;
      case 'Index':
        collectSsaNames([node.target], out);
        break;
      case 'Enum':
        collectSsaNames(node.values, out);
        break;
      case 'MatchExpr':
        collectSsaNames([node.value], out);
        collectSsaNames(node.arms.map((arm) => arm.body), out);
        break;
      default:
        break;
    }
  }
}

function emit(node: IRNode, indent: number, out: CodeBuilder, ctx: EmitContext): void {
  const pad = '  '.repeat(indent);
  switch (node.kind) {
    case 'Program':
      node.body.forEach((n) => emit(n, indent, out, ctx));
      return;
    case 'Function': {
      const params = node.params.join(', ');
      out.append(
        `${pad}function ${node.name}(${params}) {`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.append('\n');
      let ssaNames: Set<string> | null = null;
      if (ctx.hoistSsa) {
        const collected = new Set<string>();
        collectSsaNames(node.body, collected);
        if (collected.size > 0) ssaNames = collected;
      }
      if (ssaNames && ssaNames.size > 0) {
        const declPad = '  '.repeat(indent + 1);
        for (const name of Array.from(ssaNames).sort()) {
          out.append(`${declPad}let ${name};`, 'Let');
          out.append('\n');
        }
      }
      const nextCtx: EmitContext = { ...ctx, ssaNames };
      const usesTry = ctx.tryFunctions?.has(node.name) ?? false;
      if (usesTry) {
        out.append(`${pad}  try {`);
        out.append('\n');
        node.body.forEach((n) => emit(n, indent + 2, out, nextCtx));
        out.append(`${pad}  } catch (err) {`);
        out.append('\n');
        out.append(`${pad}    if (err && err.__lumina_try) return err.value;`);
        out.append('\n');
        out.append(`${pad}    throw err;`);
        out.append('\n');
        out.append(`${pad}  }`);
        out.append('\n');
      } else {
        node.body.forEach((n) => emit(n, indent + 1, out, nextCtx));
      }
      out.append(`${pad}}`, node.kind, node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined);
      out.append('\n');
      return;
    }
    case 'Let':
      if (ctx.ssaNames?.has(node.name)) {
        out.append(
          `${pad}${node.name} = `,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
      } else {
        out.append(
          `${pad}let ${node.name} = `,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
      }
      out.appendExpr(emitExpr(node.value));
      out.append(';');
      out.append('\n');
      return;
    case 'Phi':
      if (ctx.ssaNames?.has(node.name)) {
        out.append(
          `${pad}${node.name} = (`,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
      } else {
        out.append(
          `${pad}let ${node.name} = (`,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
      }
      out.appendExpr(emitExpr(node.condition));
      out.append(') ? ');
      out.appendExpr(emitExpr(node.thenValue));
      out.append(' : ');
      out.appendExpr(emitExpr(node.elseValue));
      out.append(';');
      out.append('\n');
      return;
    case 'Return':
      out.append(
        `${pad}return `,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.value));
      out.append(';');
      out.append('\n');
      return;
    case 'ExprStmt':
      out.append(
        `${pad}`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.expr));
      out.append(';');
      out.append('\n');
      return;
    case 'If': {
      out.append(
        `${pad}if (`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.condition));
      out.append(') {');
      out.append('\n');
      node.thenBody.forEach((n) => emit(n, indent + 1, out, ctx));
      if (node.elseBody && node.elseBody.length > 0) {
        out.append(
          `${pad}} else {`,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
        out.append('\n');
        node.elseBody.forEach((n) => emit(n, indent + 1, out, ctx));
      }
      out.append(
        `${pad}}`,
        node.kind,
        node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined
      );
      out.append('\n');
      return;
    }
    case 'While': {
      out.append(
        `${pad}while (`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.condition));
      out.append(') {');
      out.append('\n');
      node.body.forEach((n) => emit(n, indent + 1, out, ctx));
      out.append(
        `${pad}}`,
        node.kind,
        node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined
      );
      out.append('\n');
      return;
    }
    case 'Assign':
      out.append(
        `${pad}${node.target} = `,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.value));
      out.append(';');
      out.append('\n');
      return;
    case 'Binary':
    case 'StructLiteral':
    case 'Number':
    case 'Boolean':
    case 'String':
    case 'Identifier':
    case 'Call':
    case 'Member':
    case 'Index':
    case 'Enum':
    case 'MatchExpr':
      out.append(
        `${pad}`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node));
      out.append(';');
      out.append('\n');
      return;
    default:
      out.append(`${pad}// unsupported`, 'Unsupported');
      out.append('\n');
      return;
  }
}

type EmitMapping = { offset: number; source: { line: number; column: number } };
type EmitResult = { code: string; mappings: EmitMapping[] };

const normalizeNumericTypeName = (typeName: string): string => {
  if (typeName === 'int') return 'i32';
  if (typeName === 'float') return 'f64';
  return typeName;
};

const isIntegerTypeName = (typeName: string): boolean =>
  typeName === 'int' || typeName.startsWith('i') || typeName.startsWith('u');

const isFloatTypeName = (typeName: string): boolean => typeName === 'f32' || typeName === 'f64' || typeName === 'float';

function emitExpr(node: IRNode): EmitResult {
  const baseLoc = node.location?.start
    ? { line: node.location.start.line, column: node.location.start.column }
    : undefined;
  const withBase = (result: EmitResult): EmitResult => {
    if (baseLoc) result.mappings.unshift({ offset: 0, source: baseLoc });
    return result;
  };
  const concat = (...parts: Array<string | EmitResult>): EmitResult => {
    let code = '';
    const mappings: EmitMapping[] = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        code += part;
        continue;
      }
      for (const mapping of part.mappings) {
        mappings.push({ offset: mapping.offset + code.length, source: mapping.source });
      }
      code += part.code;
    }
    return { code, mappings };
  };

    switch (node.kind) {
      case 'Binary':
      if (node.op === '+' && (node.left.kind === 'String' || node.right.kind === 'String')) {
        return withBase(concat('(', emitExpr(node.left), ' + ', emitExpr(node.right), ')'));
      }
      return withBase(concat('(', emitExpr(node.left), ` ${node.op} `, emitExpr(node.right), ')'));
      case 'Call': {
      const parts: Array<string | EmitResult> = [`${node.callee}(`];
      node.args.forEach((arg, idx) => {
        if (idx > 0) parts.push(', ');
        parts.push(emitExpr(arg));
      });
      parts.push(')');
      return withBase(concat(...parts));
    }
    case 'Member':
      return withBase(concat(emitExpr(node.object), '.', node.property));
    case 'Index':
      return withBase(concat(emitExpr(node.target), `[${node.index}]`));
    case 'Enum': {
      const parts: Array<string | EmitResult> = [`{ tag: ${JSON.stringify(node.tag)}, values: [`];
      node.values.forEach((value, idx) => {
        if (idx > 0) parts.push(', ');
        parts.push(emitExpr(value));
      });
      parts.push('] }');
      return withBase(concat(...parts));
    }
    case 'StructLiteral': {
      const parts: Array<string | EmitResult> = ['{ '];
      node.fields.forEach((field, idx) => {
        if (idx > 0) parts.push(', ');
        parts.push(`${field.name}: `);
        parts.push(emitExpr(field.value));
      });
      parts.push(' }');
      return withBase(concat(...parts));
    }
      case 'MatchExpr': {
      const tempName = `__match_expr_${Math.random().toString(36).slice(2, 8)}`;
      const result: EmitResult = { code: '', mappings: [] };
      const add = (piece: string | EmitResult) => {
        const combined = concat(result, piece);
        result.code = combined.code;
        result.mappings = combined.mappings;
      };
      add(`(() => {\nconst ${tempName} = `);
      add(emitExpr(node.value));
      add(';\n');
      const emitBindings = (bindings: string[]) =>
        bindings.map((name, idx) => `const ${name} = ${tempName}.values[${idx}];`).join('\n');
      const arms = node.arms.map((arm) => {
        const bodyExpr = emitExpr(arm.body);
        if (arm.variant === null) {
          const binds = arm.bindings.length > 0 ? emitBindings(arm.bindings) + '\n' : '';
          return concat(`{\n${binds}return `, bodyExpr, ';\n}');
        }
        const binds = arm.bindings.length > 0 ? emitBindings(arm.bindings) + '\n' : '';
        return concat(
          `if (${tempName}.tag === ${JSON.stringify(arm.variant)}) {\n${binds}return `,
          bodyExpr,
          ';\n}'
        );
      });
      arms.forEach((arm, idx) => {
        if (idx === 0) add(arm);
        else {
          add(' else ');
          add(arm);
        }
      });
      add('\n})()');
      return withBase(result);
      }
      case 'Cast': {
        const value = emitExpr(node.expr);
        const target = normalizeNumericTypeName(node.targetType);
        const concatCast = (prefix: string, suffix: string = ''): EmitResult => concat(prefix, value, suffix);

        if (isFloatTypeName(target)) {
          if (target === 'f32') return withBase(concatCast('Math.fround(', ')'));
          return withBase(value);
        }

        if (isIntegerTypeName(target)) {
          const base = concatCast('Math.trunc(', ')');
          switch (target) {
            case 'i8':
              return withBase(concat('(', base, ' << 24) >> 24'));
            case 'u8':
              return withBase(concat('(', base, ' & 0xFF)'));
            case 'i16':
              return withBase(concat('(', base, ' << 16) >> 16'));
            case 'u16':
              return withBase(concat('(', base, ' & 0xFFFF)'));
            case 'u32':
              return withBase(concat('(', base, ' >>> 0)'));
            case 'i32':
              return withBase(concat('(', base, ' | 0)'));
            default:
              return withBase(base);
          }
        }
        return withBase(value);
      }
      case 'Number':
        return withBase({ code: String(node.value), mappings: [] });
    case 'Boolean':
      return withBase({ code: node.value ? 'true' : 'false', mappings: [] });
    case 'String':
      return withBase({ code: JSON.stringify(node.value), mappings: [] });
    case 'Identifier':
      return withBase({ code: node.name, mappings: [] });
    default:
      return withBase({ code: 'undefined', mappings: [] });
  }
}

const tryHelperSource = (): string => `
function __lumina_try(value) {
  if (value && typeof value === 'object') {
    const tag = value.$tag ?? value.tag;
    if (tag === 'Ok') {
      if ('$payload' in value) return value.$payload;
      const values = value.values;
      if (Array.isArray(values)) return values.length > 1 ? values : values[0];
    }
    if (tag === 'Err') {
      throw { __lumina_try: true, value };
    }
  }
  return value;
}`.trim();

const collectTryFunctions = (root: IRNode): Set<string> => {
  const result = new Set<string>();
  const visit = (node: IRNode): boolean => {
    switch (node.kind) {
      case 'Call':
        if (node.callee === '__lumina_try') return true;
        return node.args.some(visit);
      case 'Let':
        return visit(node.value);
      case 'Return':
        return visit(node.value);
      case 'ExprStmt':
        return visit(node.expr);
      case 'Binary':
        return visit(node.left) || visit(node.right);
      case 'Cast':
        return visit(node.expr);
      case 'StructLiteral':
        return node.fields.some((field) => visit(field.value));
      case 'Member':
        return visit(node.object);
      case 'Index':
        return visit(node.target);
      case 'Enum':
        return node.values.some(visit);
      case 'MatchExpr':
        return visit(node.value) || node.arms.some((arm) => visit(arm.body));
      case 'If':
        return visit(node.condition) || node.thenBody.some(visit) || (node.elseBody ? node.elseBody.some(visit) : false);
      case 'While':
        return visit(node.condition) || node.body.some(visit);
      case 'Program':
        return node.body.some(visit);
      case 'Function': {
        const hasTry = node.body.some(visit);
        if (hasTry) result.add(node.name);
        return hasTry;
      }
      default:
        return false;
    }
  };
  visit(root);
  return result;
};

class CodeBuilder {
  private chunks: string[] = [];
  private line = 1;
  private column = 0;
  readonly map?: { mappings: Array<{ line: number; column: number; kind: string; source?: { line: number; column: number } }> };

  constructor(trackMap: boolean) {
    if (trackMap) {
      this.map = { mappings: [] };
    }
  }

  append(text: string, kind?: string, source?: { line: number; column: number }) {
    if (!text) return;
    if (this.map && kind && source) {
      this.map.mappings.push({ line: this.line, column: this.column, kind, source });
    }
    this.chunks.push(text);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        this.line += 1;
        this.column = 0;
      } else {
        this.column += 1;
      }
    }
  }

  appendExpr(expr: EmitResult) {
    if (!expr.code) return;
    if (this.map) {
      for (const mapping of expr.mappings) {
        const pos = offsetToLineCol(expr.code, mapping.offset);
        const line = this.line + pos.lineOffset;
        const column = pos.lineOffset === 0 ? this.column + pos.columnOffset : pos.columnOffset;
        this.map.mappings.push({
          line,
          column,
          kind: 'Expr',
          source: mapping.source,
        });
      }
    }
    this.append(expr.code);
  }

  toString(): string {
    return this.chunks.join('');
  }
}

function offsetToLineCol(code: string, offset: number): { lineOffset: number; columnOffset: number } {
  let lineOffset = 0;
  let columnOffset = 0;
  const max = Math.min(offset, code.length);
  for (let i = 0; i < max; i++) {
    const ch = code[i];
    if (ch === '\n') {
      lineOffset += 1;
      columnOffset = 0;
    } else {
      columnOffset += 1;
    }
  }
  return { lineOffset, columnOffset };
}

function buildSourceMap(builder: CodeBuilder, options: CodegenOptions): RawSourceMap | undefined {
  if (!builder.map) return undefined;
  const sourceFile = options.sourceFile ?? 'input.lm';
  const generator = new SourceMapGenerator({ file: undefined });
  for (const mapping of builder.map.mappings) {
    if (!mapping.source) continue;
    generator.addMapping({
      generated: { line: mapping.line, column: mapping.column },
      original: {
        line: mapping.source.line,
        column: Math.max(0, mapping.source.column - 1),
      },
      source: sourceFile,
    });
  }
  if (options.sourceContent) {
    generator.setSourceContent(sourceFile, options.sourceContent);
  }
  return generator.toJSON();
}
