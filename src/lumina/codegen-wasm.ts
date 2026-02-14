import { type Diagnostic } from '../parser/index.js';
import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaFnDecl } from './ast.js';
import { inferProgram } from './hm-infer.js';
import { prune, type Type } from './types.js';
import { type Location } from '../utils/index.js';

type WasmValType = 'i32' | 'f64';

export interface WasmCodegenOptions {
  exportMain?: boolean;
}

export interface WasmCodegenResult {
  wat: string;
  diagnostics: Diagnostic[];
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

export function generateWATFromAst(
  program: LuminaProgram,
  options: WasmCodegenOptions = {}
): WasmCodegenResult {
  const infer = inferProgram(program);
  const diagnostics = [...infer.diagnostics];

  const builder = new WasmBuilder(diagnostics, infer.subst, infer.inferredExprs, infer.inferredFnParams);
  const functions = program.body.filter((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl');

  builder.append('(module');
  builder.append('  (import "env" "print_int" (func $print_int (param i32)))');
  builder.append('  (import "env" "print_float" (func $print_float (param f64)))');
  builder.append('  (import "env" "print_bool" (func $print_bool (param i32)))');
  builder.append('  (import "env" "abs_int" (func $abs_int (param i32) (result i32)))');
  builder.append('  (import "env" "abs_float" (func $abs_float (param f64) (result f64)))');
  builder.append('  (memory (export "memory") 1)');
  for (const fn of functions) {
    builder.append(builder.emitFunction(fn));
  }
  if (options.exportMain !== false) {
    for (const fn of functions) {
      builder.append(`  (export "${fn.name}" (func $${fn.name}))`);
    }
  }
  builder.append(')');

  return { wat: builder.toString(), diagnostics };
}

class WasmBuilder {
  private lines: string[] = [];
  private diagnostics: Diagnostic[];
  private subst: Map<number, Type>;
  private exprTypes: Map<number, Type>;
  private fnParamTypes: Map<string, Type[]>;

  constructor(
    diagnostics: Diagnostic[],
    subst: Map<number, Type>,
    exprTypes: Map<number, Type>,
    fnParamTypes: Map<string, Type[]>
  ) {
    this.diagnostics = diagnostics;
    this.subst = subst;
    this.exprTypes = exprTypes;
    this.fnParamTypes = fnParamTypes;
  }

  append(line: string) {
    this.lines.push(line);
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }

  emitFunction(fn: LuminaFnDecl): string {
    const paramTypes = this.fnParamTypes.get(fn.name) ?? [];
    const params = fn.params.map((param, idx) => {
      const wasmType = this.typeToWasm(paramTypes[idx], param.location) ?? 'i32';
      return `(param $${param.name} ${wasmType})`;
    });

    const returnType = fn.returnType && fn.returnType !== 'void'
      ? this.inferReturnType(fn)
      : this.inferReturnType(fn);
    const resultSig = returnType ? `(result ${returnType})` : '';

    const locals = this.collectLocals(fn);
    const localsDecl = locals.length > 0 ? `  ${locals.join(' ')}` : '';

    const bodyLines = this.emitBlock(fn.body.body ?? []);
    const lines = [
      `  (func $${fn.name} ${params.join(' ')} ${resultSig}`.trimEnd(),
      localsDecl,
      ...bodyLines.map((line) => `    ${line}`),
      '  )',
    ];
    return lines.join('\n');
  }

  private inferReturnType(fn: LuminaFnDecl): WasmValType | null {
    if (!fn.body?.body) return null;
    const returnStmt = fn.body.body.find((stmt) => stmt.type === 'Return');
    if (!returnStmt) return null;
    const retExpr = (returnStmt as { value?: LuminaExpr }).value;
    if (!retExpr || typeof retExpr.id !== 'number') return null;
    const type = this.exprTypes.get(retExpr.id);
    return this.typeToWasm(type, retExpr.location);
  }

  private collectLocals(fn: LuminaFnDecl): string[] {
    const locals: string[] = [];
    const seen = new Set<string>();
    const walk = (stmt: LuminaStatement) => {
      if (stmt.type === 'Let') {
        const name = stmt.name;
        if (!seen.has(name)) {
          const type = typeof stmt.value?.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
          const wasmType = this.typeToWasm(type, stmt.location) ?? 'i32';
          locals.push(`(local $${name} ${wasmType})`);
          seen.add(name);
        }
      } else if (stmt.type === 'If') {
        stmt.thenBlock?.body?.forEach(walk);
        stmt.elseBlock?.body?.forEach(walk);
      } else if (stmt.type === 'While') {
        stmt.body?.body?.forEach(walk);
      } else if (stmt.type === 'Block') {
        stmt.body?.forEach(walk);
      }
    };
    fn.body?.body?.forEach(walk);
    return locals;
  }

  private emitBlock(statements: LuminaStatement[]): string[] {
    const lines: string[] = [];
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'Let': {
          const exprLines = this.emitExpr(stmt.value);
          lines.push(...exprLines);
          lines.push(`local.set $${stmt.name}`);
          break;
        }
        case 'Assign': {
          const exprLines = this.emitExpr(stmt.value);
          lines.push(...exprLines);
          if (stmt.target.type === 'Identifier') {
            lines.push(`local.set $${stmt.target.name}`);
          } else {
            this.reportUnsupported('assignment target', stmt.location);
            lines.push('unreachable');
          }
          break;
        }
        case 'Return': {
          const exprLines = this.emitExpr(stmt.value);
          lines.push(...exprLines);
          lines.push('return');
          break;
        }
        case 'ExprStmt': {
          const exprLines = this.emitExpr(stmt.expr);
          lines.push(...exprLines);
          if (this.exprReturnsValue(stmt.expr)) {
            lines.push('drop');
          }
          break;
        }
        case 'If':
          lines.push(...this.emitIf(stmt));
          break;
        case 'While':
        case 'MatchStmt':
        case 'StructDecl':
        case 'EnumDecl':
        case 'TypeDecl':
        case 'Import':
          this.reportUnsupported(stmt.type, stmt.location);
          lines.push('unreachable');
          break;
        default:
          lines.push('nop');
          break;
      }
    }
    return lines;
  }

  private emitIf(stmt: {
    condition: LuminaExpr;
    thenBlock: { body?: LuminaStatement[] };
    elseBlock?: { body?: LuminaStatement[] } | null;
  }): string[] {
    const lines: string[] = [];
    lines.push(...this.emitExpr(stmt.condition));
    lines.push('(if');
    lines.push('  (then');
    const thenLines = this.emitBlock(stmt.thenBlock?.body ?? []);
    for (const line of thenLines) {
      lines.push(`    ${line}`);
    }
    lines.push('  )');
    if (stmt.elseBlock) {
      lines.push('  (else');
      const elseLines = this.emitBlock(stmt.elseBlock.body ?? []);
      for (const line of elseLines) {
        lines.push(`    ${line}`);
      }
      lines.push('  )');
    }
    lines.push(')');
    return lines;
  }

  private exprReturnsValue(expr: LuminaExpr): boolean {
    if (typeof expr.id !== 'number') return true;
    const type = this.exprTypes.get(expr.id);
    if (!type) return true;
    const pruned = prune(type, this.subst);
    return !(pruned.kind === 'primitive' && pruned.name === 'void');
  }

  private emitExpr(expr: LuminaExpr): string[] {
    switch (expr.type) {
      case 'Number':
        return [this.emitNumber(expr)];
      case 'Boolean':
        return [`i32.const ${expr.value ? 1 : 0}`];
      case 'Identifier':
        return [`local.get $${expr.name}`];
      case 'Binary':
        return this.emitBinary(expr);
      case 'Call':
        return this.emitCall(expr);
      default:
        this.reportUnsupported(expr.type, expr.location);
        return ['unreachable'];
    }
  }

  private emitNumber(expr: { value: number; location?: Location; id?: number }): string {
    const type = typeof expr.id === 'number' ? this.exprTypes.get(expr.id) : undefined;
    const wasmType = this.typeToWasm(type, expr.location) ?? 'i32';
    if (wasmType === 'f64') {
      return `f64.const ${expr.value}`;
    }
    return `i32.const ${Math.trunc(expr.value)}`;
  }

  private emitBinary(expr: {
    op: string;
    left: LuminaExpr;
    right: LuminaExpr;
    location?: Location;
    id?: number;
  }): string[] {
    const type = typeof expr.id === 'number' ? this.exprTypes.get(expr.id) : undefined;
    const wasmType = this.typeToWasm(type, expr.location) ?? 'i32';
    const op = this.mapBinaryOp(expr.op, wasmType);
    return [...this.emitExpr(expr.left), ...this.emitExpr(expr.right), op];
  }

  private emitCall(expr: { callee: { name: string }; args: LuminaExpr[]; location?: Location }): string[] {
    const args: string[] = [];
    for (const arg of expr.args ?? []) {
      args.push(...this.emitExpr(arg));
    }
    args.push(`call $${expr.callee.name}`);
    return args;
  }

  private mapBinaryOp(op: string, wasmType: WasmValType): string {
    const prefix = wasmType === 'f64' ? 'f64' : 'i32';
    switch (op) {
      case '+':
        return `${prefix}.add`;
      case '-':
        return `${prefix}.sub`;
      case '*':
        return `${prefix}.mul`;
      case '/':
        return wasmType === 'f64' ? 'f64.div' : 'i32.div_s';
      case '==':
        return `${prefix}.eq`;
      case '!=':
        return `${prefix}.ne`;
      case '<':
        return wasmType === 'f64' ? 'f64.lt' : 'i32.lt_s';
      case '<=':
        return wasmType === 'f64' ? 'f64.le' : 'i32.le_s';
      case '>':
        return wasmType === 'f64' ? 'f64.gt' : 'i32.gt_s';
      case '>=':
        return wasmType === 'f64' ? 'f64.ge' : 'i32.ge_s';
      default:
        return `${prefix}.add`;
    }
  }

  private typeToWasm(type: Type | undefined, location?: Location): WasmValType | null {
    if (!type) return null;
    const pruned = prune(type, this.subst);
    if (pruned.kind === 'primitive') {
      if (pruned.name === 'int' || pruned.name === 'bool') return 'i32';
      if (pruned.name === 'float') return 'f64';
      if (pruned.name === 'void') return null;
    }
    this.reportUnsupported(`type '${this.formatType(pruned)}'`, location);
    return null;
  }

  private formatType(type: Type): string {
    if (type.kind === 'primitive') return type.name;
    if (type.kind === 'promise') return `Promise<${this.formatType(type.inner)}>`;
    if (type.kind === 'adt') return type.name;
    if (type.kind === 'function') return 'fn';
    return type.kind;
  }

  private reportUnsupported(feature: string, location?: Location) {
    this.diagnostics.push({
      severity: 'error',
      message: `WASM backend: unsupported ${feature}`,
      code: 'WASM-001',
      location: location ?? defaultLocation,
      source: 'lumina',
    });
  }
}
