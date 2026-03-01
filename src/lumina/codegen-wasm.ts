import { type Diagnostic } from '../parser/index.js';
import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaFnDecl,
  type LuminaStructDecl,
  type LuminaTypeExpr,
  type LuminaConstExpr,
  type LuminaArrayType,
} from './ast.js';
import { inferProgram } from './hm-infer.js';
import { prune, type Type, normalizePrimitiveName } from './types.js';

const normalizeTargetTypeName = (name: string): string => {
  if (name === 'int') return 'i32';
  if (name === 'float') return 'f64';
  return name;
};

const isUnsignedTypeName = (name: string): boolean => name.startsWith('u');
const isFloatTypeName = (name: string): boolean => name === 'f32' || name === 'f64' || name === 'float';
import { type Location } from '../utils/index.js';

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
  return { base: trimmed.slice(0, idx), args: splitTypeArgs(trimmed.slice(idx + 1, -1)) };
};

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
  const structs = program.body.filter((stmt): stmt is LuminaStructDecl => stmt.type === 'StructDecl');

  builder.append('(module');
  builder.append('  (import "env" "print_int" (func $print_int (param i32)))');
  builder.append('  (import "env" "print_float" (func $print_float (param f64)))');
  builder.append('  (import "env" "print_bool" (func $print_bool (param i32)))');
  builder.append('  (import "env" "abs_int" (func $abs_int (param i32) (result i32)))');
  builder.append('  (import "env" "abs_float" (func $abs_float (param f64) (result f64)))');
  builder.append('  (memory (export "memory") 1)');
  for (const struct of structs) {
    builder.append(builder.emitStructLayout(struct));
  }
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

  emitStructLayout(struct: LuminaStructDecl): string {
    const fieldLayouts: Array<{ name: string; offset: number; size: number }> = [];
    let offset = 0;
    for (const field of struct.body) {
      const fieldSize = this.calculateTypeSize(field.typeName, field.location ?? struct.location);
      fieldLayouts.push({ name: field.name, offset, size: fieldSize });
      offset += fieldSize;
    }
    const totalSize = offset;
    const lines: string[] = [];
    lines.push(`  ;; Struct ${struct.name}`);
    lines.push(`  ;; Total size: ${totalSize} bytes`);
    lines.push(`  (func $${struct.name}_new (result i32)`);
    lines.push('    i32.const 0');
    lines.push('  )');
    for (const field of fieldLayouts) {
      lines.push(`  ;;   field ${field.name}: offset ${field.offset}, size ${field.size}`);
    }
    return lines.join('\n');
  }

  private calculateTypeSize(typeExpr: LuminaTypeExpr, location?: Location): number {
    if (typeof typeExpr === 'string') {
      const parsed = parseTypeName(typeExpr);
      if (parsed && parsed.base === 'Array' && parsed.args.length >= 2) {
        const elementSize = this.calculateTypeSize(parsed.args[0], location);
        const length = this.evaluateConstSizeText(parsed.args[1], location);
        if (length === null) return elementSize;
        return elementSize * length;
      }
      return this.getPrimitiveSize(typeExpr);
    }
    if ((typeExpr as LuminaArrayType).kind === 'array') {
      const arrayExpr = typeExpr as LuminaArrayType;
      const elementSize = this.calculateTypeSize(arrayExpr.element, location ?? arrayExpr.location);
      const length = arrayExpr.size ? this.evaluateConstSize(arrayExpr.size, location ?? arrayExpr.location) : null;
      if (length === null) return elementSize;
      return elementSize * length;
    }
    return 4;
  }

  private getPrimitiveSize(typeName: string): number {
    const normalized = normalizeTargetTypeName(typeName);
    const sizes: Record<string, number> = {
      i8: 1,
      u8: 1,
      i16: 2,
      u16: 2,
      i32: 4,
      u32: 4,
      int: 4,
      usize: 4,
      f32: 4,
      f64: 8,
      float: 8,
      i64: 8,
      u64: 8,
      i128: 16,
      u128: 16,
    };
    return sizes[normalized] ?? 4;
  }

  private evaluateConstSize(expr: LuminaConstExpr, location?: Location): number | null {
    switch (expr.type) {
      case 'ConstLiteral':
        return expr.value;
      case 'ConstParam':
        return null;
      case 'ConstBinary': {
        const left = this.evaluateConstSize(expr.left, location ?? expr.location);
        const right = this.evaluateConstSize(expr.right, location ?? expr.location);
        if (left === null || right === null) return null;
        switch (expr.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            if (right === 0) return null;
            return Math.floor(left / right);
          default:
            return null;
        }
      }
      default:
        return null;
    }
  }

  private evaluateConstSizeText(text: string, location?: Location): number | null {
    const tokens = text.trim().match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[()+\-*/]/g);
    if (!tokens || tokens.length === 0) return null;
    if (tokens.some((token) => /^[A-Za-z_]/.test(token))) return null;
    let index = 0;
    const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
    const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);
    const parsePrimary = (): number | null => {
      const token = consume();
      if (!token) return null;
      if (/^\d+$/.test(token)) return Number(token);
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
          if (right === 0) {
            this.reportUnsupported('const division by zero', location);
            return null;
          }
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
    return value;
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
        case 'TraitDecl':
        case 'ImplDecl':
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
      case 'Try':
        this.reportUnsupported('try operator', expr.location);
        return ['unreachable'];
      case 'Identifier':
        return [`local.get $${expr.name}`];
      case 'Cast': {
        const valueLines = this.emitExpr(expr.expr);
        const targetTypeName = typeof expr.targetType === 'string' ? expr.targetType : 'any';
        const normalizedTarget = normalizeTargetTypeName(targetTypeName);
        const targetWasm: WasmValType = isFloatTypeName(normalizedTarget) ? 'f64' : 'i32';
        const sourceType = typeof expr.expr.id === 'number' ? this.exprTypes.get(expr.expr.id) : undefined;
        const sourcePrim =
          sourceType && sourceType.kind === 'primitive' ? normalizePrimitiveName(sourceType.name) : null;
        const sourceWasm = this.typeToWasm(sourceType, expr.location) ?? targetWasm;

        if (sourceWasm === targetWasm) return valueLines;
        if (sourceWasm === 'i32' && targetWasm === 'f64') {
          const op = sourcePrim && isUnsignedTypeName(sourcePrim) ? 'f64.convert_i32_u' : 'f64.convert_i32_s';
          return [...valueLines, op];
        }
        if (sourceWasm === 'f64' && targetWasm === 'i32') {
          const op = normalizedTarget.startsWith('u') ? 'i32.trunc_f64_u' : 'i32.trunc_f64_s';
          return [...valueLines, op];
        }
        this.reportUnsupported(`cast to '${normalizedTarget}'`, expr.location);
        return valueLines;
      }
      case 'Binary':
        return this.emitBinary(expr);
      case 'Call':
        return this.emitCall(expr);
      case 'Index':
        return this.emitIndex(expr);
      default:
        this.reportUnsupported(expr.type, expr.location);
        return ['unreachable'];
    }
  }

  private emitIndex(expr: Extract<LuminaExpr, { type: 'Index' }>): string[] {
    const objectType = typeof expr.object.id === 'number' ? this.exprTypes.get(expr.object.id) : undefined;
    const arrayInfo = this.extractArrayTypeInfo(objectType, expr.location);
    const indexExpr = this.emitExpr(expr.index);
    const lines: string[] = [];
    if (arrayInfo && arrayInfo.length !== null) {
      lines.push(...indexExpr);
      lines.push(`i32.const ${arrayInfo.length}`);
      lines.push('i32.ge_u');
      lines.push('if');
      lines.push('  unreachable');
      lines.push('end');
    }
    lines.push(...this.emitExpr(expr.object));
    lines.push(...indexExpr);
    lines.push(`i32.const ${arrayInfo?.elementSize ?? 4}`);
    lines.push('i32.mul');
    lines.push('i32.add');
    lines.push(arrayInfo?.elementWasm === 'f64' ? 'f64.load' : 'i32.load');
    return lines;
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
      const normalized = normalizePrimitiveName(pruned.name);
      if (normalized === 'bool') return 'i32';
      if (normalized === 'i8' || normalized === 'i16' || normalized === 'i32' || normalized === 'u8' || normalized === 'u16' || normalized === 'u32') {
        return 'i32';
      }
      if (normalized === 'f32' || normalized === 'f64') {
        return 'f64';
      }
      if (normalized === 'i64' || normalized === 'u64' || normalized === 'i128' || normalized === 'u128') {
        this.reportUnsupported(`type '${normalized}' (WASM i64 not yet supported)`, location);
        return 'i32';
      }
      if (normalized === 'void') return null;
    }
    if (pruned.kind === 'adt' && pruned.name === 'Array') {
      return 'i32';
    }
    this.reportUnsupported(`type '${this.formatType(pruned)}'`, location);
    return null;
  }

  private extractArrayTypeInfo(
    type: Type | undefined,
    location?: Location
  ): { length: number | null; elementSize: number; elementWasm: WasmValType } | null {
    if (!type) return null;
    const pruned = prune(type, this.subst);
    if (pruned.kind !== 'adt' || pruned.name !== 'Array' || pruned.params.length < 2) return null;
    const element = prune(pruned.params[0], this.subst);
    const size = prune(pruned.params[1], this.subst);
    const elementWasm = this.typeToWasm(element, location) ?? 'i32';
    const elementSize = elementWasm === 'f64' ? 8 : 4;
    let length: number | null = null;
    if (size.kind === 'adt' && size.params.length === 0) {
      length = this.evaluateConstSizeText(size.name, location);
    } else if (size.kind === 'primitive') {
      length = this.evaluateConstSizeText(size.name, location);
    }
    return { length, elementSize, elementWasm };
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
