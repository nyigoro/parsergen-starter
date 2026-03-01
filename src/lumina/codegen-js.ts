import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaMatchPattern,
  type LuminaFnDecl,
  type LuminaImplDecl,
  type LuminaTraitDecl,
  type LuminaTraitMethod,
  type LuminaBlock,
  type LuminaStructDecl,
  type LuminaTypeExpr,
  type LuminaConstExpr,
  type LuminaArrayType,
} from './ast.js';
import { SourceMapGenerator, type RawSourceMap } from 'source-map';
import { mangleTraitMethodName, type TraitMethodResolution } from './trait-utils.js';

const normalizeNumericTypeName = (typeName: string): string => {
  if (typeName === 'int') return 'i32';
  if (typeName === 'float') return 'f64';
  return typeName;
};

const isIntegerTypeName = (typeName: string): boolean =>
  typeName === 'int' || typeName.startsWith('i') || typeName.startsWith('u');

const isFloatTypeName = (typeName: string): boolean => typeName === 'f32' || typeName === 'f64' || typeName === 'float';

const splitTypeArgs = (input: string): string[] => {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') depth += 1;
    if (ch === '>') depth -= 1;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
};

const parseTypeName = (typeName: string): { base: string; args: string[] } | null => {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf('<');
  if (idx === -1) return { base: trimmed, args: [] };
  if (!trimmed.endsWith('>')) return null;
  const base = trimmed.slice(0, idx);
  const inner = trimmed.slice(idx + 1, -1);
  return { base, args: splitTypeArgs(inner) };
};

export interface CodegenJsOptions {
  target?: 'esm' | 'cjs';
  includeRuntime?: boolean;
  sourceMap?: boolean;
  sourceFile?: string;
  sourceContent?: string;
  traitMethodResolutions?: Map<number, TraitMethodResolution>;
}

export interface CodegenJsResult {
  code: string;
  map?: RawSourceMap;
}

export function generateJSFromAst(program: LuminaProgram, options: CodegenJsOptions = {}): CodegenJsResult {
  const builder = new CodeBuilder(options.sourceMap === true);
  const generator = new JSGenerator(builder, options);
  generator.emitProgram(program);
  const code = builder.toString().trimEnd() + '\n';
  const map = options.sourceMap ? buildSourceMap(builder, options) : undefined;
  return { code, map };
}

class JSGenerator {
  private indentLevel = 0;
  private readonly target: 'esm' | 'cjs';
  private readonly includeRuntime: boolean;
  private matchCounter = 0;
  private tempCounter = 0;
  private usesTryHelper = false;
  private readonly traitMethodResolutions: Map<number, TraitMethodResolution>;
  private readonly traitDecls = new Map<string, LuminaTraitDecl>();
  private defaultMethodContext:
    | { traitType: string; forType: string; selfParams: Set<string> }
    | null = null;

  constructor(private readonly builder: CodeBuilder, options: CodegenJsOptions) {
    this.target = options.target ?? 'esm';
    this.includeRuntime = options.includeRuntime !== false;
    this.traitMethodResolutions = options.traitMethodResolutions ?? new Map();
  }

