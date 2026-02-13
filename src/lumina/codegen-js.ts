import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaMatchPattern } from './ast.js';
import { SourceMapGenerator, type RawSourceMap } from 'source-map';

export interface CodegenJsOptions {
  target?: 'esm' | 'cjs';
  includeRuntime?: boolean;
  sourceMap?: boolean;
  sourceFile?: string;
  sourceContent?: string;
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

  constructor(private readonly builder: CodeBuilder, options: CodegenJsOptions) {
    this.target = options.target ?? 'esm';
    this.includeRuntime = options.includeRuntime !== false;
  }

  emitProgram(node: LuminaProgram): void {
    if (this.includeRuntime) {
      if (this.target === 'cjs') {
        this.builder.append(
          'const { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic } = require("./lumina-runtime.cjs");'
        );
      } else {
        this.builder.append(
          'import { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";'
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
      this.builder.append('function __set(obj, prop, value) { obj[prop] = value; return value; }');
    }
    this.builder.append('\n');

    for (const stmt of node.body) {
      this.emitStatement(stmt);
    }

    if (this.includeRuntime) {
      if (this.target === 'cjs') {
        this.builder.append('module.exports = { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic };');
      } else {
        this.builder.append('export { io, str, math, list, fs, Result, Option, __set, formatValue, LuminaPanic };');
      }
    } else {
      if (this.target === 'cjs') {
        this.builder.append('module.exports = { io, str, math, fs, __set };');
      } else {
        this.builder.append('export { io, str, math, fs, __set };');
      }
    }
    this.builder.append('\n');
  }

  private emitStatement(stmt: LuminaStatement): void {
    const pad = this.pad();
    switch (stmt.type) {
      case 'FnDecl': {
        const params = stmt.params.map((p) => p.name).join(', ');
        const asyncKeyword = stmt.async ? 'async ' : '';
        this.builder.append(
          `${pad}${asyncKeyword}function ${stmt.name}(${params}) `,
          stmt.type,
          stmt.location ? { line: stmt.location.start.line, column: stmt.location.start.column } : undefined
        );
        this.emitBlock(stmt.body, { inline: true, trailingNewline: false });
        this.builder.append('\n');
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
      case 'TypeDecl':
      case 'StructDecl':
      case 'EnumDecl':
      case 'Import':
      case 'ErrorNode':
        return;
      default:
        return;
    }
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
      case 'Identifier':
        return withBase({ code: expr.name, mappings: [] });
      case 'Move':
        return withBase(this.emitExpr(expr.target));
      case 'Await': {
        const value = this.emitExpr(expr.value);
        return withBase(concat('await ', value));
      }
      case 'Binary':
        return withBase(concat('(', this.emitExpr(expr.left), ` ${expr.op} `, this.emitExpr(expr.right), ')'));
      case 'Call': {
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
