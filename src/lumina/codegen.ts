import { type IRNode } from './ir.js';

export interface CodegenResult {
  code: string;
  map?: { mappings: Array<{ line: number; kind: string }> };
}

export interface CodegenOptions {
  target?: 'esm' | 'cjs';
  includeRuntime?: boolean;
  sourceMap?: boolean;
}

export function generateJS(ir: IRNode, options: CodegenOptions = {}): CodegenResult {
  const target = options.target ?? 'esm';
  const includeRuntime = options.includeRuntime !== false;
  const builder = new CodeBuilder(options.sourceMap === true);

  if (includeRuntime) {
    builder.push(`function print(...args) { console.log(...args); }`, 'Runtime');
  }

  emit(ir, 0, builder);

  let code = builder.toString().trimEnd() + '\n';
  if (target === 'cjs') {
    code += 'module.exports = { print };\n';
  } else {
    code += 'export { print };\n';
  }

  return { code, map: builder.map };
}

function emit(node: IRNode, indent: number, out: CodeBuilder): void {
  const pad = '  '.repeat(indent);
  switch (node.kind) {
    case 'Program':
      node.body.forEach(n => emit(n, indent, out));
      return;
    case 'Function': {
      const params = node.params.join(', ');
      out.push(`${pad}function ${node.name}(${params}) {`, node.kind);
      node.body.forEach(n => emit(n, indent + 1, out));
      out.push(`${pad}}`, node.kind);
      return;
    }
    case 'Let':
      out.push(`${pad}let ${node.name} = ${emitExpr(node.value)};`, node.kind);
      return;
    case 'Return':
      out.push(`${pad}return ${emitExpr(node.value)};`, node.kind);
      return;
    case 'ExprStmt':
      out.push(`${pad}${emitExpr(node.expr)};`, node.kind);
      return;
    case 'Binary':
    case 'Number':
    case 'String':
    case 'Identifier':
      out.push(`${pad}${emitExpr(node)};`, node.kind);
      return;
    default:
      out.push(`${pad}// unsupported`, 'Unsupported');
      return;
  }
}

function emitExpr(node: IRNode): string {
  switch (node.kind) {
    case 'Binary':
      if (node.op === '+' && (node.left.kind === 'String' || node.right.kind === 'String')) {
        return `(${emitExpr(node.left)} + ${emitExpr(node.right)})`;
      }
      return `(${emitExpr(node.left)} ${node.op} ${emitExpr(node.right)})`;
    case 'Number':
      return String(node.value);
    case 'String':
      return JSON.stringify(node.value);
    case 'Identifier':
      return node.name;
    default:
      return 'undefined';
  }
}

class CodeBuilder {
  private lines: string[] = [];
  readonly map?: { mappings: Array<{ line: number; kind: string }> };

  constructor(trackMap: boolean) {
    if (trackMap) {
      this.map = { mappings: [] };
    }
  }

  push(line: string, kind: string) {
    this.lines.push(line);
    if (this.map) {
      this.map.mappings.push({ line: this.lines.length, kind });
    }
  }

  toString(): string {
    return this.lines.join('\n') + (this.lines.length ? '\n' : '');
  }
}