  emitProgram(node: LuminaProgram): void {
    this.usesTryHelper = programUsesTry(node);
    this.traitDecls.clear();
    for (const stmt of node.body) {
      if (stmt.type === 'TraitDecl') {
        this.traitDecls.set(stmt.name, stmt);
      }
    }
    if (this.includeRuntime) {
      if (this.target === 'cjs') {
        this.builder.append(
          'const { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } = require("./lumina-runtime.cjs");'
        );
      } else {
        this.builder.append(
          'import { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } from "./lumina-runtime.js";'
        );
      }
    } else {
      this.builder.append('const io = { println: (...args) => console.log(...args), print: (...args) => console.log(...args), eprint: (...args) => console.error(...args), eprintln: (...args) => console.error(...args) };');
      this.builder.append('\n');
      this.builder.append('const str = { length: (value) => value.length, concat: (a, b) => a + b, split: (value, sep) => value.split(sep), trim: (value) => value.trim(), contains: (haystack, needle) => haystack.includes(needle) };');
      this.builder.append('\n');
      this.builder.append('const math = { abs: (value) => Math.trunc(Math.abs(value)), min: (a, b) => Math.trunc(Math.min(a, b)), max: (a, b) => Math.trunc(Math.max(a, b)), absf: (value) => Math.abs(value), minf: (a, b) => Math.min(a, b), maxf: (a, b) => Math.max(a, b), sqrt: (value) => Math.sqrt(value), pow: (base, exp) => Math.pow(base, exp), floor: (value) => Math.floor(value), ceil: (value) => Math.ceil(value), round: (value) => Math.round(value), pi: Math.PI, e: Math.E };');
      this.builder.append('\n');
      this.builder.append('const fs = { readFile: async () => ({ $tag: "Err", $payload: "No fs runtime" }), writeFile: async () => ({ $tag: "Err", $payload: "No fs runtime" }) };');
      this.builder.append('\n');
      this.builder.append('const path = { join: (a, b) => `${a}/${b}`, is_absolute: () => false, extension: () => ({ $tag: "None" }), dirname: (v) => v, basename: (v) => v, normalize: (v) => v };');
      this.builder.append('\n');
      this.builder.append('const env = { var: () => ({ $tag: "Err", $payload: "No env runtime" }), set_var: () => ({ $tag: "Err", $payload: "No env runtime" }), remove_var: () => ({ $tag: "Err", $payload: "No env runtime" }), args: () => [], cwd: () => ({ $tag: "Err", $payload: "No env runtime" }) };');
      this.builder.append('\n');
      this.builder.append('const process = { spawn: () => ({ $tag: "Err", $payload: "No process runtime" }), exit: () => {}, cwd: () => "", pid: () => -1 };');
      this.builder.append('\n');
      this.builder.append('const json = { to_string: () => ({ $tag: "Err", $payload: "No json runtime" }), to_pretty_string: () => ({ $tag: "Err", $payload: "No json runtime" }), from_string: () => ({ $tag: "Err", $payload: "No json runtime" }), parse: () => ({ $tag: "Err", $payload: "No json runtime" }) };');
      this.builder.append('\n');
      this.builder.append('const http = { fetch: async () => ({ $tag: "Err", $payload: "No http runtime" }) };');
      this.builder.append('\n');
      this.builder.append(
        'const time = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString(), instantNow: () => Date.now(), elapsedMs: (since) => Math.max(0, Date.now() - since), sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.trunc(ms)))) };'
      );
      this.builder.append('\n');
      this.builder.append('const channel = { new: () => ({ sender: {}, receiver: {} }) };');
      this.builder.append('\n');
      this.builder.append('const async_channel = channel;');
      this.builder.append('\n');
      this.builder.append('const timeout = async (ms) => await time.sleep(ms);');
      this.builder.append('\n');
      this.builder.append('const join_all = async (values) => { const arr = Array.isArray(values) ? values : (values && values[Symbol.iterator]) ? Array.from(values) : []; return await Promise.all(arr.map((v) => Promise.resolve(v))); };');
      this.builder.append('\n');
      this.builder.append(
        'const regex = { isValid: () => false, test: async () => ({ $tag: "Err", $payload: "No regex runtime" }), find: () => ({ $tag: "None" }), findAll: async () => ({ $tag: "Err", $payload: "No regex runtime" }), replace: async () => ({ $tag: "Err", $payload: "No regex runtime" }) };'
      );
      this.builder.append('\n');
      this.builder.append(
        'const crypto = { isAvailable: async () => false, sha256: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), hmacSha256: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), randomBytes: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), randomInt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), aesGcmEncrypt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }), aesGcmDecrypt: async () => ({ $tag: "Err", $payload: "No crypto runtime" }) };'
      );
      this.builder.append('\n');
      this.builder.append('function __set(obj, prop, value) { obj[prop] = value; return value; }');
      this.builder.append('\n');
      this.builder.append('function __lumina_stringify(value) { return String(value); }');
      this.builder.append('\n');
      this.builder.append('function __lumina_range(start, end, inclusive, hasStart, hasEnd) { return { start: hasStart ? Number(start) : null, end: hasEnd ? Number(end) : null, inclusive: !!inclusive }; }');
      this.builder.append('\n');
      this.builder.append(
        'function __lumina_slice(str, start, end, inclusive) { const actualStart = start ?? 0; const actualEnd = end ?? str.length; const finalEnd = inclusive ? actualEnd + 1 : actualEnd; if (actualStart < 0 || actualStart > str.length) { throw new Error(`String slice start index ${actualStart} out of bounds`); } if (finalEnd < 0 || finalEnd > str.length) { throw new Error(`String slice end index ${finalEnd} out of bounds`); } return str.substring(actualStart, finalEnd); }'
      );
      this.builder.append('\n');
      this.builder.append('function __lumina_fixed_array(size, initializer) { const arr = new Array(Math.max(0, Math.trunc(size))); if (typeof initializer === "function") { for (let i = 0; i < arr.length; i++) arr[i] = initializer(i); } return arr; }');
      this.builder.append('\n');
      this.builder.append('function __lumina_array_bounds_check(array, index, expectedSize) { const idx = Math.trunc(Number(index)); if (expectedSize !== undefined && array.length !== expectedSize) { throw new Error(`Array size mismatch: expected ${expectedSize}, got ${array.length}`); } if (idx < 0 || idx >= array.length) { throw new Error(`Array index out of bounds: ${idx} (array length: ${array.length})`); } }');
      this.builder.append('\n');
      this.builder.append('function __lumina_array_literal(elements, expectedSize) { if (expectedSize !== undefined && elements.length !== expectedSize) { throw new Error(`Array literal has wrong size: expected ${expectedSize}, got ${elements.length}`); } return elements; }');
      this.builder.append('\n');
      this.builder.append(
        'function __lumina_index(target, index, expectedSize) { if (typeof target === "string" && index && typeof index === "object" && "start" in index) { const start = index.start == null ? 0 : Math.max(0, index.start); const endBase = index.end == null ? target.length : Math.max(0, index.end); return __lumina_slice(target, start, endBase, index.inclusive); } if (Array.isArray(target)) { __lumina_array_bounds_check(target, index, expectedSize); return target[Math.trunc(Number(index))]; } return target ? target[index] : undefined; }'
      );
      this.builder.append('\n');
      this.builder.append('function __lumina_clone(value) { if (value == null || typeof value !== "object") return value; if (Array.isArray(value)) return value.map((entry) => __lumina_clone(entry)); return { ...value }; }');
      this.builder.append('\n');
      this.builder.append('function __lumina_debug(value) { return __lumina_stringify(value); }');
      this.builder.append('\n');
      this.builder.append('function __lumina_eq(left, right) { return JSON.stringify(left) === JSON.stringify(right); }');
      this.builder.append('\n');
      this.builder.append('function __lumina_struct(_name, fields) { return fields; }');
      this.builder.append('\n');
      this.builder.append('function __lumina_register_trait_impl(_trait, _type, _fn) {}');
    }
    if (this.usesTryHelper) {
      this.builder.append(tryHelperSource());
      this.builder.append('\n');
    }
    this.builder.append('\n');

    for (const stmt of node.body) {
      this.emitStatement(stmt);
    }

    if (this.includeRuntime) {
      if (this.target === 'cjs') {
        this.builder.append(
          'module.exports = { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };'
        );
      } else {
        this.builder.append(
          'export { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };'
        );
      }
    } else {
      if (this.target === 'cjs') {
        this.builder.append('module.exports = { io, str, math, fs, path, env, process, json, http, time, join_all, timeout, async_channel, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl };');
      } else {
        this.builder.append('export { io, str, math, fs, path, env, process, json, http, time, join_all, timeout, async_channel, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl };');
      }
    }
    this.builder.append('\n');
  }

