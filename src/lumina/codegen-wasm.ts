import { type Diagnostic } from '../parser/index.js';
import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaFnDecl,
  type LuminaImplDecl,
  type LuminaTraitDecl,
  type LuminaStructDecl,
  type LuminaTypeExpr,
  type LuminaConstExpr,
  type LuminaArrayType,
  type LuminaMatchPattern,
} from './ast.js';
import { inferProgram } from './hm-infer.js';
import { prune, type Type, type ConstExpr as TypeConstExpr, normalizePrimitiveName } from './types.js';

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

interface WasmStructFieldLayout {
  name: string;
  offset: number;
  size: number;
  wasmType: WasmValType;
  typeName: LuminaTypeExpr;
}

interface WasmStructInfo {
  totalSize: number;
  fields: Map<string, WasmStructFieldLayout>;
  orderedFields: WasmStructFieldLayout[];
}

type WasmStructLayout = Map<string, WasmStructInfo>;

interface WasmTraitMethodDispatch {
  traitName: string;
  forType: string;
  method: string;
  wasmName: string;
  fn: LuminaFnDecl;
}

type WasmTraitDispatchMap = Map<string, Map<string, WasmTraitMethodDispatch>>;

interface WasmLambdaInfo {
  id: number;
  fnName: string;
  lambda: Extract<LuminaExpr, { type: 'Lambda' }>;
  captures: string[];
  captureTypes: Type[];
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const sanitizeWasmIdent = (value: string): string =>
  value.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'anon';

const resolveTypeExprName = (typeExpr: LuminaTypeExpr): string => {
  if (typeof typeExpr === 'string') {
    const parsed = parseTypeName(typeExpr);
    return parsed?.base ?? typeExpr;
  }
  if ((typeExpr as LuminaArrayType).kind === 'array') {
    return 'Array';
  }
  return 'unknown';
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
  if (!enumLayout.has('Option')) {
    enumLayout.set(
      'Option',
      new Map<string, WasmEnumVariantInfo>([
        ['Some', { tag: 0, arity: 1, hasIndexedResult: false, params: ['i32'] }],
        ['None', { tag: 1, arity: 0, hasIndexedResult: false, params: [] }],
      ])
    );
  }
  if (!enumLayout.has('Result')) {
    enumLayout.set(
      'Result',
      new Map<string, WasmEnumVariantInfo>([
        ['Ok', { tag: 0, arity: 1, hasIndexedResult: false, params: ['i32'] }],
        ['Err', { tag: 1, arity: 1, hasIndexedResult: false, params: ['i32'] }],
      ])
    );
  }

  const traitDecls = new Map<string, LuminaTraitDecl>();
  const structDecls = new Map<string, LuminaStructDecl>();
  const traitDispatch: WasmTraitDispatchMap = new Map();
  const implMethods: WasmTraitMethodDispatch[] = [];

  for (const stmt of program.body) {
    if (stmt.type === 'TraitDecl') {
      traitDecls.set(stmt.name, stmt);
      continue;
    }
    if (stmt.type === 'StructDecl') {
      structDecls.set(stmt.name, stmt);
      continue;
    }
    if (stmt.type !== 'ImplDecl') continue;
    const impl = stmt as LuminaImplDecl;
    const traitName = resolveTypeExprName(impl.traitType);
    const forTypeName = resolveTypeExprName(impl.forType);
    for (const method of impl.methods ?? []) {
      const wasmName = `${sanitizeWasmIdent(traitName)}_${sanitizeWasmIdent(forTypeName)}_${sanitizeWasmIdent(method.name)}`;
      const inferredParams = infer.inferredFnParams.get(method.name);
      if (inferredParams) {
        infer.inferredFnParams.set(wasmName, inferredParams);
      }
      const dispatch: WasmTraitMethodDispatch = {
        traitName,
        forType: forTypeName,
        method: method.name,
        wasmName,
        fn: {
          ...method,
          name: wasmName,
        },
      };
      implMethods.push(dispatch);
      if (!traitDispatch.has(forTypeName)) traitDispatch.set(forTypeName, new Map());
      traitDispatch.get(forTypeName)!.set(method.name, dispatch);
    }
  }

  const builder = new WasmBuilder(
    diagnostics,
    infer.subst,
    infer.inferredExprs,
    infer.inferredFnParams,
    enumLayout,
    structDecls,
    traitDecls,
    traitDispatch
  );
  const functions = program.body.filter((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl');
  const structs = program.body.filter((stmt): stmt is LuminaStructDecl => stmt.type === 'StructDecl');

  builder.append('(module');
  builder.append('  (import "env" "print_int" (func $print_int (param i32)))');
  builder.append('  (import "env" "print_float" (func $print_float (param f64)))');
  builder.append('  (import "env" "print_bool" (func $print_bool (param i32)))');
  builder.append('  (import "env" "print_string" (func $print_string (param i32)))');
  builder.append('  (import "env" "abs_int" (func $abs_int (param i32) (result i32)))');
  builder.append('  (import "env" "abs_float" (func $abs_float (param f64) (result f64)))');
  builder.append('  (import "env" "str_new" (func $str_new (param i32 i32) (result i32)))');
  builder.append('  (import "env" "str_concat" (func $str_concat (param i32 i32) (result i32)))');
  builder.append('  (import "env" "str_len" (func $str_len (param i32) (result i32)))');
  builder.append('  (import "env" "str_slice" (func $str_slice (param i32 i32 i32 i32) (result i32)))');
  builder.append('  (import "env" "str_eq" (func $str_eq (param i32 i32) (result i32)))');
  builder.append('  (import "env" "str_from_int" (func $str_from_int (param i32) (result i32)))');
  builder.append('  (import "env" "str_from_float" (func $str_from_float (param f64) (result i32)))');
  builder.append('  (import "env" "str_from_bool" (func $str_from_bool (param i32) (result i32)))');
  builder.append('  (import "env" "str_from_handle" (func $str_from_handle (param i32) (result i32)))');
  builder.append('  (import "env" "mem_retain" (func $mem_retain (param i32)))');
  builder.append('  (import "env" "mem_release" (func $mem_release (param i32)))');
  builder.append('  (import "env" "mem_stats_live" (func $mem_stats_live (result i32)))');
  builder.append('  (import "env" "vec_new" (func $vec_new (result i32)))');
  builder.append('  (import "env" "vec_len" (func $vec_len (param i32) (result i32)))');
  builder.append('  (import "env" "vec_push" (func $vec_push (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_get_has" (func $vec_get_has (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_get" (func $vec_get (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_pop_has" (func $vec_pop_has (param i32) (result i32)))');
  builder.append('  (import "env" "vec_pop" (func $vec_pop (param i32) (result i32)))');
  builder.append('  (import "env" "vec_clear" (func $vec_clear (param i32)))');
  builder.append('  (import "env" "vec_take" (func $vec_take (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_skip" (func $vec_skip (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_any_closure" (func $vec_any_closure (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_all_closure" (func $vec_all_closure (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_map_closure" (func $vec_map_closure (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_filter_closure" (func $vec_filter_closure (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_fold_closure" (func $vec_fold_closure (param i32 i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_find_has" (func $vec_find_has (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_find" (func $vec_find (param i32 i32) (result i32)))');
  builder.append('  (import "env" "vec_position" (func $vec_position (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_new" (func $hashmap_new (result i32)))');
  builder.append('  (import "env" "hashmap_len" (func $hashmap_len (param i32) (result i32)))');
  builder.append('  (import "env" "hashmap_insert_has" (func $hashmap_insert_has (param i32 i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_insert_prev" (func $hashmap_insert_prev (param i32 i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_get_has" (func $hashmap_get_has (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_get" (func $hashmap_get (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_remove_has" (func $hashmap_remove_has (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_remove" (func $hashmap_remove (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_contains_key" (func $hashmap_contains_key (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashmap_clear" (func $hashmap_clear (param i32)))');
  builder.append('  (import "env" "hashset_new" (func $hashset_new (result i32)))');
  builder.append('  (import "env" "hashset_len" (func $hashset_len (param i32) (result i32)))');
  builder.append('  (import "env" "hashset_insert" (func $hashset_insert (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashset_contains" (func $hashset_contains (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashset_remove" (func $hashset_remove (param i32 i32) (result i32)))');
  builder.append('  (import "env" "hashset_clear" (func $hashset_clear (param i32)))');
  builder.append('  (memory (export "memory") 1)');
  builder.append('  (global $heap_ptr (mut i32) (i32.const 4096))');
  builder.append('  (global $free_head (mut i32) (i32.const 0))');
  builder.append('  (func $__ensure_capacity (param $needed_end i32)');
  builder.append('    (local $current_bytes i32)');
  builder.append('    (local $required_pages i32)');
  builder.append('    memory.size');
  builder.append('    i32.const 65536');
  builder.append('    i32.mul');
  builder.append('    local.set $current_bytes');
  builder.append('    local.get $needed_end');
  builder.append('    local.get $current_bytes');
  builder.append('    i32.gt_u');
  builder.append('    if');
  builder.append('      local.get $needed_end');
  builder.append('      i32.const 65535');
  builder.append('      i32.add');
  builder.append('      i32.const 65536');
  builder.append('      i32.div_u');
  builder.append('      local.set $required_pages');
  builder.append('      local.get $required_pages');
  builder.append('      memory.size');
  builder.append('      i32.sub');
  builder.append('      memory.grow');
  builder.append('      drop');
  builder.append('    end');
  builder.append('  )');
  builder.append('  (func $alloc (param $size i32) (result i32)');
  builder.append('    (local $aligned i32)');
  builder.append('    (local $block i32)');
  builder.append('    (local $prev i32)');
  builder.append('    (local $curr i32)');
  builder.append('    (local $curr_size i32)');
  builder.append('    (local $next i32)');
  builder.append('    (local $needed_end i32)');
  builder.append('    local.get $size');
  builder.append('    i32.const 7');
  builder.append('    i32.add');
  builder.append('    i32.const -8');
  builder.append('    i32.and');
  builder.append('    local.set $aligned');
  builder.append('    local.get $aligned');
  builder.append('    i32.eqz');
  builder.append('    if');
  builder.append('      i32.const 8');
  builder.append('      local.set $aligned');
  builder.append('    end');
  builder.append('    i32.const 0');
  builder.append('    local.set $prev');
  builder.append('    global.get $free_head');
  builder.append('    local.set $curr');
  builder.append('    (block $search_done');
  builder.append('      (loop $search');
  builder.append('        local.get $curr');
  builder.append('        i32.eqz');
  builder.append('        br_if $search_done');
  builder.append('        local.get $curr');
  builder.append('        i32.load');
  builder.append('        local.set $curr_size');
  builder.append('        local.get $curr_size');
  builder.append('        local.get $aligned');
  builder.append('        i32.ge_u');
  builder.append('        if');
  builder.append('          local.get $curr');
  builder.append('          i32.const 4');
  builder.append('          i32.add');
  builder.append('          i32.load');
  builder.append('          local.set $next');
  builder.append('          local.get $prev');
  builder.append('          i32.eqz');
  builder.append('          if');
  builder.append('            local.get $next');
  builder.append('            global.set $free_head');
  builder.append('          else');
  builder.append('            local.get $prev');
  builder.append('            i32.const 4');
  builder.append('            i32.add');
  builder.append('            local.get $next');
  builder.append('            i32.store');
  builder.append('          end');
  builder.append('          local.get $curr');
  builder.append('          i32.const 8');
  builder.append('          i32.add');
  builder.append('          return');
  builder.append('        end');
  builder.append('        local.get $curr');
  builder.append('        local.set $prev');
  builder.append('        local.get $curr');
  builder.append('        i32.const 4');
  builder.append('        i32.add');
  builder.append('        i32.load');
  builder.append('        local.set $curr');
  builder.append('        br $search');
  builder.append('      )');
  builder.append('    )');
  builder.append('    global.get $heap_ptr');
  builder.append('    local.set $block');
  builder.append('    local.get $block');
  builder.append('    i32.const 8');
  builder.append('    i32.add');
  builder.append('    local.get $aligned');
  builder.append('    i32.add');
  builder.append('    local.set $needed_end');
  builder.append('    local.get $needed_end');
  builder.append('    call $__ensure_capacity');
  builder.append('    local.get $block');
  builder.append('    local.get $aligned');
  builder.append('    i32.store');
  builder.append('    local.get $block');
  builder.append('    i32.const 4');
  builder.append('    i32.add');
  builder.append('    i32.const 0');
  builder.append('    i32.store');
  builder.append('    local.get $needed_end');
  builder.append('    global.set $heap_ptr');
  builder.append('    local.get $block');
  builder.append('    i32.const 8');
  builder.append('    i32.add');
  builder.append('  )');
  builder.append('  (func $free (param $ptr i32)');
  builder.append('    (local $block i32)');
  builder.append('    local.get $ptr');
  builder.append('    i32.eqz');
  builder.append('    if');
  builder.append('      return');
  builder.append('    end');
  builder.append('    local.get $ptr');
  builder.append('    i32.const 8');
  builder.append('    i32.sub');
  builder.append('    local.set $block');
  builder.append('    local.get $block');
  builder.append('    i32.const 4');
  builder.append('    i32.add');
  builder.append('    global.get $free_head');
  builder.append('    i32.store');
  builder.append('    local.get $block');
  builder.append('    global.set $free_head');
  builder.append('  )');
  for (const struct of structs) {
    builder.append(builder.emitStructLayout(struct));
  }
  for (const fn of functions) {
    builder.append(builder.emitFunction(fn));
  }
  for (const implMethod of implMethods) {
    builder.append(builder.emitFunction(implMethod.fn));
  }
  const lambdaFns = builder.emitSynthesizedLambdas();
  if (lambdaFns.trim().length > 0) {
    builder.append(lambdaFns);
  }
  if (options.exportMain !== false) {
    for (const fn of functions) {
      builder.append(`  (export "${fn.name}" (func $${fn.name}))`);
    }
  }
  builder.append('  (export "__alloc" (func $alloc))');
  builder.append('  (export "__free" (func $free))');
  for (const lambdaFn of builder.getSynthesizedLambdaFunctionNames()) {
    builder.append(`  (export "${lambdaFn}" (func $${lambdaFn}))`);
  }
  builder.append(builder.emitStringDataSegments());
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
  private structDecls: Map<string, LuminaStructDecl>;
  private structLayout: WasmStructLayout = new Map();
  private traitDecls: Map<string, LuminaTraitDecl>;
  private traitDispatch: WasmTraitDispatchMap;
  private traitDispatchByFn = new Map<string, WasmTraitMethodDispatch>();
  private matchCounter = 0;
  private stringLiterals = new Map<string, { offset: number; bytes: number[] }>();
  private nextStringOffset = 32;
  private currentFunctionReturn: WasmValType | null = null;
  private currentFunctionReturnType: Type | undefined;
  private currentLocalTypes = new Map<string, Type>();
  private localLambdaBindings = new Map<string, WasmLambdaInfo>();
  private lambdaCounter = 0;
  private lambdaByExprId = new Map<number, WasmLambdaInfo>();
  private synthesizedLambdas: WasmLambdaInfo[] = [];

  constructor(
    diagnostics: Diagnostic[],
    subst: Map<number, Type>,
    exprTypes: Map<number, Type>,
    fnParamTypes: Map<string, Type[]>,
    enumLayout: WasmEnumLayout,
    structDecls: Map<string, LuminaStructDecl>,
    traitDecls: Map<string, LuminaTraitDecl>,
    traitDispatch: WasmTraitDispatchMap
  ) {
    this.diagnostics = diagnostics;
    this.subst = subst;
    this.exprTypes = exprTypes;
    this.fnParamTypes = fnParamTypes;
    this.enumLayout = enumLayout;
    this.structDecls = structDecls;
    this.traitDecls = traitDecls;
    this.traitDispatch = traitDispatch;
    for (const methods of traitDispatch.values()) {
      for (const dispatch of methods.values()) {
        this.traitDispatchByFn.set(dispatch.wasmName, dispatch);
      }
    }
    this.initializeStructLayouts();
  }

  append(line: string) {
    this.lines.push(line);
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }

  private initializeStructLayouts(): void {
    for (const struct of this.structDecls.values()) {
      const orderedFields: WasmStructFieldLayout[] = [];
      const fieldMap = new Map<string, WasmStructFieldLayout>();
      let offset = 0;
      for (const field of struct.body) {
        const wasmType = this.typeExprToWasm(field.typeName, field.location) ?? 'i32';
        const size = this.calculateTypeSize(field.typeName, field.location ?? struct.location);
        const info: WasmStructFieldLayout = {
          name: field.name,
          offset,
          size,
          wasmType,
          typeName: field.typeName,
        };
        orderedFields.push(info);
        fieldMap.set(field.name, info);
        offset += size;
      }
      this.structLayout.set(struct.name, {
        totalSize: offset,
        fields: fieldMap,
        orderedFields,
      });
    }
  }

  private lookupStructFieldInfo(expr: Extract<LuminaExpr, { type: 'Member' }>): WasmStructFieldLayout | null {
    const objectType =
      (typeof expr.object.id === 'number' ? this.exprTypes.get(expr.object.id) : undefined) ??
      (expr.object.type === 'Identifier' ? this.currentLocalTypes.get(expr.object.name) : undefined);
    if (!objectType) return null;
    const pruned = prune(objectType, this.subst);
    if (pruned.kind !== 'adt') return null;
    const struct = this.structLayout.get(pruned.name);
    if (!struct) return null;
    return struct.fields.get(expr.property) ?? null;
  }

  private allocStringLiteral(value: string): { offset: number; bytes: number[] } {
    const existing = this.stringLiterals.get(value);
    if (existing) return existing;
    const bytes = Array.from(new TextEncoder().encode(value));
    const offset = this.nextStringOffset;
    this.nextStringOffset += bytes.length + 1;
    const entry = { offset, bytes };
    this.stringLiterals.set(value, entry);
    return entry;
  }

  emitStringDataSegments(): string {
    if (this.stringLiterals.size === 0) return '';
    const lines: string[] = [];
    for (const [value, entry] of this.stringLiterals.entries()) {
      const escaped = Array.from(entry.bytes)
        .map((b) => `\\${b.toString(16).padStart(2, '0')}`)
        .join('');
      lines.push(`  (data (i32.const ${entry.offset}) "${escaped}") ;; "${value.replace(/"/g, '\\"')}"`);
    }
    return lines.join('\n');
  }

  emitSynthesizedLambdas(): string {
    const lines: string[] = [];
    for (let i = 0; i < this.synthesizedLambdas.length; i += 1) {
      const info = this.synthesizedLambdas[i];
      lines.push(this.emitFunction(this.createLambdaFunctionDecl(info)));
    }
    return lines.join('\n');
  }

  getSynthesizedLambdaFunctionNames(): string[] {
    return this.synthesizedLambdas.map((info) => info.fnName);
  }

  private createLambdaFunctionDecl(info: WasmLambdaInfo): LuminaFnDecl {
    const captureParams = info.captures.map((name) => ({
      name,
      typeName: null,
    }));
    const params = [...captureParams, ...(info.lambda.params ?? [])];
    return {
      type: 'FnDecl',
      name: info.fnName,
      async: !!info.lambda.async,
      params,
      returnType: info.lambda.returnType ?? null,
      body: info.lambda.body,
      typeParams: info.lambda.typeParams ?? [],
      whereClauses: [],
      extern: false,
      visibility: 'private',
      location: info.lambda.location,
    };
  }

  private getOrCreateLambdaInfo(lambda: Extract<LuminaExpr, { type: 'Lambda' }>): WasmLambdaInfo {
    const lambdaId = lambda.id;
    if (typeof lambdaId === 'number') {
      const existing = this.lambdaByExprId.get(lambdaId);
      if (existing) return existing;
    }
    const captures = this.resolveLambdaCaptures(lambda);
    const captureTypes = captures.map((name) => this.currentLocalTypes.get(name) ?? ({ kind: 'primitive', name: 'i32' } as Type));
    const info: WasmLambdaInfo = {
      id: ++this.lambdaCounter,
      fnName: `__lambda_${this.lambdaCounter}`,
      lambda,
      captures,
      captureTypes,
    };
    if (typeof lambdaId === 'number') {
      this.lambdaByExprId.set(lambdaId, info);
    }
    const type = typeof lambdaId === 'number' ? this.exprTypes.get(lambdaId) : undefined;
    const prunedType = type ? prune(type, this.subst) : undefined;
    const paramTypes = prunedType?.kind === 'function' ? prunedType.args : [];
    this.fnParamTypes.set(info.fnName, [...captureTypes, ...paramTypes]);
    this.synthesizedLambdas.push(info);
    return info;
  }

  private resolveLambdaCaptures(lambda: Extract<LuminaExpr, { type: 'Lambda' }>): string[] {
    if (Array.isArray(lambda.captures) && lambda.captures.length > 0) {
      return lambda.captures.filter((name) => this.currentLocalTypes.has(name));
    }
    const available = new Set(this.currentLocalTypes.keys());
    const params = new Set((lambda.params ?? []).map((param) => param.name));
    const captures = new Set<string>();

    const visitExpr = (expr: LuminaExpr, scope: Set<string>) => {
      switch (expr.type) {
        case 'Identifier':
          if (!scope.has(expr.name) && available.has(expr.name)) captures.add(expr.name);
          return;
        case 'Binary':
          visitExpr(expr.left, scope);
          visitExpr(expr.right, scope);
          return;
        case 'Call':
          if (expr.receiver) visitExpr(expr.receiver, scope);
          for (const arg of expr.args ?? []) visitExpr(arg, scope);
          return;
        case 'Member':
          visitExpr(expr.object, scope);
          return;
        case 'Index':
          visitExpr(expr.object, scope);
          visitExpr(expr.index, scope);
          return;
        case 'StructLiteral':
          for (const field of expr.fields ?? []) visitExpr(field.value, scope);
          return;
        case 'ArrayLiteral':
          for (const element of expr.elements ?? []) visitExpr(element, scope);
          return;
        case 'TupleLiteral':
          for (const element of expr.elements ?? []) visitExpr(element, scope);
          return;
        case 'ArrayRepeatLiteral':
          visitExpr(expr.value, scope);
          visitExpr(expr.count, scope);
          return;
        case 'InterpolatedString':
          for (const part of expr.parts ?? []) {
            if (typeof part !== 'string') visitExpr(part, scope);
          }
          return;
        case 'Cast':
          visitExpr(expr.expr, scope);
          return;
        case 'Try':
          visitExpr(expr.value, scope);
          return;
        case 'Await':
          visitExpr(expr.value, scope);
          return;
        case 'Move':
          if (expr.target.type === 'Identifier' && !scope.has(expr.target.name) && available.has(expr.target.name)) {
            captures.add(expr.target.name);
          }
          return;
        case 'MatchExpr':
          visitExpr(expr.value, scope);
          for (const arm of expr.arms ?? []) {
            if (arm.guard) visitExpr(arm.guard, scope);
            visitExpr(arm.body, new Set(scope));
          }
          return;
        case 'SelectExpr':
          for (const arm of expr.arms ?? []) {
            visitExpr(arm.value, scope);
            const next = new Set(scope);
            if (arm.binding && arm.binding !== '_') next.add(arm.binding);
            visitExpr(arm.body, next);
          }
          return;
        case 'Range':
          if (expr.start) visitExpr(expr.start, scope);
          if (expr.end) visitExpr(expr.end, scope);
          return;
        case 'IsExpr':
          visitExpr(expr.value, scope);
          return;
        case 'Lambda':
          return;
        default:
          return;
      }
    };

    const visitStmt = (stmt: LuminaStatement, scope: Set<string>) => {
      switch (stmt.type) {
        case 'Let':
          visitExpr(stmt.value, scope);
          scope.add(stmt.name);
          return;
        case 'Assign':
          if (stmt.target.type === 'Member') visitExpr(stmt.target.object, scope);
          visitExpr(stmt.value, scope);
          return;
        case 'ExprStmt':
          visitExpr(stmt.expr, scope);
          return;
        case 'Return':
          visitExpr(stmt.value, scope);
          return;
        case 'If':
          visitExpr(stmt.condition, scope);
          for (const s of stmt.thenBlock.body ?? []) visitStmt(s, new Set(scope));
          for (const s of stmt.elseBlock?.body ?? []) visitStmt(s, new Set(scope));
          return;
        case 'IfLet': {
          visitExpr(stmt.value, scope);
          const thenScope = new Set(scope);
          for (const name of this.collectPatternBindingNames(stmt.pattern)) thenScope.add(name);
          for (const s of stmt.thenBlock.body ?? []) visitStmt(s, thenScope);
          for (const s of stmt.elseBlock?.body ?? []) visitStmt(s, new Set(scope));
          return;
        }
        case 'While':
          visitExpr(stmt.condition, scope);
          for (const s of stmt.body.body ?? []) visitStmt(s, new Set(scope));
          return;
        case 'WhileLet': {
          visitExpr(stmt.value, scope);
          const whileScope = new Set(scope);
          for (const name of this.collectPatternBindingNames(stmt.pattern)) whileScope.add(name);
          for (const s of stmt.body.body ?? []) visitStmt(s, whileScope);
          return;
        }
        case 'For': {
          visitExpr(stmt.iterable, scope);
          const nested = new Set(scope);
          nested.add(stmt.iterator);
          for (const s of stmt.body.body ?? []) visitStmt(s, nested);
          return;
        }
        case 'MatchStmt':
          visitExpr(stmt.value, scope);
          for (const arm of stmt.arms ?? []) {
            if (arm.guard) visitExpr(arm.guard, scope);
            for (const s of arm.body.body ?? []) visitStmt(s, new Set(scope));
          }
          return;
        default:
          return;
      }
    };

    const scope = new Set(params);
    for (const stmt of lambda.body.body ?? []) {
      visitStmt(stmt, scope);
    }
    return Array.from(captures);
  }

  emitStructLayout(struct: LuminaStructDecl): string {
    const layout = this.structLayout.get(struct.name);
    if (!layout) return '';
    const lines: string[] = [];
    lines.push(`  ;; Struct ${struct.name}`);
    lines.push(`  ;; Total size: ${layout.totalSize} bytes`);
    const params = layout.orderedFields.map((field) => `(param $${field.name} ${field.wasmType})`).join(' ');
    lines.push(`  (func $${sanitizeWasmIdent(struct.name)}_new ${params} (result i32)`);
    lines.push('    (local $__struct_ptr i32)');
    lines.push(`    i32.const ${layout.totalSize}`);
    lines.push('    call $alloc');
    lines.push('    local.set $__struct_ptr');
    for (const field of layout.orderedFields) {
      lines.push('    local.get $__struct_ptr');
      if (field.offset !== 0) {
        lines.push(`    i32.const ${field.offset}`);
        lines.push('    i32.add');
      }
      lines.push(`    local.get $${field.name}`);
      lines.push(`    ${field.wasmType}.store`);
    }
    lines.push('    local.get $__struct_ptr');
    lines.push('  )');
    for (const field of layout.orderedFields) {
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
    if (fn.async) {
      this.reportUnsupported(
        `async function '${fn.name}' (WASM backend currently supports synchronous functions only)`,
        fn.location,
        'WASM-ASYNC-001'
      );
    }
    const paramTypes = this.fnParamTypes.get(fn.name) ?? [];
    const params = fn.params.map((param, idx) => {
      const wasmType = this.typeToWasm(paramTypes[idx], param.location) ?? 'i32';
      return `(param $${param.name} ${wasmType})`;
    });
    const prevLocalTypes = this.currentLocalTypes;
    const prevLocalLambdas = this.localLambdaBindings;
    this.currentLocalTypes = new Map();
    this.localLambdaBindings = new Map();
    const traitDispatch = this.traitDispatchByFn.get(fn.name);
    fn.params.forEach((param, idx) => {
      const type = paramTypes[idx];
      if (type) this.currentLocalTypes.set(param.name, type);
      if (!type && traitDispatch && idx === 0) {
        this.currentLocalTypes.set(param.name, { kind: 'adt', name: traitDispatch.forType, params: [] });
      }
    });

    const returnType = this.inferReturnType(fn);
    this.currentFunctionReturn = returnType;
    this.currentFunctionReturnType = this.inferFunctionReturnTypeNode(fn);
    const resultSig = returnType ? `(result ${returnType})` : '';

    const locals = this.collectLocals(fn);
    const localsDecl = locals.length > 0 ? `  ${locals.join(' ')}` : '';

    const bodyLines = this.emitBlock(fn.body.body ?? [], false);
    const lines = [
      `  (func $${fn.name} ${params.join(' ')} ${resultSig}`.trimEnd(),
      localsDecl,
      ...bodyLines.map((line) => `    ${line}`),
      '  )',
    ];
    this.currentFunctionReturn = null;
    this.currentFunctionReturnType = undefined;
    this.currentLocalTypes = prevLocalTypes;
    this.localLambdaBindings = prevLocalLambdas;
    return lines.join('\n');
  }

  private inferReturnType(fn: LuminaFnDecl): WasmValType | null {
    const fromDecl = this.inferFunctionReturnTypeNode(fn);
    if (fromDecl) {
      const declared = this.typeToWasm(fromDecl, fn.location);
      if (declared !== null) return declared;
    }
    if (!fn.body?.body) return null;
    const returnStmt = fn.body.body.find((stmt) => stmt.type === 'Return');
    if (!returnStmt) return null;
    const retExpr = (returnStmt as { value?: LuminaExpr }).value;
    if (!retExpr || typeof retExpr.id !== 'number') return null;
    const type = this.exprTypes.get(retExpr.id);
    return this.typeToWasm(type, retExpr.location);
  }

  private inferFunctionReturnTypeNode(fn: LuminaFnDecl): Type | undefined {
    if (fn.returnType === null) return undefined;
    if (typeof fn.returnType === 'string') {
      const parsed = parseTypeName(fn.returnType);
      const base = parsed?.base ?? fn.returnType;
      if (base === 'void') return { kind: 'primitive', name: 'void' };
      if (
        base === 'bool' ||
        base === 'int' ||
        base === 'i8' ||
        base === 'i16' ||
        base === 'i32' ||
        base === 'u8' ||
        base === 'u16' ||
        base === 'u32' ||
        base === 'usize' ||
        base === 'f32' ||
        base === 'f64' ||
        base === 'float' ||
        base === 'string'
      ) {
        return { kind: 'primitive', name: base as never };
      }
      return { kind: 'adt', name: base, params: [] };
    }
    if ((fn.returnType as LuminaArrayType).kind === 'array') {
      return { kind: 'adt', name: 'Array', params: [] };
    }
    return undefined;
  }

  private collectLocals(fn: LuminaFnDecl): string[] {
    const locals: string[] = [];
    const seen = new Set<string>();
    const addLocal = (name: string, wasmType: WasmValType | 'i32' | 'f64' = 'i32') => {
      if (seen.has(name)) return;
      locals.push(`(local $${name} ${wasmType})`);
      seen.add(name);
    };
    const walkExpr = (expr: LuminaExpr) => {
      switch (expr.type) {
        case 'MatchExpr': {
          addLocal(this.getMatchExprTempName(expr), 'i32');
          for (const arm of expr.arms ?? []) {
            for (const binding of this.collectPatternBindingNames(arm.pattern)) {
              addLocal(binding, 'i32');
            }
            if (arm.guard) walkExpr(arm.guard);
            walkExpr(arm.body);
          }
          walkExpr(expr.value);
          return;
        }
        case 'Binary':
          walkExpr(expr.left);
          walkExpr(expr.right);
          return;
        case 'Call':
          if (expr.receiver) walkExpr(expr.receiver);
          for (const arg of expr.args ?? []) walkExpr(arg);
          return;
        case 'Member':
          walkExpr(expr.object);
          return;
        case 'Index':
          walkExpr(expr.object);
          walkExpr(expr.index);
          return;
        case 'StructLiteral':
          for (const field of expr.fields ?? []) walkExpr(field.value);
          return;
        case 'ArrayLiteral':
        case 'TupleLiteral':
          for (const element of expr.elements ?? []) walkExpr(element);
          return;
        case 'ArrayRepeatLiteral':
          walkExpr(expr.value);
          walkExpr(expr.count);
          return;
        case 'InterpolatedString':
          for (const part of expr.parts ?? []) {
            if (typeof part !== 'string') walkExpr(part);
          }
          return;
        case 'Cast':
          walkExpr(expr.expr);
          return;
        case 'Try':
        case 'Await':
          walkExpr(expr.value);
          return;
        case 'Move':
          if (expr.target.type === 'Member') walkExpr(expr.target.object);
          return;
        case 'SelectExpr':
          for (const arm of expr.arms ?? []) {
            walkExpr(arm.value);
            walkExpr(arm.body);
          }
          return;
        case 'Range':
          if (expr.start) walkExpr(expr.start);
          if (expr.end) walkExpr(expr.end);
          return;
        case 'IsExpr':
          walkExpr(expr.value);
          return;
        default:
          return;
      }
    };
    addLocal('__enum_tmp', 'i32');
    addLocal('__tmp_i32', 'i32');
    const walk = (stmt: LuminaStatement) => {
      if (stmt.type === 'Let') {
        const name = stmt.name;
        const type = typeof stmt.value?.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
        const wasmType = this.typeToWasm(type, stmt.location) ?? 'i32';
        addLocal(name, wasmType);
        walkExpr(stmt.value);
      } else if (stmt.type === 'IfLet') {
        addLocal(this.getIfLetTempName(stmt), 'i32');
        for (const binding of this.collectPatternBindingNames(stmt.pattern)) {
          addLocal(binding, 'i32');
        }
        walkExpr(stmt.value);
        stmt.thenBlock?.body?.forEach(walk);
        stmt.elseBlock?.body?.forEach(walk);
      } else if (stmt.type === 'WhileLet') {
        addLocal(this.getWhileLetTempName(stmt), 'i32');
        for (const binding of this.collectPatternBindingNames(stmt.pattern)) {
          addLocal(binding, 'i32');
        }
        walkExpr(stmt.value);
        stmt.body?.body?.forEach(walk);
      } else if (stmt.type === 'If') {
        walkExpr(stmt.condition);
        stmt.thenBlock?.body?.forEach(walk);
        stmt.elseBlock?.body?.forEach(walk);
      } else if (stmt.type === 'While') {
        walkExpr(stmt.condition);
        stmt.body?.body?.forEach(walk);
      } else if (stmt.type === 'For') {
        addLocal(stmt.iterator, 'i32');
        addLocal(this.getForEndTempName(stmt), 'i32');
        walkExpr(stmt.iterable);
        stmt.body?.body?.forEach(walk);
      } else if (stmt.type === 'MatchStmt') {
        walkExpr(stmt.value);
        const matchTemp = this.getMatchTempName(stmt);
        addLocal(matchTemp, 'i32');
        for (const arm of stmt.arms ?? []) {
          for (const binding of this.collectPatternBindingNames(arm.pattern)) {
            addLocal(binding, 'i32');
          }
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
          if (arm.guard) walkExpr(arm.guard);
          arm.body?.body?.forEach(walk);
        }
      } else if (stmt.type === 'Block') {
        stmt.body?.forEach(walk);
      } else if (stmt.type === 'Assign') {
        if (stmt.target.type === 'Member') walkExpr(stmt.target.object);
        walkExpr(stmt.value);
      } else if (stmt.type === 'ExprStmt') {
        walkExpr(stmt.expr);
      } else if (stmt.type === 'Return') {
        walkExpr(stmt.value);
      }
    };
    fn.body?.body?.forEach(walk);
    return locals;
  }

  private emitBlock(statements: LuminaStatement[], scoped: boolean = true): string[] {
    const savedTypes = this.currentLocalTypes;
    const savedLambdas = this.localLambdaBindings;
    if (scoped) {
      this.currentLocalTypes = new Map(savedTypes);
      this.localLambdaBindings = new Map(savedLambdas);
    }
    const lines: string[] = [];
    for (const stmt of statements) {
      switch (stmt.type) {
        case 'Let': {
          const exprLines = this.emitExpr(stmt.value);
          lines.push(...exprLines);
          lines.push(`local.set $${stmt.name}`);
          if (typeof stmt.value.id === 'number') {
            const inferred = this.exprTypes.get(stmt.value.id);
            if (inferred) this.currentLocalTypes.set(stmt.name, inferred);
          } else if (stmt.value.type === 'Identifier') {
            const inherited = this.currentLocalTypes.get(stmt.value.name);
            if (inherited) this.currentLocalTypes.set(stmt.name, inherited);
            const lambda = this.localLambdaBindings.get(stmt.value.name);
            if (lambda) this.localLambdaBindings.set(stmt.name, lambda);
          } else if (stmt.value.type === 'StructLiteral') {
            this.currentLocalTypes.set(stmt.name, { kind: 'adt', name: stmt.value.name, params: [] });
          }
          if (stmt.value.type === 'Lambda') {
            this.localLambdaBindings.set(stmt.name, this.getOrCreateLambdaInfo(stmt.value));
          } else if (stmt.value.type !== 'Identifier') {
            this.localLambdaBindings.delete(stmt.name);
          }
          break;
        }
        case 'Assign': {
          if (stmt.target.type === 'Identifier') {
            const exprLines = this.emitExpr(stmt.value);
            lines.push(...exprLines);
            lines.push(`local.set $${stmt.target.name}`);
            if (stmt.value.type === 'Lambda') {
              this.localLambdaBindings.set(stmt.target.name, this.getOrCreateLambdaInfo(stmt.value));
            } else if (stmt.value.type === 'Identifier') {
              const lambda = this.localLambdaBindings.get(stmt.value.name);
              if (lambda) this.localLambdaBindings.set(stmt.target.name, lambda);
              else this.localLambdaBindings.delete(stmt.target.name);
            } else {
              this.localLambdaBindings.delete(stmt.target.name);
            }
          } else if (stmt.target.type === 'Member') {
            const fieldInfo = this.lookupStructFieldInfo(stmt.target);
            if (!fieldInfo) {
              this.reportUnsupported('assignment target member', stmt.location);
              lines.push('unreachable');
              break;
            }
            lines.push(...this.emitExpr(stmt.target.object));
            if (fieldInfo.offset !== 0) {
              lines.push(`i32.const ${fieldInfo.offset}`);
              lines.push('i32.add');
            }
            lines.push(...this.emitExpr(stmt.value));
            lines.push(`${fieldInfo.wasmType}.store`);
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
        case 'IfLet':
          lines.push(...this.emitIfLet(stmt));
          break;
        case 'While':
          lines.push(...this.emitWhile(stmt));
          break;
        case 'WhileLet':
          lines.push(...this.emitWhileLet(stmt));
          break;
        case 'For':
          lines.push(...this.emitFor(stmt));
          break;
        case 'MatchStmt': {
          const lowered = this.emitMatchStmt(stmt) ?? this.emitSimpleEnumMatchStmt(stmt);
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
        case 'Block':
          lines.push(...this.emitBlock(stmt.body ?? [], true));
          break;
        default:
          lines.push('nop');
          break;
      }
    }
    if (scoped) {
      this.currentLocalTypes = savedTypes;
      this.localLambdaBindings = savedLambdas;
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
    const thenLines = this.emitBlock(stmt.thenBlock?.body ?? [], true);
    for (const line of thenLines) {
      lines.push(`    ${line}`);
    }
    lines.push('  )');
    if (stmt.elseBlock) {
      lines.push('  (else');
      const elseLines = this.emitBlock(stmt.elseBlock.body ?? [], true);
      for (const line of elseLines) {
        lines.push(`    ${line}`);
      }
      lines.push('  )');
    }
    lines.push(')');
    return lines;
  }

  private resolvePatternEnumName(
    pattern: Extract<LuminaMatchPattern, { type: 'EnumPattern' }>,
    valueType?: Type
  ): string | null {
    if (pattern.enumName && this.enumLayout.has(pattern.enumName)) {
      return pattern.enumName;
    }
    if (valueType) {
      const pruned = prune(valueType, this.subst);
      if (pruned.kind === 'adt' && this.enumLayout.has(pruned.name)) {
        const variants = this.enumLayout.get(pruned.name);
        if (variants?.has(pattern.variant)) return pruned.name;
      }
    }
    const candidates: string[] = [];
    for (const [enumName, variants] of this.enumLayout.entries()) {
      if (variants.has(pattern.variant)) candidates.push(enumName);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  private emitPatternConditionFromLocal(
    pattern: LuminaMatchPattern,
    valueLocal: string,
    valueType?: Type
  ): string[] | null {
    switch (pattern.type) {
      case 'WildcardPattern':
      case 'BindingPattern':
        return ['i32.const 1'];
      case 'LiteralPattern': {
        if (typeof pattern.value === 'number') {
          return [`local.get $${valueLocal}`, `i32.const ${Math.trunc(pattern.value)}`, 'i32.eq'];
        }
        if (typeof pattern.value === 'boolean') {
          return [`local.get $${valueLocal}`, `i32.const ${pattern.value ? 1 : 0}`, 'i32.eq'];
        }
        if (typeof pattern.value === 'string') {
          return [
            `local.get $${valueLocal}`,
            ...this.emitExpr({ type: 'String', value: pattern.value, location: pattern.location }),
            'call $str_eq',
          ];
        }
        return null;
      }
      case 'EnumPattern': {
        const enumName = this.resolvePatternEnumName(pattern, valueType);
        if (!enumName) return null;
        const variantInfo = this.resolveEnumVariantInfo(enumName, pattern.variant);
        if (!variantInfo) return null;
        const lines = [`local.get $${valueLocal}`];
        if (this.enumUsesHeapRepresentation(enumName)) lines.push('i32.load');
        lines.push(`i32.const ${variantInfo.tag}`, 'i32.eq');
        return lines;
      }
      case 'TuplePattern':
      case 'StructPattern':
      default:
        return null;
    }
  }

  private emitPatternBindingsFromLocal(
    pattern: LuminaMatchPattern,
    valueLocal: string,
    valueType?: Type
  ): string[] | null {
    switch (pattern.type) {
      case 'WildcardPattern':
      case 'LiteralPattern':
        return [];
      case 'BindingPattern':
        return [`local.get $${valueLocal}`, `local.set $${pattern.name}`];
      case 'EnumPattern': {
        const enumName = this.resolvePatternEnumName(pattern, valueType);
        if (!enumName) return null;
        const variantInfo = this.resolveEnumVariantInfo(enumName, pattern.variant);
        if (!variantInfo) return null;
        const payloadBindings = this.extractSimpleEnumPatternBindings(pattern, variantInfo.arity);
        if (!payloadBindings) return null;
        const lines: string[] = [];
        for (let i = 0; i < payloadBindings.length; i += 1) {
          const binding = payloadBindings[i];
          if (binding === '_') continue;
          const payloadType = this.typeExprToWasm(variantInfo.params[i], pattern.location);
          if (!payloadType) return null;
          lines.push(
            `local.get $${valueLocal}`,
            `i32.const ${8 + i * 8}`,
            'i32.add',
            payloadType === 'f64' ? 'f64.load' : 'i32.load',
            `local.set $${binding}`
          );
        }
        return lines;
      }
      case 'TuplePattern':
      case 'StructPattern':
      default:
        return null;
    }
  }

  private emitIfLet(stmt: Extract<LuminaStatement, { type: 'IfLet' }>): string[] {
    const valueType = typeof stmt.value.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
    const tempName = this.getIfLetTempName(stmt);
    const condLines = this.emitPatternConditionFromLocal(stmt.pattern, tempName, valueType);
    const bindLines = this.emitPatternBindingsFromLocal(stmt.pattern, tempName, valueType);
    if (!condLines || !bindLines) {
      this.reportUnsupported('if let pattern in WASM backend', stmt.location);
      return ['unreachable'];
    }
    const lines: string[] = [];
    lines.push(...this.emitExpr(stmt.value));
    lines.push(`local.set $${tempName}`);
    lines.push(...condLines);
    lines.push('(if');
    lines.push('  (then');
    for (const line of bindLines) lines.push(`    ${line}`);
    const thenLines = this.emitBlock(stmt.thenBlock.body ?? [], true);
    for (const line of thenLines) lines.push(`    ${line}`);
    lines.push('  )');
    if (stmt.elseBlock) {
      lines.push('  (else');
      const elseLines = this.emitBlock(stmt.elseBlock.body ?? [], true);
      for (const line of elseLines) lines.push(`    ${line}`);
      lines.push('  )');
    }
    lines.push(')');
    return lines;
  }

  private emitWhile(stmt: Extract<LuminaStatement, { type: 'While' }>): string[] {
    const suffix = this.nodeTempSuffix(stmt);
    const loopLabel = `$while_loop_${suffix}`;
    const exitLabel = `$while_exit_${suffix}`;
    const lines: string[] = [];
    lines.push(`(block ${exitLabel}`);
    lines.push(`  (loop ${loopLabel}`);
    lines.push(...this.emitExpr(stmt.condition).map((line) => `    ${line}`));
    lines.push('    i32.eqz');
    lines.push(`    br_if ${exitLabel}`);
    const bodyLines = this.emitBlock(stmt.body.body ?? [], true);
    for (const line of bodyLines) lines.push(`    ${line}`);
    lines.push(`    br ${loopLabel}`);
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private emitWhileLet(stmt: Extract<LuminaStatement, { type: 'WhileLet' }>): string[] {
    const suffix = this.nodeTempSuffix(stmt);
    const loopLabel = `$whilelet_loop_${suffix}`;
    const exitLabel = `$whilelet_exit_${suffix}`;
    const tempName = this.getWhileLetTempName(stmt);
    const valueType = typeof stmt.value.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
    const condLines = this.emitPatternConditionFromLocal(stmt.pattern, tempName, valueType);
    const bindLines = this.emitPatternBindingsFromLocal(stmt.pattern, tempName, valueType);
    if (!condLines || !bindLines) {
      this.reportUnsupported('while let pattern in WASM backend', stmt.location);
      return ['unreachable'];
    }
    const lines: string[] = [];
    lines.push(`(block ${exitLabel}`);
    lines.push(`  (loop ${loopLabel}`);
    lines.push(...this.emitExpr(stmt.value).map((line) => `    ${line}`));
    lines.push(`    local.set $${tempName}`);
    lines.push(...condLines.map((line) => `    ${line}`));
    lines.push('    i32.eqz');
    lines.push(`    br_if ${exitLabel}`);
    for (const line of bindLines) lines.push(`    ${line}`);
    const bodyLines = this.emitBlock(stmt.body.body ?? [], true);
    for (const line of bodyLines) lines.push(`    ${line}`);
    lines.push(`    br ${loopLabel}`);
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private emitFor(stmt: Extract<LuminaStatement, { type: 'For' }>): string[] {
    if (stmt.iterable.type !== 'Range') {
      this.reportUnsupported('for-loop iterable (only ranges are supported in WASM backend)', stmt.location);
      return ['unreachable'];
    }
    const suffix = this.nodeTempSuffix(stmt);
    const loopLabel = `$for_loop_${suffix}`;
    const exitLabel = `$for_exit_${suffix}`;
    const endTemp = this.getForEndTempName(stmt);
    const lines: string[] = [];

    const startLines = stmt.iterable.start ? this.emitExpr(stmt.iterable.start) : ['i32.const 0'];
    lines.push(...startLines, `local.set $${stmt.iterator}`);

    if (stmt.iterable.end) {
      lines.push(...this.emitExpr(stmt.iterable.end), `local.set $${endTemp}`);
    } else {
      lines.push(`local.get $${stmt.iterator}`, `local.set $${endTemp}`);
    }

    const previousIterType = this.currentLocalTypes.get(stmt.iterator);
    this.currentLocalTypes.set(stmt.iterator, { kind: 'primitive', name: 'i32' });
    const bodyLines = this.emitBlock(stmt.body.body ?? [], true);
    if (previousIterType) this.currentLocalTypes.set(stmt.iterator, previousIterType);
    else this.currentLocalTypes.delete(stmt.iterator);

    lines.push(`(block ${exitLabel}`);
    lines.push(`  (loop ${loopLabel}`);
    lines.push(`    local.get $${stmt.iterator}`);
    lines.push(`    local.get $${endTemp}`);
    lines.push(stmt.iterable.inclusive ? '    i32.gt_s' : '    i32.ge_s');
    lines.push(`    br_if ${exitLabel}`);
    for (const line of bodyLines) lines.push(`    ${line}`);
    lines.push(`    local.get $${stmt.iterator}`);
    lines.push('    i32.const 1');
    lines.push('    i32.add');
    lines.push(`    local.set $${stmt.iterator}`);
    lines.push(`    br ${loopLabel}`);
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private getMatchTempName(stmt: Extract<LuminaStatement, { type: 'MatchStmt' }>): string {
    const base = stmt.location?.start?.offset ?? this.matchCounter++;
    return `__match_${base}`;
  }

  private nodeTempSuffix(node: { location?: Location; id?: number }): string {
    if (node.location?.start?.offset != null) return String(node.location.start.offset);
    if (typeof node.id === 'number') return String(node.id);
    return String(this.matchCounter++);
  }

  private getIfLetTempName(stmt: Extract<LuminaStatement, { type: 'IfLet' }>): string {
    return `__iflet_${this.nodeTempSuffix(stmt)}`;
  }

  private getWhileLetTempName(stmt: Extract<LuminaStatement, { type: 'WhileLet' }>): string {
    return `__whilelet_${this.nodeTempSuffix(stmt)}`;
  }

  private getMatchExprTempName(expr: Extract<LuminaExpr, { type: 'MatchExpr' }>): string {
    return `__match_expr_${this.nodeTempSuffix(expr)}`;
  }

  private getForEndTempName(stmt: Extract<LuminaStatement, { type: 'For' }>): string {
    return `__for_end_${this.nodeTempSuffix(stmt)}`;
  }

  private collectPatternBindingNames(pattern: LuminaMatchPattern): string[] {
    switch (pattern.type) {
      case 'BindingPattern':
        return pattern.name === '_' ? [] : [pattern.name];
      case 'TuplePattern':
        return pattern.elements.flatMap((element) => this.collectPatternBindingNames(element));
      case 'StructPattern':
        return pattern.fields.flatMap((field) => this.collectPatternBindingNames(field.pattern));
      case 'EnumPattern': {
        if (pattern.patterns && pattern.patterns.length > 0) {
          return pattern.patterns.flatMap((nested) => this.collectPatternBindingNames(nested));
        }
        return pattern.bindings.filter((name) => name !== '_');
      }
      case 'WildcardPattern':
      case 'LiteralPattern':
      default:
        return [];
    }
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
      if (
        base === 'string' ||
        this.structLayout.has(base) ||
        this.enumLayout.has(base) ||
        base === 'Option' ||
        base === 'Result'
      ) {
        return 'i32';
      }
      if (/^[A-Z][A-Za-z0-9_]*$/.test(base)) {
        return 'i32';
      }
      this.reportUnsupported(`enum payload type '${base}' in WASM backend`, location, 'WASM-GADT-001');
      return null;
    }
    if ((typeExpr as LuminaArrayType).kind === 'array') return 'i32';
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

  private emitMatchStmt(stmt: Extract<LuminaStatement, { type: 'MatchStmt' }>): string[] | null {
    const matchTemp = this.getMatchTempName(stmt);
    const valueType = typeof stmt.value.id === 'number' ? this.exprTypes.get(stmt.value.id) : undefined;
    const label = `$match_end_${this.nodeTempSuffix(stmt)}`;
    const lines: string[] = [];
    lines.push(...this.emitExpr(stmt.value));
    lines.push(`local.set $${matchTemp}`);
    lines.push(`(block ${label}`);
    let hasFallback = false;

    for (const arm of stmt.arms ?? []) {
      if (arm.guard) return null;
      const condLines = this.emitPatternConditionFromLocal(arm.pattern, matchTemp, valueType);
      const bindLines = this.emitPatternBindingsFromLocal(arm.pattern, matchTemp, valueType);
      if (!condLines || !bindLines) return null;
      lines.push(...condLines.map((line) => `  ${line}`));
      lines.push('  if');
      for (const line of bindLines) lines.push(`    ${line}`);
      const bodyLines = this.emitBlock(arm.body.body ?? [], true);
      lines.push(...bodyLines.map((line) => `    ${line}`));
      lines.push(`    br ${label}`);
      lines.push('  end');
      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        hasFallback = true;
        break;
      }
    }

    if (!hasFallback) lines.push('  unreachable');
    lines.push(')');
    return lines;
  }

  private emitMatchExpr(expr: Extract<LuminaExpr, { type: 'MatchExpr' }>): string[] | null {
    const valueType = typeof expr.value.id === 'number' ? this.exprTypes.get(expr.value.id) : undefined;
    const resultType = this.typeToWasm(typeof expr.id === 'number' ? this.exprTypes.get(expr.id) : undefined, expr.location) ?? 'i32';
    const tempName = this.getMatchExprTempName(expr);
    const label = `$match_expr_end_${this.nodeTempSuffix(expr)}`;
    const buildArm = (index: number): string[] | null => {
      if (index >= expr.arms.length) {
        return ['unreachable'];
      }
      const arm = expr.arms[index];
      if (arm.guard) return null;
      const condLines = this.emitPatternConditionFromLocal(arm.pattern, tempName, valueType);
      const bindLines = this.emitPatternBindingsFromLocal(arm.pattern, tempName, valueType);
      if (!condLines || !bindLines) return null;
      const thenExpr = this.emitExpr(arm.body);
      const elseExpr = buildArm(index + 1);
      if (!elseExpr) return null;
      const lines: string[] = [];
      lines.push(...condLines);
      lines.push(`(if (result ${resultType})`);
      lines.push('  (then');
      for (const line of bindLines) lines.push(`    ${line}`);
      for (const line of thenExpr) lines.push(`    ${line}`);
      lines.push('  )');
      lines.push('  (else');
      for (const line of elseExpr) lines.push(`    ${line}`);
      lines.push('  )');
      lines.push(')');
      return lines;
    };

    const armLines = buildArm(0);
    if (!armLines) return null;
    return [
      ...this.emitExpr(expr.value),
      `local.set $${tempName}`,
      `(block ${label} (result ${resultType})`,
      ...armLines.map((line) => `  ${line}`),
      ')',
    ];
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
      case 'String': {
        const literal = this.allocStringLiteral(expr.value);
        return [`i32.const ${literal.offset}`, `i32.const ${literal.bytes.length}`, 'call $str_new'];
      }
      case 'InterpolatedString':
        return this.emitInterpolatedString(expr.parts ?? [], expr.location);
      case 'Member': {
        const structField = this.lookupStructFieldInfo(expr);
        if (structField) {
          const lines = this.emitExpr(expr.object);
          if (structField.offset !== 0) {
            lines.push(`i32.const ${structField.offset}`);
            lines.push('i32.add');
          }
          lines.push(`${structField.wasmType}.load`);
          return lines;
        }
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
        return this.emitTryExpr(expr.value, expr.location);
      case 'Identifier':
        return [`local.get $${expr.name}`];
      case 'Await':
        this.reportUnsupported('await expression (WASM backend currently has no async runtime)', expr.location, 'WASM-ASYNC-001');
        return this.emitExpr(expr.value);
      case 'Lambda':
        return this.emitLambdaExpr(expr);
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
      case 'MatchExpr': {
        const lowered = this.emitMatchExpr(expr);
        if (lowered) return lowered;
        this.reportUnsupported('match expression pattern in WASM backend', expr.location);
        return ['unreachable'];
      }
      case 'SelectExpr':
        this.reportUnsupported('select expression (WASM backend currently has no async runtime)', expr.location, 'WASM-ASYNC-001');
        return ['i32.const 0'];
      case 'Range':
        this.reportUnsupported('standalone range expression in WASM backend', expr.location);
        return ['i32.const 0'];
      case 'Index':
        return this.emitIndex(expr);
      case 'StructLiteral':
        return this.emitStructLiteral(expr);
      default:
        this.reportUnsupported(expr.type, expr.location);
        return ['unreachable'];
    }
  }

  private emitInterpolatedString(
    parts: Array<string | LuminaExpr>,
    location?: Location
  ): string[] {
    if (parts.length === 0) {
      return ['i32.const 0', 'i32.const 0', 'call $str_new'];
    }
    const lines: string[] = [];
    let initialized = false;
    for (const part of parts) {
      const partLines =
        typeof part === 'string' ? this.emitExpr({ type: 'String', value: part, location }) : this.emitStringifiedExpr(part);
      if (!initialized) {
        lines.push(...partLines);
        initialized = true;
        continue;
      }
      lines.push('local.set $__tmp_i32');
      lines.push(...partLines);
      lines.push('local.get $__tmp_i32');
      lines.push('call $str_concat');
    }
    return lines;
  }

  private emitStringifiedExpr(expr: LuminaExpr): string[] {
    const lines = this.emitExpr(expr);
    const type = typeof expr.id === 'number' ? this.exprTypes.get(expr.id) : undefined;
    const wasmType = this.typeToWasm(type, expr.location) ?? 'i32';
    const pruned = type ? prune(type, this.subst) : null;
    if (pruned?.kind === 'primitive' && normalizePrimitiveName(pruned.name) === 'string') {
      return lines;
    }
    if (wasmType === 'f64') return [...lines, 'call $str_from_float'];
    if (pruned?.kind === 'primitive' && normalizePrimitiveName(pruned.name) === 'bool') {
      return [...lines, 'call $str_from_bool'];
    }
    if (pruned?.kind === 'primitive' && normalizePrimitiveName(pruned.name) !== 'string') {
      return [...lines, 'call $str_from_int'];
    }
    return [...lines, 'call $str_from_handle'];
  }

  private emitTryExpr(value: LuminaExpr, location?: Location): string[] {
    const resultType = typeof value.id === 'number' ? this.exprTypes.get(value.id) : undefined;
    if (!resultType) {
      this.reportUnsupported('try operator without inferred result type', location, 'WASM-TRY-001');
      return ['unreachable'];
    }
    const pruned = prune(resultType, this.subst);
    if (pruned.kind !== 'adt' || pruned.name !== 'Result' || pruned.params.length < 2) {
      this.reportUnsupported('try operator outside Result context', location, 'WASM-TRY-001');
      return ['unreachable'];
    }
    if (this.currentFunctionReturn !== 'i32') {
      this.reportUnsupported('try operator requires Result-returning WASM function', location, 'WASM-TRY-001');
      return ['unreachable'];
    }
    const okType = prune(pruned.params[0], this.subst);
    const okWasm = this.typeToWasm(okType, location) ?? 'i32';
    const lines: string[] = [];
    lines.push(...this.emitExpr(value));
    lines.push('local.tee $__tmp_i32');
    lines.push('i32.load');
    lines.push('i32.const 0');
    lines.push('i32.eq');
    lines.push(`(if (result ${okWasm})`);
    lines.push('  (then');
    lines.push('    local.get $__tmp_i32');
    lines.push('    i32.const 8');
    lines.push('    i32.add');
    lines.push(`    ${okWasm}.load`);
    lines.push('  )');
    lines.push('  (else');
    lines.push('    local.get $__tmp_i32');
    lines.push('    return');
    lines.push(`    ${okWasm}.const 0`);
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private emitStructLiteral(expr: Extract<LuminaExpr, { type: 'StructLiteral' }>): string[] {
    const struct = this.structLayout.get(expr.name);
    if (!struct) {
      this.reportUnsupported(`struct literal '${expr.name}'`, expr.location);
      return ['unreachable'];
    }
    const fieldByName = new Map(expr.fields.map((field) => [field.name, field.value]));
    const lines: string[] = [];
    for (const field of struct.orderedFields) {
      const valueExpr = fieldByName.get(field.name);
      if (!valueExpr) {
        this.reportUnsupported(`missing field '${field.name}' in struct literal '${expr.name}'`, expr.location);
        lines.push(field.wasmType === 'f64' ? 'f64.const 0' : 'i32.const 0');
        continue;
      }
      lines.push(...this.emitExpr(valueExpr));
    }
    lines.push(`call $${sanitizeWasmIdent(expr.name)}_new`);
    return lines;
  }

  private emitLambdaExpr(lambda: Extract<LuminaExpr, { type: 'Lambda' }>): string[] {
    const info = this.getOrCreateLambdaInfo(lambda);
    const lines: string[] = [];
    const envSize = 8 + info.captures.length * 8;
    lines.push(`i32.const ${envSize}`);
    lines.push('call $alloc');
    lines.push('local.tee $__tmp_i32');
    lines.push(`i32.const ${info.id}`);
    lines.push('i32.store');
    lines.push('local.get $__tmp_i32');
    lines.push('i32.const 4');
    lines.push('i32.add');
    lines.push(`i32.const ${info.captures.length}`);
    lines.push('i32.store');
    for (let i = 0; i < info.captures.length; i += 1) {
      const captureName = info.captures[i];
      const captureType = info.captureTypes[i];
      const wasmType = this.typeToWasm(captureType, lambda.location) ?? 'i32';
      lines.push('local.get $__tmp_i32');
      lines.push(`i32.const ${8 + i * 8}`);
      lines.push('i32.add');
      if (this.currentLocalTypes.has(captureName)) {
        lines.push(`local.get $${captureName}`);
      } else {
        lines.push(wasmType === 'f64' ? 'f64.const 0' : 'i32.const 0');
      }
      lines.push(`${wasmType}.store`);
    }
    lines.push('local.get $__tmp_i32');
    return lines;
  }

  private emitClosureInvoke(
    closureLocalName: string,
    info: WasmLambdaInfo,
    args: LuminaExpr[]
  ): string[] {
    const lines: string[] = [];
    lines.push(`local.get $${closureLocalName}`);
    lines.push('local.tee $__tmp_i32');
    lines.push('i32.load');
    lines.push(`i32.const ${info.id}`);
    lines.push('i32.ne');
    lines.push('if');
    lines.push('  unreachable');
    lines.push('end');
    for (let i = 0; i < info.captures.length; i += 1) {
      const captureType = info.captureTypes[i];
      const wasmType = this.typeToWasm(captureType, info.lambda.location) ?? 'i32';
      lines.push('local.get $__tmp_i32');
      lines.push(`i32.const ${8 + i * 8}`);
      lines.push('i32.add');
      lines.push(`${wasmType}.load`);
    }
    for (const arg of args) {
      lines.push(...this.emitExpr(arg));
    }
    lines.push(`call $${info.fnName}`);
    return lines;
  }

  private emitOptionFromHasValue(
    hasLines: string[],
    valueLines: string[],
    payloadWasm: WasmValType = 'i32'
  ): string[] {
    const lines: string[] = [];
    lines.push(...hasLines);
    lines.push('(if (result i32)');
    lines.push('  (then');
    lines.push('    i32.const 16');
    lines.push('    call $alloc');
    lines.push('    local.tee $__enum_tmp');
    lines.push('    i32.const 0');
    lines.push('    i32.store');
    lines.push('    local.get $__enum_tmp');
    lines.push('    i32.const 8');
    lines.push('    i32.add');
    lines.push(...valueLines.map((line) => `    ${line}`));
    lines.push(`    ${payloadWasm}.store`);
    lines.push('    local.get $__enum_tmp');
    lines.push('  )');
    lines.push('  (else');
    lines.push('    i32.const 8');
    lines.push('    call $alloc');
    lines.push('    local.tee $__enum_tmp');
    lines.push('    i32.const 1');
    lines.push('    i32.store');
    lines.push('    local.get $__enum_tmp');
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private emitOptionFromSentinel(
    valueLines: string[],
    sentinel: number
  ): string[] {
    const lines: string[] = [];
    lines.push(...valueLines);
    lines.push('local.tee $__tmp_i32');
    lines.push(`i32.const ${sentinel}`);
    lines.push('i32.ne');
    lines.push('(if (result i32)');
    lines.push('  (then');
    lines.push('    i32.const 16');
    lines.push('    call $alloc');
    lines.push('    local.tee $__enum_tmp');
    lines.push('    i32.const 0');
    lines.push('    i32.store');
    lines.push('    local.get $__enum_tmp');
    lines.push('    i32.const 8');
    lines.push('    i32.add');
    lines.push('    local.get $__tmp_i32');
    lines.push('    i32.store');
    lines.push('    local.get $__enum_tmp');
    lines.push('  )');
    lines.push('  (else');
    lines.push('    i32.const 8');
    lines.push('    call $alloc');
    lines.push('    local.tee $__enum_tmp');
    lines.push('    i32.const 1');
    lines.push('    i32.store');
    lines.push('    local.get $__enum_tmp');
    lines.push('  )');
    lines.push(')');
    return lines;
  }

  private emitIndex(expr: Extract<LuminaExpr, { type: 'Index' }>): string[] {
    const objectType = typeof expr.object.id === 'number' ? this.exprTypes.get(expr.object.id) : undefined;
    const prunedObject = objectType ? prune(objectType, this.subst) : undefined;
    if (expr.index.type === 'Range') {
      if (prunedObject?.kind === 'primitive' && normalizePrimitiveName(prunedObject.name) === 'string') {
        const startLines = expr.index.start ? this.emitExpr(expr.index.start) : ['i32.const 0'];
        const endLines = expr.index.end ? this.emitExpr(expr.index.end) : ['i32.const -1'];
        return [
          ...this.emitExpr(expr.object),
          ...startLines,
          ...endLines,
          `i32.const ${expr.index.inclusive ? 1 : 0}`,
          'call $str_slice',
        ];
      }
      this.reportUnsupported('range index on non-string value', expr.location);
      return ['unreachable'];
    }
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
    const leftType = typeof expr.left.id === 'number' ? this.exprTypes.get(expr.left.id) : undefined;
    const rightType = typeof expr.right.id === 'number' ? this.exprTypes.get(expr.right.id) : undefined;
    const leftPruned = leftType ? prune(leftType, this.subst) : null;
    const rightPruned = rightType ? prune(rightType, this.subst) : null;
    const isLeftString = leftPruned?.kind === 'primitive' && normalizePrimitiveName(leftPruned.name) === 'string';
    const isRightString = rightPruned?.kind === 'primitive' && normalizePrimitiveName(rightPruned.name) === 'string';
    if (expr.op === '+' && (isLeftString || isRightString)) {
      const left = isLeftString ? this.emitExpr(expr.left) : this.emitStringifiedExpr(expr.left);
      const right = isRightString ? this.emitExpr(expr.right) : this.emitStringifiedExpr(expr.right);
      return [...left, ...right, 'call $str_concat'];
    }
    if ((expr.op === '==' || expr.op === '!=') && isLeftString && isRightString) {
      const opLines = [...this.emitExpr(expr.left), ...this.emitExpr(expr.right), 'call $str_eq'];
      if (expr.op === '!=') {
        opLines.push('i32.eqz');
      }
      return opLines;
    }
    const wasmType = this.typeToWasm(type, expr.location) ?? 'i32';
    const op = this.mapBinaryOp(expr.op, wasmType);
    return [...this.emitExpr(expr.left), ...this.emitExpr(expr.right), op];
  }

  private emitCall(expr: Extract<LuminaExpr, { type: 'Call' }>): string[] {
    if (expr.enumName) {
      const variantInfo = this.resolveEnumVariantInfo(expr.enumName, expr.callee.name);
      if (variantInfo) {
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
      if (this.currentLocalTypes.has(expr.enumName)) {
        const dispatched = this.emitReceiverDispatch(
          { type: 'Identifier', name: expr.enumName, location: expr.location },
          expr.callee.name,
          expr.args ?? [],
          expr.location
        );
        if (dispatched) return dispatched;
      }
      return this.emitNamespacedCall(expr.enumName, expr.callee.name, expr.args ?? [], expr.location);
    }

    if (expr.receiver) {
      const dispatched = this.emitReceiverDispatch(expr.receiver, expr.callee.name, expr.args ?? [], expr.location);
      if (dispatched) return dispatched;
      return ['unreachable'];
    }

    const boundLambda = this.localLambdaBindings.get(expr.callee.name);
    if (boundLambda) {
      return this.emitClosureInvoke(expr.callee.name, boundLambda, expr.args ?? []);
    }

    const args: string[] = [];
    for (const arg of expr.args ?? []) {
      args.push(...this.emitExpr(arg));
    }
    args.push(`call $${sanitizeWasmIdent(expr.callee.name)}`);
    return args;
  }

  private emitReceiverDispatch(
    receiverExpr: LuminaExpr,
    methodName: string,
    args: LuminaExpr[],
    location?: Location
  ): string[] | null {
    const receiverType =
      (typeof receiverExpr.id === 'number' ? this.exprTypes.get(receiverExpr.id) : undefined) ??
      (receiverExpr.type === 'Identifier' ? this.currentLocalTypes.get(receiverExpr.name) : undefined);
    const pruned = receiverType ? prune(receiverType, this.subst) : undefined;
    const forType = pruned?.kind === 'adt' ? pruned.name : null;
    let dispatched: WasmTraitMethodDispatch | undefined;
    if (forType) {
      const methodMap = this.traitDispatch.get(forType);
      dispatched = methodMap?.get(methodName);
    }
    if (!dispatched) {
      const fallback: WasmTraitMethodDispatch[] = [];
      for (const methods of this.traitDispatch.values()) {
        const candidate = methods.get(methodName);
        if (candidate) fallback.push(candidate);
      }
      if (fallback.length === 1) {
        dispatched = fallback[0];
      }
    }
    if (dispatched) {
      const lines: string[] = [...this.emitExpr(receiverExpr)];
      for (const arg of args) {
        lines.push(...this.emitExpr(arg));
      }
      lines.push(`call $${dispatched.wasmName}`);
      return lines;
    }
    if (methodName === 'toString' && args.length === 0) {
      return this.emitStringifiedExpr(receiverExpr);
    }
    if (forType) {
      const builtin = this.emitBuiltinCollectionMethod(forType, receiverExpr, methodName, args, location);
      if (builtin) return builtin;
    }
    this.reportUnsupported(`method call '${methodName}'`, location, 'WASM-TRAIT-001');
    return null;
  }

  private emitBuiltinCollectionMethod(
    receiverType: string,
    receiverExpr: LuminaExpr,
    methodName: string,
    args: LuminaExpr[],
    location?: Location
  ): string[] | null {
    const moduleName =
      receiverType === 'Vec' ? 'vec' : receiverType === 'HashMap' ? 'hashmap' : receiverType === 'HashSet' ? 'hashset' : null;
    if (!moduleName) return null;
    return this.emitNamespacedCall(moduleName, methodName, [receiverExpr, ...args], location);
  }

  private emitNamespacedCall(
    namespace: string,
    callee: string,
    args: LuminaExpr[],
    location?: Location
  ): string[] {
    const lines: string[] = [];
    const emitArgs = () => {
      for (const arg of args) lines.push(...this.emitExpr(arg));
    };
    if (namespace === 'str') {
      if (callee === 'concat' && args.length === 2) {
        emitArgs();
        lines.push('call $str_concat');
        return lines;
      }
      if (callee === 'len' && args.length === 1) {
        emitArgs();
        lines.push('call $str_len');
        return lines;
      }
      if (callee === 'from_int' && args.length === 1) {
        emitArgs();
        lines.push('call $str_from_int');
        return lines;
      }
      if ((callee === 'from_float' || callee === 'from_f64') && args.length === 1) {
        emitArgs();
        lines.push('call $str_from_float');
        return lines;
      }
      if (callee === 'from_bool' && args.length === 1) {
        emitArgs();
        lines.push('call $str_from_bool');
        return lines;
      }
    }
    if (namespace === 'io') {
      if ((callee === 'println' || callee === 'print') && args.length === 1) {
        const arg = args[0];
        const argType = typeof arg.id === 'number' ? this.exprTypes.get(arg.id) : undefined;
        const pruned = argType ? prune(argType, this.subst) : undefined;
        if (pruned?.kind === 'primitive') {
          const normalized = normalizePrimitiveName(pruned.name);
          if (normalized === 'string') {
            lines.push(...this.emitExpr(arg), 'call $print_string');
            return lines;
          }
          if (normalized === 'bool') {
            lines.push(...this.emitExpr(arg), 'call $print_bool');
            return lines;
          }
          if (normalized === 'f32' || normalized === 'f64') {
            lines.push(...this.emitExpr(arg), 'call $print_float');
            return lines;
          }
          lines.push(...this.emitExpr(arg), 'call $print_int');
          return lines;
        }
        lines.push(...this.emitStringifiedExpr(arg), 'call $print_string');
        return lines;
      }
    }
    if (namespace === 'vec') {
      if (callee === 'new' && args.length === 0) return ['call $vec_new'];
      if (callee === 'len' && args.length === 1) {
        emitArgs();
        lines.push('call $vec_len');
        return lines;
      }
      if (callee === 'push' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_push');
        return lines;
      }
      if (callee === 'clear' && args.length === 1) {
        emitArgs();
        lines.push('call $vec_clear');
        lines.push('i32.const 0');
        return lines;
      }
      if (callee === 'take' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_take');
        return lines;
      }
      if (callee === 'skip' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_skip');
        return lines;
      }
      if (callee === 'get' && args.length === 2) {
        const hasLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $vec_get_has'];
        const valueLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $vec_get'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
      if (callee === 'pop' && args.length === 1) {
        const hasLines = [...this.emitExpr(args[0]), 'call $vec_pop_has'];
        const valueLines = [...this.emitExpr(args[0]), 'call $vec_pop'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
      if (callee === 'any' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_any_closure');
        return lines;
      }
      if (callee === 'all' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_all_closure');
        return lines;
      }
      if (callee === 'map' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_map_closure');
        return lines;
      }
      if (callee === 'filter' && args.length === 2) {
        emitArgs();
        lines.push('call $vec_filter_closure');
        return lines;
      }
      if (callee === 'fold' && args.length === 3) {
        emitArgs();
        lines.push('call $vec_fold_closure');
        return lines;
      }
      if (callee === 'find' && args.length === 2) {
        const hasLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $vec_find_has'];
        const valueLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $vec_find'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
      if (callee === 'position' && args.length === 2) {
        const posLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $vec_position'];
        return this.emitOptionFromSentinel(posLines, -1);
      }
    }
    if (namespace === 'hashmap') {
      if (callee === 'new' && args.length === 0) return ['call $hashmap_new'];
      if (callee === 'len' && args.length === 1) {
        emitArgs();
        lines.push('call $hashmap_len');
        return lines;
      }
      if (callee === 'contains_key' && args.length === 2) {
        emitArgs();
        lines.push('call $hashmap_contains_key');
        return lines;
      }
      if (callee === 'clear' && args.length === 1) {
        emitArgs();
        lines.push('call $hashmap_clear');
        lines.push('i32.const 0');
        return lines;
      }
      if (callee === 'insert' && args.length === 3) {
        const hasLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), ...this.emitExpr(args[2]), 'call $hashmap_insert_has'];
        const valueLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), ...this.emitExpr(args[2]), 'call $hashmap_insert_prev'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
      if (callee === 'get' && args.length === 2) {
        const hasLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $hashmap_get_has'];
        const valueLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $hashmap_get'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
      if (callee === 'remove' && args.length === 2) {
        const hasLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $hashmap_remove_has'];
        const valueLines = [...this.emitExpr(args[0]), ...this.emitExpr(args[1]), 'call $hashmap_remove'];
        return this.emitOptionFromHasValue(hasLines, valueLines);
      }
    }
    if (namespace === 'hashset') {
      if (callee === 'new' && args.length === 0) return ['call $hashset_new'];
      if (callee === 'len' && args.length === 1) {
        emitArgs();
        lines.push('call $hashset_len');
        return lines;
      }
      if (callee === 'insert' && args.length === 2) {
        emitArgs();
        lines.push('call $hashset_insert');
        return lines;
      }
      if (callee === 'contains' && args.length === 2) {
        emitArgs();
        lines.push('call $hashset_contains');
        return lines;
      }
      if (callee === 'remove' && args.length === 2) {
        emitArgs();
        lines.push('call $hashset_remove');
        return lines;
      }
      if (callee === 'clear' && args.length === 1) {
        emitArgs();
        lines.push('call $hashset_clear');
        lines.push('i32.const 0');
        return lines;
      }
    }

    this.reportUnsupported(`module call '${namespace}.${callee}'`, location);
    return ['unreachable'];
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
      case '%':
        return wasmType === 'f64' ? 'f64.div' : 'i32.rem_s';
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
      case '&&':
        return 'i32.and';
      case '||':
        return 'i32.or';
      default:
        return `${prefix}.add`;
    }
  }

  private typeToWasm(type: Type | undefined, location?: Location): WasmValType | null {
    if (!type) return null;
    const pruned = prune(type, this.subst);
    if (pruned.kind === 'primitive') {
      const normalized = normalizePrimitiveName(pruned.name);
      if (normalized === 'string') return 'i32';
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
    if (pruned.kind === 'array') return 'i32';
    if (pruned.kind === 'adt' && pruned.name === 'Array') {
      return 'i32';
    }
    if (pruned.kind === 'adt') {
      if (pruned.name === 'Vec' || pruned.name === 'HashMap' || pruned.name === 'HashSet') {
        return 'i32';
      }
      const variants = this.enumLayout.get(pruned.name);
      if (variants) {
        return 'i32';
      }
      if (this.structLayout.has(pruned.name)) {
        return 'i32';
      }
      if (pruned.name === 'Option' || pruned.name === 'Result') {
        return 'i32';
      }
    }
    if (pruned.kind === 'function') return 'i32';
    this.reportUnsupported(`type '${this.formatType(pruned)}'`, location);
    return null;
  }

  private extractArrayTypeInfo(
    type: Type | undefined,
    location?: Location
  ): { length: number | null; elementSize: number; elementWasm: WasmValType } | null {
    if (!type) return null;
    const pruned = prune(type, this.subst);
    if (pruned.kind === 'array') {
      const elementWasm = this.typeToWasm(pruned.element, location) ?? 'i32';
      const elementSize = elementWasm === 'f64' ? 8 : 4;
      let length: number | null = null;
      if (pruned.size) {
        const sizeValue = this.evaluateConstSizeText(this.formatConstExpr(pruned.size), location);
        if (sizeValue !== null) length = sizeValue;
      }
      return { length, elementSize, elementWasm };
    }
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

  private formatConstExpr(expr: TypeConstExpr): string {
    const node = expr as {
      kind: string;
      value?: number | boolean;
      name?: string;
      op?: string;
      left?: TypeConstExpr;
      right?: TypeConstExpr;
      args?: TypeConstExpr[];
      condition?: TypeConstExpr;
      thenExpr?: TypeConstExpr;
      elseExpr?: TypeConstExpr;
      expr?: TypeConstExpr;
    };
    switch (node.kind) {
      case 'const-literal':
        return String(node.value);
      case 'const-param':
        return String(node.name ?? '');
      case 'const-unary':
        return `${node.op ?? ''}${node.expr ? this.formatConstExpr(node.expr) : ''}`;
      case 'const-binary':
        return `${node.left ? this.formatConstExpr(node.left) : ''}${node.op ?? ''}${node.right ? this.formatConstExpr(node.right) : ''}`;
      case 'const-call':
        return `${node.name ?? ''}(${(node.args ?? []).map((arg) => this.formatConstExpr(arg)).join(',')})`;
      case 'const-if':
        return `if ${node.condition ? this.formatConstExpr(node.condition) : ''} { ${node.thenExpr ? this.formatConstExpr(node.thenExpr) : ''} } else { ${node.elseExpr ? this.formatConstExpr(node.elseExpr) : ''} }`;
      default:
        return '';
    }
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
