import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaMatchPattern,
  type LuminaFnDecl,
  type LuminaImplDecl,
  type LuminaTraitDecl,
  type LuminaTraitMethod,
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
          'const { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic } = require("./lumina-runtime.cjs");'
        );
      } else {
        this.builder.append(
          'import { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic } from "./lumina-runtime.js";'
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
      this.builder.append('const http = { fetch: async () => ({ $tag: "Err", $payload: "No http runtime" }) };');
      this.builder.append('\n');
      this.builder.append(
        'const time = { nowMs: () => Date.now(), nowIso: () => new Date().toISOString(), instantNow: () => Date.now(), elapsedMs: (since) => Math.max(0, Date.now() - since), sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.trunc(ms)))) };'
      );
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
      this.builder.append(
        'function __lumina_index(target, index) { if (typeof target === "string" && index && typeof index === "object" && "start" in index) { const start = index.start == null ? 0 : Math.max(0, index.start); const endBase = index.end == null ? target.length : Math.max(0, index.end); return __lumina_slice(target, start, endBase, index.inclusive); } return target ? target[index] : undefined; }'
      );
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
          'module.exports = { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic };'
        );
      } else {
        this.builder.append(
          'export { io, str, math, list, vec, hashmap, hashset, channel, thread, sync, fs, http, time, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, LuminaPanic };'
        );
      }
    } else {
      if (this.target === 'cjs') {
        this.builder.append('module.exports = { io, str, math, fs, http, time, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index };');
      } else {
        this.builder.append('export { io, str, math, fs, http, time, regex, crypto, __set, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index };');
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
      case 'TypeDecl':
      case 'TraitDecl':
      case 'StructDecl':
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
    const traitDecl = this.traitDecls.get(traitName);
    const implemented = new Set(stmt.methods.map((method) => method.name));
    for (const method of stmt.methods) {
      const mangledName = mangleTraitMethodName(traitType, forType, method.name);
      this.emitFunctionDecl(mangledName, method);
    }
    if (traitDecl) {
      for (const method of traitDecl.methods) {
        if (!method.body) continue;
        if (implemented.has(method.name)) continue;
        const mangledName = mangleTraitMethodName(traitType, forType, method.name);
        this.emitDefaultTraitMethod(mangledName, traitType, forType, method);
      }
    }
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
    const pad = this.pad();
    this.builder.append(
      `${pad}const ${matchId} = `,
      stmt.type,
      stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
    );
    this.builder.appendExpr(this.emitExpr(stmt.value));
    this.builder.append(';\n');
    this.builder.append(`${pad}switch (${matchId}.$tag) {\n`);
    this.indentLevel++;
    let hasWildcard = false;
    for (const arm of stmt.arms) {
      if (arm.pattern.type === 'WildcardPattern') {
        hasWildcard = true;
        this.builder.append(`${this.pad()}default: {\n`);
        this.indentLevel++;
        this.emitMatchBindings(matchId, arm.pattern);
        for (const s of arm.body.body) {
          this.emitStatement(s);
        }
        this.builder.append(`${this.pad()}break;\n`);
        this.indentLevel--;
        this.builder.append(`${this.pad()}}\n`);
        continue;
      }
      this.builder.append(`${this.pad()}case ${JSON.stringify(arm.pattern.variant)}: {\n`);
      this.indentLevel++;
      this.emitMatchBindings(matchId, arm.pattern);
      for (const s of arm.body.body) {
        this.emitStatement(s);
      }
      this.builder.append(`${this.pad()}break;\n`);
      this.indentLevel--;
      this.builder.append(`${this.pad()}}\n`);
    }
    if (!hasWildcard) {
      this.builder.append(`${this.pad()}default: {\n`);
      this.builder.append(`${this.pad()}  throw new Error("Exhaustiveness failure");\n`);
      this.builder.append(`${this.pad()}}\n`);
    }
    this.indentLevel--;
    this.builder.append(`${pad}}`);
  }

  private emitMatchBindings(matchId: string, pattern: LuminaMatchPattern): void {
    if (pattern.type !== 'EnumPattern') return;
    if (pattern.bindings.length === 0) return;
    pattern.bindings.forEach((binding, idx) => {
      if (binding === '_') return;
      if (pattern.bindings.length === 1) {
        this.builder.append(`${this.pad()}const ${binding} = ${matchId}.$payload;\n`);
        return;
      }
      this.builder.append(`${this.pad()}const ${binding} = ${matchId}.$payload[${idx}];\n`);
    });
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
        const parts: Array<string | EmitResult> = ['{ '];
        expr.fields.forEach((field, idx) => {
          if (idx > 0) parts.push(', ');
          parts.push(`${field.name}: `);
          parts.push(this.emitExpr(field.value));
        });
        parts.push(' }');
        return withBase(concat(...parts));
      }
      case 'MatchExpr':
        return withBase(this.emitMatchExpr(expr.value, expr.arms));
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
    arms: Array<{ pattern: LuminaMatchPattern; body: LuminaExpr }>
  ): EmitResult {
    const matchId = `__match_val_${this.matchCounter++}`;
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
    add(`switch (${matchId}.$tag) {\n`);
    let hasWildcard = false;
    for (const arm of arms) {
      if (arm.pattern.type === 'WildcardPattern') {
        hasWildcard = true;
        add('  default: {\n');
        const binds = this.emitMatchBindingsExpr(matchId, arm.pattern);
        if (binds) add(binds + '\n');
        add('    return ');
        add(this.emitExpr(arm.body));
        add(';\n  }\n');
        continue;
      }
      add(`  case ${JSON.stringify(arm.pattern.variant)}: {\n`);
      const binds = this.emitMatchBindingsExpr(matchId, arm.pattern);
      if (binds) add(binds + '\n');
      add('    return ');
      add(this.emitExpr(arm.body));
      add(';\n  }\n');
    }
    if (!hasWildcard) {
      add('  default: {\n    throw new Error("Exhaustiveness failure");\n  }\n');
    }
    add('}\n})()');
    return result;
  }

  private emitMatchBindingsExpr(matchId: string, pattern: LuminaMatchPattern): string {
    if (pattern.type !== 'EnumPattern') return '';
    if (pattern.bindings.length === 0) return '';
    const lines: string[] = [];
    pattern.bindings.forEach((binding, idx) => {
      if (binding === '_') return;
      if (pattern.bindings.length === 1) {
        lines.push(`    const ${binding} = ${matchId}.$payload;`);
        return;
      }
      lines.push(`    const ${binding} = ${matchId}.$payload[${idx}];`);
    });
    return lines.join('\n');
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
    case 'While':
      return exprUsesTry(stmt.condition) || blockUsesTry(stmt.body);
    case 'MatchStmt':
      return exprUsesTry(stmt.value) || stmt.arms.some((arm) => blockUsesTry(arm.body));
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
    case 'Binary':
      return exprUsesTry(expr.left) || exprUsesTry(expr.right);
    case 'Call':
      return expr.args.some(exprUsesTry);
    case 'Member':
      return exprUsesTry(expr.object);
    case 'StructLiteral':
      return expr.fields.some((field) => exprUsesTry(field.value));
    case 'MatchExpr':
      return exprUsesTry(expr.value) || expr.arms.some((arm) => exprUsesTry(arm.body));
    case 'Move':
      return exprUsesTry(expr.target);
    case 'InterpolatedString':
      return expr.parts.some((part) => typeof part !== 'string' && exprUsesTry(part));
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