  private emitStatement(stmt: LuminaStatement): void {
    const pad = this.pad();
    switch (stmt.type) {
      case 'FnDecl': {
        this.emitFunctionDecl(stmt.name, stmt);
        return;
      }
      case 'Let': {
        const keyword = stmt.mutable ? 'let' : 'const';
        this.builder.append(
          `${pad}${keyword} ${stmt.name} = `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        return;
      }
      case 'LetTuple': {
        const tupleTemp = `__tuple_${this.tempCounter++}`;
        this.builder.append(
          `${pad}const ${tupleTemp} = `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        const keyword = stmt.mutable ? 'let' : 'const';
        stmt.names.forEach((name, idx) => {
          const sourceExpr =
            idx === 0
              ? `${tupleTemp}.sender ?? ${tupleTemp}[0]`
              : idx === 1
                ? `${tupleTemp}.receiver ?? ${tupleTemp}[1]`
                : `${tupleTemp}[${idx}]`;
          this.builder.append(`${pad}${keyword} ${name} = ${sourceExpr};\n`);
        });
        return;
      }
      case 'LetElse': {
        const matchTemp = `__let_else_${this.tempCounter++}`;
        this.builder.append(
          `${pad}const ${matchTemp} = `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        const patternCond = this.emitPatternCondition(stmt.pattern, matchTemp);
        this.builder.append(`${pad}if (!(${patternCond})) `);
        this.emitBlock(stmt.elseBlock, { inline: true, trailingNewline: true });
        const bindingKeyword = stmt.mutable ? 'let' : 'const';
        for (const line of this.emitPatternBindingLines(stmt.pattern, matchTemp, bindingKeyword)) {
          this.builder.append(`${pad}${line}\n`);
        }
        return;
      }
      case 'Return': {
        this.builder.append(
          `${pad}return `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        return;
      }
      case 'Assign': {
        this.builder.append(
          `${pad}`,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.target as LuminaExpr));
        this.builder.append(' = ');
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        return;
      }
      case 'ExprStmt': {
        this.builder.append(
          `${pad}`,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.expr));
        this.builder.append(';\n');
        return;
      }
      case 'If': {
        this.builder.append(
          `${pad}if (`,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.condition));
        this.builder.append(') ');
        this.emitBlock(stmt.thenBlock, { inline: true, trailingNewline: false });
        if (stmt.elseBlock) {
          this.builder.append(' else ');
          this.emitBlock(stmt.elseBlock, { inline: true, trailingNewline: false });
        }
        this.builder.append('\n');
        return;
      }
      case 'IfLet': {
        const matchTemp = `__if_let_${this.tempCounter++}`;
        this.builder.append(
          `${pad}const ${matchTemp} = `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        const patternCond = this.emitPatternCondition(stmt.pattern, matchTemp);
        this.builder.append(`${pad}if (${patternCond}) {\n`);
        this.indentLevel++;
        for (const line of this.emitPatternBindingLines(stmt.pattern, matchTemp, 'const')) {
          this.builder.append(`${this.pad()}${line}\n`);
        }
        for (const bodyStmt of stmt.thenBlock.body) {
          this.emitStatement(bodyStmt);
        }
        this.indentLevel--;
        this.builder.append(`${pad}}`);
        if (stmt.elseBlock) {
          this.builder.append(' else ');
          this.emitBlock(stmt.elseBlock, { inline: true, trailingNewline: false });
        }
        this.builder.append('\n');
        return;
      }
      case 'While': {
        this.builder.append(
          `${pad}while (`,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.condition));
        this.builder.append(') ');
        this.emitBlock(stmt.body, { inline: true, trailingNewline: false });
        this.builder.append('\n');
        return;
      }
      case 'For': {
        const rangeTemp = `__for_range_${this.tempCounter++}`;
        const endTemp = `__for_end_${this.tempCounter++}`;
        this.builder.append(
          `${pad}const ${rangeTemp} = `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.appendExpr(this.emitExpr(stmt.iterable));
        this.builder.append(';\n');
        this.builder.append(`${pad}const ${endTemp} = ${rangeTemp}.end ?? (${rangeTemp}.start ?? 0);\n`);
        this.builder.append(
          `${pad}for (let ${stmt.iterator} = (${rangeTemp}.start ?? 0); ${rangeTemp}.inclusive ? ${stmt.iterator} <= ${endTemp} : ${stmt.iterator} < ${endTemp}; ${stmt.iterator}++) `
        );
        this.emitBlock(stmt.body, { inline: true, trailingNewline: false });
        this.builder.append('\n');
        return;
      }
      case 'WhileLet': {
        const matchTemp = `__while_let_${this.tempCounter++}`;
        this.builder.append(
          `${pad}while (true) {`,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.builder.append('\n');
        this.indentLevel++;
        this.builder.append(`${this.pad()}const ${matchTemp} = `);
        this.builder.appendExpr(this.emitExpr(stmt.value));
        this.builder.append(';\n');
        const patternCond = this.emitPatternCondition(stmt.pattern, matchTemp);
        this.builder.append(`${this.pad()}if (!(${patternCond})) break;\n`);
        for (const line of this.emitPatternBindingLines(stmt.pattern, matchTemp, 'const')) {
          this.builder.append(`${this.pad()}${line}\n`);
        }
        for (const bodyStmt of stmt.body.body) {
          this.emitStatement(bodyStmt);
        }
        this.indentLevel--;
        this.builder.append(`${pad}}\n`);
        return;
      }
      case 'MatchStmt': {
        this.emitMatchStatement(stmt);
        this.builder.append('\n');
        return;
      }
      case 'Block': {
        this.emitBlock(stmt, { inline: false, trailingNewline: false });
        this.builder.append('\n');
        return;
      }
      case 'ImplDecl': {
        this.emitImplDecl(stmt);
        return;
      }
      case 'StructDecl': {
        this.emitStructDecl(stmt);
        return;
      }
      case 'TypeDecl':
      case 'MacroRulesDecl':
      case 'TraitDecl':
      case 'EnumDecl':
      case 'Import':
      case 'ErrorNode':
        return;
      default:
        return;
    }
  }

  private emitFunctionDecl(name: string, stmt: LuminaFnDecl): void {
    const pad = this.pad();
    const params = stmt.params.map((p) => p.name).join(', ');
    const asyncKeyword = stmt.async ? 'async ' : '';
    const usesTry = blockUsesTry(stmt.body);
    this.builder.append(
      `${pad}${asyncKeyword}function ${name}(${params}) {`,
      stmt.type,
      stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
    );
    this.builder.append('\n');
    this.indentLevel++;
    if (usesTry) {
      this.builder.append(`${this.pad()}try `);
      this.emitBlock(stmt.body, { inline: true, trailingNewline: false });
      this.builder.append(` catch (err) {\n`);
      this.indentLevel++;
      this.builder.append(`${this.pad()}if (err && err.__lumina_try) return err.value;\n`);
      this.builder.append(`${this.pad()}throw err;\n`);
      this.indentLevel--;
      this.builder.append(`${this.pad()}}\n`);
    } else {
      for (const bodyStmt of stmt.body.body) {
        this.emitStatement(bodyStmt);
      }
    }
    this.indentLevel--;
    this.builder.append(`${pad}}\n`);
  }

  private emitImplDecl(stmt: LuminaImplDecl): void {
    const traitType = typeof stmt.traitType === 'string' ? stmt.traitType : 'Trait';
    const forType = typeof stmt.forType === 'string' ? stmt.forType : 'Unknown';
    const traitName = traitType.split('<')[0];
    const forTypeBase = forType.includes('<') ? forType.slice(0, forType.indexOf('<')) : forType;
    const traitDecl = this.traitDecls.get(traitName);
    const implemented = new Set(stmt.methods.map((method) => method.name));
    for (const method of stmt.methods) {
      const mangledName = mangleTraitMethodName(traitType, forType, method.name);
      this.emitFunctionDecl(mangledName, method);
      const registerTrait =
        (traitName === 'Hash' && method.name === 'hash') ||
        (traitName === 'Eq' && method.name === 'eq') ||
        (traitName === 'Ord' && method.name === 'cmp');
      if (registerTrait) {
        this.builder.append(
          `${this.pad()}__lumina_register_trait_impl(${JSON.stringify(traitName)}, ${JSON.stringify(forTypeBase)}, ${mangledName});\n`
        );
      }
    }
    if (traitDecl) {
      for (const method of traitDecl.methods) {
        if (!method.body) continue;
        if (implemented.has(method.name)) continue;
        const mangledName = mangleTraitMethodName(traitType, forType, method.name);
        this.emitDefaultTraitMethod(mangledName, traitType, forType, method);
        const registerTrait =
          (traitName === 'Hash' && method.name === 'hash') ||
          (traitName === 'Eq' && method.name === 'eq') ||
          (traitName === 'Ord' && method.name === 'cmp');
        if (registerTrait) {
          this.builder.append(
            `${this.pad()}__lumina_register_trait_impl(${JSON.stringify(traitName)}, ${JSON.stringify(forTypeBase)}, ${mangledName});\n`
          );
        }
      }
    }
  }

  private emitStructDecl(stmt: LuminaStructDecl): void {
    const pad = this.pad();
    const fieldNames = stmt.body.map((field) => field.name);
    this.builder.append(
      `${pad}class ${stmt.name} {`,
      stmt.type,
      stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
    );
    this.builder.append('\n');
    this.indentLevel++;
    this.builder.append(`${this.pad()}constructor(${fieldNames.join(', ')}) {\n`);
    this.indentLevel++;
    for (const field of stmt.body) {
      const fixedSize = this.getFixedArraySize(field.typeName);
      if (fixedSize !== null) {
        this.builder.append(
          `${this.pad()}if (!Array.isArray(${field.name}) || ${field.name}.length !== ${fixedSize}) {\n`
        );
        this.indentLevel++;
        this.builder.append(
          `${this.pad()}throw new Error(${JSON.stringify(
            `Array field "${field.name}" must have exactly ${fixedSize} elements`
          )} + ", got " + (${field.name}?.length ?? "unknown"));\n`
        );
        this.indentLevel--;
        this.builder.append(`${this.pad()}}\n`);
      }
      this.builder.append(`${this.pad()}this.${field.name} = ${field.name};\n`);
    }
    this.indentLevel--;
    this.builder.append(`${this.pad()}}\n`);
    this.indentLevel--;
    this.builder.append(`${pad}}\n`);
  }

  private getFixedArraySize(typeExpr: LuminaTypeExpr | null | undefined): number | null {
    if (!typeExpr) return null;
    if (typeof typeExpr === 'string') {
      const parsed = parseTypeName(typeExpr);
      if (!parsed || parsed.base !== 'Array' || parsed.args.length < 2) return null;
      return this.evaluateConstSizeText(parsed.args[1]);
    }
    if ((typeExpr as LuminaArrayType).kind === 'array') {
      const arrayExpr = typeExpr as LuminaArrayType;
      if (!arrayExpr.size) return null;
      return this.evaluateConstSize(arrayExpr.size);
    }
    return null;
  }

  private evaluateConstSize(expr: LuminaConstExpr): number | null {
    switch (expr.type) {
      case 'ConstLiteral':
        return expr.value;
      case 'ConstBinary': {
        const left = this.evaluateConstSize(expr.left);
        const right = this.evaluateConstSize(expr.right);
        if (left === null || right === null) return null;
        switch (expr.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            return right === 0 ? null : Math.floor(left / right);
          default:
            return null;
        }
      }
      case 'ConstParam':
      default:
        return null;
    }
  }

  private evaluateConstSizeText(text: string): number | null {
    const trimmed = text.trim();
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    const tokens = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[()+\-*/]/g);
    if (!tokens || tokens.length === 0) return null;
    if (tokens.some((token) => /^[A-Za-z_]/.test(token))) return null;
    let index = 0;
    const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
    const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);
    const parsePrimary = (): number | null => {
      const token = consume();
      if (!token) return null;
      if (/^-?\d+$/.test(token)) return Number(token);
      if (token === '(') {
        const inner = parseAddSub();
        if (peek() !== ')') return null;
        consume();
        return inner;
      }
      return null;
    };
    const parseMulDiv = (): number | null => {
      let left = parsePrimary();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '*' && op !== '/') break;
        consume();
        const right = parsePrimary();
        if (right === null) return null;
        if (op === '*') left *= right;
        else {
          if (right === 0) return null;
          left = Math.floor(left / right);
        }
      }
      return left;
    };
    const parseAddSub = (): number | null => {
      let left = parseMulDiv();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '+' && op !== '-') break;
        consume();
        const right = parseMulDiv();
        if (right === null) return null;
        if (op === '+') left += right;
        else left -= right;
      }
      return left;
    };
    const value = parseAddSub();
    if (value === null || index !== tokens.length) return null;
    return Math.trunc(value);
  }

  private emitDefaultTraitMethod(
    mangledName: string,
    traitType: string,
    forType: string,
    method: LuminaTraitMethod
  ): void {
    const selfParams = new Set<string>();
    for (const param of method.params) {
      if (typeof param.typeName === 'string' && param.typeName === 'Self') {
        selfParams.add(param.name);
      }
    }
    const previousContext = this.defaultMethodContext;
    this.defaultMethodContext = { traitType, forType, selfParams };
    const fnDecl: LuminaFnDecl = {
      type: 'FnDecl',
      name: mangledName,
      params: method.params,
      returnType: method.returnType ?? null,
      body: method.body ?? { type: 'Block', body: [] },
      visibility: 'private',
      extern: false,
      async: false,
      typeParams: method.typeParams ?? [],
      location: method.location,
    };
    this.emitFunctionDecl(mangledName, fnDecl);
    this.defaultMethodContext = previousContext;
  }

  private emitBlock(
    block: { body: LuminaStatement[] },
    options?: { expressionContext?: boolean; inline?: boolean; trailingNewline?: boolean }
  ): void {
    const inline = options?.inline ?? false;
    const trailingNewline = options?.trailingNewline ?? false;
    const pad = inline ? '' : this.pad();
    this.builder.append(`${pad}{\n`);
    this.indentLevel++;
    const lastIdx = block.body.length - 1;
    block.body.forEach((stmt, idx) => {
      const isTail = idx === lastIdx;
      if (options?.expressionContext && isTail && this.isExpressionStatement(stmt)) {
        const expr = (stmt as Extract<LuminaStatement, { type: 'ExprStmt' }>).expr;
        this.builder.append(`${this.pad()}return `);
        this.builder.appendExpr(this.emitExpr(expr));
        this.builder.append(';\n');
        return;
      }
      this.emitStatement(stmt);
    });
    this.indentLevel--;
    this.builder.append(`${this.pad()}}`);
    if (trailingNewline) this.builder.append('\n');
  }

  private emitMatchStatement(stmt: Extract<LuminaStatement, { type: 'MatchStmt' }>): void {
    const matchId = `__match_val_${this.matchCounter++}`;
    const matchDone = `__match_done_${this.matchCounter++}`;
    const pad = this.pad();
    this.builder.append(
      `${pad}const ${matchId} = `,
      stmt.type,
      stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
    );
    this.builder.appendExpr(this.emitExpr(stmt.value));
    this.builder.append(';\n');
    this.builder.append(`${pad}let ${matchDone} = false;\n`);
    for (const arm of stmt.arms) {
      const armCondition = this.emitPatternCondition(arm.pattern, matchId);
      this.builder.append(`${pad}if (!${matchDone} && (${armCondition})) {\n`);
      this.indentLevel++;
      for (const line of this.emitPatternBindingLines(arm.pattern, matchId, 'const')) {
        this.builder.append(`${this.pad()}${line}\n`);
      }
      if (arm.guard) {
        this.builder.append(`${this.pad()}if (`);
        this.builder.appendExpr(this.emitExpr(arm.guard));
        this.builder.append(`) {\n`);
        this.indentLevel++;
        this.builder.append(`${this.pad()}${matchDone} = true;\n`);
        for (const s of arm.body.body) {
          this.emitStatement(s);
        }
        this.indentLevel--;
        this.builder.append(`${this.pad()}}\n`);
      } else {
        this.builder.append(`${this.pad()}${matchDone} = true;\n`);
        for (const s of arm.body.body) {
          this.emitStatement(s);
        }
      }
      this.indentLevel--;
      this.builder.append(`${pad}}\n`);
    }
    this.builder.append(`${pad}if (!${matchDone}) {\n`);
    this.indentLevel++;
    this.builder.append(`${this.pad()}throw new Error("Exhaustiveness failure");\n`);
    this.indentLevel--;
    this.builder.append(`${pad}}\n`);
  }

  private emitPatternCondition(pattern: LuminaMatchPattern, valueExpr: string): string {
    switch (pattern.type) {
      case 'WildcardPattern':
      case 'BindingPattern':
        return 'true';
      case 'LiteralPattern':
        return `${valueExpr} === ${JSON.stringify(pattern.value)}`;
      case 'TuplePattern': {
        const clauses = [`Array.isArray(${valueExpr})`, `${valueExpr}.length >= ${pattern.elements.length}`];
        pattern.elements.forEach((element, idx) => {
          clauses.push(this.emitPatternCondition(element, `${valueExpr}[${idx}]`));
        });
        return clauses.join(' && ');
      }
      case 'StructPattern': {
        const clauses = [`${valueExpr} != null`, `typeof ${valueExpr} === "object"`];
        pattern.fields.forEach((field) => {
          clauses.push(this.emitPatternCondition(field.pattern, `${valueExpr}.${field.name}`));
        });
        return clauses.join(' && ');
      }
      case 'EnumPattern': {
        const clauses = [`((${valueExpr}?.$tag ?? ${valueExpr}?.tag) === ${JSON.stringify(pattern.variant)})`];
        if (pattern.patterns && pattern.patterns.length > 0) {
          pattern.patterns.forEach((nested, idx) => {
            const payloadExpr =
              pattern.patterns && pattern.patterns.length === 1
                ? `${valueExpr}?.$payload`
                : `${valueExpr}?.$payload?.[${idx}]`;
            clauses.push(this.emitPatternCondition(nested, payloadExpr));
          });
        }
        return clauses.join(' && ');
      }
      default:
        return 'false';
    }
  }

  private emitPatternBindingLines(
    pattern: LuminaMatchPattern,
    valueExpr: string,
    keyword: 'const' | 'let'
  ): string[] {
    const lines: string[] = [];
    const emit = (pat: LuminaMatchPattern, valueCode: string) => {
      switch (pat.type) {
        case 'BindingPattern':
          lines.push(`${keyword} ${pat.name} = ${valueCode};`);
          return;
        case 'TuplePattern':
          pat.elements.forEach((element, idx) => emit(element, `${valueCode}[${idx}]`));
          return;
        case 'StructPattern':
          pat.fields.forEach((field) => emit(field.pattern, `${valueCode}.${field.name}`));
          return;
        case 'EnumPattern':
          if (pat.patterns && pat.patterns.length > 0) {
            pat.patterns.forEach((nested, idx) => {
              const payloadExpr = pat.patterns && pat.patterns.length === 1
                ? `${valueCode}.$payload`
                : `${valueCode}.$payload[${idx}]`;
              emit(nested, payloadExpr);
            });
            return;
          }
          pat.bindings.forEach((binding, idx) => {
            if (binding === '_') return;
            if (pat.bindings.length === 1) {
              lines.push(`${keyword} ${binding} = ${valueCode}.$payload;`);
              return;
            }
            lines.push(`${keyword} ${binding} = ${valueCode}.$payload[${idx}];`);
          });
          return;
        case 'LiteralPattern':
        case 'WildcardPattern':
          return;
      }
    };
    emit(pattern, valueExpr);
    return lines;
  }

  private emitMatchBindings(matchId: string, pattern: LuminaMatchPattern): void {
    for (const line of this.emitPatternBindingLines(pattern, matchId, 'const')) {
      this.builder.append(`${this.pad()}${line}\n`);
    }
  }

  private renderInlineFunctionBody(block: LuminaBlock): string {
    const tempBuilder = new CodeBuilder(false);
    const tempGenerator = new JSGenerator(tempBuilder, {
      target: this.target,
      includeRuntime: false,
      traitMethodResolutions: this.traitMethodResolutions,
    });
    tempGenerator.indentLevel = 1;
    for (const stmt of block.body) {
      tempGenerator.emitStatement(stmt);
    }
    const rendered = tempBuilder.toString();
    return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
  }

  private indentMultiline(value: string, prefix: string): string {
    if (!value) return value;
    const lines = value.split('\n');
    const mapped: string[] = [];
    for (const line of lines) {
      if (line.length === 0) continue;
      mapped.push(`${prefix}${line}\n`);
    }
    return mapped.join('');
  }

  private emitExpr(expr: LuminaExpr): EmitResult {
    const baseLoc = expr.location?.start
      ? { line: expr.location.start.line, column: expr.location.start.column }
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

    switch (expr.type) {
      case 'Number':
        return withBase({ code: String(expr.value), mappings: [] });
      case 'Boolean':
        return withBase({ code: expr.value ? 'true' : 'false', mappings: [] });
      case 'ArrayLiteral': {
        if (expr.elements.length === 0) {
          return withBase({ code: 'vec.from([])', mappings: [] });
        }
        const parts: Array<string | EmitResult> = ['vec.from(['];
        expr.elements.forEach((element, idx) => {
          if (idx > 0) parts.push(', ');
          parts.push(this.emitExpr(element));
        });
        parts.push('])');
        return withBase(concat(...parts));
      }
      case 'TupleLiteral': {
        const parts: Array<string | EmitResult> = ['['];
        expr.elements.forEach((element, idx) => {
          if (idx > 0) parts.push(', ');
          parts.push(this.emitExpr(element));
        });
        parts.push(']');
        return withBase(concat(...parts));
      }
      case 'ArrayRepeatLiteral': {
        return withBase(
          concat(
            'vec.from(Array.from({ length: Math.max(0, Math.trunc(',
            this.emitExpr(expr.count),
            ')) }, () => ',
            this.emitExpr(expr.value),
            '))'
          )
        );
      }
      case 'Lambda': {
        const params = expr.params.map((param) => param.name).join(', ');
        const asyncKeyword = expr.async ? 'async ' : '';
        const body = this.renderInlineFunctionBody(expr.body);
        const usesTry = blockUsesTry(expr.body);
        if (usesTry) {
          const wrappedBody = this.indentMultiline(body, '    ');
          const code =
            `${asyncKeyword}function(${params}) {\n` +
            `  try {\n` +
            `${wrappedBody}` +
            `  } catch (err) {\n` +
            `    if (err && err.__lumina_try) return err.value;\n` +
            `    throw err;\n` +
            `  }\n` +
            `}`;
          return withBase({ code, mappings: [] });
        }
        const code = `${asyncKeyword}function(${params}) {\n${body}}`;
        return withBase({ code, mappings: [] });
      }
      case 'String':
        return withBase({ code: JSON.stringify(expr.value), mappings: [] });
      case 'InterpolatedString': {
        if (expr.parts.length === 0) {
          return withBase({ code: '""', mappings: [] });
        }
        const rendered = expr.parts.map((part) => {
          if (typeof part === 'string') {
            return { code: JSON.stringify(part), mappings: [] };
          }
          const inner = this.emitExpr(part);
          return concat('__lumina_stringify(', inner, ')');
        });
        const pieces: Array<string | EmitResult> = ['('];
        rendered.forEach((part, idx) => {
          if (idx > 0) pieces.push(' + ');
          pieces.push(part);
        });
        pieces.push(')');
        return withBase(concat(...pieces));
      }
      case 'Range': {
        const start = expr.start ? this.emitExpr(expr.start) : { code: '0', mappings: [] };
        const end = expr.end ? this.emitExpr(expr.end) : { code: '0', mappings: [] };
        const hasStart = expr.start ? 'true' : 'false';
        const hasEnd = expr.end ? 'true' : 'false';
        const inclusive = expr.inclusive ? 'true' : 'false';
        return withBase(
          concat(
            '__lumina_range(',
            start,
            ', ',
            end,
            ', ',
            inclusive,
            ', ',
            hasStart,
            ', ',
            hasEnd,
            ')'
          )
        );
      }
      case 'Index': {
        const object = this.emitExpr(expr.object);
        if (expr.index.type === 'Range') {
          const range = expr.index;
          const start = range.start ? this.emitExpr(range.start) : { code: '0', mappings: [] };
          const end = range.end ? this.emitExpr(range.end) : null;
          const tempName = `__lumina_tmp_${this.tempCounter++}`;
          return withBase(
            concat(
              '(() => { const ',
              tempName,
              ' = ',
              object,
              '; return __lumina_slice(',
              tempName,
              ', ',
              start,
              ', ',
              end ?? 'undefined',
              ', ',
              range.inclusive ? 'true' : 'false',
              '); })()'
            )
          );
        }
        const index = this.emitExpr(expr.index);
        return withBase(concat('__lumina_index(', object, ', ', index, ')'));
      }
      case 'MacroInvoke': {
        const message = JSON.stringify(`Unsupported macro invocation '${expr.name}!' (macro expansion is not implemented)`);
        return withBase({ code: `(() => { throw new Error(${message}); })()`, mappings: [] });
      }
      case 'Identifier':
        return withBase({ code: expr.name, mappings: [] });
      case 'Move':
        return withBase(this.emitExpr(expr.target));
      case 'Await': {
        const value = this.emitExpr(expr.value);
        return withBase(concat('await ', value));
      }
      case 'Try': {
        const value = this.emitExpr(expr.value);
        return withBase(concat('__lumina_try(', value, ')'));
      }
      case 'Cast': {
        const value = this.emitExpr(expr.expr);
        const targetType = typeof expr.targetType === 'string' ? expr.targetType : 'any';
        const target = normalizeNumericTypeName(targetType);
        const wrap = (prefix: string, suffix: string = ''): EmitResult => concat(prefix, value, suffix);

        if (isFloatTypeName(target)) {
          if (target === 'f32') return withBase(wrap('Math.fround(', ')'));
          return withBase(value);
        }
        if (isIntegerTypeName(target)) {
          const base = wrap('Math.trunc(', ')');
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
      case 'Binary':
        return withBase(concat('(', this.emitExpr(expr.left), ` ${expr.op} `, this.emitExpr(expr.right), ')'));
      case 'Call': {
        const resolution = expr.id != null ? this.traitMethodResolutions.get(expr.id) : undefined;
        if (resolution && (expr.enumName || expr.receiver)) {
          const receiverExpr: LuminaExpr = expr.receiver ?? {
            type: 'Identifier',
            name: expr.enumName as string,
            location: expr.location,
          };
          const parts: Array<string | EmitResult> = [`${resolution.mangledName}(`, this.emitExpr(receiverExpr)];
          expr.args.forEach((arg) => {
            parts.push(', ');
            parts.push(this.emitExpr(arg));
          });
          parts.push(')');
          return withBase(concat(...parts));
        }
        if (this.defaultMethodContext && expr.enumName && this.defaultMethodContext.selfParams.has(expr.enumName)) {
          const mangledName = mangleTraitMethodName(
            this.defaultMethodContext.traitType,
            this.defaultMethodContext.forType,
            expr.callee.name
          );
          const parts: Array<string | EmitResult> = [`${mangledName}(`, this.emitExpr({ type: 'Identifier', name: expr.enumName })];
          expr.args.forEach((arg) => {
            parts.push(', ');
            parts.push(this.emitExpr(arg));
          });
          parts.push(')');
          return withBase(concat(...parts));
        }
        if (expr.enumName && isUpperIdent(expr.enumName)) {
          return this.emitEnumConstruct(expr.enumName, expr.callee.name, expr.args, baseLoc);
        }
        const helperReceiverExpr =
          expr.receiver ||
          (expr.enumName && !isUpperIdent(expr.enumName)
            ? ({ type: 'Identifier', name: expr.enumName } as LuminaExpr)
            : null);

        if (helperReceiverExpr && expr.args.length === 0) {
          const receiverExpr = this.emitExpr(helperReceiverExpr);
          switch (expr.callee.name) {
            case 'clone':
              return withBase(concat('__lumina_clone(', receiverExpr, ')'));
            case 'debug':
              return withBase(concat('__lumina_debug(', receiverExpr, ')'));
            case 'millis':
            case 'milliseconds':
              return withBase(concat('Math.trunc(', receiverExpr, ')'));
            case 'seconds':
              return withBase(concat('(Math.trunc(', receiverExpr, ') * 1000)'));
            case 'minutes':
              return withBase(concat('(Math.trunc(', receiverExpr, ') * 60000)'));
            case 'hours':
              return withBase(concat('(Math.trunc(', receiverExpr, ') * 3600000)'));
            default:
              break;
          }
        }
        if (helperReceiverExpr && expr.callee.name === 'eq' && expr.args.length === 1) {
          return withBase(
            concat('__lumina_eq(', this.emitExpr(helperReceiverExpr), ', ', this.emitExpr(expr.args[0]), ')')
          );
        }
        if (expr.receiver) {
          const parts: Array<string | EmitResult> = [this.emitExpr(expr.receiver), '.', expr.callee.name, '('];
          expr.args.forEach((arg, idx) => {
            if (idx > 0) parts.push(', ');
            parts.push(this.emitExpr(arg));
          });
          parts.push(')');
          return withBase(concat(...parts));
        }
        const calleeName = expr.enumName ? `${expr.enumName}.${expr.callee.name}` : expr.callee.name;
        const parts: Array<string | EmitResult> = [`${calleeName}(`];
        expr.args.forEach((arg, idx) => {
          if (idx > 0) parts.push(', ');
          parts.push(this.emitExpr(arg));
        });
        parts.push(')');
        return withBase(concat(...parts));
      }
      case 'Member': {
        if (expr.object.type === 'Identifier' && isUpperIdent(expr.object.name) && isUpperIdent(expr.property)) {
          return this.emitEnumConstruct(expr.object.name, expr.property, [], baseLoc);
        }
        return withBase(concat(this.emitExpr(expr.object), '.', expr.property));
      }
      case 'StructLiteral': {
        const parts: Array<string | EmitResult> = ['__lumina_struct(', JSON.stringify(expr.name), ', { '];
        expr.fields.forEach((field, idx) => {
          if (idx > 0) parts.push(', ');
          parts.push(`${field.name}: `);
          parts.push(this.emitExpr(field.value));
        });
        parts.push(' })');
        return withBase(concat(...parts));
      }
      case 'MatchExpr':
        return withBase(this.emitMatchExpr(expr.value, expr.arms));
      case 'SelectExpr': {
        if (!expr.arms || expr.arms.length === 0) {
          return withBase({ code: 'undefined', mappings: [] });
        }
        const armParts: Array<string | EmitResult> = [];
        expr.arms.forEach((arm, idx) => {
          if (idx > 0) armParts.push(', ');
          const valueExpr = this.emitExpr(arm.value);
          const bodyExpr = this.emitExpr(arm.body);
          if (arm.binding && arm.binding !== '_') {
            armParts.push(
              concat(
                '(async () => { const __select_value = await ',
                valueExpr,
                '; const ',
                arm.binding,
                ' = __select_value; return ',
                bodyExpr,
                '; })()'
              )
            );
          } else {
            armParts.push(concat('(async () => { await ', valueExpr, '; return ', bodyExpr, '; })()'));
          }
        });
        return withBase(concat('(await Promise.race([', ...armParts, ']))'));
      }
      case 'IsExpr': {
        const value = this.emitExpr(expr.value);
        const variant = JSON.stringify(expr.variant);
        return withBase(concat(value, ' && ', value, '.$tag === ', variant));
      }
      default:
        return withBase({ code: 'undefined', mappings: [] });
    }
  }

  private emitEnumConstruct(
    _enumName: string,
    variant: string,
    args: LuminaExpr[],
    baseLoc?: { line: number; column: number }
  ): EmitResult {
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

    if (args.length === 0) return withBase({ code: `{ $tag: ${JSON.stringify(variant)} }`, mappings: [] });
    if (args.length === 1) {
      return withBase(
        concat('{ $tag: ', JSON.stringify(variant), ', $payload: ', this.emitExpr(args[0]), ' }')
      );
    }
    const parts: Array<string | EmitResult> = ['{ $tag: ', JSON.stringify(variant), ', $payload: ['];
    args.forEach((arg, idx) => {
      if (idx > 0) parts.push(', ');
      parts.push(this.emitExpr(arg));
    });
    parts.push('] }');
    return withBase(concat(...parts));
  }

  private emitMatchExpr(
    value: LuminaExpr,
    arms: Array<{ pattern: LuminaMatchPattern; guard?: LuminaExpr | null; body: LuminaExpr }>
  ): EmitResult {
    const matchId = `__match_val_${this.matchCounter++}`;
    const doneId = `__match_done_${this.matchCounter++}`;
    const resultId = `__match_result_${this.matchCounter++}`;
    const result: EmitResult = { code: '', mappings: [] };
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
    const add = (piece: string | EmitResult) => {
      const combined = concat(result, piece);
      result.code = combined.code;
      result.mappings = combined.mappings;
    };

    add('(() => {\n');
    add(`const ${matchId} = `);
    add(this.emitExpr(value));
    add(';\n');
    add(`let ${doneId} = false;\n`);
    add(`let ${resultId};\n`);
    for (const arm of arms) {
      const armCondition = this.emitPatternCondition(arm.pattern, matchId);
      add(`if (!${doneId} && (${armCondition})) {\n`);
      const binds = this.emitPatternBindingLines(arm.pattern, matchId, 'const');
      if (binds.length > 0) {
        for (const line of binds) {
          add(`  ${line}\n`);
        }
      }
      if (arm.guard) {
        add('  if (');
        add(this.emitExpr(arm.guard));
        add(') {\n');
        add(`    ${doneId} = true;\n`);
        add(`    ${resultId} = `);
        add(this.emitExpr(arm.body));
        add(';\n');
        add('  }\n');
      } else {
        add(`  ${doneId} = true;\n`);
        add(`  ${resultId} = `);
        add(this.emitExpr(arm.body));
        add(';\n');
      }
      add('}\n');
    }
    add(`if (!${doneId}) throw new Error("Exhaustiveness failure");\n`);
    add(`return ${resultId};\n`);
    add('})()');
    return result;
  }

  private collectPatternBindings(pattern: LuminaMatchPattern): string[] {
    switch (pattern.type) {
      case 'BindingPattern':
        return [pattern.name];
      case 'TuplePattern':
        return pattern.elements.flatMap((element) => this.collectPatternBindings(element));
      case 'StructPattern':
        return pattern.fields.flatMap((field) => this.collectPatternBindings(field.pattern));
      case 'EnumPattern':
        if (pattern.patterns && pattern.patterns.length > 0) {
          return pattern.patterns.flatMap((nested) => this.collectPatternBindings(nested));
        }
        return pattern.bindings.filter((binding) => binding !== '_');
      default:
        return [];
    }
  }

  private pad(): string {
    return '  '.repeat(this.indentLevel);
  }

  private isExpressionStatement(stmt: LuminaStatement): boolean {
    return stmt.type === 'ExprStmt';
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

const programUsesTry = (program: LuminaProgram): boolean =>
  program.body.some((stmt) => statementUsesTry(stmt));

const blockUsesTry = (block: { body: LuminaStatement[] }): boolean =>
  block.body.some((stmt) => statementUsesTry(stmt));

const statementUsesTry = (stmt: LuminaStatement): boolean => {
  switch (stmt.type) {
    case 'FnDecl':
      return blockUsesTry(stmt.body);
    case 'ImplDecl':
      return stmt.methods.some((method) => blockUsesTry(method.body));
    case 'TraitDecl':
      return stmt.methods.some((method) => (method.body ? blockUsesTry(method.body) : false));
    case 'Let':
      return exprUsesTry(stmt.value);
    case 'LetTuple':
      return exprUsesTry(stmt.value);
    case 'LetElse':
      return exprUsesTry(stmt.value) || blockUsesTry(stmt.elseBlock);
    case 'Return':
      return exprUsesTry(stmt.value);
    case 'Assign':
      return exprUsesTry(stmt.value) || exprUsesTry(stmt.target as LuminaExpr);
    case 'ExprStmt':
      return exprUsesTry(stmt.expr);
    case 'If':
      return (
        exprUsesTry(stmt.condition) ||
        blockUsesTry(stmt.thenBlock) ||
        (stmt.elseBlock ? blockUsesTry(stmt.elseBlock) : false)
      );
    case 'IfLet':
      return exprUsesTry(stmt.value) || blockUsesTry(stmt.thenBlock) || (stmt.elseBlock ? blockUsesTry(stmt.elseBlock) : false);
    case 'While':
      return exprUsesTry(stmt.condition) || blockUsesTry(stmt.body);
    case 'For':
      return exprUsesTry(stmt.iterable) || blockUsesTry(stmt.body);
    case 'WhileLet':
      return exprUsesTry(stmt.value) || blockUsesTry(stmt.body);
    case 'MatchStmt':
      return exprUsesTry(stmt.value) || stmt.arms.some((arm) => (arm.guard ? exprUsesTry(arm.guard) : false) || blockUsesTry(arm.body));
    case 'Block':
      return blockUsesTry(stmt);
    default:
      return false;
  }
};

const exprUsesTry = (expr: LuminaExpr): boolean => {
  switch (expr.type) {
    case 'Try':
      return true;
    case 'Await':
      return exprUsesTry(expr.value);
    case 'Cast':
      return exprUsesTry(expr.expr);
    case 'Lambda':
      return blockUsesTry(expr.body);
    case 'Binary':
      return exprUsesTry(expr.left) || exprUsesTry(expr.right);
    case 'Call':
      return expr.args.some(exprUsesTry) || (expr.receiver ? exprUsesTry(expr.receiver) : false);
    case 'Member':
      return exprUsesTry(expr.object);
    case 'StructLiteral':
      return expr.fields.some((field) => exprUsesTry(field.value));
    case 'MatchExpr':
      return exprUsesTry(expr.value) || expr.arms.some((arm) => (arm.guard ? exprUsesTry(arm.guard) : false) || exprUsesTry(arm.body));
    case 'SelectExpr':
      return expr.arms.some((arm) => exprUsesTry(arm.value) || exprUsesTry(arm.body));
    case 'Move':
      return exprUsesTry(expr.target);
    case 'InterpolatedString':
      return expr.parts.some((part) => typeof part !== 'string' && exprUsesTry(part));
    case 'ArrayLiteral':
      return expr.elements.some((element) => exprUsesTry(element));
    case 'ArrayRepeatLiteral':
      return exprUsesTry(expr.value) || exprUsesTry(expr.count);
    case 'TupleLiteral':
      return expr.elements.some((element) => exprUsesTry(element));
    case 'MacroInvoke':
      return expr.args.some((arg) => exprUsesTry(arg));
    case 'Range':
      return (expr.start ? exprUsesTry(expr.start) : false) || (expr.end ? exprUsesTry(expr.end) : false);
    case 'Index':
      return exprUsesTry(expr.object) || exprUsesTry(expr.index);
    default:
      return false;
  }
};

type EmitMapping = { offset: number; source: { line: number; column: number } };
type EmitResult = { code: string; mappings: EmitMapping[] };

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

function buildSourceMap(builder: CodeBuilder, options: CodegenJsOptions): RawSourceMap | undefined {
  if (!builder.map) return undefined;
  const sourceFile = options.sourceFile ?? 'input.lm';
  const generator = new SourceMapGenerator({ file: undefined });
  for (const mapping of builder.map.mappings) {
    if (!mapping.source) continue;
    generator.addMapping({
      generated: { line: mapping.line, column: mapping.column },
      original: { line: mapping.source.line, column: Math.max(0, mapping.source.column - 1) },
      source: sourceFile,
    });
  }
  if (options.sourceContent) {
    generator.setSourceContent(sourceFile, options.sourceContent);
  }
  return generator.toJSON();
}

function isUpperIdent(name: string): boolean {
  return /^[A-Z]/.test(name);
}
