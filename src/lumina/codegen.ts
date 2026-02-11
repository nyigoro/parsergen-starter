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
      out.push(
        `${pad}function ${node.name}(${params}) {`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      node.body.forEach(n => emit(n, indent + 1, out));
      out.push(`${pad}}`, node.kind, node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined);
      return;
    }
    case 'Let':
      out.push(
        `${pad}let ${node.name} = ${emitExpr(node.value)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      return;
    case 'Phi':
      out.push(
        `${pad}let ${node.name} = (${emitExpr(node.condition)}) ? ${emitExpr(node.thenValue)} : ${emitExpr(node.elseValue)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      return;
    case 'Return':
      out.push(
        `${pad}return ${emitExpr(node.value)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      return;
    case 'ExprStmt':
      out.push(
        `${pad}${emitExpr(node.expr)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      return;
    case 'If': {
      out.push(
        `${pad}if (${emitExpr(node.condition)}) {`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      node.thenBody.forEach(n => emit(n, indent + 1, out));
      if (node.elseBody && node.elseBody.length > 0) {
        out.push(`${pad}} else {`, node.kind, node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined);
        node.elseBody.forEach(n => emit(n, indent + 1, out));
      }
      out.push(`${pad}}`, node.kind, node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined);
      return;
    }
    case 'While': {
      out.push(
        `${pad}while (${emitExpr(node.condition)}) {`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      node.body.forEach(n => emit(n, indent + 1, out));
      out.push(`${pad}}`, node.kind, node.location ? { line: node.location.end.line, column: node.location.end.column } : undefined);
      return;
    }
    case 'Assign':
      out.push(
        `${pad}${node.target} = ${emitExpr(node.value)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
      return;
    case 'Binary':
    case 'Number':
    case 'Boolean':
    case 'String':
    case 'Identifier':
    case 'Call':
    case 'Member':
    case 'Index':
    case 'Enum':
    case 'MatchExpr':
      out.push(
        `${pad}${emitExpr(node)};`,
        node.kind,
        node.location ? { line: node.location.start.line, column: node.location.start.column } : undefined
      );
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
    case 'Call':
      return `${node.callee}(${node.args.map(emitExpr).join(', ')})`;
    case 'Member':
      return `${emitExpr(node.object)}.${node.property}`;
    case 'Index':
      return `${emitExpr(node.target)}[${node.index}]`;
    case 'Enum':
      return `{ tag: ${JSON.stringify(node.tag)}, values: [${node.values.map(emitExpr).join(', ')}] }`;
    case 'MatchExpr': {
      const tempName = `__match_expr_${Math.random().toString(36).slice(2, 8)}`;
      let body = `const ${tempName} = ${emitExpr(node.value)};\n`;
      const emitBindings = (bindings: string[]) => {
        return bindings
          .map((name, idx) => `const ${name} = ${tempName}.values[${idx}];`)
          .join('\n');
      };
      const arms = node.arms.map((arm) => {
        if (arm.variant === null) {
          const binds = arm.bindings.length > 0 ? emitBindings(arm.bindings) + '\n' : '';
          return `{\n${binds}return ${emitExpr(arm.body)};\n}`;
        }
        const binds = arm.bindings.length > 0 ? emitBindings(arm.bindings) + '\n' : '';
        return `if (${tempName}.tag === ${JSON.stringify(arm.variant)}) {\n${binds}return ${emitExpr(arm.body)};\n}`;
      });
      let chain = '';
      for (let i = 0; i < arms.length; i++) {
        if (i === 0) chain += arms[i];
        else chain += ` else ${arms[i]}`;
      }
      return `(() => {\n${body}${chain}\n})()`;
    }
    case 'Number':
      return String(node.value);
    case 'Boolean':
      return node.value ? 'true' : 'false';
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
  readonly map?: { mappings: Array<{ line: number; kind: string; source?: { line: number; column: number } }> };

  constructor(trackMap: boolean) {
    if (trackMap) {
      this.map = { mappings: [] };
    }
  }

  push(line: string, kind: string, source?: { line: number; column: number }) {
    this.lines.push(line);
    if (this.map) {
      this.map.mappings.push({ line: this.lines.length, kind, source });
    }
  }

  toString(): string {
    return this.lines.join('\n') + (this.lines.length ? '\n' : '');
  }
}
