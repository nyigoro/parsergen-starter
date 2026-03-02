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
  type LuminaMatchPattern,
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
  let angleDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') angleDepth += 1;
    if (ch === '>') angleDepth -= 1;
    if (ch === '(') parenDepth += 1;
    if (ch === ')') parenDepth -= 1;
    if (ch === '{') braceDepth += 1;
    if (ch === '}') braceDepth -= 1;
    if (ch === ',' && angleDepth === 0 && parenDepth === 0 && braceDepth === 0) {
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

interface WasmEnumVariantInfo {
  tag: number;
  arity: number;
  hasIndexedResult: boolean;
  params: LuminaTypeExpr[];
}

type WasmEnumLayout = Map<string, Map<string, WasmEnumVariantInfo>>;

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

  const enumLayout: WasmEnumLayout = new Map();
  for (const stmt of program.body) {
    if (stmt.type !== 'EnumDecl') continue;
    const variants = new Map<string, WasmEnumVariantInfo>();
    stmt.variants.forEach((variant, index) => {
      variants.set(variant.name, {
        tag: index,
        arity: variant.params?.length ?? 0,
        hasIndexedResult: !!variant.resultType,
        params: variant.params ?? [],
      });
    });
    enumLayout.set(stmt.name, variants);
  }

  const builder = new WasmBuilder(diagnostics, infer.subst, infer.inferredExprs, infer.inferredFnParams, enumLayout);
  const functions = program.body.filter((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl');
  const structs = program.body.filter((stmt): stmt is LuminaStructDecl => stmt.type === 'StructDecl');

  builder.append('(module');
  builder.append('  (import "env" "print_int" (func $print_int (param i32)))');
  builder.append('  (import "env" "print_float" (func $print_float (param f64)))');
  builder.append('  (import "env" "print_bool" (func $print_bool (param i32)))');
  builder.append('  (import "env" "abs_int" (func $abs_int (param i32) (result i32)))');
  builder.append('  (import "env" "abs_float" (func $abs_float (param f64) (result f64)))');
  builder.append('  (memory (export "memory") 1)');
  builder.append('  (global $heap_ptr (mut i32) (i32.const 1024))');
  builder.append('  (func $alloc (param $size i32) (result i32)');
  builder.append('    (local $ptr i32)');
  builder.append('    global.get $heap_ptr');
  builder.append('    local.tee $ptr');
  builder.append('    local.get $size');
  builder.append('    i32.add');
  builder.append('    global.set $heap_ptr');
  builder.append('    local.get $ptr');
  builder.append('  )');
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
  private enumLayout: WasmEnumLayout;
  private matchCounter = 0;

  constructor(
    diagnostics: Diagnostic[],
    subst: Map<number, Type>,
    exprTypes: Map<number, Type>,
    fnParamTypes: Map<string, Type[]>,
    enumLayout: WasmEnumLayout
  ) {
    this.diagnostics = diagnostics;
    this.subst = subst;
    this.exprTypes = exprTypes;
    this.fnParamTypes = fnParamTypes;
    this.enumLayout = enumLayout;
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

  private evaluateConstSize(expr: LuminaConstExpr, _location?: Location): number | null {
    const evalValue = (node: LuminaConstExpr): number | boolean | null => {
      switch (node.type) {
        case 'ConstLiteral':
          return node.value;
        case 'ConstParam':
          return null;
        case 'ConstUnary': {
          const value = evalValue(node.expr);
          if (value == null) return null;
          if (node.op === '-') return typeof value === 'number' ? -value : null;
          return typeof value === 'boolean' ? !value : null;
        }
        case 'ConstBinary': {
          const left = evalValue(node.left);
          const right = evalValue(node.right);
          if (left == null || right == null) return null;
          switch (node.op) {
            case '+':
            case '-':
            case '*':
            case '/':
              if (typeof left !== 'number' || typeof right !== 'number') return null;
              if (node.op === '+') return left + right;
              if (node.op === '-') return left - right;
              if (node.op === '*') return left * right;
              return right === 0 ? null : Math.floor(left / right);
            case '<':
            case '<=':
            case '>':
            case '>=':
              if (typeof left !== 'number' || typeof right !== 'number') return null;
              if (node.op === '<') return left < right;
              if (node.op === '<=') return left <= right;
              if (node.op === '>') return left > right;
              return left >= right;
            case '==':
              return left === right;
            case '!=':
              return left !== right;
            case '&&':
            case '||':
              if (typeof left !== 'boolean' || typeof right !== 'boolean') return null;
              return node.op === '&&' ? left && right : left || right;
            default:
              return null;
          }
        }
        case 'ConstCall': {
          if (node.args.length !== 2) return null;
          const left = evalValue(node.args[0]);
          const right = evalValue(node.args[1]);
          if (typeof left !== 'number' || typeof right !== 'number') return null;
          if (node.name === 'min') return Math.min(left, right);
          if (node.name === 'max') return Math.max(left, right);
          return null;
        }
        case 'ConstIf': {
          const condition = evalValue(node.condition);
          if (typeof condition !== 'boolean') return null;
          return evalValue(condition ? node.thenExpr : node.elseExpr);
        }
        default:
          return null;
      }
    };
    const value = evalValue(expr);
    return typeof value === 'number' ? Math.trunc(value) : null;
  }

  private evaluateConstSizeText(text: string, location?: Location): number | null {
    const tokens = text.trim().match(/<=|>=|==|!=|\|\||&&|[(){}!,+\-*/<>]|[A-Za-z_][A-Za-z0-9_]*|\d+/g);
    if (!tokens || tokens.length === 0) return null;
    let index = 0;
    const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
    const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);
    const match = (token: string): boolean => {
      if (peek() !== token) return false;
      consume();
      return true;
    };
    const parsePrimary = (): number | boolean | null => {
      const token = consume();
      if (!token) return null;
      if (/^\d+$/.test(token)) return Number(token);
      if (token === 'true') return true;
      if (token === 'false') return false;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
        if (peek() === '(' && (token === 'min' || token === 'max')) {
          consume();
          const left = parseExpr();
          if (!match(',')) return null;
          const right = parseExpr();
          if (!match(')')) return null;
          if (typeof left !== 'number' || typeof right !== 'number') return null;
          return token === 'min' ? Math.min(left, right) : Math.max(left, right);
        }
        return null;
      }
      if (token === '(') {
        const inner = parseExpr();
        if (peek() !== ')') return null;
        consume();
        return inner;
      }
      return null;
    };
    const parseUnary = (): number | boolean | null => {
      const token = peek();
      if (token === '-' || token === '!') {
        consume();
        const value = parseUnary();
        if (value == null) return null;
        if (token === '-') return typeof value === 'number' ? -value : null;
        return typeof value === 'boolean' ? !value : null;
      }
      return parsePrimary();
    };
    const parseMulDiv = (): number | boolean | null => {
      let left = parseUnary();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '*' && op !== '/') break;
        consume();
        const right = parseUnary();
        if (right === null) return null;
        if (typeof left !== 'number' || typeof right !== 'number') return null;
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
    const parseAddSub = (): number | boolean | null => {
      let left = parseMulDiv();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '+' && op !== '-') break;
        consume();
        const right = parseMulDiv();
        if (right === null) return null;
        if (typeof left !== 'number' || typeof right !== 'number') return null;
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };
    const parseCompare = (): number | boolean | null => {
      let left = parseAddSub();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '<' && op !== '<=' && op !== '>' && op !== '>=') break;
        consume();
        const right = parseAddSub();
        if (right === null) return null;
        if (typeof left !== 'number' || typeof right !== 'number') return null;
        if (op === '<') left = left < right;
        else if (op === '<=') left = left <= right;
        else if (op === '>') left = left > right;
        else left = left >= right;
      }
      return left;
    };
    const parseEquality = (): number | boolean | null => {
      let left = parseCompare();
      if (left === null) return null;
      while (true) {
        const op = peek();
        if (op !== '==' && op !== '!=') break;
        consume();
        const right = parseCompare();
        if (right === null) return null;
        left = op === '==' ? left === right : left !== right;
      }
      return left;
    };
    const parseAnd = (): number | boolean | null => {
      let left = parseEquality();
      if (left === null) return null;
      while (match('&&')) {
        const right = parseEquality();
        if (right === null) return null;
        if (typeof left !== 'boolean' || typeof right !== 'boolean') return null;
        left = left && right;
      }
      return left;
    };
    const parseOr = (): number | boolean | null => {
      let left = parseAnd();
      if (left === null) return null;
      while (match('||')) {
        const right = parseAnd();
        if (right === null) return null;
        if (typeof left !== 'boolean' || typeof right !== 'boolean') return null;
        left = left || right;
      }
      return left;
    };
    const parseIf = (): number | boolean | null => {
      if (peek() !== 'if') return parseOr();
      consume();
      const condition = parseExpr();
      if (typeof condition !== 'boolean') return null;
      if (!match('{')) return null;
      const thenExpr = parseExpr();
      if (!match('}')) return null;
      if (!match('else')) return null;
      if (!match('{')) return null;
      const elseExpr = parseExpr();
      if (!match('}')) return null;
      return condition ? thenExpr : elseExpr;
    };
    const parseExpr = (): number | boolean | null => parseIf();
    const value = parseExpr();
    if (value === null || index !== tokens.length || typeof value !== 'number') return null;
    return Math.trunc(value);
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
    const addLocal = (name: string, wasmType: WasmValType | 'i32' | 'f64' = 'i32') => {
      if (seen.has(name)) return;
      locals.push(`(local $${name} ${wasmType})`);
      seen.add(name);
    };
    addLocal('__enum_tmp', 'i32');
    const walk = (stmt: LuminaStatement) => {
      if (stmt.type === 'Let') {
        const name = stmt.name;
        const type = typeof stmt.value?.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
        const wasmType = this.typeToWasm(type, stmt.location) ?? 'i32';
        addLocal(name, wasmType);
      } else if (stmt.type === 'If') {
        stmt.thenBlock?.body?.forEach(walk);
        stmt.elseBlock?.body?.forEach(walk);
      } else if (stmt.type === 'While') {
        stmt.body?.body?.forEach(walk);
      } else if (stmt.type === 'MatchStmt') {
        const matchTemp = this.getMatchTempName(stmt);
        addLocal(matchTemp, 'i32');
        for (const arm of stmt.arms ?? []) {
          if (arm.pattern.type === 'EnumPattern') {
            const enumName = arm.pattern.enumName;
            if (enumName) {
              const variant = this.resolveEnumVariantInfo(enumName, arm.pattern.variant);
              if (variant) {
                const bindings = this.extractSimpleEnumPatternBindings(arm.pattern, variant.arity);
                if (bindings) {
                  for (let i = 0; i < bindings.length; i += 1) {
                    const binding = bindings[i];
                    if (binding === '_') continue;
                    const payloadWasm = this.typeExprToWasm(variant.params[i], arm.pattern.location) ?? 'i32';
                    addLocal(binding, payloadWasm);
                  }
                }
              }
            }
          }
          arm.body?.body?.forEach(walk);
        }
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
          this.reportUnsupported(stmt.type, stmt.location);
          lines.push('unreachable');
          break;
        case 'MatchStmt': {
          const lowered = this.emitSimpleEnumMatchStmt(stmt);
          if (lowered) {
            lines.push(...lowered);
          } else {
            this.reportUnsupported(stmt.type, stmt.location);
            lines.push('unreachable');
          }
          break;
        }
        case 'TraitDecl':
        case 'ImplDecl':
        case 'StructDecl':
        case 'EnumDecl':
        case 'TypeDecl':
        case 'Import':
          if (stmt.type === 'EnumDecl') {
            // Top-level enums are type-level metadata in this backend.
            lines.push('nop');
          } else {
            this.reportUnsupported(stmt.type, stmt.location);
            lines.push('unreachable');
          }
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

  private getMatchTempName(stmt: Extract<LuminaStatement, { type: 'MatchStmt' }>): string {
    const base = stmt.location?.start?.offset ?? this.matchCounter++;
    return `__match_${base}`;
  }

  private resolveEnumVariantInfo(enumName: string, variant: string): WasmEnumVariantInfo | null {
    const variants = this.enumLayout.get(enumName);
    if (!variants) return null;
    return variants.get(variant) ?? null;
  }

  private enumUsesHeapRepresentation(enumName: string): boolean {
    const variants = this.enumLayout.get(enumName);
    if (!variants) return false;
    for (const variant of variants.values()) {
      if (variant.arity > 0) return true;
    }
    return false;
  }

  private typeExprToWasm(typeExpr: LuminaTypeExpr, location?: Location): WasmValType | null {
    if (typeof typeExpr === 'string') {
      const parsed = parseTypeName(typeExpr);
      const base = normalizeTargetTypeName(parsed?.base ?? typeExpr);
      if (
        base === 'bool' ||
        base === 'i8' ||
        base === 'i16' ||
        base === 'i32' ||
        base === 'u8' ||
        base === 'u16' ||
        base === 'u32' ||
        base === 'int' ||
        base === 'usize'
      ) {
        return 'i32';
      }
      if (base === 'f32' || base === 'f64' || base === 'float') {
        return 'f64';
      }
      this.reportUnsupported(`enum payload type '${base}' in WASM backend`, location, 'WASM-GADT-001');
      return null;
    }
    this.reportUnsupported('non-string enum payload type in WASM backend', location, 'WASM-GADT-001');
    return null;
  }

  private emitEnumAlloc(
    enumName: string,
    variant: WasmEnumVariantInfo,
    payloadExprs: LuminaExpr[],
    location?: Location
  ): string[] {
    const lines: string[] = [];
    const slotSize = 8;
    const totalSize = 8 + slotSize * variant.arity;
    lines.push(`i32.const ${totalSize}`);
    lines.push('call $alloc');
    lines.push('local.tee $__enum_tmp');
    lines.push(`i32.const ${variant.tag}`);
    lines.push('i32.store');
    if (variant.arity !== payloadExprs.length) {
      this.reportUnsupported(
        `enum constructor payload arity ${payloadExprs.length} does not match variant arity ${variant.arity} for '${enumName}'`,
        location,
        'WASM-GADT-001'
      );
      lines.push('unreachable');
      lines.push('local.get $__enum_tmp');
      return lines;
    }
    for (let i = 0; i < variant.arity; i += 1) {
      const payloadType = this.typeExprToWasm(variant.params[i], location);
      if (!payloadType) {
        lines.push('unreachable');
        continue;
      }
      lines.push('local.get $__enum_tmp');
      lines.push(`i32.const ${8 + i * slotSize}`);
      lines.push('i32.add');
      lines.push(...this.emitExpr(payloadExprs[i]));
      lines.push(payloadType === 'f64' ? 'f64.store' : 'i32.store');
    }
    lines.push('local.get $__enum_tmp');
    return lines;
  }

  private extractSimpleEnumPatternBindings(
    pattern: Extract<LuminaMatchPattern, { type: 'EnumPattern' }>,
    arity: number
  ): string[] | null {
    if (arity === 0) return [];
    const nested = pattern.patterns ?? [];
    if (nested.length > 0) {
      if (nested.length !== arity) return null;
      const out: string[] = [];
      for (const n of nested) {
        if (n.type === 'BindingPattern') {
          out.push(n.name);
          continue;
        }
        if (n.type === 'WildcardPattern') {
          out.push('_');
          continue;
        }
        return null;
      }
      return out;
    }
    if (pattern.bindings.length > 0) {
      if (pattern.bindings.length !== arity) return null;
      return [...pattern.bindings];
    }
    return null;
  }

  private emitSimpleEnumMatchStmt(stmt: Extract<LuminaStatement, { type: 'MatchStmt' }>): string[] | null {
    const matchTemp = this.getMatchTempName(stmt);
    const matchLines = this.emitExpr(stmt.value);
    const label = `$match_end_${this.matchCounter++}`;
    const lines: string[] = [];
    lines.push(...matchLines);
    lines.push(`local.set $${matchTemp}`);
    lines.push(`(block ${label}`);
    let hasFallback = false;

    for (const arm of stmt.arms) {
      if (arm.guard) return null;
      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (arm.pattern.type === 'BindingPattern') {
          lines.push(`  local.get $${matchTemp}`);
          lines.push(`  local.set $${arm.pattern.name}`);
        }
        const bodyLines = this.emitBlock(arm.body.body ?? []);
        lines.push(...bodyLines.map((line) => `  ${line}`));
        lines.push(`  br ${label}`);
        hasFallback = true;
        break;
      }
      if (arm.pattern.type !== 'EnumPattern') return null;
      const enumName = arm.pattern.enumName;
      if (!enumName) return null;
      const variantInfo = this.resolveEnumVariantInfo(enumName, arm.pattern.variant);
      if (!variantInfo) return null;
      const heapEnum = this.enumUsesHeapRepresentation(enumName);
      const payloadBindings = this.extractSimpleEnumPatternBindings(arm.pattern, variantInfo.arity);
      if (!payloadBindings) return null;

      lines.push(`  local.get $${matchTemp}`);
      if (heapEnum) lines.push('  i32.load');
      lines.push(`  i32.const ${variantInfo.tag}`);
      lines.push('  i32.eq');
      lines.push('  if');
      for (let i = 0; i < payloadBindings.length; i += 1) {
        const payloadBinding = payloadBindings[i];
        if (payloadBinding === '_') continue;
        const payloadType = this.typeExprToWasm(variantInfo.params[i], arm.pattern.location);
        if (!payloadType) return null;
        lines.push(`    local.get $${matchTemp}`);
        lines.push(`    i32.const ${8 + i * 8}`);
        lines.push('    i32.add');
        lines.push(`    ${payloadType === 'f64' ? 'f64.load' : 'i32.load'}`);
        lines.push(`    local.set $${payloadBinding}`);
      }
      const bodyLines = this.emitBlock(arm.body.body ?? []);
      lines.push(...bodyLines.map((line) => `    ${line}`));
      lines.push(`    br ${label}`);
      lines.push('  end');
    }

    if (!hasFallback) {
      lines.push('  unreachable');
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
      case 'Member': {
        if (expr.object.type !== 'Identifier') {
          this.reportUnsupported('member expression', expr.location);
          return ['unreachable'];
        }
        const enumName = expr.object.name;
        const variantInfo = this.resolveEnumVariantInfo(enumName, expr.property);
        if (!variantInfo) {
          this.reportUnsupported(`member '${expr.object.name}.${expr.property}'`, expr.location);
          return ['unreachable'];
        }
        if (variantInfo.arity !== 0) {
          this.reportUnsupported(
            `enum variant '${expr.object.name}.${expr.property}' payload in WASM backend`,
            expr.location,
            'WASM-GADT-001'
          );
          return ['unreachable'];
        }
        if (this.enumUsesHeapRepresentation(enumName)) {
          return this.emitEnumAlloc(enumName, variantInfo, [], expr.location);
        }
        return [`i32.const ${variantInfo.tag}`];
      }
      case 'Try':
        this.reportUnsupported('try operator', expr.location);
        return ['unreachable'];
      case 'Identifier':
        return [`local.get $${expr.name}`];
      case 'IsExpr': {
        const enumName = expr.enumName;
        if (!enumName) {
          this.reportUnsupported('is expression without enum name in WASM backend', expr.location, 'WASM-GADT-001');
          return ['unreachable'];
        }
        const variantInfo = this.resolveEnumVariantInfo(enumName, expr.variant);
        if (!variantInfo) {
          this.reportUnsupported(`unknown enum variant '${enumName}.${expr.variant}'`, expr.location, 'WASM-GADT-001');
          return ['unreachable'];
        }
        const valueLines = this.emitExpr(expr.value);
        if (this.enumUsesHeapRepresentation(enumName)) {
          return [...valueLines, 'i32.load', `i32.const ${variantInfo.tag}`, 'i32.eq'];
        }
        return [...valueLines, `i32.const ${variantInfo.tag}`, 'i32.eq'];
      }
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

  private emitCall(expr: Extract<LuminaExpr, { type: 'Call' }>): string[] {
    if (expr.enumName) {
      const variantInfo = this.resolveEnumVariantInfo(expr.enumName, expr.callee.name);
      if (!variantInfo) {
        this.reportUnsupported(`unknown enum variant '${expr.enumName}.${expr.callee.name}'`, expr.location, 'WASM-GADT-001');
        return ['unreachable'];
      }
      const argCount = expr.args?.length ?? 0;
      if (variantInfo.arity !== argCount) {
        this.reportUnsupported(
          `enum constructor '${expr.enumName}.${expr.callee.name}' arity mismatch in WASM backend`,
          expr.location,
          'WASM-GADT-001'
        );
        return ['unreachable'];
      }
      if (variantInfo.arity === 0) {
        if (this.enumUsesHeapRepresentation(expr.enumName)) {
          return this.emitEnumAlloc(expr.enumName, variantInfo, [], expr.location);
        }
        return [`i32.const ${variantInfo.tag}`];
      }
      return this.emitEnumAlloc(expr.enumName, variantInfo, expr.args ?? [], expr.location);
    }
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
    if (pruned.kind === 'adt') {
      const variants = this.enumLayout.get(pruned.name);
      if (variants) {
        return 'i32';
      }
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

  private reportUnsupported(feature: string, location?: Location, code: string = 'WASM-001') {
    this.diagnostics.push({
      severity: 'error',
      message: `WASM backend: unsupported ${feature}`,
      code,
      location: location ?? defaultLocation,
      source: 'lumina',
    });
  }
}
