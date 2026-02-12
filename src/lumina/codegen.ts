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

  if (includeRuntime) {
    if (target === 'cjs') {
      builder.append(`const { io, Result, Option, __set, formatValue, LuminaPanic } = require("./lumina-runtime.cjs");`, 'Runtime');
      builder.append('\n');
    } else {
      builder.append(`import { io, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";`, 'Runtime');
      builder.append('\n');
    }
  } else {
    builder.append(`const io = { println: (...args) => console.log(...args), print: (...args) => console.log(...args) };`, 'Runtime');
    builder.append('\n');
    builder.append(`function __set(obj, prop, value) { obj[prop] = value; return value; }`, 'Runtime');
    builder.append('\n');
  }

  emit(ir, 0, builder);

  let code = builder.toString().trimEnd() + '\n';
  if (includeRuntime) {
    if (target === 'cjs') {
      code += 'module.exports = { io, Result, Option, __set, formatValue, LuminaPanic };\n';
    } else {
      code += 'export { io, Result, Option, __set, formatValue, LuminaPanic };\n';
    }
  } else {
    if (target === 'cjs') {
      code += 'module.exports = { io, __set };\n';
    } else {
      code += 'export { io, __set };\n';
    }
  }

  const map = options.sourceMap ? buildSourceMap(builder, options) : undefined;
  return { code, map };
}

function emit(node: IRNode, indent: number, out: CodeBuilder): void {
  const pad = '  '.repeat(indent);
  switch (node.kind) {
    case 'Program':
      node.body.forEach((n) => emit(n, indent, out));
      return;
    case 'Function': {
      const params = node.params.join(', ');
      out.append(
        `${pad}function ${node.name}(${params}) {`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.append('\n');
      node.body.forEach((n) => emit(n, indent + 1, out));
      out.append(`${pad}}`, node.kind, node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined);
      out.append('\n');
      return;
    }
    case 'Let':
      out.append(
        `${pad}let ${node.name} = `,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      out.appendExpr(emitExpr(node.value));
      out.append(';');
      out.append('\n');
      return;
    case 'Phi':
      out.append(
        `${pad}let ${node.name} = (`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
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
      node.thenBody.forEach((n) => emit(n, indent + 1, out));
      if (node.elseBody && node.elseBody.length > 0) {
        out.append(
          `${pad}} else {`,
          node.kind,
          node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
        );
        out.append('\n');
        node.elseBody.forEach((n) => emit(n, indent + 1, out));
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
      node.body.forEach((n) => emit(n, indent + 1, out));
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
