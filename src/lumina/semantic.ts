import { type Location } from '../utils/index.js';
import { type Diagnostic, type DiagnosticRelatedInformation } from '../parser/index.js';
import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaType,
  type LuminaTypeExpr,
  type LuminaTypeHole,
  type LuminaTraitDecl,
  type LuminaTraitMethod,
  type LuminaImplDecl,
  type LuminaFnDecl,
  type LuminaBlock,
  type LuminaLambda,
} from './ast.js';
import { inferProgram } from './hm-infer.js';
import { normalizeDiagnostic } from './diagnostics-util.js';
import { normalizeTypeForComparison, normalizeTypeForDisplay, normalizeTypeNameForDisplay } from './type-utils.js';
import { ConstEvaluator } from './const-eval.js';
import type { ConstExpr as TypeConstExpr } from './types.js';
import {
  createStdModuleRegistry,
  getPreludeExports,
  resolveModuleBindings,
  type ModuleExport,
  type ModuleFunction,
  type ModuleRegistry,
} from './module-registry.js';
import { mangleTraitMethodName, type TraitMethodResolution } from './trait-utils.js';

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type?: LuminaType;
  pendingReturn?: boolean;
  async?: boolean;
  location?: Location;
  mutable?: boolean;
  ref?: boolean;
  refMutable?: boolean;
  visibility?: 'public' | 'private';
  extern?: boolean;
  uri?: string;
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  paramTypes?: LuminaType[];
  paramNames?: string[];
  paramRefs?: boolean[];
  paramRefMuts?: boolean[];
  externModule?: string | null;
  enumVariants?: Array<{ name: string; params: LuminaType[] }>;
  enumName?: string;
  structFields?: Map<string, LuminaType>;
  derivedTraits?: string[];
}

export class SymbolTable {
  private symbols = new Map<string, SymbolInfo>();

  define(symbol: SymbolInfo) {
    this.symbols.set(symbol.name, symbol);
  }

  has(name: string): boolean {
    return this.symbols.has(name);
  }

  get(name: string): SymbolInfo | undefined {
    return this.symbols.get(name);
  }

  list(): SymbolInfo[] {
    return Array.from(this.symbols.values());
  }
}

function cloneSymbolTable(source: SymbolTable): SymbolTable {
  const next = new SymbolTable();
  for (const sym of source.list()) {
    next.define(sym);
  }
  return next;
}

export interface TraitMethodSig {
  name: string;
  params: LuminaType[];
  returnType: LuminaType;
  typeParams: Array<{ name: string; bound?: LuminaType[] }>;
  defaultBody?: LuminaBlock | null;
  location?: Location;
}

export interface TraitAssocTypeInfo {
  name: string;
  defaultType?: LuminaType | null;
  location?: Location;
}

export interface TraitInfo {
  name: string;
  typeParams: Array<{ name: string; bound?: LuminaType[] }>;
  superTraits: LuminaType[];
  methods: Map<string, TraitMethodSig>;
  associatedTypes: Map<string, TraitAssocTypeInfo>;
  visibility?: 'public' | 'private';
  location?: Location;
  uri?: string;
}

export interface ImplInfo {
  traitName: string;
  traitType: LuminaType;
  forType: LuminaType;
  typeParams: Array<{ name: string; bound?: LuminaType[] }>;
  methods: Map<string, LuminaFnDecl>;
  associatedTypes: Map<string, LuminaType>;
  visibility?: 'public' | 'private';
  location?: Location;
  uri?: string;
}

export interface TraitRegistry {
  traits: Map<string, TraitInfo>;
  implsByKey: Map<string, ImplInfo>;
  implsByTrait: Map<string, ImplInfo[]>;
}

const builtinTypes: Set<LuminaType> = new Set([
  'int',
  'float',
  'string',
  'bool',
  'void',
  'any',
  'i8',
  'i16',
  'i32',
  'i64',
  'i128',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'usize',
  'f32',
  'f64',
  'Vec',
  'Array',
  'Deque',
  'HashMap',
  'HashSet',
  'BTreeMap',
  'BTreeSet',
  'PriorityQueue',
  'Channel',
  'Sender',
  'Receiver',
  'Thread',
  'ThreadHandle',
  'Mutex',
  'Semaphore',
  'AtomicI32',
  'ProcessOutput',
  'Promise',
  'Range',
]);

const numericTypes: Set<LuminaType> = new Set([
  'int',
  'float',
  'i8',
  'i16',
  'i32',
  'i64',
  'i128',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'usize',
  'f32',
  'f64',
]);

const normalizeNumericType = (type: LuminaType): LuminaType => {
  if (type === 'int') return 'i32';
  if (type === 'float') return 'f64';
  if (type === 'usize') return 'u32';
  return type;
};

const areTypesEquivalent = (left: LuminaType, right: LuminaType): boolean =>
  normalizeTypeForComparison(left) === normalizeTypeForComparison(right);

const isNumericTypeName = (type: LuminaType): boolean => numericTypes.has(type);

const intBitWidth = (type: LuminaType): number => {
  if (type === 'int') return 32;
  const match = String(type).match(/^[iu](\d+)$/);
  return match ? Number(match[1]) : 0;
};

const isFloatTypeName = (type: LuminaType): boolean => type === 'f32' || type === 'f64' || type === 'float';
const isIntTypeName = (type: LuminaType): boolean =>
  type === 'int' || String(type).startsWith('i') || String(type).startsWith('u');

const SELF_TYPE_NAME = 'Self';

const isTypeHoleExpr = (typeName: LuminaTypeExpr): typeName is LuminaTypeHole =>
  typeof typeName === 'object' && !!typeName && (typeName as LuminaTypeHole).kind === 'TypeHole';

const renderConstExpr = (expr: import('./ast.js').LuminaConstExpr | undefined): string => {
  if (!expr) return '_';
  switch (expr.type) {
    case 'ConstLiteral':
      return String(expr.value);
    case 'ConstParam':
      return expr.name;
    case 'ConstBinary':
      return `${renderConstExpr(expr.left)}${expr.op}${renderConstExpr(expr.right)}`;
    default:
      return '_';
  }
};

const resolveTypeExpr = (typeName: LuminaTypeExpr | null | undefined): LuminaType | null => {
  if (!typeName) return null;
  if (isTypeHoleExpr(typeName)) return 'any';
  if (typeof typeName === 'object' && (typeName as { kind?: string }).kind === 'array') {
    const arrayType = typeName as import('./ast.js').LuminaArrayType;
    const elementType = resolveTypeExpr(arrayType.element) ?? 'any';
    const sizeExpr = renderConstExpr(arrayType.size);
    return `Array<${elementType},${sizeExpr}>`;
  }
  if (typeof typeName === 'string') {
    if (typeName === 'unit') return 'void';
    return typeName;
  }
  return 'any';
};

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const ERROR_TYPE: LuminaType = '__error__';

const isErrorTypeName = (typeName: string | null | undefined): boolean =>
  !!typeName && normalizeTypeForComparison(typeName) === ERROR_TYPE;

const diagAt = (
  message: string,
  location?: Location,
  severity: Diagnostic['severity'] = 'error',
  codeOverride?: string,
  relatedInformation?: DiagnosticRelatedInformation[]
): Diagnostic => ({
  severity,
  message,
  location: location ?? defaultLocation,
  code: codeOverride ?? (severity === 'warning' ? 'LINT' : 'TYPE_ERROR'),
  source: 'lumina',
  relatedInformation,
});

function formatTypeForDiagnostic(type: LuminaType | null | undefined): string {
  if (!type) return 'unknown';
  if (isErrorTypeName(type)) return '<error>';
  const normalized = normalizeTypeForDisplay(type);
  const parsed = parseTypeName(normalized);
  if (!parsed) return normalized;
  const base = normalizeTypeNameForDisplay(parsed.base);
  if (parsed.args.length === 0) return base;
  const args = parsed.args.map((arg) => formatTypeForDiagnostic(arg));
  return `${base}<${args.join(',')}>`;
}

function collectPatternBindingNames(pattern: import('./ast.js').LuminaMatchPattern, out: string[] = []): string[] {
  switch (pattern.type) {
    case 'BindingPattern':
      out.push(pattern.name);
      return out;
    case 'TuplePattern':
      for (const element of pattern.elements) collectPatternBindingNames(element, out);
      return out;
    case 'StructPattern':
      for (const field of pattern.fields) collectPatternBindingNames(field.pattern, out);
      return out;
    case 'EnumPattern':
      if (pattern.patterns && pattern.patterns.length > 0) {
        for (const nested of pattern.patterns) collectPatternBindingNames(nested, out);
      } else {
        for (const binding of pattern.bindings) {
          if (binding !== '_') out.push(binding);
        }
      }
      return out;
    default:
      return out;
  }
}

function collectPatternBindingTypes(
  pattern: import('./ast.js').LuminaMatchPattern,
  valueType: LuminaType | null | undefined,
  symbols: SymbolTable
): Map<string, LuminaType> {
  const out = new Map<string, LuminaType>();
  const visit = (pat: import('./ast.js').LuminaMatchPattern, currentType: LuminaType | null | undefined) => {
    switch (pat.type) {
      case 'BindingPattern':
        out.set(pat.name, currentType ?? 'any');
        return;
      case 'WildcardPattern':
      case 'LiteralPattern':
        return;
      case 'TuplePattern': {
        const parsed = currentType ? parseTypeName(currentType) : null;
        const tupleArgs = parsed && parsed.base === 'Tuple' ? parsed.args : [];
        pat.elements.forEach((element, idx) => visit(element, tupleArgs[idx] ?? 'any'));
        return;
      }
      case 'StructPattern': {
        const structSym = symbols.get(pat.name);
        const currentParsed = currentType ? parseTypeName(currentType) : null;
        const mapping = new Map<string, LuminaType>();
        if (structSym?.typeParams && currentParsed && currentParsed.base === pat.name) {
          structSym.typeParams.forEach((tp, idx) => {
            mapping.set(tp.name, currentParsed.args[idx] ?? 'any');
          });
        }
        for (const field of pat.fields) {
          const declared = structSym?.structFields?.get(field.name) ?? 'any';
          const resolved = mapping.size > 0 ? substituteTypeParams(declared, mapping) : declared;
          visit(field.pattern, resolved);
        }
        return;
      }
      case 'EnumPattern': {
        const enumName = pat.enumName ?? (currentType ? parseTypeName(currentType)?.base : null);
        const enumSym = enumName ? symbols.get(enumName) : undefined;
        const variant = enumSym?.enumVariants?.find((entry) => entry.name === pat.variant);
        const mapping = enumName && currentType ? buildEnumTypeMapping(enumName, currentType, symbols) : null;
        const mappedParams = variant
          ? variant.params.map((param) => (mapping ? substituteTypeParams(param, mapping) : param))
          : [];
        if (pat.patterns && pat.patterns.length > 0) {
          pat.patterns.forEach((nested, idx) => visit(nested, mappedParams[idx] ?? 'any'));
          return;
        }
        pat.bindings.forEach((binding, idx) => {
          if (binding === '_') return;
          out.set(binding, mappedParams[idx] ?? 'any');
        });
        return;
      }
    }
  };

  visit(pattern, valueType ?? 'any');
  return out;
}

const getLValueBaseName = (expr: LuminaExpr): string | null => {
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type !== 'Member') return null;
  let current: LuminaExpr = expr.object;
  while (current.type === 'Member') {
    current = current.object;
  }
  return current.type === 'Identifier' ? current.name : null;
};

const getMovePath = (expr: LuminaExpr): string | null => {
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type !== 'Member') return null;
  const segments: string[] = [];
  let current: LuminaExpr = expr;
  while (current.type === 'Member') {
    segments.unshift(current.property);
    current = current.object;
  }
  if (current.type !== 'Identifier') return null;
  segments.unshift(current.name);
  return segments.join('.');
};

const isMovePrefix = (prefix: string, path: string): boolean =>
  path === prefix || path.startsWith(`${prefix}.`);

const formatMoveConflictMessage = (
  action: 'use' | 'move' | 'access',
  path: string,
  conflictPath: string
): string => {
  if (conflictPath !== path) {
    if (isMovePrefix(path, conflictPath)) {
      const suffix = conflictPath.slice(path.length + 1);
      if (suffix) {
        return `Cannot ${action} '${path}' because field '${suffix}' was already moved`;
      }
    } else if (isMovePrefix(conflictPath, path)) {
      return `Cannot ${action} '${path}' because '${conflictPath}' was already moved`;
    }
  }
  return `Cannot ${action} '${path}' because it was already moved`;
};

const resolveMutableSource = (
  expr: LuminaExpr,
  symbols: SymbolTable,
  options?: AnalyzeOptions
): boolean => {
  const baseName = getLValueBaseName(expr);
  if (!baseName) return false;
  const sym = symbols.get(baseName) ?? options?.externSymbols?.(baseName);
  return !!(sym && (sym.mutable || sym.refMutable));
};

export interface AnalyzeOptions {
  externSymbols?: (name: string) => SymbolInfo | undefined;
  currentUri?: string;
  typeParams?: Map<string, LuminaType | undefined>;
  typeParamBounds?: Map<string, LuminaType[]>;
  externalSymbols?: SymbolInfo[];
  importedNames?: Set<string>;
  diDebug?: boolean;
  skipFunctionBodies?: Set<string>;
  cachedFunctionReturns?: Map<string, LuminaType>;
  indexingOnly?: boolean;
  recursiveWrappers?: string[];
  useHm?: boolean;
  useRowPolymorphism?: boolean;
  hmSourceText?: string;
  hmInferred?: {
    letTypes: Map<string, LuminaType>;
    fnReturns: Map<string, LuminaType>;
    fnByName: Map<string, LuminaType>;
    fnParams: Map<string, LuminaType[]>;
  };
  moduleBindings?: Map<string, ModuleExport>;
  moduleRegistry?: ModuleRegistry;
  traitRegistry?: TraitRegistry;
  traitMethodResolutions?: Map<number, TraitMethodResolution>;
  stopOnUnresolvedMemberError?: boolean;
}

class StopOnUnresolvedMemberError extends Error {}

export function analyzeLumina(program: LuminaProgram, options?: AnalyzeOptions) {
  const diagnostics: Diagnostic[] = [];
  const symbols = new SymbolTable();
  const pendingDeps = new Map<string, Set<string>>();
  const diGraphs = new Map<string, string>();
  let hmCallSignatures: Map<number, { args: LuminaType[]; returnType: LuminaType }> | undefined;
  let hmExprTypes: Map<number, string> | undefined;
  const registry = options?.moduleRegistry ?? (options?.moduleBindings ? undefined : createStdModuleRegistry());
  const explicitModuleBindings = options?.moduleBindings ?? resolveModuleBindings(program, registry);
  const moduleBindings = new Map(explicitModuleBindings);
  for (const exp of getPreludeExports(registry)) {
    if (!moduleBindings.has(exp.name)) {
      moduleBindings.set(exp.name, exp);
    }
  }
  const importedNames = options?.importedNames ?? new Set(explicitModuleBindings.keys());
  let activeOptions: AnalyzeOptions | undefined = options
    ? { ...options, moduleBindings, importedNames }
    : { moduleBindings, importedNames };

  for (const t of builtinTypes) symbols.define({ name: t, kind: 'type', type: t });

  if (activeOptions?.externalSymbols) {
    for (const sym of activeOptions.externalSymbols) {
      if (activeOptions.currentUri && sym.uri && sym.uri === activeOptions.currentUri) continue;
      if (activeOptions.importedNames && !activeOptions.importedNames.has(sym.name)) continue;
      if (!symbols.has(sym.name)) {
        symbols.define(sym);
      }
    }
  }

  // Pass 1: register type/function declarations (hoisting)
  for (const stmt of program.body) {
    if (stmt.type === 'ErrorNode') continue;
    if (stmt.type === 'TypeDecl') {
      const typeParams = stmt.typeParams?.map((param) => ({
        name: param.name,
        bound: (param.bound ?? []).map((bound) => resolveTypeExpr(bound) ?? 'any'),
      }));
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: typeParams ?? [],
        extern: stmt.extern ?? false,
        externModule: stmt.externModule ?? null,
      });
    } else if (stmt.type === 'StructDecl') {
      const fields = new Map<string, LuminaType>();
      for (const field of stmt.body) {
        fields.set(field.name, resolveTypeExpr(field.typeName) ?? 'any');
      }
      const typeParams = stmt.typeParams?.map((param) => ({
        name: param.name,
        bound: (param.bound ?? []).map((bound) => resolveTypeExpr(bound) ?? 'any'),
      }));
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: typeParams ?? [],
        structFields: fields,
        derivedTraits: stmt.derives ?? [],
      });
    } else if (stmt.type === 'EnumDecl') {
      const typeParams = stmt.typeParams?.map((param) => ({
        name: param.name,
        bound: (param.bound ?? []).map((bound) => resolveTypeExpr(bound) ?? 'any'),
      }));
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: typeParams ?? [],
        enumVariants: stmt.variants.map((v) => ({
          name: v.name,
          params: (v.params ?? []).map((param) => resolveTypeExpr(param) ?? 'any'),
        })),
      });
    } else if (stmt.type === 'FnDecl') {
      const cachedReturn = options?.cachedFunctionReturns?.get(stmt.name);
      const hmReturn = options?.hmInferred?.fnByName.get(stmt.name);
      const hmParamTypes = options?.hmInferred?.fnParams.get(stmt.name);
      const typeParams = stmt.typeParams?.map((param) => ({
        name: param.name,
        bound: (param.bound ?? []).map((bound) => resolveTypeExpr(bound) ?? 'any'),
      }));
      let resolvedReturn = resolveTypeExpr(stmt.returnType) ?? cachedReturn ?? hmReturn ?? undefined;
      if (resolvedReturn && stmt.async) {
        const parsed = parseTypeName(resolvedReturn);
        if (!(parsed && parsed.base === 'Promise' && parsed.args.length === 1)) {
          resolvedReturn = `Promise<${resolvedReturn}>`;
        }
      }
      symbols.define({
        name: stmt.name,
        kind: 'function',
        async: !!stmt.async,
        type: resolvedReturn,
        pendingReturn: resolveTypeExpr(stmt.returnType) == null && cachedReturn == null && hmReturn == null,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        extern: stmt.extern ?? false,
        uri: options?.currentUri,
        typeParams: typeParams ?? [],
        paramTypes: stmt.params.map((p, idx) => resolveTypeExpr(p.typeName) ?? hmParamTypes?.[idx] ?? 'any'),
        paramNames: stmt.params.map((p) => p.name),
        paramRefs: stmt.params.map((p) => !!p.ref),
        paramRefMuts: stmt.params.map((p) => !!p.refMut),
        externModule: stmt.externModule ?? null,
      });
    }
  }

  reportAdvancedTypeFeatureDiagnostics(program, diagnostics);

  const traitRegistry = collectTraitRegistry(program, symbols, diagnostics, options);
  const traitMethodResolutions = new Map<number, TraitMethodResolution>();
  activeOptions = { ...(activeOptions ?? {}), traitRegistry, traitMethodResolutions };

  if (options?.indexingOnly) {
    return { symbols, diagnostics, diGraphs: options?.diDebug ? diGraphs : undefined, traitRegistry, traitMethodResolutions };
  }

  if (options?.useHm) {
    const hm = inferProgram(program, {
      moduleRegistry: registry,
      moduleBindings,
      recursiveWrappers: options?.recursiveWrappers,
      useRowPolymorphism: options?.useRowPolymorphism,
    });
    const sourceText = options.hmSourceText ?? '';
    const sourceFile = options.currentUri ?? 'inline';
    const hmInferred = {
      letTypes: new Map<string, LuminaType>(),
      fnReturns: new Map<string, LuminaType>(),
      fnByName: new Map<string, LuminaType>(),
      fnParams: new Map<string, LuminaType[]>(),
    };
    for (const [key, type] of hm.inferredLets) {
      const mapped = hmTypeToLuminaType(type);
      if (mapped) hmInferred.letTypes.set(key, mapped);
    }
    for (const [key, type] of hm.inferredFnReturns) {
      const mapped = hmTypeToLuminaType(type);
      if (mapped) hmInferred.fnReturns.set(key, mapped);
    }
    for (const [name, type] of hm.inferredFnByName) {
      const mapped = hmTypeToLuminaType(type);
      if (mapped) hmInferred.fnByName.set(name, mapped);
    }
    for (const [name, params] of hm.inferredFnParams) {
      const mapped = params.map((param) => hmTypeToLuminaType(param) ?? 'any');
      hmInferred.fnParams.set(name, mapped);
    }
    hmCallSignatures = new Map<number, { args: LuminaType[]; returnType: LuminaType }>();
    for (const [key, signature] of hm.inferredCalls) {
      const args = signature.args.map((arg) => hmTypeToLuminaType(arg) ?? 'any');
      const returnType = hmTypeToLuminaType(signature.returnType) ?? 'any';
      hmCallSignatures.set(key, { args, returnType });
    }
    hmExprTypes = new Map<number, string>();
    for (const [id, type] of hm.inferredExprs) {
      hmExprTypes.set(id, hmTypeToDisplay(type));
    }
    activeOptions = { ...options, hmInferred };
    for (const sym of symbols.list()) {
      if (sym.kind !== 'function') continue;
      const hmReturn = hmInferred.fnByName.get(sym.name);
      const hmParams = hmInferred.fnParams.get(sym.name);
      let changed = false;
      const next: SymbolInfo = { ...sym };
      if (hmReturn && (sym.type == null || sym.type === 'any')) {
        next.type = hmReturn;
        next.pendingReturn = false;
        changed = true;
      }
      if (hmParams && hmParams.length > 0) {
        next.paramTypes = hmParams;
        changed = true;
      }
      if (changed) symbols.define(next);
    }
    for (const diag of hm.diagnostics) {
      const normalized = normalizeDiagnostic(diag, sourceText, sourceFile);
      diagnostics.push({
        code: normalized.code,
        message: normalized.message,
        severity: normalized.severity === 'info' ? 'warning' : normalized.severity,
        location: diag.location ?? defaultLocation,
        source: diag.source ?? 'lumina',
        relatedInformation: diag.relatedInformation,
      });
    }
  }

  const rootScope = new Scope();
  const resolving = new Set<string>();

  validateRecursiveStructs(symbols, diagnostics, options);

  try {
    // Pass 2: analyze non-function statements so top-level bindings are known.
    for (const stmt of program.body) {
      if (stmt.type === 'FnDecl') continue;
      typeCheckStatement(stmt, symbols, diagnostics, null, rootScope, activeOptions, undefined, resolving, pendingDeps, undefined, undefined);
    }

    if (options?.useHm) {
      for (const sym of symbols.list()) {
        if (sym.kind !== 'function' || !sym.pendingReturn) continue;
        symbols.define({ ...sym, type: sym.type ?? 'any', pendingReturn: false });
      }
    } else {
      const maxPasses = 5;
      let changed = true;
      let pass = 0;
      while (changed && pass < maxPasses) {
        changed = false;
        pass += 1;
        for (const stmt of program.body) {
          if (stmt.type !== 'FnDecl') continue;
          if (options?.skipFunctionBodies?.has(stmt.name)) continue;
          const sym = symbols.get(stmt.name);
          if (!sym || !sym.pendingReturn) continue;
          if (resolving.has(stmt.name)) continue;
          resolving.add(stmt.name);
          pendingDeps.set(stmt.name, new Set());
          const inferred = resolveFunctionBody(stmt, symbols, diagnostics, activeOptions, resolving, pendingDeps, rootScope, diGraphs);
          resolving.delete(stmt.name);
          if (inferred) {
            symbols.define({ ...sym, type: inferred, pendingReturn: false });
            pendingDeps.delete(stmt.name);
            changed = true;
          } else if (inferred === 'void') {
            symbols.define({ ...sym, type: 'void', pendingReturn: false });
            pendingDeps.delete(stmt.name);
            changed = true;
          }
        }
        const cycles = detectPendingCycles(pendingDeps);
        if (cycles.length > 0) {
          for (const fnName of cycles) {
            const sym = symbols.get(fnName);
            diagnostics.push(diagAt(`Recursive inference detected for '${fnName}'`, sym?.location ?? program.location));
            if (sym) {
              symbols.define({ ...sym, type: 'any', pendingReturn: false });
            }
          }
          changed = false;
        }
      }
    }

    for (const stmt of program.body) {
      if (stmt.type === 'ErrorNode') continue;
      if (stmt.type === 'FnDecl') {
        if (options?.skipFunctionBodies?.has(stmt.name)) continue;
        resolveFunctionBody(stmt, symbols, diagnostics, activeOptions, resolving, pendingDeps, rootScope, diGraphs);
      }
    }
  } catch (error) {
    if (!(error instanceof StopOnUnresolvedMemberError)) {
      throw error;
    }
  }

  collectUnusedBindingsLocal(rootScope, diagnostics, program.location);

  return { symbols, diagnostics, diGraphs: options?.diDebug ? diGraphs : undefined, hmCallSignatures, hmExprTypes, traitRegistry, traitMethodResolutions };
}

function reportAdvancedTypeFeatureDiagnostics(program: LuminaProgram, diagnostics: Diagnostic[]): void {
  const reportUnsupportedHkt = (
    typeParams: Array<{ name: string; bound?: LuminaType[] }> | undefined,
    location?: Location
  ) => {
    for (const param of typeParams ?? []) {
      const arity = Number((param as unknown as { higherKindArity?: number }).higherKindArity ?? 0);
      if (arity > 0) {
        diagnostics.push(
          diagAt(
            `Higher-kinded type parameter '${param.name}<...>' is parsed but not type-checked yet`,
            location,
            'error',
            'UNSUPPORTED_HKT'
          )
        );
      }
    }
  };

  const validateConstExpr = (
    expr: import('./ast.js').LuminaConstExpr,
    availableParams: Set<string>,
    location?: Location
  ): void => {
    switch (expr.type) {
      case 'ConstLiteral':
        return;
      case 'ConstParam':
        if (!availableParams.has(expr.name)) {
          diagnostics.push(
            diagAt(
              `Const parameter '${expr.name}' is not declared in type parameters`,
              expr.location ?? location,
              'error',
              'CONST-UNBOUND-PARAM'
            )
          );
        }
        return;
      case 'ConstBinary':
        validateConstExpr(expr.left, availableParams, location);
        validateConstExpr(expr.right, availableParams, location);
        return;
      default:
        return;
    }
  };

  const validateConstExprInType = (
    typeExpr: LuminaTypeExpr | null | undefined,
    availableConstParams: Set<string>,
    location?: Location
  ): void => {
    if (!typeExpr || typeof typeExpr === 'string' || isTypeHoleExpr(typeExpr)) return;
    if ((typeExpr as { kind?: string }).kind === 'array') {
      const arrayType = typeExpr as import('./ast.js').LuminaArrayType;
      if (arrayType.size) {
        validateConstExpr(arrayType.size, availableConstParams, location ?? arrayType.location);
      }
      validateConstExprInType(arrayType.element, availableConstParams, location ?? arrayType.location);
    }
  };

  const validateConstGenericDecl = (
    typeParams: Array<{ name: string; bound?: LuminaType[]; isConst?: boolean; constType?: string }> | undefined,
    location?: Location
  ): void => {
    if (!typeParams || typeParams.length === 0) return;
    const validConstTypes = new Set(['usize', 'i32', 'i64']);

    let seenConst = false;
    const names = new Set<string>();

    for (const param of typeParams) {
      if (names.has(param.name)) {
        diagnostics.push(
          diagAt(`Duplicate type/const parameter: ${param.name}`, location, 'error', 'CONST-DUPLICATE')
        );
      }
      names.add(param.name);

      if (param.isConst) {
        seenConst = true;
        if (!param.constType) {
          diagnostics.push(
            diagAt(
              `Const parameter '${param.name}' must have explicit type (usize, i32, or i64)`,
              location,
              'error',
              'CONST-NO-TYPE'
            )
          );
          continue;
        }
        if (!validConstTypes.has(param.constType)) {
          diagnostics.push(
            diagAt(
              `Const parameter type must be usize, i32, or i64. Got: ${param.constType}`,
              location,
              'error',
              'CONST-INVALID-TYPE'
            )
          );
        }
      } else if (seenConst) {
        diagnostics.push(
          diagAt(
            `Type parameter '${param.name}' should come before const parameters`,
            location,
            'warning',
            'CONST-ORDER'
          )
        );
      }
    }
  };

  for (const stmt of program.body) {
    switch (stmt.type) {
      case 'FnDecl':
      case 'StructDecl':
      case 'EnumDecl':
      case 'TypeDecl':
      case 'TraitDecl':
      case 'ImplDecl':
        reportUnsupportedHkt(stmt.typeParams as Array<{ name: string; bound?: LuminaType[] }> | undefined, stmt.location);
        break;
      default:
        break;
    }

    if (stmt.type === 'StructDecl' || stmt.type === 'EnumDecl') {
      const declTypeParams = stmt.typeParams as Array<{
        name: string;
        bound?: LuminaType[];
        isConst?: boolean;
        constType?: string;
      }> | undefined;
      validateConstGenericDecl(declTypeParams, stmt.location);
      const availableConstParams = new Set(
        (declTypeParams ?? []).filter((param) => param.isConst).map((param) => param.name)
      );
      if (stmt.type === 'StructDecl') {
        for (const field of stmt.body ?? []) {
          validateConstExprInType(field.typeName, availableConstParams, field.location ?? stmt.location);
        }
      } else {
        for (const variant of stmt.variants ?? []) {
          for (const paramType of variant.params ?? []) {
            validateConstExprInType(paramType, availableConstParams, variant.location ?? stmt.location);
          }
          if (variant.resultType) {
            diagnostics.push(
              diagAt(
                `GADT variant result type on '${stmt.name}.${variant.name}' is parsed but not type-checked yet`,
                variant.location ?? stmt.location,
                'error',
                'UNSUPPORTED_GADT'
              )
            );
            validateConstExprInType(variant.resultType, availableConstParams, variant.location ?? stmt.location);
          }
        }
      }
      continue;
    }

  }
}

function warnOnImportedShadow(
  name: string,
  location: Location | undefined,
  diagnostics: Diagnostic[],
  options?: AnalyzeOptions
): void {
  if (!options?.importedNames?.has(name)) return;
  const binding = options.moduleBindings?.get(name);
  const target = binding?.kind === 'module' ? 'namespace' : 'imported binding';
  diagnostics.push(
    diagAt(
      `Binding '${name}' shadows ${target} '${name}'`,
      location,
      'warning',
      'SHADOWED_IMPORT'
    )
  );
}

function resolveFunctionBody(
  stmt: LuminaStatement,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  options: AnalyzeOptions | undefined,
  resolving: Set<string>,
  pendingDeps: Map<string, Set<string>>,
  parentScope?: Scope,
  diGraphs?: Map<string, string>
): LuminaType | null {
  if (stmt.type !== 'FnDecl') return null;
  if (options?.skipFunctionBodies?.has(stmt.name)) {
    const cached = options.cachedFunctionReturns?.get(stmt.name);
    if (cached) return cached;
    return resolveTypeExpr(stmt.returnType) ?? null;
  }
  const isAsync = !!stmt.async;
  const hmReturn = options?.hmInferred?.fnByName.get(stmt.name) ?? null;
  const resolvedReturn = resolveTypeExpr(stmt.returnType) ?? hmReturn ?? (options?.useHm ? 'any' : null);
  let signatureReturn: LuminaType | null = resolvedReturn;
  let bodyReturn: LuminaType | null = resolvedReturn;
  if (isAsync && resolvedReturn) {
    const parsed = parseTypeName(resolvedReturn);
    if (parsed && parsed.base === 'Promise' && parsed.args.length === 1) {
      bodyReturn = parsed.args[0];
      signatureReturn = resolvedReturn;
    } else {
      bodyReturn = resolvedReturn;
      signatureReturn = `Promise<${resolvedReturn}>`;
    }
  } else if (isAsync) {
    signatureReturn = null;
    bodyReturn = null;
  }
  const local = new SymbolTable();
  for (const sym of symbols.list()) {
    local.define(sym);
  }
  const typeParams = new Map<string, LuminaType | undefined>();
  const typeParamBounds = new Map<string, LuminaType[]>();
  for (const param of stmt.typeParams ?? []) {
    const bound = param.bound?.[0];
    typeParams.set(param.name, bound ? (resolveTypeExpr(bound) ?? 'any') : undefined);
    const bounds: LuminaType[] = [];
    for (const boundType of param.bound ?? []) {
      const resolved = resolveTypeExpr(boundType);
      if (resolved) bounds.push(resolved);
    }
    if (bounds.length > 0) {
      typeParamBounds.set(param.name, bounds);
    }
  }
  const fnScope = new Scope(parentScope);
  const hmParamTypes = options?.hmInferred?.fnParams.get(stmt.name);
  stmt.params.forEach((param, idx) => {
    warnOnImportedShadow(param.name, param.location ?? stmt.location, diagnostics, options);
    const inferredParam = resolveTypeExpr(param.typeName) ?? hmParamTypes?.[idx] ?? null;
    if (!param.typeName && !options?.useHm) {
      diagnostics.push(diagAt(`Missing type annotation for parameter '${param.name}'`, param.location ?? stmt.location));
    }
    const paramType = inferredParam ?? 'any';
    if (param.typeName) {
      const known = ensureKnownType(param.typeName, symbols, new Set(typeParams.keys()), diagnostics, param.location ?? stmt.location);
      if (known === 'unknown') {
        const resolvedParam = resolveTypeExpr(param.typeName);
        const suggestion = resolvedParam ? suggestName(resolvedParam, collectVisibleTypeSymbols(symbols, options)) : null;
        const related = suggestion
          ? [
              {
                location: param.location ?? stmt.location ?? defaultLocation,
                message: `Did you mean '${suggestion}'?`,
              },
            ]
          : undefined;
        diagnostics.push(
          diagAt(
            `Unknown type '${resolvedParam ?? 'unknown'}' for parameter '${param.name}'`,
            param.location ?? stmt.location,
            'error',
            'UNKNOWN_TYPE',
            related
          )
        );
      }
    }
    local.define({
      name: param.name,
      kind: 'variable',
      type: paramType,
      location: param.location ?? stmt.location,
      ref: !!param.ref,
      refMutable: !!param.refMut,
      mutable: false,
    });
    fnScope.define(param.name, param.location ?? stmt.location);
  });
  if (stmt.extern) {
    return signatureReturn ?? resolvedReturn ?? null;
  }
  if (options?.diDebug && diGraphs) {
    diGraphs.set(stmt.name, buildCfgDot(stmt.name, stmt.body.body));
  }
  const collector = bodyReturn ? undefined : { types: [] as LuminaType[] };
  const di = new DefiniteAssignment();
  for (const param of stmt.params) {
    di.define(fnScope, param.name, true);
  }
  for (const bodyStmt of stmt.body.body) {
    typeCheckStatement(
      bodyStmt,
      local,
      diagnostics,
      bodyReturn,
      fnScope,
      { ...options, typeParams, typeParamBounds },
      collector,
      resolving,
      pendingDeps,
      stmt.name,
      di
    );
  }
  collectUnusedBindings(fnScope, diagnostics, stmt.location);
  if (bodyReturn) return signatureReturn ?? bodyReturn;
  const hasReturn = blockHasReturn(stmt.body);
  if (pendingDeps.get(stmt.name)?.size) {
    if (collector && collector.types.length === 0 && !hasReturn) {
      pendingDeps.delete(stmt.name);
      return isAsync ? 'Promise<void>' : 'void';
    }
    return null;
  }
  if (collector && collector.types.length > 0) {
    const [first, ...rest] = collector.types;
    const mismatch = rest.some((t) => !areTypesEquivalent(t, first));
    if (mismatch) {
      diagnostics.push(diagAt(`Inconsistent return types for '${stmt.name}'`, stmt.location));
      return null;
    }
    return isAsync ? `Promise<${first}>` : first;
  }
  return isAsync ? 'Promise<void>' : 'void';
}

function blockHasReturn(block: { body: LuminaStatement[] }): boolean {
  const visit = (stmt: LuminaStatement): boolean => {
    switch (stmt.type) {
      case 'Return':
        return true;
      case 'Block':
        return stmt.body.some(visit);
      case 'If':
        return visit(stmt.thenBlock) || (stmt.elseBlock ? visit(stmt.elseBlock) : false);
      case 'IfLet':
        return visit(stmt.thenBlock) || (stmt.elseBlock ? visit(stmt.elseBlock) : false);
      case 'While':
      case 'WhileLet':
      case 'For':
        return visit(stmt.body);
      case 'LetElse':
        return visit(stmt.elseBlock);
      case 'MatchStmt':
        return stmt.arms.some((arm) => visit(arm.body));
      default:
        return false;
    }
  };
  return block.body.some(visit);
}

function detectPendingCycles(graph: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles = new Set<string>();

  const visit = (node: string) => {
    if (stack.has(node)) {
      cycles.add(node);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }
    stack.delete(node);
  };

  for (const node of graph.keys()) {
    visit(node);
  }
  return Array.from(cycles);
}

function collectVisibleSymbols(symbols: SymbolTable, options?: { currentUri?: string }): string[] {
  const list = symbols.list();
  const names: string[] = [];
  for (const sym of list) {
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') continue;
    names.push(sym.name);
  }
  return names;
}

function collectVisibleTypeSymbols(symbols: SymbolTable, options?: { currentUri?: string }): string[] {
  const list = symbols.list();
  const names: string[] = [];
  for (const sym of list) {
    if (sym.kind !== 'type') continue;
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') continue;
    names.push(sym.name);
  }
  return names;
}

function findEnumVariant(
  symbols: SymbolTable,
  name: string,
  options?: { currentUri?: string }
): { enumName: string; params: LuminaType[] } | null {
  for (const sym of symbols.list()) {
    if (!sym.enumVariants) continue;
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') continue;
    const variant = sym.enumVariants.find((v) => v.name === name);
    if (variant) {
      return { enumName: sym.name, params: variant.params };
    }
  }
  return null;
}

function findEnumVariantQualified(
  symbols: SymbolTable,
  enumName: string,
  variantName: string,
  options?: { currentUri?: string }
): { enumName: string; params: LuminaType[] } | null {
  const sym = symbols.get(enumName);
  if (!sym || !sym.enumVariants) return null;
  if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') return null;
  const variant = sym.enumVariants.find((v) => v.name === variantName);
  if (!variant) return null;
  return { enumName: sym.name, params: variant.params };
}

function getEnumPayloadType(
  symbols: SymbolTable,
  variantName: string,
  options?: { currentUri?: string }
): LuminaType | null {
  const variant = findEnumVariant(symbols, variantName, options);
  if (!variant) return null;
  if (variant.params.length !== 1) return null;
  return variant.params[0];
}

function getEnumPayloadTypeQualified(
  symbols: SymbolTable,
  enumName: string,
  variantName: string,
  options?: { currentUri?: string }
): LuminaType | null {
  const variant = findEnumVariantQualified(symbols, enumName, variantName, options);
  if (!variant) return null;
  if (variant.params.length !== 1) return null;
  return variant.params[0];
}

function getNarrowingFromCondition(
  expr: LuminaExpr,
  symbols: SymbolTable,
  options?: { currentUri?: string }
): { name: string; type: LuminaType; when: 'then' | 'else' } | null {
  if (expr.type === 'IsExpr') {
    if (expr.value.type !== 'Identifier') return null;
    const payloadType = expr.enumName
      ? getEnumPayloadTypeQualified(symbols, expr.enumName, expr.variant, options)
      : getEnumPayloadType(symbols, expr.variant, options);
    if (!payloadType) return null;
    return { name: expr.value.name, type: payloadType, when: 'then' };
  }
  if (expr.type !== 'Binary') return null;
  if (expr.op !== '==' && expr.op !== '!=') return null;

  const tryMatch = (left: LuminaExpr, right: LuminaExpr, when: 'then' | 'else') => {
    if (left.type !== 'Identifier' || right.type !== 'Call') return null;
    const payloadType = right.enumName
      ? getEnumPayloadTypeQualified(symbols, right.enumName, right.callee.name, options)
      : getEnumPayloadType(symbols, right.callee.name, options);
    if (!payloadType) return null;
    return { name: left.name, type: payloadType, when };
  };

  const when = expr.op === '==' ? 'then' : 'else';
  return (
    tryMatch(expr.left, expr.right, when) ??
    tryMatch(expr.right, expr.left, when)
  );
}

function resolveEnumFromType(
  symbols: SymbolTable,
  typeName: LuminaType | null
): { name: string; variants: Array<{ name: string; params: LuminaType[] }> } | null {
  if (!typeName) return null;
  const parsed = parseTypeName(typeName);
  const base = parsed?.base ?? typeName;
  const sym = symbols.get(base);
  if (!sym || !sym.enumVariants) return null;
  return { name: base, variants: sym.enumVariants };
}

function buildEnumTypeMapping(
  enumName: string,
  matchType: LuminaType | null,
  symbols: SymbolTable
): Map<string, LuminaType> | null {
  const sym = symbols.get(enumName);
  const typeParams = sym?.typeParams ?? [];
  if (typeParams.length === 0) return null;
  if (!matchType) return null;
  const parsed = parseTypeName(matchType);
  if (!parsed || parsed.base !== enumName) return null;
  if (parsed.args.length !== typeParams.length) return null;
  const mapping = new Map<string, LuminaType>();
  typeParams.forEach((tp, idx) => {
    mapping.set(tp.name, parsed.args[idx]);
  });
  return mapping;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function suggestName(name: string, candidates: string[]): string | null {
  let best: { name: string; dist: number } | null = null;
  for (const candidate of candidates) {
    const dist = levenshtein(name, candidate);
    if (best === null || dist < best.dist) {
      best = { name: candidate, dist };
    }
  }
  if (!best) return null;
  return best.dist <= 2 ? best.name : null;
}

function typeCheckStatement(
  stmt: LuminaStatement,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  currentReturnType: LuminaType | null,
  scope?: Scope,
  options?: AnalyzeOptions,
  returnCollector?: { types: LuminaType[] },
  resolving?: Set<string>,
  pendingDeps?: Map<string, Set<string>>,
  currentFunction?: string,
  di?: DefiniteAssignment
) {
  try {
    switch (stmt.type) {
    case 'ErrorNode':
      diagnostics.push(diagAt(stmt.message ?? 'Invalid syntax', stmt.location));
      return;
    case 'TypeDecl':
      if (stmt.extern) {
        return;
      }
      if (stmt.typeParams && stmt.typeParams.length > 0) {
        const traitNames = options?.traitRegistry ? new Set(options.traitRegistry.traits.keys()) : undefined;
        for (const param of stmt.typeParams) {
          if (!isValidTypeParam(param.name)) {
            diagnostics.push(diagAt(`Invalid type parameter '${param.name}'`, stmt.location));
          }
          if (param.bound) {
            for (const bound of param.bound) {
              const resolvedBound = resolveTypeExpr(bound);
              if (
                resolvedBound &&
                !isKnownType(
                  resolvedBound,
                  symbols,
                  new Set<string>(stmt.typeParams.map((p) => p.name)),
                  traitNames,
                  true
                )
              ) {
                diagnostics.push(diagAt(`Unknown bound '${resolvedBound}' for type parameter '${param.name}'`, stmt.location));
              }
            }
          }
        }
      }
      {
        const typeParams = new Map<string, LuminaType | undefined>();
        for (const param of stmt.typeParams ?? []) {
          const bound = param.bound?.[0];
          typeParams.set(param.name, bound ? (resolveTypeExpr(bound) ?? 'any') : undefined);
        }
        for (const field of stmt.body) {
          const known = ensureKnownType(field.typeName, symbols, new Set(typeParams.keys()), diagnostics, stmt.location);
          if (known === 'unknown') {
            const resolvedField = resolveTypeExpr(field.typeName);
            const suggestion = resolvedField ? suggestName(resolvedField, collectVisibleTypeSymbols(symbols, options)) : null;
            const related = suggestion
              ? [
                  {
                    location: stmt.location ?? defaultLocation,
                    message: `Did you mean '${suggestion}'?`,
                  },
                ]
              : undefined;
            diagnostics.push(
              diagAt(
                `Unknown type '${resolvedField ?? 'unknown'}' for field '${field.name}'`,
                stmt.location,
                'error',
                'UNKNOWN_TYPE',
                related
              )
            );
          }
        }
      }
      return;
    case 'TraitDecl':
    case 'ImplDecl':
      return;
    case 'StructDecl': {
      if (stmt.typeParams && stmt.typeParams.length > 0) {
        const traitNames = options?.traitRegistry ? new Set(options.traitRegistry.traits.keys()) : undefined;
        for (const param of stmt.typeParams) {
          if (!isValidTypeParam(param.name)) {
            diagnostics.push(diagAt(`Invalid type parameter '${param.name}'`, stmt.location));
          }
          if (param.bound) {
            for (const bound of param.bound) {
              const resolvedBound = resolveTypeExpr(bound);
              if (
                resolvedBound &&
                !isKnownType(
                  resolvedBound,
                  symbols,
                  new Set<string>(stmt.typeParams.map((p) => p.name)),
                  traitNames,
                  true
                )
              ) {
                diagnostics.push(diagAt(`Unknown bound '${resolvedBound}' for type parameter '${param.name}'`, stmt.location));
              }
            }
          }
        }
      }
      {
        const typeParams = new Map<string, LuminaType | undefined>();
        for (const param of stmt.typeParams ?? []) {
          const bound = param.bound?.[0];
          typeParams.set(param.name, bound ? (resolveTypeExpr(bound) ?? 'any') : undefined);
        }
        for (const field of stmt.body) {
          const known = ensureKnownType(field.typeName, symbols, new Set(typeParams.keys()), diagnostics, stmt.location);
          if (known === 'unknown') {
            const resolvedField = resolveTypeExpr(field.typeName);
            const suggestion = resolvedField ? suggestName(resolvedField, collectVisibleTypeSymbols(symbols, options)) : null;
            const related = suggestion
              ? [
                  {
                    location: stmt.location ?? defaultLocation,
                    message: `Did you mean '${suggestion}'?`,
                  },
                ]
              : undefined;
            diagnostics.push(
              diagAt(
                `Unknown type '${resolvedField ?? 'unknown'}' for field '${field.name}'`,
                stmt.location,
                'error',
                'UNKNOWN_TYPE',
                related
              )
            );
          }
        }
      }
      return;
    }
    case 'EnumDecl': {
      for (const variant of stmt.variants) {
        for (const param of variant.params ?? []) {
          const resolvedParam = resolveTypeExpr(param);
          if (resolvedParam && !isKnownType(resolvedParam, symbols, new Set<string>(stmt.typeParams?.map(p => p.name) ?? []))) {
            diagnostics.push(diagAt(`Unknown type '${resolvedParam}' for enum variant '${variant.name}'`, variant.location ?? stmt.location));
          }
        }
      }
      return;
    }
    case 'FnDecl': {
      resolveFunctionBody(stmt, symbols, diagnostics, options, resolving ?? new Set(), pendingDeps ?? new Map(), scope);
      return;
    }
    case 'Let': {
      const typeParams = options?.typeParams ?? new Map<string, LuminaType | undefined>();
      const expectedType = resolveTypeExpr(stmt.typeName) ?? null;
      warnOnImportedShadow(stmt.name, stmt.location, diagnostics, options);
      if (scope) {
        const parentScope = scope.parent;
        const shadowed = parentScope ? findDefScope(parentScope, stmt.name) : null;
        if (shadowed) {
          const shadowedLocation = shadowed.locals.get(stmt.name);
          const related = shadowedLocation
            ? [
                {
                  location: shadowedLocation,
                  message: `Previous '${stmt.name}' declared here`,
                },
              ]
            : undefined;
          diagnostics.push(
            diagAt(
              `Binding '${stmt.name}' shadows a variable from an outer scope`,
              stmt.location,
              'warning',
              'SHADOWED_BINDING',
              related
            )
          );
        }
      }
      if (expectedType) {
        const known = ensureKnownType(expectedType, symbols, new Set(typeParams.keys()), diagnostics, stmt.location);
        if (known === 'unknown') {
          const suggestion = suggestName(expectedType, collectVisibleTypeSymbols(symbols, options));
          const related = suggestion
            ? [
                {
                  location: stmt.location ?? defaultLocation,
                  message: `Did you mean '${suggestion}'?`,
                },
              ]
            : undefined;
          diagnostics.push(diagAt(`Unknown type '${expectedType}' for variable '${stmt.name}'`, stmt.location, 'error', 'UNKNOWN_TYPE', related));
        }
      }
      if (scope && di) {
        di.define(scope, stmt.name, false);
      }
      if (scope) {
        scope.define(stmt.name, stmt.location);
      }
      symbols.define({
        name: stmt.name,
        kind: 'variable',
        type: expectedType ?? 'any',
        location: stmt.location,
        mutable: stmt.mutable ?? false,
      });
      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        expectedType ?? undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      const hmTypeKey = hmKey(stmt.location);
      const hmInferredType =
        !expectedType && hmTypeKey ? options?.hmInferred?.letTypes.get(hmTypeKey) ?? null : null;
      if (expectedType && valueType && !isTypeAssignable(valueType, expectedType, symbols, options?.typeParams)) {
        diagnostics.push(
          diagAt(
            `Type mismatch: '${stmt.name}' is '${formatTypeForDiagnostic(expectedType)}' but value is '${formatTypeForDiagnostic(valueType)}'`,
            stmt.location
          )
        );
      }
      const finalType = expectedType ?? valueType ?? hmInferredType;
      if (!finalType) {
        if (
          stmt.value.type === 'Call' &&
          !expectedType &&
          (() => {
            const callee = stmt.value.callee.name;
            const sym = symbols.get(callee) ?? options?.externSymbols?.(callee);
            return !!(sym && sym.kind === 'function' && sym.pendingReturn);
          })()
        ) {
          symbols.define({ name: stmt.name, kind: 'variable', type: 'any', location: stmt.location });
          scope?.define(stmt.name, stmt.location);
          return;
        }
        diagnostics.push(diagAt(`Could not infer type for '${stmt.name}'`, stmt.location));
      }
      if (finalType === 'void') {
        diagnostics.push(
          diagAt(`Cannot bind void value to '${stmt.name}'`, stmt.location, 'error', 'VOID_BINDING')
        );
      }
      symbols.define({
        name: stmt.name,
        kind: 'variable',
        type: finalType ?? 'any',
        location: stmt.location,
        mutable: stmt.mutable ?? false,
      });
      if (scope && di) {
        di.assign(scope, stmt.name);
      }
      return;
    }
    case 'LetTuple': {
      const seen = new Set<string>();
      for (const name of stmt.names) {
        if (seen.has(name)) {
          diagnostics.push(diagAt(`Duplicate binding '${name}' in tuple destructuring`, stmt.location, 'error', 'DUPLICATE_BINDING'));
          return;
        }
        seen.add(name);
      }

      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (!valueType || isErrorTypeName(valueType)) return;

      const parsed = parseTypeName(valueType);
      let bindingTypes: LuminaType[] | null = null;
      if (parsed?.base === 'Channel' && parsed.args.length >= 1) {
        const value = parsed.args[0] ?? 'any';
        bindingTypes = [`Sender<${value}>`, `Receiver<${value}>`];
      } else if (parsed?.base === 'Tuple' && parsed.args.length > 0) {
        bindingTypes = parsed.args;
      }

      if (!bindingTypes) {
        diagnostics.push(
          diagAt(
            `Cannot destructure '${formatTypeForDiagnostic(valueType)}' with tuple pattern`,
            stmt.location,
            'error',
            'TUPLE_DESTRUCTURE_TYPE'
          )
        );
        return;
      }

      if (bindingTypes.length !== stmt.names.length) {
        diagnostics.push(
          diagAt(
            `Tuple destructuring expects ${bindingTypes.length} binding(s), found ${stmt.names.length}`,
            stmt.location,
            'error',
            'TUPLE_DESTRUCTURE_ARITY'
          )
        );
        return;
      }

      for (let i = 0; i < stmt.names.length; i += 1) {
        const name = stmt.names[i];
        const finalType = bindingTypes[i] ?? 'any';
        warnOnImportedShadow(name, stmt.location, diagnostics, options);
        if (scope) {
          const parentScope = scope.parent;
          const shadowed = parentScope ? findDefScope(parentScope, name) : null;
          if (shadowed) {
            const shadowedLocation = shadowed.locals.get(name);
            const related = shadowedLocation
              ? [
                  {
                    location: shadowedLocation,
                    message: `Previous '${name}' declared here`,
                  },
                ]
              : undefined;
            diagnostics.push(
              diagAt(
                `Binding '${name}' shadows a variable from an outer scope`,
                stmt.location,
                'warning',
                'SHADOWED_BINDING',
                related
              )
            );
          }
        }
        symbols.define({
          name,
          kind: 'variable',
          type: finalType,
          location: stmt.location,
          mutable: stmt.mutable ?? false,
        });
        scope?.define(name, stmt.location);
        if (scope && di) {
          di.define(scope, name, false);
          di.assign(scope, name);
        }
      }
      return;
    }
    case 'LetElse': {
      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );

      const elseScope = new Scope(scope);
      const elseSymbols = cloneSymbolTable(symbols);
      typeCheckStatement(
        stmt.elseBlock,
        elseSymbols,
        diagnostics,
        currentReturnType,
        elseScope,
        options,
        returnCollector,
        resolving,
        pendingDeps,
        currentFunction,
        di ? di.clone() : undefined
      );

      const bindingTypes = collectPatternBindingTypes(stmt.pattern, valueType ?? 'any', symbols);
      for (const [name, bindingType] of bindingTypes.entries()) {
        symbols.define({
          name,
          kind: 'variable',
          type: bindingType,
          location: stmt.location,
          mutable: stmt.mutable ?? false,
        });
        scope?.define(name, stmt.location);
        if (scope && di) {
          di.define(scope, name, false);
          di.assign(scope, name);
        }
      }
      return;
    }
    case 'If': {
      const condType = typeCheckExpr(stmt.condition, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      if (condType && condType !== 'bool') {
        diagnostics.push(diagAt(`If condition must be 'bool'`, stmt.location));
      }
      const narrowing = getNarrowingFromCondition(stmt.condition, symbols, options);
      let elseNarrow: { name: string; type: LuminaType } | null = null;
      if (stmt.condition.type === 'IsExpr' && stmt.condition.value.type === 'Identifier') {
        const valueType = typeCheckExpr(stmt.condition.value, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
        const enumInfo = resolveEnumFromType(symbols, valueType);
        if (enumInfo) {
          const targetVariant = stmt.condition.variant;
          const remaining = enumInfo.variants.filter((v) => v.name !== targetVariant);
          if (remaining.length === 1 && remaining[0].params.length === 1) {
            elseNarrow = { name: stmt.condition.value.name, type: remaining[0].params[0] };
          }
        }
      }
      const baseMoves = snapshotMoves(scope);
      if (di) {
        const thenDi = di.clone();
        const elseDi = di.clone();
        const thenScope = new Scope(scope);
        const thenSymbols = cloneSymbolTable(symbols);
        if (narrowing) {
          if (narrowing.when === 'then') {
            thenScope.narrow(narrowing.name, narrowing.type);
          }
        }
        typeCheckStatement(
          stmt.thenBlock,
          thenSymbols,
          diagnostics,
          currentReturnType,
          thenScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction,
          thenDi
        );
        const thenMoves = snapshotMoves(scope);
        restoreMoves(baseMoves);
        let elseMoves = baseMoves;
        if (stmt.elseBlock) {
          const elseScope = new Scope(scope);
          const elseSymbols = cloneSymbolTable(symbols);
          if (narrowing && narrowing.when === 'else') {
            elseScope.narrow(narrowing.name, narrowing.type);
          }
          if (elseNarrow) {
            elseScope.narrow(elseNarrow.name, elseNarrow.type);
          }
          typeCheckStatement(
            stmt.elseBlock,
            elseSymbols,
            diagnostics,
            currentReturnType,
            elseScope,
            options,
            returnCollector,
            resolving,
            pendingDeps,
            currentFunction,
            elseDi
          );
          elseMoves = snapshotMoves(scope);
        }
        mergeMoves(scope, [thenMoves, elseMoves]);
        di.mergeFromBranches([thenDi, elseDi]);
      } else {
        const thenScope = new Scope(scope);
        const thenSymbols = cloneSymbolTable(symbols);
        if (narrowing) {
          if (narrowing.when === 'then') {
            thenScope.narrow(narrowing.name, narrowing.type);
          }
        }
        typeCheckStatement(
          stmt.thenBlock,
          thenSymbols,
          diagnostics,
          currentReturnType,
          thenScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction
        );
        const thenMoves = snapshotMoves(scope);
        restoreMoves(baseMoves);
        let elseMoves = baseMoves;
        if (stmt.elseBlock) {
          const elseScope = new Scope(scope);
          const elseSymbols = cloneSymbolTable(symbols);
          if (narrowing && narrowing.when === 'else') {
            elseScope.narrow(narrowing.name, narrowing.type);
          }
          if (elseNarrow) {
            elseScope.narrow(elseNarrow.name, elseNarrow.type);
          }
          typeCheckStatement(
            stmt.elseBlock,
            elseSymbols,
            diagnostics,
            currentReturnType,
            elseScope,
            options,
            returnCollector,
            resolving,
            pendingDeps,
            currentFunction
          );
          elseMoves = snapshotMoves(scope);
        }
        mergeMoves(scope, [thenMoves, elseMoves]);
      }
      return;
    }
    case 'IfLet': {
      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );

      const thenScope = new Scope(scope);
      const thenSymbols = cloneSymbolTable(symbols);
      const thenDi = di ? di.clone() : undefined;
      const bindingTypes = collectPatternBindingTypes(stmt.pattern, valueType ?? 'any', symbols);
      for (const [name, bindingType] of bindingTypes.entries()) {
        thenScope.define(name, stmt.location);
        thenSymbols.define({
          name,
          kind: 'variable',
          type: bindingType,
          location: stmt.location,
          mutable: false,
        });
        if (thenDi) {
          thenDi.define(thenScope, name, true);
        }
      }
      typeCheckStatement(
        stmt.thenBlock,
        thenSymbols,
        diagnostics,
        currentReturnType,
        thenScope,
        options,
        returnCollector,
        resolving,
        pendingDeps,
        currentFunction,
        thenDi
      );

      if (stmt.elseBlock) {
        const elseScope = new Scope(scope);
        const elseSymbols = cloneSymbolTable(symbols);
        typeCheckStatement(
          stmt.elseBlock,
          elseSymbols,
          diagnostics,
          currentReturnType,
          elseScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction,
          di ? di.clone() : undefined
        );
      }
      return;
    }
    case 'While': {
      const condType = typeCheckExpr(stmt.condition, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      if (condType && condType !== 'bool') {
        diagnostics.push(diagAt(`While condition must be 'bool'`, stmt.location));
      }
      const baseMoves = snapshotMoves(scope);
      if (di) {
        const bodyDi = di.clone();
        const loopSymbols = cloneSymbolTable(symbols);
        typeCheckStatement(
          stmt.body,
          loopSymbols,
          diagnostics,
          currentReturnType,
          scope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction,
          bodyDi
        );
      } else {
        const loopSymbols = cloneSymbolTable(symbols);
        typeCheckStatement(
          stmt.body,
          loopSymbols,
          diagnostics,
          currentReturnType,
          scope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction
        );
      }
      const bodyMoves = snapshotMoves(scope);
      restoreMoves(baseMoves);
      mergeMoves(scope, [baseMoves, bodyMoves]);
      return;
    }
    case 'For': {
      const iterableType = typeCheckExpr(
        stmt.iterable,
        symbols,
        diagnostics,
        scope,
        options,
        'Range',
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (iterableType && !areTypesEquivalent(iterableType, 'Range')) {
        diagnostics.push(
          diagAt(
            `For loop expects a Range iterable, found '${formatTypeForDiagnostic(iterableType)}'`,
            stmt.location,
            'error',
            'FOR_RANGE_REQUIRED'
          )
        );
      }

      const loopScope = new Scope(scope);
      const loopSymbols = cloneSymbolTable(symbols);
      loopScope.define(stmt.iterator, stmt.location);
      loopSymbols.define({
        name: stmt.iterator,
        kind: 'variable',
        type: 'i32',
        location: stmt.location,
        mutable: false,
      });

      const baseMoves = snapshotMoves(scope);
      if (di) {
        const loopDi = di.clone();
        loopDi.define(loopScope, stmt.iterator, true);
        typeCheckStatement(
          stmt.body,
          loopSymbols,
          diagnostics,
          currentReturnType,
          loopScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction,
          loopDi
        );
      } else {
        typeCheckStatement(
          stmt.body,
          loopSymbols,
          diagnostics,
          currentReturnType,
          loopScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction
        );
      }
      collectUnusedBindings(loopScope, diagnostics, stmt.location);
      const bodyMoves = snapshotMoves(scope);
      restoreMoves(baseMoves);
      mergeMoves(scope, [baseMoves, bodyMoves]);
      return;
    }
    case 'WhileLet': {
      const matchType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      const parsedMatch = matchType ? parseTypeName(matchType) : null;
      const matchBase = parsedMatch?.base ?? matchType ?? null;
      const enumSym = matchBase ? symbols.get(matchBase) : undefined;
      const variants = enumSym?.enumVariants ?? [];
      const loopScope = new Scope(scope);
      const loopSymbols = cloneSymbolTable(symbols);
      const loopDi = di ? di.clone() : undefined;
      const matchMutability = resolveMutableSource(stmt.value, symbols, options);
      const pattern = stmt.pattern;
      if (pattern.type === 'EnumPattern') {
        if (pattern.enumName && matchBase && pattern.enumName !== matchBase) {
          diagnostics.push(diagAt(`While-let value is '${matchBase}', not '${pattern.enumName}'`, stmt.location));
        }
        const variant = pattern.enumName
          ? findEnumVariantQualified(symbols, pattern.enumName, pattern.variant, options)
          : variants.find((v) => v.name === pattern.variant)
            ? { enumName: matchBase ?? '', params: variants.find((v) => v.name === pattern.variant)?.params ?? [] }
            : null;
        if (!variant) {
          diagnostics.push(diagAt(`Unknown enum variant '${pattern.variant}'`, stmt.location));
        } else {
          const mapping = matchBase ? buildEnumTypeMapping(matchBase, matchType, symbols) : null;
          const mappedParams = mapping
            ? variant.params.map((param) => substituteTypeParams(param, mapping))
            : variant.params;
          if (pattern.bindings.length > 0) {
            if (mappedParams.length === 0) {
              diagnostics.push(diagAt(`Variant '${pattern.variant}' has no payload`, stmt.location));
            } else if (pattern.bindings.length !== mappedParams.length) {
              diagnostics.push(diagAt(`Variant '${pattern.variant}' expects ${mappedParams.length} bindings`, stmt.location));
            }
            pattern.bindings.forEach((binding, idx) => {
              if (binding === '_') return;
              const paramType = mappedParams[idx];
              if (!paramType) return;
              loopScope.define(binding, stmt.location);
              loopSymbols.define({
                name: binding,
                kind: 'variable',
                type: paramType,
                location: stmt.location,
                mutable: matchMutability,
              });
              loopDi?.define(loopScope, binding, true);
            });
          }
        }
      }

      const baseMoves = snapshotMoves(scope);
      typeCheckStatement(
        stmt.body,
        loopSymbols,
        diagnostics,
        currentReturnType,
        loopScope,
        options,
        returnCollector,
        resolving,
        pendingDeps,
        currentFunction,
        loopDi
      );
      collectUnusedBindings(loopScope, diagnostics, stmt.location);
      const bodyMoves = snapshotMoves(scope);
      restoreMoves(baseMoves);
      mergeMoves(scope, [baseMoves, bodyMoves]);
      return;
    }
    case 'Assign': {
      if (stmt.target.type === 'Identifier') {
        const target = stmt.target.name;
        const sym = symbols.get(target) ?? options?.externSymbols?.(target);
        if (!sym) {
          diagnostics.push(diagAt(`Unknown identifier '${target}'`, stmt.location));
          return;
        }
        if (sym.kind === 'variable' && sym.mutable === false) {
          diagnostics.push(diagAt(`Cannot assign to immutable variable '${target}'`, stmt.location));
          return;
        }
        scope?.write(target);
        scope?.clearMovedPath(target, true);
        const valueType = typeCheckExpr(stmt.value, symbols, diagnostics, scope, options, sym.type, resolving, pendingDeps, currentFunction, di);
        if (scope && di) {
          const defScope = findDefScope(scope, target);
          if (defScope) di.assign(defScope, target);
        }
        if (valueType && sym.type && !isTypeAssignable(valueType, sym.type, symbols, options?.typeParams)) {
          diagnostics.push(
            diagAt(
              `Type mismatch: '${target}' is '${formatTypeForDiagnostic(sym.type)}' but value is '${formatTypeForDiagnostic(valueType)}'`,
              stmt.location
            )
          );
        }
        return;
      }

      const baseName = getLValueBaseName(stmt.target);
      if (!baseName) {
        diagnostics.push(diagAt('Invalid assignment target', stmt.location));
        return;
      }
      const targetPath = getMovePath(stmt.target);
      const baseSym = symbols.get(baseName) ?? options?.externSymbols?.(baseName);
      if (!baseSym) {
        diagnostics.push(diagAt(`Unknown identifier '${baseName}'`, stmt.location));
        return;
      }
      if (targetPath) {
        const movedAt = scope?.findMoveConflict(baseName, 'exact');
        if (movedAt) {
          diagnostics.push(
            diagAt(
              `Cannot assign to '${targetPath}' here; '${baseName}' was moved`,
              stmt.location,
              'error',
              'USE_AFTER_MOVE',
              [
                {
                  location: movedAt,
                  message: `Moved here`,
                },
              ]
            )
          );
          return;
        }
        scope?.clearMovedPath(targetPath, true);
      }
      if (baseSym.ref && !baseSym.refMutable) {
        diagnostics.push(diagAt(`Cannot assign through immutable reference '${baseName}'`, stmt.location, 'error', 'REF_MUT_REQUIRED'));
        return;
      }
      if (baseSym.mutable === false && !baseSym.refMutable) {
        diagnostics.push(diagAt(`Cannot assign through immutable binding '${baseName}'`, stmt.location));
        return;
      }

      const objectType = typeCheckExpr(
        stmt.target.object,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        undefined,
        true
      );
      if (!objectType) return;
      const parsed = parseTypeName(objectType);
      const structName = parsed?.base ?? objectType;
      const structSym = symbols.get(structName);
      if (!structSym || !structSym.structFields) {
        diagnostics.push(diagAt(`'${objectType}' has no fields`, stmt.location));
        return;
      }
      const fieldType = structSym.structFields.get(stmt.target.property);
      if (!fieldType) {
        diagnostics.push(diagAt(`Unknown field '${stmt.target.property}' on '${objectType}'`, stmt.location));
        return;
      }
      const mapping = new Map<string, LuminaType>();
      if (parsed && structSym.typeParams && parsed.args.length === structSym.typeParams.length) {
        structSym.typeParams.forEach((tp, idx) => {
          mapping.set(tp.name, parsed.args[idx]);
        });
      }
      const resolvedField = substituteTypeParams(fieldType, mapping);
      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        resolvedField,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (valueType && !isTypeAssignable(valueType, resolvedField, symbols, options?.typeParams)) {
        diagnostics.push(
          diagAt(
            `Type mismatch for '${stmt.target.property}': expected '${formatTypeForDiagnostic(resolvedField)}', got '${formatTypeForDiagnostic(valueType)}'`,
            stmt.location
          )
        );
      }
      return;
    }
    case 'Return': {
      const valueType = typeCheckExpr(
        stmt.value,
        symbols,
        diagnostics,
        scope,
        options,
        currentReturnType ?? undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (
        currentReturnType &&
        currentReturnType !== 'any' &&
        valueType &&
        !isTypeAssignable(valueType, currentReturnType, symbols, options?.typeParams)
      ) {
        diagnostics.push(
          diagAt(
            `Return type '${formatTypeForDiagnostic(valueType)}' does not match '${formatTypeForDiagnostic(currentReturnType)}'`,
            stmt.location
          )
        );
      }
      if (!currentReturnType && valueType && returnCollector) {
        returnCollector.types.push(valueType);
      }
      return;
    }
    case 'ExprStmt':
      typeCheckExpr(stmt.expr, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      return;
    case 'Block': {
      const blockScope = new Scope(scope);
      const blockSymbols = cloneSymbolTable(symbols);
      const blockDi = di ?? undefined;
      for (const bodyStmt of stmt.body) {
        typeCheckStatement(
          bodyStmt,
          blockSymbols,
          diagnostics,
          currentReturnType,
          blockScope,
          options,
          returnCollector,
          resolving,
          pendingDeps,
          currentFunction,
          blockDi
        );
      }
      collectUnusedBindings(blockScope, diagnostics, stmt.location);
      return;
    }
    case 'MatchStmt': {
      const matchType = typeCheckExpr(stmt.value, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      const parsedMatch = matchType ? parseTypeName(matchType) : null;
      const matchBase = parsedMatch?.base ?? matchType ?? null;
      const enumSym = matchBase ? symbols.get(matchBase) : undefined;
      const variants = enumSym?.enumVariants ?? [];
      const seen = new Set<string>();
      let hasWildcard = false;
      let hasEnumPattern = false;
      const branchStates: DefiniteAssignment[] = [];
      const baseMoves = snapshotMoves(scope);
      const branchMoves: Array<Map<Scope, Map<string, Location | undefined>>> = [];
      const matchValueName = stmt.value.type === 'Identifier' ? stmt.value.name : null;
      const matchMutability = resolveMutableSource(stmt.value, symbols, options);
      for (const arm of stmt.arms) {
        restoreMoves(baseMoves);
        const armScope = new Scope(scope);
        const armSymbols = new SymbolTable();
        const armDi = di ? di.clone() : undefined;
        for (const sym of symbols.list()) {
          armSymbols.define(sym);
        }
        const pattern = arm.pattern;
        if (pattern.type === 'WildcardPattern') {
          hasWildcard = true;
        } else if (pattern.type === 'EnumPattern') {
          hasEnumPattern = true;
          if (pattern.enumName && matchBase && pattern.enumName !== matchBase) {
            diagnostics.push(diagAt(`Match value is '${matchBase}', not '${pattern.enumName}'`, arm.location ?? stmt.location));
          }
          const variant = pattern.enumName
            ? findEnumVariantQualified(symbols, pattern.enumName, pattern.variant, options)
            : variants.find((v) => v.name === pattern.variant)
              ? { enumName: matchBase ?? '', params: variants.find((v) => v.name === pattern.variant)?.params ?? [] }
              : null;
          if (!variant) {
            diagnostics.push(diagAt(`Unknown enum variant '${pattern.variant}'`, arm.location ?? stmt.location));
          } else {
            const variantName = pattern.variant;
            if (seen.has(variantName)) {
              diagnostics.push(diagAt(`Duplicate match arm for '${variantName}'`, arm.location ?? stmt.location));
            }
            seen.add(variantName);
            const mapping = matchBase ? buildEnumTypeMapping(matchBase, matchType, symbols) : null;
            const mappedParams = mapping
              ? variant.params.map((param) => substituteTypeParams(param, mapping))
              : variant.params;
            if (matchValueName && mappedParams.length === 1) {
              armScope.narrow(matchValueName, mappedParams[0]);
            }
            if (pattern.bindings.length > 0) {
              if (mappedParams.length === 0) {
                diagnostics.push(diagAt(`Variant '${variantName}' has no payload`, arm.location ?? stmt.location));
              } else if (pattern.bindings.length !== mappedParams.length) {
                diagnostics.push(diagAt(`Variant '${variantName}' expects ${mappedParams.length} bindings`, arm.location ?? stmt.location));
              }
              pattern.bindings.forEach((binding, idx) => {
                if (binding === '_') return;
                const paramType = mappedParams[idx];
                if (!paramType) return;
                armScope.define(binding, arm.location ?? stmt.location);
                armSymbols.define({
                  name: binding,
                  kind: 'variable',
                  type: paramType,
                  location: arm.location ?? stmt.location,
                  mutable: matchMutability,
                });
                if (armDi) {
                  armDi.define(armScope, binding, true);
                }
              });
            }
          }
        } else if (pattern.type === 'BindingPattern') {
          hasWildcard = true;
          armScope.define(pattern.name, arm.location ?? stmt.location);
          armSymbols.define({
            name: pattern.name,
            kind: 'variable',
            type: matchType ?? 'any',
            location: arm.location ?? stmt.location,
            mutable: matchMutability,
          });
          if (armDi) armDi.define(armScope, pattern.name, true);
        } else {
          const genericBindingTypes = collectPatternBindingTypes(pattern, matchType ?? 'any', symbols);
          for (const [binding, bindingType] of genericBindingTypes.entries()) {
            armScope.define(binding, arm.location ?? stmt.location);
            armSymbols.define({
              name: binding,
              kind: 'variable',
              type: bindingType,
              location: arm.location ?? stmt.location,
              mutable: matchMutability,
            });
            if (armDi) armDi.define(armScope, binding, true);
          }
        }
        if (arm.guard) {
          const guardType = typeCheckExpr(
            arm.guard,
            armSymbols,
            diagnostics,
            armScope,
            options,
            undefined,
            resolving,
            pendingDeps,
            currentFunction,
            armDi
          );
          if (guardType && normalizeTypeForComparison(guardType) !== 'bool' && normalizeTypeForComparison(guardType) !== 'any') {
            diagnostics.push(diagAt(`Match guard must be 'bool'`, arm.guard.location ?? arm.location ?? stmt.location));
          }
        }
        typeCheckStatement(arm.body, armSymbols, diagnostics, currentReturnType, armScope, options, returnCollector, resolving, pendingDeps, currentFunction, armDi);
        collectUnusedBindings(armScope, diagnostics, arm.location ?? stmt.location);
        if (armDi) branchStates.push(armDi);
        branchMoves.push(snapshotMoves(scope));
      }
      if (di && branchStates.length > 0) {
        di.mergeFromBranches(branchStates);
      }
      if (branchMoves.length > 0) {
        mergeMoves(scope, branchMoves);
      }
      if (hasEnumPattern && matchType && (!enumSym || !enumSym.enumVariants)) {
        diagnostics.push(diagAt(`Match expression must be an enum`, stmt.location));
      } else if (hasEnumPattern && !hasWildcard && enumSym?.enumVariants) {
        const missing = enumSym.enumVariants.map((v) => v.name).filter((name) => !seen.has(name));
      if (missing.length > 0) {
        const related: DiagnosticRelatedInformation[] = [
          {
            location: stmt.location ?? defaultLocation,
            message: `Covered variants: ${Array.from(seen).join(', ') || 'none'}`,
          },
          {
            location: stmt.location ?? defaultLocation,
            message: `Missing variants: ${missing.join(', ')}`,
          },
        ];
        diagnostics.push(
          diagAt(
            `Missing case${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
            stmt.location,
            'error',
            'MATCH_NOT_EXHAUSTIVE',
            related
          )
        );
      }
      }
      return;
    }
    case 'MacroRulesDecl':
    case 'Import':
      return;
    }
  } finally {
    scope?.clearBorrows();
  }
}

function typeCheckExpr(
  expr: LuminaExpr,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  scope?: Scope,
  options?: AnalyzeOptions,
  expectedType?: LuminaType,
  resolving?: Set<string>,
  pendingDeps?: Map<string, Set<string>>,
  currentFunction?: string,
  di?: DefiniteAssignment,
  pipedArgType?: LuminaType,
  allowPartialMoveBase?: boolean,
  skipMoveChecks?: boolean
): LuminaType | null {
  const reportCallArgMismatch = (
    fnName: string,
    index: number,
    expected: LuminaType,
    actual: LuminaType,
    location?: Location,
    paramName?: string | null
  ) => {
    const nameSuffix = paramName ? ` ('${paramName}')` : '';
    const expectedText = formatTypeForDiagnostic(expected);
    const actualText = formatTypeForDiagnostic(actual);
    diagnostics.push(
      diagAt(
        `Argument ${index + 1}${nameSuffix} of '${fnName}' expects '${expectedText}', but found '${actualText}'`,
        location,
        'error',
        'LUM-001'
      )
    );
  };

  const unresolvedMember = (
    message: string,
    location?: Location,
    code: string = 'UNRESOLVED_MEMBER'
  ): LuminaType => {
    diagnostics.push(diagAt(message, location, 'error', code));
    if (options?.stopOnUnresolvedMemberError) {
      throw new StopOnUnresolvedMemberError(message);
    }
    return ERROR_TYPE;
  };

  const inferNumberType = (expr: { suffix?: string | null; raw?: string; isFloat?: boolean }): LuminaType => {
    const suffix = expr.suffix ?? null;
    if (suffix) return suffix;
    const raw = expr.raw ?? '';
    const isFloat = expr.isFloat || raw.includes('.') || raw.includes('e') || raw.includes('E');
    return isFloat ? 'f64' : 'i32';
  };

  const collectLambdaCaptureCandidates = (lambda: LuminaLambda): string[] => {
    const used = new Set<string>();
    const declared = new Set<string>(lambda.params.map((param) => param.name));

    const visitExprNode = (node: LuminaExpr) => {
      switch (node.type) {
        case 'Identifier':
          used.add(node.name);
          return;
        case 'Member':
          visitExprNode(node.object);
          return;
        case 'Call':
          if (!node.receiver && !node.enumName) {
            used.add(node.callee.name);
          }
          if (node.receiver) visitExprNode(node.receiver);
          for (const arg of node.args) visitExprNode(arg);
          return;
        case 'Binary':
          visitExprNode(node.left);
          visitExprNode(node.right);
          return;
        case 'Move':
          if (node.target.type === 'Identifier') {
            used.add(node.target.name);
          } else {
            visitExprNode(node.target.object);
          }
          return;
        case 'Await':
        case 'Try':
          visitExprNode(node.value);
          return;
        case 'Cast':
          visitExprNode(node.expr);
          return;
        case 'StructLiteral':
          for (const field of node.fields) visitExprNode(field.value);
          return;
        case 'ArrayLiteral':
          for (const element of node.elements) visitExprNode(element);
          return;
        case 'ArrayRepeatLiteral':
          visitExprNode(node.value);
          visitExprNode(node.count);
          return;
        case 'MacroInvoke':
          for (const arg of node.args) visitExprNode(arg);
          return;
        case 'TupleLiteral':
          for (const element of node.elements) visitExprNode(element);
          return;
        case 'Index':
          visitExprNode(node.object);
          visitExprNode(node.index);
          return;
        case 'IsExpr':
          visitExprNode(node.value);
          return;
        case 'MatchExpr':
          visitExprNode(node.value);
          for (const arm of node.arms) {
            visitExprNode(arm.body);
          }
          return;
        case 'SelectExpr':
          for (const arm of node.arms ?? []) {
            if (arm?.value) visitExprNode(arm.value);
            if (arm?.body) visitExprNode(arm.body);
          }
          return;
        case 'InterpolatedString':
          for (const part of node.parts) {
            if (typeof part !== 'string') visitExprNode(part);
          }
          return;
        case 'Lambda':
        case 'Number':
        case 'String':
        case 'Boolean':
          return;
        case 'Range':
          if (node.start) visitExprNode(node.start);
          if (node.end) visitExprNode(node.end);
          return;
      }
    };

    const visitStmtNode = (stmt: LuminaStatement) => {
      switch (stmt.type) {
        case 'Let':
          visitExprNode(stmt.value);
          declared.add(stmt.name);
          return;
        case 'LetTuple':
          visitExprNode(stmt.value);
          for (const name of stmt.names) {
            declared.add(name);
          }
          return;
        case 'LetElse':
          visitExprNode(stmt.value);
          visitStmtNode(stmt.elseBlock);
          return;
        case 'Return':
          visitExprNode(stmt.value);
          return;
        case 'ExprStmt':
          visitExprNode(stmt.expr);
          return;
        case 'Assign':
          if (stmt.target.type === 'Identifier') {
            used.add(stmt.target.name);
          } else {
            visitExprNode(stmt.target.object);
          }
          visitExprNode(stmt.value);
          return;
        case 'If':
          visitExprNode(stmt.condition);
          visitStmtNode(stmt.thenBlock);
          if (stmt.elseBlock) visitStmtNode(stmt.elseBlock);
          return;
        case 'IfLet':
          visitExprNode(stmt.value);
          visitStmtNode(stmt.thenBlock);
          if (stmt.elseBlock) visitStmtNode(stmt.elseBlock);
          return;
        case 'While':
          visitExprNode(stmt.condition);
          visitStmtNode(stmt.body);
          return;
        case 'For':
          visitExprNode(stmt.iterable);
          declared.add(stmt.iterator);
          visitStmtNode(stmt.body);
          return;
        case 'WhileLet':
          visitExprNode(stmt.value);
          if (stmt.pattern.type === 'EnumPattern') {
            for (const binding of stmt.pattern.bindings) {
              declared.add(binding);
            }
          }
          visitStmtNode(stmt.body);
          return;
        case 'MatchStmt':
          visitExprNode(stmt.value);
          for (const arm of stmt.arms) {
            for (const binding of collectPatternBindingNames(arm.pattern)) {
              if (binding === '_') continue;
              declared.add(binding);
            }
            visitStmtNode(arm.body);
          }
          return;
        case 'Block':
          for (const inner of stmt.body) visitStmtNode(inner);
          return;
        case 'ErrorNode':
        case 'Import':
        case 'TraitDecl':
        case 'ImplDecl':
        case 'TypeDecl':
        case 'StructDecl':
        case 'EnumDecl':
        case 'FnDecl':
          return;
      }
    };

    for (const stmt of lambda.body.body) {
      visitStmtNode(stmt);
    }

    return Array.from(used).filter((name) => !declared.has(name));
  };

  const validateThreadSpawnCall = (args: LuminaExpr[], argTypes: Array<LuminaType | null>) => {
    if (args.length !== 1) return;
    const firstArg = args[0];
    if (firstArg.type !== 'Lambda') return;
    const lambda = firstArg as LuminaLambda;
    const captures = Array.from(
      new Set((lambda.captures && lambda.captures.length > 0 ? lambda.captures : collectLambdaCaptureCandidates(lambda)) ?? [])
    );
    const variableCaptures = captures.filter((name) => {
      if (scope && findDefScope(scope, name)) return true;
      const sym = symbols.get(name) ?? options?.externSymbols?.(name);
      return sym?.kind === 'variable';
    });
    if (variableCaptures.length === 0) return;

    if (lambda.capture !== 'move') {
      diagnostics.push(
        diagAt(
          `thread.spawn requires a 'move' closure when capturing variables (${variableCaptures.join(', ')})`,
          lambda.location ?? firstArg.location ?? defaultLocation,
          'error',
          'THREAD_CAPTURE_REQUIRES_MOVE'
        )
      );
      return;
    }

    for (const name of variableCaptures) {
      const sym = symbols.get(name) ?? options?.externSymbols?.(name);
      const captureType =
        typeCheckExpr(
          { type: 'Identifier', name, location: lambda.location } as LuminaExpr,
          symbols,
          [],
          scope,
          options,
          undefined,
          resolving,
          pendingDeps,
          currentFunction,
          di,
          undefined,
          false,
          true
        ) ??
        sym?.type ??
        argTypes[0] ??
        'any';
      if (!isImplicitlySendType(captureType, symbols)) {
        diagnostics.push(
          diagAt(
            `Captured variable '${name}' has non-Send type '${formatTypeForDiagnostic(captureType)}'`,
            lambda.location ?? firstArg.location ?? defaultLocation,
            'error',
            'THREAD_CAPTURE_NOT_SEND'
          )
        );
      }
    }
  };

  const seedTypeParamsFromExpected = (
    enumName: string,
    mapping: Map<string, LuminaType>,
    typeParamDefs: Array<{ name: string; bound?: LuminaType[] }>
  ) => {
    if (!expectedType) return;
    const parsed = parseTypeName(expectedType);
    if (!parsed || parsed.base !== enumName) return;
    if (parsed.args.length !== typeParamDefs.length) return;
    typeParamDefs.forEach((tp, idx) => {
      if (!mapping.has(tp.name)) {
        mapping.set(tp.name, parsed.args[idx]);
      }
    });
  };

  const resolveModuleFunction = (
    binding: ModuleExport | undefined,
    member?: string
  ): ModuleFunction | null => {
    if (!binding) return null;
    if (binding.kind === 'function') {
      return member ? null : binding;
    }
    if (binding.kind === 'module') {
      if (!member) return null;
      const exp = binding.exports.get(member);
      return exp && exp.kind === 'function' ? exp : null;
    }
    return null;
  };

  const resolveTraitMethodCall = (
    receiverType: LuminaType,
    args: LuminaExpr[],
    callLocation: Location | undefined,
    callId: number | null | undefined,
    callee: string
  ): LuminaType | null => {
    const registry = options?.traitRegistry;
    if (!registry) {
      diagnostics.push(
        diagAt(
          `Type '${formatTypeForDiagnostic(receiverType)}' has no method '${callee}'`,
          callLocation,
          'error',
          'MEMBER-NOT-FOUND'
        )
      );
      return null;
    }
    const receiverParsed = parseTypeName(receiverType);
    const isTypeParamReference =
      receiverParsed &&
      receiverParsed.args.length === 0 &&
      ((options?.typeParams && options.typeParams.has(receiverParsed.base)) ||
        (options?.typeParamBounds && options.typeParamBounds.has(receiverParsed.base)));
    if (isTypeParamReference) {
      const bounds = options?.typeParamBounds?.get(receiverParsed.base) ?? [];
      const boundCandidates: Array<{
        trait: TraitInfo;
        method: TraitMethodSig;
        mapping: Map<string, LuminaType>;
        expectedParams: LuminaType[];
        expectedReturn: LuminaType;
      }> = [];

      for (const bound of bounds) {
        const boundNorm = normalizeTypeForComparison(bound);
        const parsedBound = parseTypeName(boundNorm);
        if (!parsedBound) continue;
        const trait = registry.traits.get(parsedBound.base);
        if (!trait) continue;
        const method = trait.methods.get(callee);
        if (!method) continue;
        const mapping = buildTraitTypeMapping(trait, parsedBound.args);
        mapping.set(SELF_TYPE_NAME, receiverType);
        for (const assocName of trait.associatedTypes.keys()) {
          mapping.set(`${SELF_TYPE_NAME}::${assocName}`, `${receiverType}::${assocName}`);
        }
        const expectedParams = method.params.map((param) => substituteTypeParams(param, mapping));
        const expectedReturn = substituteTypeParams(method.returnType, mapping);
        boundCandidates.push({ trait, method, mapping, expectedParams, expectedReturn });
      }

      if (boundCandidates.length === 0) {
        diagnostics.push(
          diagAt(
            `Type '${formatTypeForDiagnostic(receiverType)}' has no method '${callee}'`,
            callLocation,
            'error',
            'MEMBER-NOT-FOUND'
          )
        );
        return null;
      }
      if (boundCandidates.length > 1) {
        diagnostics.push(
          diagAt(
            `Ambiguous trait method '${callee}' for '${formatTypeForDiagnostic(receiverType)}'`,
            callLocation,
            'error',
            'TRAIT-009'
          )
        );
        return null;
      }
      const candidate = boundCandidates[0];
      const actualArgs: LuminaType[] = [];
      for (const arg of args) {
        const argType = typeCheckExpr(
          arg,
          symbols,
          diagnostics,
          scope,
          options,
          undefined,
          resolving,
          pendingDeps,
          currentFunction,
          di
        );
        if (argType) actualArgs.push(argType);
      }

      if (candidate.expectedParams.length !== actualArgs.length + 1) {
        diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, callLocation, 'error', 'TRAIT-006'));
      } else {
        const expectedSelf = candidate.expectedParams[0];
        if (!isTypeAssignable(receiverType, expectedSelf, symbols, options?.typeParams)) {
          diagnostics.push(
            diagAt(
              `Method '${callee}' expects '${formatTypeForDiagnostic(expectedSelf)}' receiver but got '${formatTypeForDiagnostic(receiverType)}'`,
              callLocation,
              'error',
              'TRAIT-006'
            )
          );
        }
        for (let i = 0; i < actualArgs.length; i += 1) {
          const expected = candidate.expectedParams[i + 1];
          const actual = actualArgs[i];
          if (!isTypeAssignable(actual, expected, symbols, options?.typeParams)) {
            reportCallArgMismatch(callee, i, expected, actual, args[i]?.location ?? callLocation, null);
          }
        }
      }
      return candidate.expectedReturn;
    }

    const candidates = findTraitMethodCandidates(registry, receiverType, callee);
    if (candidates.length === 0) {
      diagnostics.push(
        diagAt(
          `Type '${formatTypeForDiagnostic(receiverType)}' has no method '${callee}'`,
          callLocation,
          'error',
          'MEMBER-NOT-FOUND'
        )
      );
      return null;
    }
    if (candidates.length > 1) {
      diagnostics.push(
        diagAt(
          `Ambiguous trait method '${callee}' for '${formatTypeForDiagnostic(receiverType)}'`,
          callLocation,
          'error',
          'TRAIT-009'
        )
      );
      return null;
    }
    const candidate = candidates[0];
    const expectedParams = candidate.method.params.map((param) => substituteTypeParams(param, candidate.mapping));
    const expectedReturn = substituteTypeParams(candidate.method.returnType, candidate.mapping);

    const actualArgs: LuminaType[] = [];
    for (const arg of args) {
      const argType = typeCheckExpr(
        arg,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (argType) actualArgs.push(argType);
    }

    if (expectedParams.length !== actualArgs.length + 1) {
      diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, callLocation, 'error', 'TRAIT-006'));
    } else {
      const expectedSelf = expectedParams[0];
      if (!isTypeAssignable(receiverType, expectedSelf, symbols, options?.typeParams)) {
        diagnostics.push(
          diagAt(
            `Method '${callee}' expects '${formatTypeForDiagnostic(expectedSelf)}' receiver but got '${formatTypeForDiagnostic(receiverType)}'`,
            callLocation,
            'error',
            'TRAIT-006'
          )
        );
      }
      for (let i = 0; i < actualArgs.length; i += 1) {
        const expected = expectedParams[i + 1];
        const actual = actualArgs[i];
        if (!isTypeAssignable(actual, expected, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, i, expected, actual, args[i]?.location ?? callLocation, null);
        }
      }
    }

    if (callId != null && options?.traitMethodResolutions) {
      const mangledName = mangleTraitMethodName(candidate.impl.traitType, candidate.impl.forType, callee);
      options.traitMethodResolutions.set(callId, {
        traitName: candidate.impl.traitName,
        traitType: candidate.impl.traitType,
        forType: candidate.impl.forType,
        methodName: callee,
        mangledName,
      });
    }
    return expectedReturn;
  };

  const canResolveTraitMethodCall = (receiverType: LuminaType, callee: string): boolean => {
    const registry = options?.traitRegistry;
    if (!registry) return false;
    const receiverParsed = parseTypeName(receiverType);
    const isTypeParamReference =
      receiverParsed &&
      receiverParsed.args.length === 0 &&
      ((options?.typeParams && options.typeParams.has(receiverParsed.base)) ||
        (options?.typeParamBounds && options.typeParamBounds.has(receiverParsed.base)));
    if (isTypeParamReference) {
      const bounds = options?.typeParamBounds?.get(receiverParsed.base) ?? [];
      for (const bound of bounds) {
        const parsedBound = parseTypeName(normalizeTypeForComparison(bound));
        if (!parsedBound) continue;
        const trait = registry.traits.get(parsedBound.base);
        if (trait?.methods.has(callee)) return true;
      }
      return false;
    }
    return findTraitMethodCandidates(registry, receiverType, callee).length > 0;
  };

  const resolveBuiltinMethodCall = (
    receiverType: LuminaType,
    args: LuminaExpr[],
    callLocation: Location | undefined,
    callee: string
  ): LuminaType | null => {
    const parsed = parseTypeName(receiverType);
    if (!parsed) return null;

    const actualArgs: LuminaType[] = [];
    for (const arg of args) {
      const argType = typeCheckExpr(
        arg,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (argType) actualArgs.push(argType);
    }

    const ensureArity = (expected: number): boolean => {
      if (actualArgs.length === expected) return true;
      diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, callLocation, 'error', 'LUM-002'));
      return false;
    };

    const receiverStruct = symbols.get(parsed.base);
    const derivedTraits = new Set(receiverStruct?.derivedTraits ?? []);
    if (derivedTraits.has('Clone') && callee === 'clone') {
      ensureArity(0);
      return receiverType;
    }
    if (derivedTraits.has('Debug') && callee === 'debug') {
      ensureArity(0);
      return 'string';
    }
    if (derivedTraits.has('Eq') && callee === 'eq') {
      if (!ensureArity(1)) return 'bool';
      if (!isTypeAssignable(actualArgs[0], receiverType, symbols, options?.typeParams)) {
        reportCallArgMismatch(callee, 0, receiverType, actualArgs[0], args[0]?.location ?? callLocation, null);
      }
      return 'bool';
    }

    if (isIntTypeName(parsed.base) || isFloatTypeName(parsed.base)) {
      if (callee === 'millis' || callee === 'milliseconds') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'seconds') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'minutes') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'hours') {
        ensureArity(0);
        return 'i32';
      }
    }

    if (parsed.base === 'Vec') {
      const elemType = parsed.args[0] ?? 'any';
      if (callee === 'push') {
        if (!ensureArity(1)) return 'void';
        if (!isTypeAssignable(actualArgs[0], elemType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, elemType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'void';
      }
      if (callee === 'get') {
        if (!ensureArity(1)) return `Option<${elemType}>`;
        if (!isIntTypeName(normalizeTypeForComparison(actualArgs[0]))) {
          reportCallArgMismatch(callee, 0, 'i32', actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return `Option<${elemType}>`;
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'pop') {
        ensureArity(0);
        return `Option<${elemType}>`;
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'map') {
        ensureArity(1);
        return 'Vec<any>';
      }
      if (callee === 'filter') {
        ensureArity(1);
        return `Vec<${elemType}>`;
      }
      if (callee === 'fold') {
        if (!ensureArity(2)) return 'any';
        return actualArgs[0] ?? 'any';
      }
      if (callee === 'for_each') {
        ensureArity(1);
        return 'void';
      }
      if (callee === 'any' || callee === 'all') {
        ensureArity(1);
        return 'bool';
      }
      if (callee === 'find') {
        ensureArity(1);
        return `Option<${elemType}>`;
      }
      if (callee === 'position') {
        ensureArity(1);
        return 'Option<i32>';
      }
      if (callee === 'take' || callee === 'skip') {
        if (!ensureArity(1)) return `Vec<${elemType}>`;
        if (!isIntTypeName(normalizeTypeForComparison(actualArgs[0]))) {
          reportCallArgMismatch(callee, 0, 'i32', actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return `Vec<${elemType}>`;
      }
      if (callee === 'zip') {
        if (!ensureArity(1)) return `Vec<Tuple<${elemType},any>>`;
        const otherParsed = parseTypeName(actualArgs[0]);
        if (otherParsed?.base !== 'Vec') {
          reportCallArgMismatch(callee, 0, 'Vec<any>', actualArgs[0], args[0]?.location ?? callLocation, null);
          return `Vec<Tuple<${elemType},any>>`;
        }
        const otherElem = otherParsed.args[0] ?? 'any';
        return `Vec<Tuple<${elemType},${otherElem}>>`;
      }
      if (callee === 'enumerate') {
        ensureArity(0);
        return `Vec<Tuple<i32,${elemType}>>`;
      }
      return null;
    }

    if (parsed.base === 'HashMap' && parsed.args.length >= 2) {
      const keyType = parsed.args[0] ?? 'any';
      const valueType = parsed.args[1] ?? 'any';
      if (callee === 'insert') {
        if (!ensureArity(2)) return `Option<${valueType}>`;
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        if (!isTypeAssignable(actualArgs[1], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 1, valueType, actualArgs[1], args[1]?.location ?? callLocation, null);
        }
        return `Option<${valueType}>`;
      }
      if (callee === 'get' || callee === 'remove') {
        if (!ensureArity(1)) return `Option<${valueType}>`;
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return `Option<${valueType}>`;
      }
      if (callee === 'contains_key') {
        if (!ensureArity(1)) return 'bool';
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'bool';
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'keys') {
        ensureArity(0);
        return `Vec<${keyType}>`;
      }
      if (callee === 'values') {
        ensureArity(0);
        return `Vec<${valueType}>`;
      }
      return null;
    }

    if (parsed.base === 'HashSet' && parsed.args.length >= 1) {
      const elemType = parsed.args[0] ?? 'any';
      if (callee === 'insert' || callee === 'contains' || callee === 'remove') {
        if (!ensureArity(1)) return 'bool';
        if (!isTypeAssignable(actualArgs[0], elemType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, elemType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'bool';
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'values') {
        ensureArity(0);
        return `Vec<${elemType}>`;
      }
      return null;
    }

    if (parsed.base === 'Deque' && parsed.args.length >= 1) {
      const elemType = parsed.args[0] ?? 'any';
      if (callee === 'push_front' || callee === 'push_back') {
        if (!ensureArity(1)) return 'void';
        if (!isTypeAssignable(actualArgs[0], elemType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, elemType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'void';
      }
      if (callee === 'pop_front' || callee === 'pop_back') {
        ensureArity(0);
        return `Option<${elemType}>`;
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      return null;
    }

    if (parsed.base === 'BTreeMap' && parsed.args.length >= 2) {
      const keyType = parsed.args[0] ?? 'any';
      const valueType = parsed.args[1] ?? 'any';
      if (callee === 'insert') {
        if (!ensureArity(2)) return `Option<${valueType}>`;
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        if (!isTypeAssignable(actualArgs[1], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 1, valueType, actualArgs[1], args[1]?.location ?? callLocation, null);
        }
        return `Option<${valueType}>`;
      }
      if (callee === 'get' || callee === 'remove') {
        if (!ensureArity(1)) return `Option<${valueType}>`;
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return `Option<${valueType}>`;
      }
      if (callee === 'contains_key') {
        if (!ensureArity(1)) return 'bool';
        if (!isTypeAssignable(actualArgs[0], keyType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, keyType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'bool';
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'keys') {
        ensureArity(0);
        return `Vec<${keyType}>`;
      }
      if (callee === 'values') {
        ensureArity(0);
        return `Vec<${valueType}>`;
      }
      if (callee === 'entries') {
        ensureArity(0);
        return `Vec<Tuple<${keyType},${valueType}>>`;
      }
      return null;
    }

    if (parsed.base === 'BTreeSet' && parsed.args.length >= 1) {
      const elemType = parsed.args[0] ?? 'any';
      if (callee === 'insert' || callee === 'contains' || callee === 'remove') {
        if (!ensureArity(1)) return 'bool';
        if (!isTypeAssignable(actualArgs[0], elemType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, elemType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'bool';
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'values') {
        ensureArity(0);
        return `Vec<${elemType}>`;
      }
      return null;
    }

    if (parsed.base === 'PriorityQueue' && parsed.args.length >= 1) {
      const elemType = parsed.args[0] ?? 'any';
      if (callee === 'push') {
        if (!ensureArity(1)) return 'void';
        if (!isTypeAssignable(actualArgs[0], elemType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, elemType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'void';
      }
      if (callee === 'pop' || callee === 'peek') {
        ensureArity(0);
        return `Option<${elemType}>`;
      }
      if (callee === 'len') {
        ensureArity(0);
        return 'i32';
      }
      if (callee === 'clear') {
        ensureArity(0);
        return 'void';
      }
      return null;
    }

    if (parsed.base === 'ThreadHandle' && parsed.args.length >= 1) {
      const valueType = parsed.args[0] ?? 'any';
      if (callee === 'join') {
        ensureArity(0);
        return `Promise<Result<${valueType},string>>`;
      }
      return null;
    }

    if (parsed.base === 'Thread') {
      if (callee === 'post') {
        ensureArity(1);
        return 'bool';
      }
      if (callee === 'recv') {
        ensureArity(0);
        return 'Promise<Option<any>>';
      }
      if (callee === 'try_recv') {
        ensureArity(0);
        return 'Option<any>';
      }
      if (callee === 'terminate') {
        ensureArity(0);
        return 'Promise<void>';
      }
      if (callee === 'join' || callee === 'join_worker') {
        ensureArity(0);
        return 'Promise<int>';
      }
      return null;
    }

    if (parsed.base === 'Sender' && parsed.args.length >= 1) {
      const valueType = parsed.args[0] ?? 'any';
      if (callee === 'send') {
        if (!ensureArity(1)) return 'Promise<bool>';
        if (!isTypeAssignable(actualArgs[0], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, valueType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'Promise<bool>';
      }
      if (callee === 'try_send') {
        if (!ensureArity(1)) return 'bool';
        if (!isTypeAssignable(actualArgs[0], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, valueType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'bool';
      }
      if (callee === 'send_result') {
        if (!ensureArity(1)) return 'Result<void,string>';
        if (!isTypeAssignable(actualArgs[0], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, valueType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'Result<void,string>';
      }
      if (callee === 'send_async_result') {
        if (!ensureArity(1)) return 'Promise<Result<void,string>>';
        if (!isTypeAssignable(actualArgs[0], valueType, symbols, options?.typeParams)) {
          reportCallArgMismatch(callee, 0, valueType, actualArgs[0], args[0]?.location ?? callLocation, null);
        }
        return 'Promise<Result<void,string>>';
      }
      if (callee === 'clone') {
        ensureArity(0);
        return `Sender<${valueType}>`;
      }
      if (callee === 'is_closed') {
        ensureArity(0);
        return 'bool';
      }
      if (callee === 'drop') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'close') {
        ensureArity(0);
        return 'void';
      }
      return null;
    }

    if (parsed.base === 'Receiver' && parsed.args.length >= 1) {
      const valueType = parsed.args[0] ?? 'any';
      if (callee === 'recv') {
        ensureArity(0);
        return `Promise<Option<${valueType}>>`;
      }
      if (callee === 'try_recv') {
        ensureArity(0);
        return `Option<${valueType}>`;
      }
      if (callee === 'recv_result') {
        ensureArity(0);
        return `Promise<Result<Option<${valueType}>,string>>`;
      }
      if (callee === 'try_recv_result') {
        ensureArity(0);
        return `Result<Option<${valueType}>,string>`;
      }
      if (callee === 'is_closed') {
        ensureArity(0);
        return 'bool';
      }
      if (callee === 'drop') {
        ensureArity(0);
        return 'void';
      }
      if (callee === 'close') {
        ensureArity(0);
        return 'void';
      }
      return null;
    }

    return null;
  };
  if (expr.type === 'Number') return inferNumberType(expr);
  if (expr.type === 'Boolean') return 'bool';
  if (expr.type === 'ArrayLiteral') {
    const expectedParsed = expectedType ? parseTypeName(expectedType) : null;
    const expectsFixedArray = expectedParsed?.base === 'Array' && expectedParsed.args.length >= 2;
    const expectedElementType = expectsFixedArray ? expectedParsed.args[0] : null;
    const expectedSizeExpr = expectsFixedArray ? expectedParsed.args[1] : null;

    if (expr.elements.length === 0) {
      if (expectsFixedArray && expectedElementType && expectedSizeExpr) {
        const expectedSize = evaluateConstExprText(expectedSizeExpr, new Map());
        if (expectedSize !== null && expectedSize !== 0) {
          diagnostics.push(
            diagAt(
              `Array literal has wrong size. Expected ${expectedSize} elements, got 0`,
              expr.location,
              'error',
              'ARRAY-SIZE-MISMATCH'
            )
          );
        }
        return `Array<${expectedElementType},0>`;
      }
      if (expectedParsed && expectedParsed.base === 'Vec' && expectedParsed.args.length === 1) {
        return expectedType as LuminaType;
      }
      return 'Vec<any>';
    }
    const elementTypes: LuminaType[] = [];
    for (const element of expr.elements) {
      const elementType = typeCheckExpr(
        element,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );
      if (elementType) elementTypes.push(elementType);
    }
    if (elementTypes.length === 0) return expectsFixedArray && expectedElementType ? `Array<${expectedElementType},0>` : 'Vec<any>';
    let unified = elementTypes[0];
    for (let i = 1; i < elementTypes.length; i += 1) {
      const current = elementTypes[i];
      if (isErrorTypeName(current) || isErrorTypeName(unified)) {
        unified = ERROR_TYPE;
        continue;
      }
      if (normalizeTypeForComparison(unified) === 'any') {
        unified = current;
        continue;
      }
      if (normalizeTypeForComparison(current) === 'any') {
        continue;
      }
      if (
        !isTypeAssignable(current, unified, symbols, options?.typeParams) &&
        !isTypeAssignable(unified, current, symbols, options?.typeParams)
      ) {
        if (expectsFixedArray) {
          diagnostics.push(
            diagAt(`Array element type mismatch`, expr.elements[i]?.location ?? expr.location, 'error', 'ARRAY-ELEM-TYPE')
          );
        } else {
          diagnostics.push(
            diagAt(
              `Array elements must have compatible types. Expected '${formatTypeForDiagnostic(unified)}', found '${formatTypeForDiagnostic(current)}'`,
              expr.elements[i]?.location ?? expr.location,
              'error',
              'ARRAY-TYPE-MISMATCH'
            )
          );
        }
        unified = 'any';
      }
    }
    const finalElement = isErrorTypeName(unified) ? 'any' : unified;
    if (expectsFixedArray && expectedElementType && expectedSizeExpr) {
      const expectedSize = evaluateConstExprText(expectedSizeExpr, new Map());
      const actualSize = expr.elements.length;
      if (expectedSize !== null && expectedSize !== actualSize) {
        diagnostics.push(
          diagAt(
            `Array literal has wrong size. Expected ${expectedSize} elements, got ${actualSize}`,
            expr.location,
            'error',
            'ARRAY-SIZE-MISMATCH'
          )
        );
      }
      const parsedExpectedElem = parseTypeName(expectedElementType);
      const expectedElemIsUnresolvedTypeParam =
        !!parsedExpectedElem &&
        parsedExpectedElem.args.length === 0 &&
        isValidTypeParam(parsedExpectedElem.base) &&
        !symbols.has(parsedExpectedElem.base) &&
        !(options?.typeParams?.has(parsedExpectedElem.base) ?? false);
      if (
        !expectedElemIsUnresolvedTypeParam &&
        !isTypeAssignable(finalElement, expectedElementType, symbols, options?.typeParams)
      ) {
        diagnostics.push(diagAt(`Array element type mismatch`, expr.location, 'error', 'ARRAY-ELEM-TYPE'));
      }
      return `Array<${expectedElementType},${actualSize}>`;
    }
    return `Vec<${finalElement}>`;
  }
  if (expr.type === 'ArrayRepeatLiteral') {
    const valueType =
      typeCheckExpr(
        expr.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      ) ?? 'any';
    const countType =
      typeCheckExpr(
        expr.count,
        symbols,
        diagnostics,
        scope,
        options,
        'i32',
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      ) ?? 'any';
    if (!isIntTypeName(normalizeTypeForComparison(countType))) {
      diagnostics.push(
        diagAt(
          `Array repeat count must be integer, found '${formatTypeForDiagnostic(countType)}'`,
          expr.count.location ?? expr.location
        )
      );
    }
    return `Vec<${valueType}>`;
  }
  if (expr.type === 'TupleLiteral') {
    const elementTypes: LuminaType[] = [];
    for (const element of expr.elements) {
      const elementType = typeCheckExpr(
        element,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );
      elementTypes.push(elementType ?? 'any');
    }
    return `Tuple<${elementTypes.join(',')}>`;
  }
  if (expr.type === 'String') return 'string';
  if (expr.type === 'Lambda') {
    const local = new SymbolTable();
    for (const sym of symbols.list()) {
      local.define(sym);
    }
    const lambdaScope = new Scope(scope);
    const lambdaDi = di ? di.clone() : undefined;
    const typeParams = new Map<string, LuminaType | undefined>(options?.typeParams ?? []);
    const typeParamBounds = new Map<string, LuminaType[]>(options?.typeParamBounds ?? []);
    for (const param of expr.typeParams ?? []) {
      const bound = param.bound?.[0];
      typeParams.set(param.name, bound ? (resolveTypeExpr(bound) ?? 'any') : undefined);
      const bounds: LuminaType[] = [];
      for (const boundType of param.bound ?? []) {
        const resolved = resolveTypeExpr(boundType);
        if (resolved) bounds.push(resolved);
      }
      if (bounds.length > 0) {
        typeParamBounds.set(param.name, bounds);
      }
    }

    for (const param of expr.params) {
      const paramType = resolveTypeExpr(param.typeName) ?? 'any';
      if (param.typeName) {
        ensureKnownType(param.typeName, symbols, new Set(typeParams.keys()), diagnostics, param.location ?? expr.location);
      }
      local.define({
        name: param.name,
        kind: 'variable',
        type: paramType,
        location: param.location ?? expr.location,
        ref: !!param.ref,
        refMutable: !!param.refMut,
        mutable: false,
      });
      lambdaScope.define(param.name, param.location ?? expr.location);
      lambdaDi?.define(lambdaScope, param.name, true);
    }

    const lambdaReturn = resolveTypeExpr(expr.returnType) ?? 'any';
    const bodyOptions: AnalyzeOptions | undefined = options
      ? { ...options, typeParams, typeParamBounds }
      : { typeParams, typeParamBounds };
    for (const bodyStmt of expr.body.body) {
      typeCheckStatement(
        bodyStmt,
        local,
        diagnostics,
        lambdaReturn,
        lambdaScope,
        bodyOptions,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        lambdaDi
      );
    }

    const captured = Array.from(lambdaScope.reads).filter((name) => {
      if (lambdaScope.locals.has(name)) return false;
      const sym = symbols.get(name) ?? options?.externSymbols?.(name);
      return sym?.kind === 'variable';
    });
    expr.captures = Array.from(new Set(captured));

    if (expr.capture === 'move') {
      for (const name of expr.captures) {
        if (scope?.isBorrowed(name)) {
          diagnostics.push(
            diagAt(
              `Cannot capture '${name}' by move while it is borrowed`,
              expr.location,
              'error',
              'MOVE_WHILE_BORROWED'
            )
          );
          continue;
        }
        const previousMove = scope?.findMoveConflictInfo(name, 'overlap');
        if (previousMove) {
          diagnostics.push(
            diagAt(
              formatMoveConflictMessage('move', name, previousMove.path),
              expr.location,
              'error',
              'USE_AFTER_MOVE',
              [
                {
                  location: previousMove.location ?? expr.location ?? defaultLocation,
                  message: `Moved here`,
                },
              ]
            )
          );
        }
        scope?.markMovedPath(name, expr.location);
      }
    }

    // Function types are inferred precisely by HM; semantic pass uses a conservative placeholder.
    return 'any';
  }
  if (expr.type === 'InterpolatedString') {
    for (const part of expr.parts) {
      if (typeof part === 'string') continue;
      const partType = typeCheckExpr(
        part,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );
      if (partType && normalizeTypeForComparison(partType) === 'void') {
        diagnostics.push(
          diagAt(
            `Cannot interpolate void value`,
            part.location ?? expr.location,
            'error',
            'STRING_INTERP_VOID'
          )
        );
      }
    }
    return 'string';
  }
  if (expr.type === 'SelectExpr') {
    const fnSym = currentFunction ? symbols.get(currentFunction) : undefined;
    const isAsyncFn = !!fnSym?.async;
    if (!isAsyncFn) {
      diagnostics.push(
        diagAt(
          `'select!' can only be used inside async functions`,
          expr.location,
          'error',
          'SELECT_OUTSIDE_ASYNC'
        )
      );
    }
    if (!expr.arms || expr.arms.length === 0) {
      diagnostics.push(diagAt(`select! requires at least one arm`, expr.location, 'error', 'SELECT_EMPTY'));
      return 'any';
    }

    let unifiedBodyType: LuminaType | null = null;

    for (const arm of expr.arms) {
      const armValueType = typeCheckExpr(
        arm.value,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );

      let boundType: LuminaType = 'any';
      if (armValueType) {
        const parsedArmValue = parseTypeName(armValueType);
        if (parsedArmValue && parsedArmValue.base === 'Promise' && parsedArmValue.args.length === 1) {
          boundType = parsedArmValue.args[0] ?? 'any';
        } else if (normalizeTypeForComparison(armValueType) !== 'any') {
          diagnostics.push(
            diagAt(
              `select! arm expression must be Promise<T>, found '${formatTypeForDiagnostic(armValueType)}'`,
              arm.value.location ?? arm.location ?? expr.location,
              'error',
              'SELECT_ARM_NOT_PROMISE'
            )
          );
        }
      }

      const armSymbols = cloneSymbolTable(symbols);
      const armScope = new Scope(scope);
      const armDi = di ? di.clone() : undefined;
      if (arm.binding && arm.binding !== '_') {
        armSymbols.define({
          name: arm.binding,
          kind: 'variable',
          type: boundType,
          location: arm.location ?? expr.location,
          mutable: false,
        });
        armScope.define(arm.binding, arm.location ?? expr.location);
        armDi?.define(armScope, arm.binding, true);
      }

      const bodyType = typeCheckExpr(
        arm.body,
        armSymbols,
        diagnostics,
        armScope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        armDi,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );

      if (!bodyType) continue;
      if (!unifiedBodyType) {
        unifiedBodyType = bodyType;
        continue;
      }
      const compatible =
        isTypeAssignable(bodyType, unifiedBodyType, symbols, options?.typeParams) ||
        isTypeAssignable(unifiedBodyType, bodyType, symbols, options?.typeParams);
      if (!compatible) {
        diagnostics.push(
          diagAt(
            `select! arm result type mismatch: expected '${formatTypeForDiagnostic(unifiedBodyType)}', found '${formatTypeForDiagnostic(bodyType)}'`,
            arm.body.location ?? arm.location ?? expr.location,
            'error',
            'SELECT_ARM_TYPE_MISMATCH'
          )
        );
        unifiedBodyType = 'any';
      } else if (isTypeAssignable(unifiedBodyType, bodyType, symbols, options?.typeParams)) {
        unifiedBodyType = bodyType;
      }
    }

    return unifiedBodyType ?? 'any';
  }
  if (expr.type === 'Range') {
    const checkPart = (part: LuminaExpr | null, label: string) => {
      if (!part) return;
      const partType = typeCheckExpr(
        part,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        pipedArgType,
        allowPartialMoveBase,
        skipMoveChecks
      );
      if (!partType) return;
      const normalized = normalizeTypeForComparison(partType);
      if (normalized !== 'any' && !isIntTypeName(normalized)) {
        diagnostics.push(
          diagAt(
            `Range ${label} must be an integer`,
            part.location ?? expr.location,
            'error',
            'RANGE_TYPE'
          )
        );
      }
    };
    checkPart(expr.start, 'start');
    checkPart(expr.end, 'end');
    return 'Range';
  }
  if (expr.type === 'Index') {
    const objectType = typeCheckExpr(
      expr.object,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      allowPartialMoveBase,
      skipMoveChecks
    );
    const indexType = typeCheckExpr(
      expr.index,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      allowPartialMoveBase,
      skipMoveChecks
    );
    if (!objectType || !indexType) return null;
    const objectNorm = normalizeTypeForComparison(objectType);
    const indexNorm = normalizeTypeForComparison(indexType);
    if (isErrorTypeName(objectNorm) || isErrorTypeName(indexNorm)) return ERROR_TYPE;
    if (objectNorm === 'any' || indexNorm === 'any') return 'any';

    if (indexNorm === 'Range') {
      if (objectNorm === 'string') return 'string';
      diagnostics.push(
        diagAt(
          `Cannot index '${formatTypeForDiagnostic(objectType)}' with '${formatTypeForDiagnostic(indexType)}'`,
          expr.location,
          'error',
          'INVALID_INDEX'
        )
      );
      return null;
    }

    const parsed = parseTypeName(objectType);
    if (parsed && parsed.base === 'HashMap' && parsed.args.length === 2) {
      const keyType = parsed.args[0];
      if (!isTypeAssignable(indexType, keyType, symbols, options?.typeParams)) {
        diagnostics.push(
          diagAt(
            `HashMap key type mismatch: expected '${formatTypeForDiagnostic(keyType)}', found '${formatTypeForDiagnostic(indexType)}'`,
            expr.location,
            'error',
            'INVALID_INDEX'
          )
        );
        return null;
      }
      return parsed.args[1] ?? 'any';
    }

    if (isIntTypeName(indexNorm)) {
      if (parsed && parsed.base === 'Vec' && parsed.args.length === 1) {
        return parsed.args[0] ?? 'any';
      }
    }

    diagnostics.push(
      diagAt(
        `Cannot index '${formatTypeForDiagnostic(objectType)}' with '${formatTypeForDiagnostic(indexType)}'`,
        expr.location,
        'error',
        'INVALID_INDEX'
      )
    );
    return null;
  }
  if (expr.type === 'Cast') {
    const valueType = typeCheckExpr(
      expr.expr,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      allowPartialMoveBase,
      skipMoveChecks
    );
    const targetType = resolveTypeExpr(expr.targetType);
    if (!valueType || !targetType) {
      diagnostics.push(diagAt('Invalid cast target type', expr.location, 'error', 'TYPE-CAST'));
      return null;
    }
    const fromNorm = normalizeNumericType(valueType);
    const toNorm = normalizeNumericType(targetType);
    if (!isNumericTypeName(fromNorm) || !isNumericTypeName(toNorm)) {
      diagnostics.push(
        diagAt(
          `Cannot cast '${formatTypeForDiagnostic(valueType)}' to '${formatTypeForDiagnostic(targetType)}'`,
          expr.location,
          'error',
          'TYPE-CAST'
        )
      );
      return toNorm;
    }
    const fromWidth = intBitWidth(fromNorm);
    const toWidth = intBitWidth(toNorm);
    const lossy =
      (isFloatTypeName(fromNorm) && isIntTypeName(toNorm)) ||
      (isFloatTypeName(fromNorm) && isFloatTypeName(toNorm) && fromNorm === 'f64' && toNorm === 'f32') ||
      (isIntTypeName(fromNorm) && isFloatTypeName(toNorm) && (toNorm === 'f32' || fromWidth > 53)) ||
      (isIntTypeName(fromNorm) && isIntTypeName(toNorm) && (fromWidth > toWidth));
    if (lossy) {
      diagnostics.push(
        diagAt(
          `Lossy conversion from '${formatTypeForDiagnostic(valueType)}' to '${formatTypeForDiagnostic(targetType)}'`,
          expr.location,
          'warning',
          'LOSSY-CAST'
        )
      );
    }
    return toNorm;
  }
  if (expr.type === 'Move') {
    const path = getMovePath(expr.target);
    if (!path) {
      diagnostics.push(diagAt('Invalid move target', expr.location ?? expr.target.location));
      return null;
    }
    const baseName = path.split('.')[0];
    scope?.read(baseName);
    if (scope?.isBorrowed(baseName)) {
      diagnostics.push(
        diagAt(
          `Cannot move '${path}' while it is borrowed`,
          expr.location ?? expr.target.location,
          'error',
          'MOVE_WHILE_BORROWED'
        )
      );
    }
    const previousMove = scope?.findMoveConflictInfo(path, 'overlap');
    if (previousMove) {
      diagnostics.push(
        diagAt(
          formatMoveConflictMessage('move', path, previousMove.path),
          expr.location ?? expr.target.location,
          'error',
          'USE_AFTER_MOVE',
          [
            {
              location: previousMove.location ?? expr.location ?? defaultLocation,
              message: `Moved here`,
            },
          ]
        )
      );
    }
    scope?.markMovedPath(path, expr.location ?? expr.target.location);
    const narrowed = scope?.lookupNarrowed(baseName);
    const sym = symbols.get(baseName) ?? options?.externSymbols?.(baseName);
    let hmType: LuminaType | null = null;
    if (options?.hmInferred && scope) {
      const defScope = findDefScope(scope, baseName);
      const defLocation = defScope?.locals.get(baseName);
      const hmKeyForDef = hmKey(defLocation ?? undefined);
      if (hmKeyForDef) {
        hmType = options.hmInferred.letTypes.get(hmKeyForDef) ?? null;
      }
    }
    if (!sym) {
      if (options?.importedNames?.has(baseName)) {
        return 'any';
      }
      const suggestion = suggestName(baseName, collectVisibleSymbols(symbols, options));
      const related = suggestion
        ? [
            {
              location: expr.location ?? defaultLocation,
              message: `Did you mean '${suggestion}'?`,
            },
          ]
        : undefined;
      diagnostics.push(diagAt(`Unknown identifier '${baseName}'`, expr.location, 'error', 'UNKNOWN_IDENTIFIER', related));
      return null;
    }
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') {
      diagnostics.push(diagAt(`'${baseName}' is private to ${sym.uri}`, expr.location));
      return null;
    }
    if (scope && di) {
      const defScope = findDefScope(scope, baseName);
      if (defScope && !di.isAssigned(defScope, baseName)) {
        diagnostics.push(diagAt(`Variable '${baseName}' used before assignment`, expr.location));
      }
    }
    const targetType =
      expr.target.type === 'Member'
        ? typeCheckExpr(
            expr.target,
            symbols,
            diagnostics,
            scope,
            options,
            undefined,
            resolving,
            pendingDeps,
            currentFunction,
            di,
            pipedArgType,
            true,
            true
          )
        : null;
    return targetType ?? narrowed ?? hmType ?? sym.type ?? null;
  }
  if (expr.type === 'Await') {
    const fnSym = currentFunction ? symbols.get(currentFunction) : undefined;
    const isAsync = !!fnSym?.async;
    if (!isAsync) {
      diagnostics.push(
        diagAt(`'await' can only be used inside async functions`, expr.location, 'error', 'AWAIT_OUTSIDE_ASYNC')
      );
    }
    const valueType = typeCheckExpr(
      expr.value,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      allowPartialMoveBase,
      skipMoveChecks
    );
    if (!valueType) return null;
    const parsed = parseTypeName(valueType);
    if (parsed && parsed.base === 'Promise' && parsed.args.length === 1) {
      return parsed.args[0];
    }
    return valueType;
  }
  if (expr.type === 'Try') {
    if (!currentFunction) {
      diagnostics.push(
        diagAt(`'?' can only be used inside functions returning Result`, expr.location, 'error', 'TRY_OUTSIDE_FUNCTION')
      );
      return null;
    }
    const valueType = typeCheckExpr(
      expr.value,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      allowPartialMoveBase,
      skipMoveChecks
    );
    if (!valueType) return null;
    const parsedValue = parseTypeName(valueType);
    if (!parsedValue || parsedValue.base !== 'Result' || parsedValue.args.length !== 2) {
      diagnostics.push(
        diagAt(`'?' expects a Result value`, expr.location, 'error', 'TRY_NOT_RESULT')
      );
      return null;
    }
    const okType = parsedValue.args[0];
    const errType = parsedValue.args[1];
    const fnSym = symbols.get(currentFunction);
    let expectedReturn = fnSym?.type ?? null;
    if (fnSym?.async && expectedReturn) {
      const parsed = parseTypeName(expectedReturn);
      if (parsed && parsed.base === 'Promise' && parsed.args.length === 1) {
        expectedReturn = parsed.args[0];
      }
    }
    if (expectedReturn && expectedReturn !== 'any') {
      const parsedReturn = parseTypeName(expectedReturn);
      if (!parsedReturn || parsedReturn.base !== 'Result' || parsedReturn.args.length !== 2) {
        diagnostics.push(
          diagAt(`'?' can only be used in functions returning Result`, expr.location, 'error', 'TRY_RETURN_MISMATCH')
        );
      } else if (!areTypesEquivalent(parsedReturn.args[1], errType)) {
        diagnostics.push(
          diagAt(
            `Result error type '${formatTypeForDiagnostic(errType)}' does not match function error type '${formatTypeForDiagnostic(parsedReturn.args[1])}'`,
            expr.location,
            'error',
            'TRY_RETURN_MISMATCH'
          )
        );
      }
    }
    return okType;
  }
  if (expr.type === 'Binary') {
    if (expr.op === '|>') {
      if (expr.right.type !== 'Call') {
        diagnostics.push(diagAt(`Pipe target must be a function call`, expr.location));
        return null;
      }
      const callExpr = expr.right;
      const piped = typeCheckExpr(
        expr.left,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (!callExpr.enumName) {
        const calleeSym = symbols.get(callExpr.callee.name) ?? options?.externSymbols?.(callExpr.callee.name);
        if (calleeSym?.kind === 'function' && calleeSym.paramRefs?.[0]) {
          const isLValue = (value: LuminaExpr) => value.type === 'Identifier' || value.type === 'Member';
          if (!isLValue(expr.left)) {
            diagnostics.push(
              diagAt(
                `'${callExpr.callee.name}' expects a reference for parameter 1`,
                expr.left.location ?? expr.location,
                'error',
                'REF_LVALUE_REQUIRED'
              )
            );
          } else {
            const baseName = getLValueBaseName(expr.left);
            if (baseName) {
              const baseSym = symbols.get(baseName) ?? options?.externSymbols?.(baseName);
              const requiresMut = calleeSym.paramRefMuts?.[0] ?? false;
              if (requiresMut && baseSym?.kind === 'variable' && baseSym.mutable === false && !baseSym.refMutable) {
                diagnostics.push(
                  diagAt(
                    `'${baseName}' must be mutable when passed by mutable reference`,
                    expr.left.location ?? expr.location,
                    'error',
                    'REF_MUT_REQUIRED'
                  )
                );
              }
            }
          }
        }
      }
      const callType = typeCheckExpr(
        callExpr,
        symbols,
        diagnostics,
        scope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di,
        piped ?? undefined
      );
      return callType;
    }
    const left = typeCheckExpr(expr.left, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
    const right = typeCheckExpr(expr.right, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
    if (!left || !right) return null;
    const leftNormRaw = normalizeTypeForComparison(left);
    const rightNormRaw = normalizeTypeForComparison(right);
    const hasAny = leftNormRaw === 'any' || rightNormRaw === 'any';
    if (expr.op === '+' && left === 'string' && right === 'string') return 'string';
    if (expr.op === '&&' || expr.op === '||') {
      if (hasAny) return 'bool';
      if (left !== 'bool' || right !== 'bool') {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires bool operands`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (expr.op === '==' || expr.op === '!=') {
      const leftNorm = normalizeNumericType(left);
      const rightNorm = normalizeNumericType(right);
      const numericLeft = isNumericTypeName(leftNorm);
      const numericRight = isNumericTypeName(rightNorm);
      if (hasAny) return 'bool';
      if (numericLeft && numericRight) {
        if (leftNorm !== rightNorm) {
          diagnostics.push(diagAt(`Operator '${expr.op}' requires matching numeric operand types`, expr.location));
          return null;
        }
        return 'bool';
      }
      if (left !== right) {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires matching operand types`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') {
      if (hasAny) return 'bool';
      const leftNorm = normalizeNumericType(left);
      const rightNorm = normalizeNumericType(right);
      if (!isNumericTypeName(leftNorm) || !isNumericTypeName(rightNorm) || leftNorm !== rightNorm) {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires matching numeric operands`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (hasAny) return 'any';
    const leftNorm = normalizeNumericType(left);
    const rightNorm = normalizeNumericType(right);
    if (!isNumericTypeName(leftNorm) || !isNumericTypeName(rightNorm) || leftNorm !== rightNorm) {
      diagnostics.push(diagAt(`Operator '${expr.op}' requires matching numeric operands`, expr.location));
      return null;
    }
    return leftNorm;
  }
    if (expr.type === 'MacroInvoke') {
      for (const arg of expr.args) {
        typeCheckExpr(arg, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      }
      return unresolvedMember(`Unknown macro '${expr.name}!'`, expr.location, 'UNRESOLVED_MACRO');
    }
    if (expr.type === 'Identifier') {
      const name = expr.name;
      scope?.read(name);
      if (!skipMoveChecks) {
        const movedAt = scope?.findMoveConflictInfo(
          name,
          allowPartialMoveBase ? 'exact' : 'prefix'
        );
        if (movedAt) {
          diagnostics.push(
            diagAt(
              formatMoveConflictMessage('use', name, movedAt.path),
              expr.location,
              'error',
              'USE_AFTER_MOVE',
              [
                {
                  location: movedAt.location ?? expr.location ?? defaultLocation,
                  message: `Moved here`,
                },
              ]
            )
          );
        }
      }
      const narrowed = scope?.lookupNarrowed(name);
      const sym = symbols.get(name) ?? options?.externSymbols?.(name);
      const localDefScope = scope ? findDefScope(scope, name) : null;
      let hmType: LuminaType | null = null;
      if (options?.hmInferred && scope) {
        const defLocation = localDefScope?.locals.get(name);
        const hmKeyForDef = hmKey(defLocation ?? undefined);
        if (hmKeyForDef) {
          hmType = options.hmInferred.letTypes.get(hmKeyForDef) ?? null;
        }
      }
      if (!sym) {
        if (localDefScope) {
          if (scope && di && !di.isAssigned(localDefScope, name)) {
            diagnostics.push(diagAt(`Variable '${name}' used before assignment`, expr.location));
          }
          return narrowed ?? hmType ?? 'any';
        }
        if (options?.importedNames?.has(name)) {
          return 'any';
        }
        const suggestion = suggestName(name, collectVisibleSymbols(symbols, options));
      const related = suggestion
        ? [
            {
              location: expr.location ?? defaultLocation,
              message: `Did you mean '${suggestion}'?`,
            },
          ]
        : undefined;
      diagnostics.push(diagAt(`Unknown identifier '${name}'`, expr.location, 'error', 'UNKNOWN_IDENTIFIER', related));
      return null;
    }
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') {
      diagnostics.push(diagAt(`'${name}' is private to ${sym.uri}`, expr.location));
      return null;
    }
    if (scope && di) {
      const defScope = localDefScope;
      if (defScope && !di.isAssigned(defScope, name)) {
        diagnostics.push(diagAt(`Variable '${name}' used before assignment`, expr.location));
        }
      }
      return narrowed ?? hmType ?? sym.type ?? null;
    }
    if (expr.type === 'IsExpr') {
      const valueType = typeCheckExpr(expr.value, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      if (!valueType) return 'bool';
      const parsed = parseTypeName(valueType);
      const base = parsed?.base ?? valueType;
      if (expr.enumName) {
        const enumSym = symbols.get(expr.enumName);
        if (!enumSym || !enumSym.enumVariants) {
          const suggestion = suggestName(expr.enumName, collectVisibleTypeSymbols(symbols, options));
          const related = suggestion
            ? [{ location: expr.location ?? defaultLocation, message: `Did you mean '${suggestion}'?` }]
            : undefined;
          diagnostics.push(diagAt(`Unknown enum '${expr.enumName}'`, expr.location, 'error', 'UNKNOWN_QUALIFIER', related));
          return 'bool';
        }
        if (expr.enumName !== base) {
          diagnostics.push(diagAt(`'${expr.enumName}' does not match '${base}'`, expr.location, 'error', 'QUALIFIER_MISMATCH'));
          return 'bool';
        }
        const variant = findEnumVariantQualified(symbols, expr.enumName, expr.variant, options);
        if (!variant) {
          diagnostics.push(diagAt(`Unknown enum variant '${expr.variant}'`, expr.location));
        }
        return 'bool';
      }
      const variant = findEnumVariant(symbols, expr.variant, options);
      if (!variant) {
        diagnostics.push(diagAt(`Unknown enum variant '${expr.variant}'`, expr.location));
      }
      return 'bool';
    }
    if (expr.type === 'Call') {
      const callee = expr.callee.name;
      const isLValue = (value: LuminaExpr) => value.type === 'Identifier' || value.type === 'Member';

      if (expr.receiver) {
        const receiverType = typeCheckExpr(
          expr.receiver,
          symbols,
          diagnostics,
          scope,
          options,
          undefined,
          resolving,
          pendingDeps,
          currentFunction,
          di
        );
        if (!receiverType) return null;
        if (isErrorTypeName(receiverType)) return ERROR_TYPE;

        if (canResolveTraitMethodCall(receiverType, callee)) {
          return resolveTraitMethodCall(receiverType, expr.args, expr.location, expr.id, callee);
        }

        if (expr.receiver.type === 'Identifier') {
          const moduleBinding = options?.moduleBindings?.get(expr.receiver.name);
          const moduleFn = moduleBinding ? resolveModuleFunction(moduleBinding, callee) : null;
          if (moduleFn) {
            if (moduleFn.paramTypes.length !== expr.args.length) {
              diagnostics.push(diagAt(`Argument count mismatch for '${expr.receiver.name}.${callee}'`, expr.location));
              return moduleFn.returnType;
            }
            const argTypes: Array<LuminaType | null> = [];
            for (let i = 0; i < expr.args.length; i++) {
              const argType = typeCheckExpr(
                expr.args[i],
                symbols,
                diagnostics,
                scope,
                options,
                undefined,
                resolving,
                pendingDeps,
                currentFunction,
                di
              );
              argTypes.push(argType);
              const expected = moduleFn.paramTypes[i];
              if (argType && !isTypeAssignable(argType, expected, symbols, options?.typeParams)) {
                reportCallArgMismatch(
                  `${expr.receiver.name}.${callee}`,
                  i,
                  expected,
                  argType,
                  expr.args[i]?.location ?? expr.location,
                  moduleFn.paramNames?.[i] ?? null
                );
              }
            }
            if (expr.receiver.name === 'thread' && callee === 'spawn') {
              validateThreadSpawnCall(expr.args, argTypes);
            }
            return moduleFn.returnType;
          }
        }

        const builtinMethodType = resolveBuiltinMethodCall(receiverType, expr.args, expr.location, callee);
        if (builtinMethodType) return builtinMethodType;

        diagnostics.push(
          diagAt(
            `Type '${formatTypeForDiagnostic(receiverType)}' has no method '${callee}'`,
            expr.location,
            'error',
            'MEMBER-NOT-FOUND'
          )
        );
        return null;
      }

      if (expr.enumName) {
        const receiverSym = symbols.get(expr.enumName);
        const variableShadow = receiverSym?.kind === 'variable';
        const moduleBinding = options?.moduleBindings?.get(expr.enumName);
        const moduleFn = moduleBinding
          ? resolveModuleFunction(moduleBinding, callee)
          : null;
        if (!variableShadow && moduleFn) {
          const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
          if (moduleFn.paramTypes.length !== effectiveArgCount) {
            diagnostics.push(diagAt(`Argument count mismatch for '${expr.enumName}.${callee}'`, expr.location));
            return moduleFn.returnType;
          }
          const argTypes: Array<LuminaType | null> = [];
          for (let i = 0; i < effectiveArgCount; i++) {
            const argType =
              pipedArgType && i === 0
                ? pipedArgType
                : typeCheckExpr(
                    expr.args[pipedArgType ? i - 1 : i],
                    symbols,
                    diagnostics,
                    scope,
                    options,
                    undefined,
                    resolving,
                    pendingDeps,
                    currentFunction,
                    di
                  );
            argTypes.push(argType);
            const expected = moduleFn.paramTypes[i];
            if (argType && !isTypeAssignable(argType, expected, symbols, options?.typeParams)) {
              reportCallArgMismatch(
                `${expr.enumName}.${callee}`,
                i,
                expected,
                argType,
                expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
                moduleFn.paramNames?.[i] ?? null
              );
            }
          }
          if (expr.enumName === 'thread' && callee === 'spawn' && !pipedArgType) {
            validateThreadSpawnCall(expr.args, argTypes);
          }
          return moduleFn.returnType;
        }

        if (!variableShadow && moduleBinding?.kind === 'module') {
          const exportMember = moduleBinding.exports.get(callee);
          if (!exportMember) {
            return unresolvedMember(
              `Unknown module member '${expr.enumName}.${callee}'`,
              expr.location,
              'UNRESOLVED_MEMBER'
            );
          }
          if (exportMember.kind !== 'function') {
            return unresolvedMember(
              `Module member '${expr.enumName}.${callee}' is not callable`,
              expr.location,
              'UNRESOLVED_MEMBER'
            );
          }
        }

        if (!variableShadow && options?.importedNames?.has(expr.enumName) && !symbols.has(expr.enumName)) {
          return unresolvedMember(
            `Unresolved namespace '${expr.enumName}' for '${callee}'`,
            expr.location,
            'UNRESOLVED_NAMESPACE'
          );
        }

        if (receiverSym && receiverSym.kind === 'variable') {
          const receiverExpr: LuminaExpr = {
            type: 'Identifier',
            name: expr.enumName,
            location: expr.location,
          };
          const receiverType = typeCheckExpr(
            receiverExpr,
            symbols,
            diagnostics,
            scope,
            options,
            undefined,
            resolving,
            pendingDeps,
            currentFunction,
            di
          );
          if (!receiverType) return null;
          if (isErrorTypeName(receiverType)) return ERROR_TYPE;
          if (canResolveTraitMethodCall(receiverType, callee)) {
            return resolveTraitMethodCall(receiverType, expr.args, expr.location, expr.id, callee);
          }
          const builtinMethodType = resolveBuiltinMethodCall(receiverType, expr.args, expr.location, callee);
          if (builtinMethodType) return builtinMethodType;
          diagnostics.push(
            diagAt(
              `Type '${formatTypeForDiagnostic(receiverType)}' has no method '${callee}'`,
              expr.location,
              'error',
              'MEMBER-NOT-FOUND'
            )
          );
          return null;
        }

        const enumVariant = findEnumVariantQualified(symbols, expr.enumName, callee, options);
        if (!enumVariant) {
          diagnostics.push(diagAt(`Unknown enum variant '${expr.enumName}.${callee}'`, expr.location));
          return null;
        }
        const enumSym = symbols.get(enumVariant.enumName);
        const typeParamDefs = enumSym?.typeParams ?? [];
        const mapping = new Map<string, LuminaType>();
        const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
        seedTypeParamsFromExpected(expr.enumName, mapping, typeParamDefs);
        if (enumVariant.params.length !== effectiveArgCount) {
          diagnostics.push(diagAt(`Argument count mismatch for '${expr.enumName}.${callee}'`, expr.location));
          return enumVariant.enumName;
        }
        for (let i = 0; i < effectiveArgCount; i++) {
          const argType =
            pipedArgType && i === 0
              ? pipedArgType
              : typeCheckExpr(
                  expr.args[pipedArgType ? i - 1 : i],
                  symbols,
                  diagnostics,
                  scope,
                  options,
                  undefined,
                  resolving,
                  pendingDeps,
                  currentFunction,
                  di
                );
          const expected = enumVariant.params[i];
          if (argType) {
            unifyTypes(expected, argType, mapping);
            const resolvedExpected = substituteTypeParams(expected, mapping);
            if (!isTypeAssignable(argType, resolvedExpected, symbols, options?.typeParams)) {
              reportCallArgMismatch(
                `${expr.enumName}.${callee}`,
                i,
                resolvedExpected,
                argType,
                expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
                null
              );
            }
          }
        }
        if (typeParamDefs.length > 0) {
          const unresolved = typeParamDefs.map(tp => tp.name).filter(tp => !mapping.has(tp));
          if (unresolved.length > 0) {
            diagnostics.push(diagAt(`Could not infer type parameters for '${enumVariant.enumName}'`, expr.location));
          }
          for (const param of typeParamDefs) {
            if (param.bound && mapping.has(param.name)) {
              const value = mapping.get(param.name) as LuminaType;
              for (const bound of param.bound) {
                const resolvedBound = resolveTypeExpr(bound);
                if (!resolvedBound) continue;
                const isTrait = isTraitBound(resolvedBound, options?.traitRegistry);
                const satisfiesTrait = isTrait && satisfiesTraitBound(value, resolvedBound, options?.traitRegistry);
                if (!isTrait && !isTypeAssignable(value, resolvedBound, symbols, options?.typeParams)) {
                  const expectedText = formatTypeForDiagnostic(resolvedBound);
                  const actualText = formatTypeForDiagnostic(value);
                  diagnostics.push(
                    diagAt(
                      `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                      expr.location,
                      'error',
                      'BOUND_MISMATCH',
                      [
                        {
                          location: expr.location ?? defaultLocation,
                          message: `Expected: ${expectedText}, Actual: ${actualText}`,
                        },
                      ]
                    )
                  );
                  continue;
                }
                if (isTrait && !satisfiesTrait) {
                  const expectedText = formatTypeForDiagnostic(resolvedBound);
                  const actualText = formatTypeForDiagnostic(value);
                  diagnostics.push(
                    diagAt(
                      `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                      expr.location,
                      'error',
                      'BOUND_MISMATCH',
                      [
                        {
                          location: expr.location ?? defaultLocation,
                          message: `Expected: ${expectedText}, Actual: ${actualText}`,
                        },
                      ]
                    )
                  );
                }
              }
            }
          }
          const args = typeParamDefs.map(tp => mapping.get(tp.name) ?? 'any');
          return `${enumVariant.enumName}<${args.join(',')}>`;
        }
        return enumVariant.enumName;
      }

      const directModuleFn = options?.moduleBindings?.get(callee);
      if (directModuleFn && directModuleFn.kind === 'function') {
        const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
        if (directModuleFn.paramTypes.length !== effectiveArgCount) {
          diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, expr.location));
          return directModuleFn.returnType;
        }
        for (let i = 0; i < effectiveArgCount; i++) {
          const argType =
            pipedArgType && i === 0
              ? pipedArgType
              : typeCheckExpr(
                  expr.args[pipedArgType ? i - 1 : i],
                  symbols,
                  diagnostics,
                  scope,
                  options,
                  undefined,
                  resolving,
                  pendingDeps,
                  currentFunction,
                  di
                );
          const expected = directModuleFn.paramTypes[i];
          if (argType && !isTypeAssignable(argType, expected, symbols, options?.typeParams)) {
            reportCallArgMismatch(
              callee,
              i,
              expected,
              argType,
              expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
              directModuleFn.paramNames?.[i] ?? null
            );
          }
        }
        return directModuleFn.returnType;
      }

      scope?.read(callee);
      const sym = symbols.get(callee) ?? options?.externSymbols?.(callee);
      if (!sym || sym.kind !== 'function') {
        const enumVariant = findEnumVariant(symbols, callee, options);
        if (enumVariant) {
          const enumSym = symbols.get(enumVariant.enumName);
          const typeParamDefs = enumSym?.typeParams ?? [];
          const mapping = new Map<string, LuminaType>();
          const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
          seedTypeParamsFromExpected(enumVariant.enumName, mapping, typeParamDefs);
          if (enumVariant.params.length !== effectiveArgCount) {
            diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, expr.location));
            return enumVariant.enumName;
          }
        for (let i = 0; i < effectiveArgCount; i++) {
            const argType =
              pipedArgType && i === 0
                ? pipedArgType
                : typeCheckExpr(
                    expr.args[pipedArgType ? i - 1 : i],
                    symbols,
                    diagnostics,
                    scope,
                    options,
                    undefined,
                    resolving,
                    pendingDeps,
                    currentFunction,
                    di
                  );
            const expected = enumVariant.params[i];
            if (argType) {
              unifyTypes(expected, argType, mapping);
              const resolvedExpected = substituteTypeParams(expected, mapping);
              if (!isTypeAssignable(argType, resolvedExpected, symbols, options?.typeParams)) {
                reportCallArgMismatch(
                  callee,
                  i,
                  resolvedExpected,
                  argType,
                  expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
                  null
                );
              }
            }
          }
          if (typeParamDefs.length > 0) {
            const unresolved = typeParamDefs.map(tp => tp.name).filter(tp => !mapping.has(tp));
            if (unresolved.length > 0) {
              diagnostics.push(diagAt(`Could not infer type parameters for '${enumVariant.enumName}'`, expr.location));
            }
            for (const param of typeParamDefs) {
              if (param.bound && mapping.has(param.name)) {
                const value = mapping.get(param.name) as LuminaType;
                for (const bound of param.bound) {
                  const resolvedBound = resolveTypeExpr(bound);
                  if (!resolvedBound) continue;
                  const isTrait = isTraitBound(resolvedBound, options?.traitRegistry);
                  const satisfiesTrait = isTrait && satisfiesTraitBound(value, resolvedBound, options?.traitRegistry);
                  if (!isTrait && !isTypeAssignable(value, resolvedBound, symbols, options?.typeParams)) {
                    const expectedText = formatTypeForDiagnostic(resolvedBound);
                    const actualText = formatTypeForDiagnostic(value);
                    diagnostics.push(
                      diagAt(
                        `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                        expr.location,
                        'error',
                        'BOUND_MISMATCH',
                        [
                          {
                            location: expr.location ?? defaultLocation,
                            message: `Expected: ${expectedText}, Actual: ${actualText}`,
                          },
                        ]
                      )
                    );
                    continue;
                  }
                  if (isTrait && !satisfiesTrait) {
                    const expectedText = formatTypeForDiagnostic(resolvedBound);
                    const actualText = formatTypeForDiagnostic(value);
                    diagnostics.push(
                      diagAt(
                        `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                        expr.location,
                        'error',
                        'BOUND_MISMATCH',
                        [
                          {
                            location: expr.location ?? defaultLocation,
                            message: `Expected: ${expectedText}, Actual: ${actualText}`,
                          },
                        ]
                      )
                    );
                  }
                }
              }
            }
            const args = typeParamDefs.map(tp => mapping.get(tp.name) ?? 'any');
            return `${enumVariant.enumName}<${args.join(',')}>`;
          }
          return enumVariant.enumName;
        }
        const suggestion = suggestName(callee, collectVisibleSymbols(symbols, options));
        const related = suggestion
          ? [
              {
                location: expr.location ?? defaultLocation,
                message: `Did you mean '${suggestion}'?`,
              },
            ]
          : undefined;
        diagnostics.push(diagAt(`Unknown function '${callee}'`, expr.location, 'error', 'UNKNOWN_FUNCTION', related));
        return null;
      }
    if (sym.uri && options?.currentUri && sym.uri !== options.currentUri && sym.visibility === 'private') {
      diagnostics.push(diagAt(`'${callee}' is private to ${sym.uri}`, expr.location));
      return null;
    }
    if (sym.pendingReturn) {
      if (currentFunction && pendingDeps) {
        const deps = pendingDeps.get(currentFunction) ?? new Set<string>();
        deps.add(callee);
        pendingDeps.set(currentFunction, deps);
      }
      return null;
    }
    const typeParamDefs = sym.typeParams ?? [];
    const mapping = new Map<string, LuminaType>();
    if (expr.typeArgs && expr.typeArgs.length > 0) {
      if (expr.typeArgs.length !== typeParamDefs.length) {
        diagnostics.push(diagAt(`Type argument count mismatch for '${callee}'`, expr.location));
        return sym.type ?? null;
      }
      typeParamDefs.forEach((tp, idx) => {
        mapping.set(tp.name, expr.typeArgs![idx]);
      });
    }

    const paramTypes = sym.paramTypes ?? [];
    const paramRefs = sym.paramRefs ?? [];
    const paramRefMuts = sym.paramRefMuts ?? [];
    const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
    if (paramTypes.length !== effectiveArgCount) {
      diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, expr.location));
      return sym.type ?? null;
    }

    for (let i = 0; i < effectiveArgCount; i++) {
      const refRequired = paramRefs[i] ?? false;
      const refMutable = paramRefMuts[i] ?? false;
      if (refRequired) {
        const argExpr = pipedArgType && i === 0 ? undefined : expr.args[pipedArgType ? i - 1 : i];
        if (argExpr && !isLValue(argExpr)) {
          diagnostics.push(
            diagAt(
              `'${callee}' expects a reference for parameter ${i + 1}`,
              argExpr.location ?? expr.location,
              'error',
              'REF_LVALUE_REQUIRED'
            )
          );
        } else if (argExpr) {
          const baseName = getLValueBaseName(argExpr);
          if (baseName) {
            const baseSym = symbols.get(baseName) ?? options?.externSymbols?.(baseName);
            if (refMutable && baseSym?.kind === 'variable' && baseSym.mutable === false && !baseSym.refMutable) {
              diagnostics.push(
                diagAt(
                  `'${baseName}' must be mutable when passed by mutable reference`,
                  argExpr.location ?? expr.location,
                  'error',
                  'REF_MUT_REQUIRED'
                )
              );
            }
            if (scope) {
              const ok = refMutable ? scope.borrowMut(baseName) : scope.borrowShared(baseName);
              if (!ok) {
                diagnostics.push(
                  diagAt(
                    `Cannot borrow '${baseName}'${refMutable ? ' mutably' : ''} while it is already borrowed`,
                    argExpr.location ?? expr.location,
                    'error',
                    'BORROW_CONFLICT'
                  )
                );
              }
            }
          }
        }
      }
      const argType =
        pipedArgType && i === 0
          ? pipedArgType
          : typeCheckExpr(
              expr.args[pipedArgType ? i - 1 : i],
              symbols,
              diagnostics,
              scope,
              options,
              undefined,
              resolving,
              pendingDeps,
              currentFunction,
              di
            );
      const paramType = paramTypes[i];
      if (argType) {
        unifyTypes(paramType, argType, mapping);
        const resolvedExpected = substituteTypeParams(paramType, mapping);
        if (!isTypeAssignable(argType, resolvedExpected, symbols, options?.typeParams)) {
          reportCallArgMismatch(
            callee,
            i,
            resolvedExpected,
            argType,
            expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
            sym.paramNames?.[i] ?? null
          );
        }
      }
    }

    if (expectedType) {
      const returnType = sym.type ?? 'any';
      unifyTypes(returnType, expectedType, mapping);
    }

    const unresolved = typeParamDefs.map(tp => tp.name).filter((tp) => !mapping.has(tp));
    if (unresolved.length > 0) {
      diagnostics.push(diagAt(`Could not infer type parameters for '${callee}'`, expr.location));
    }

    for (const param of typeParamDefs) {
      if (param.bound && mapping.has(param.name)) {
        const value = mapping.get(param.name) as LuminaType;
        for (const bound of param.bound) {
          const resolvedBound = resolveTypeExpr(bound);
          if (!resolvedBound) continue;
          const isTrait = isTraitBound(resolvedBound, options?.traitRegistry);
          const satisfiesTrait = isTrait && satisfiesTraitBound(value, resolvedBound, options?.traitRegistry);
          if (!isTrait && !isTypeAssignable(value, resolvedBound, symbols, options?.typeParams)) {
            const expectedText = formatTypeForDiagnostic(resolvedBound);
            const actualText = formatTypeForDiagnostic(value);
            diagnostics.push(
              diagAt(
                `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                expr.location,
                'error',
                'BOUND_MISMATCH',
                [
                  {
                    location: expr.location ?? defaultLocation,
                    message: `Expected: ${expectedText}, Actual: ${actualText}`,
                  },
                ]
              )
            );
            continue;
          }
          if (isTrait && !satisfiesTrait) {
            const expectedText = formatTypeForDiagnostic(resolvedBound);
            const actualText = formatTypeForDiagnostic(value);
            diagnostics.push(
              diagAt(
                `Type argument '${actualText}' does not satisfy bound '${expectedText}' for '${param.name}'`,
                expr.location,
                'error',
                'BOUND_MISMATCH',
                [
                  {
                    location: expr.location ?? defaultLocation,
                    message: `Expected: ${expectedText}, Actual: ${actualText}`,
                  },
                ]
              )
            );
          }
        }
      }
    }

    const returnType = substituteTypeParams(sym.type ?? 'any', mapping);
    return returnType;
  }
  if (expr.type === 'StructLiteral') {
    const structSym = symbols.get(expr.name);
    if (!structSym || !structSym.structFields) {
      diagnostics.push(diagAt(`Unknown struct '${expr.name}'`, expr.location));
      return null;
    }

    const typeParamDefs = structSym.typeParams ?? [];
    const mapping = new Map<string, LuminaType>();

    if (expr.typeArgs && expr.typeArgs.length > 0) {
      if (expr.typeArgs.length !== typeParamDefs.length) {
        diagnostics.push(diagAt(`Type argument count mismatch for '${expr.name}'`, expr.location));
      } else {
        typeParamDefs.forEach((tp, idx) => {
          mapping.set(tp.name, expr.typeArgs![idx]);
        });
      }
    }

    const provided = new Set<string>();
    for (const field of expr.fields) {
      provided.add(field.name);
      const expected = structSym.structFields.get(field.name);
      if (!expected) {
        diagnostics.push(diagAt(`Unknown field '${field.name}' on '${expr.name}'`, field.location ?? expr.location));
        continue;
      }
      const resolvedForField = substituteConstParamsInType(substituteTypeParams(expected, mapping), mapping);
      const actual = typeCheckExpr(
        field.value,
        symbols,
        diagnostics,
        scope,
        options,
        resolvedForField,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (actual) {
        unifyTypes(expected, actual, mapping);
      }
      const resolvedExpected = substituteConstParamsInType(substituteTypeParams(expected, mapping), mapping);
      if (actual && !isTypeAssignable(actual, resolvedExpected, symbols, options?.typeParams)) {
        diagnostics.push(
          diagAt(
            `Type mismatch for '${field.name}': expected '${formatTypeForDiagnostic(resolvedExpected)}', got '${formatTypeForDiagnostic(actual)}'`,
            field.location ?? expr.location
          )
        );
      }
    }

    for (const fieldName of structSym.structFields.keys()) {
      if (!provided.has(fieldName)) {
        diagnostics.push(diagAt(`Missing field '${fieldName}' for '${expr.name}'`, expr.location));
      }
    }

    const unresolved = typeParamDefs.map(tp => tp.name).filter((tp) => !mapping.has(tp));
    if (unresolved.length > 0) {
      diagnostics.push(diagAt(`Could not infer type parameters for '${expr.name}'`, expr.location));
    }

    if (typeParamDefs.length === 0) return expr.name;
    const args = typeParamDefs.map(tp => mapping.get(tp.name) ?? 'any');
    return `${expr.name}<${args.join(',')}>`;
  }
  if (expr.type === 'Member') {
    if (expr.object.type === 'Identifier') {
      const objectName = expr.object.name;
      const expectedBase = expectedType ? parseTypeName(expectedType)?.base ?? expectedType : null;
      const binding = options?.moduleBindings?.get(objectName);
      const localSym = symbols.get(objectName);
      const variableShadow = localSym?.kind === 'variable';
      if (!variableShadow && binding && binding.kind === 'module') {
        const exp = binding.exports.get(expr.property);
        if (exp) {
          if (exp.kind === 'function') return 'any';
          if (exp.kind === 'value') return exp.valueType;
        }
        if (expectedBase && expectedBase === objectName) {
          return expectedType as LuminaType;
        }
        return unresolvedMember(
          `Unknown module member '${objectName}.${expr.property}'`,
          expr.location,
          'UNRESOLVED_MEMBER'
        );
      }
      if (!variableShadow && options?.importedNames?.has(objectName) && !symbols.has(objectName)) {
        if (expectedBase && expectedBase === objectName) {
          return expectedType as LuminaType;
        }
        return unresolvedMember(
          `Unresolved namespace '${objectName}' while accessing '${expr.property}'`,
          expr.location,
          'UNRESOLVED_NAMESPACE'
        );
      }
    }

    const movePath = getMovePath(expr);
    if (!skipMoveChecks && movePath) {
      const movedAt = scope?.findMoveConflictInfo(movePath, 'overlap');
      if (movedAt) {
        diagnostics.push(
          diagAt(
            formatMoveConflictMessage('access', movePath, movedAt.path),
            expr.location,
            'error',
            'USE_AFTER_MOVE',
            [
              {
                location: movedAt.location ?? expr.location ?? defaultLocation,
                message: `Moved here`,
              },
            ]
          )
        );
      }
    }

    const objectType = typeCheckExpr(
      expr.object,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di,
      pipedArgType,
      true,
      skipMoveChecks
    );
    if (!objectType) return null;
    if (isErrorTypeName(objectType)) return ERROR_TYPE;
    const parsed = parseTypeName(objectType);
    const structName = parsed?.base ?? objectType;
    if (parsed?.base === 'Channel' && parsed.args.length >= 1) {
      const valueType = parsed.args[0] ?? 'any';
      if (expr.property === 'sender') return `Sender<${valueType}>`;
      if (expr.property === 'receiver') return `Receiver<${valueType}>`;
      diagnostics.push(diagAt(`Unknown field '${expr.property}' on '${objectType}'`, expr.location));
      return null;
    }

    const structSym = symbols.get(structName);
    if (structSym?.enumVariants) {
      const variant = findEnumVariantQualified(symbols, structName, expr.property, options);
      if (!variant) {
        diagnostics.push(diagAt(`Unknown enum variant '${structName}.${expr.property}'`, expr.location));
        return null;
      }
      if (variant.params.length > 0) {
        diagnostics.push(
          diagAt(
            `Variant '${structName}.${expr.property}' expects ${variant.params.length} payload value(s). Use '${structName}.${expr.property}(...)'`,
            expr.location
          )
        );
      }
      if (expectedType) {
        const parsedExpected = parseTypeName(expectedType);
        if (parsedExpected?.base === structName) {
          return expectedType;
        }
      }
      if ((structSym.typeParams?.length ?? 0) > 0) {
        const args = (structSym.typeParams ?? []).map(() => 'any');
        return `${structName}<${args.join(',')}>`;
      }
      return structName;
    }

    if (!structSym || !structSym.structFields) {
      diagnostics.push(diagAt(`'${objectType}' has no fields`, expr.location));
      return null;
    }
    const fieldType = structSym.structFields.get(expr.property);
    if (!fieldType) {
      diagnostics.push(diagAt(`Unknown field '${expr.property}' on '${objectType}'`, expr.location));
      return null;
    }
    if (!parsed || (structSym.typeParams?.length ?? 0) === 0) return fieldType;
    if ((structSym.typeParams?.length ?? 0) !== parsed.args.length) {
      diagnostics.push(diagAt(`Type argument count mismatch for '${structName}'`, expr.location));
      return fieldType;
    }
    const mapping = new Map<string, LuminaType>();
    structSym.typeParams?.forEach((tp, idx) => {
      mapping.set(tp.name, parsed.args[idx]);
    });
    return substituteTypeParams(fieldType, mapping);
  }

  if (expr.type === 'MatchExpr') {
    const matchType = typeCheckExpr(
      expr.value,
      symbols,
      diagnostics,
      scope,
      options,
      undefined,
      resolving,
      pendingDeps,
      currentFunction,
      di
    );
    const parsedMatch = matchType ? parseTypeName(matchType) : null;
    const matchBase = parsedMatch?.base ?? matchType ?? null;
    const enumSym = matchBase ? symbols.get(matchBase) : undefined;
    const variants = enumSym?.enumVariants ?? [];
    const seen = new Set<string>();
    let hasWildcard = false;
    let hasEnumPattern = false;
    let armType: LuminaType | null = null;
    const baseMoves = snapshotMoves(scope);
    const branchMoves: Array<Map<Scope, Map<string, Location | undefined>>> = [];
    const matchValueName = expr.value.type === 'Identifier' ? expr.value.name : null;
    const matchMutability = resolveMutableSource(expr.value, symbols, options);

    for (const arm of expr.arms) {
      restoreMoves(baseMoves);
      const armScope = new Scope(scope);
      const armSymbols = new SymbolTable();
      for (const sym of symbols.list()) {
        armSymbols.define(sym);
      }

      const pattern = arm.pattern;
      if (pattern.type === 'WildcardPattern') {
        hasWildcard = true;
      } else if (pattern.type === 'EnumPattern') {
        hasEnumPattern = true;
        if (pattern.enumName && matchBase && pattern.enumName !== matchBase) {
          diagnostics.push(diagAt(`Match value is '${matchBase}', not '${pattern.enumName}'`, arm.location ?? expr.location));
        }
        const variant = pattern.enumName
          ? findEnumVariantQualified(symbols, pattern.enumName, pattern.variant, options)
          : variants.find((v) => v.name === pattern.variant)
            ? { enumName: matchBase ?? '', params: variants.find((v) => v.name === pattern.variant)?.params ?? [] }
            : null;
        if (!variant) {
          diagnostics.push(diagAt(`Unknown enum variant '${pattern.variant}'`, arm.location ?? expr.location));
        } else {
          const variantName = pattern.variant;
          if (seen.has(variantName)) {
            diagnostics.push(diagAt(`Duplicate match arm for '${variantName}'`, arm.location ?? expr.location));
          }
          seen.add(variantName);
          const mapping = matchBase ? buildEnumTypeMapping(matchBase, matchType, symbols) : null;
          const mappedParams = mapping
            ? variant.params.map((param) => substituteTypeParams(param, mapping))
            : variant.params;
          if (matchValueName && mappedParams.length === 1) {
            armScope.narrow(matchValueName, mappedParams[0]);
          }
          if (pattern.bindings.length > 0) {
            if (mappedParams.length === 0) {
              diagnostics.push(diagAt(`Variant '${variantName}' has no payload`, arm.location ?? expr.location));
            } else if (pattern.bindings.length !== mappedParams.length) {
              diagnostics.push(diagAt(`Variant '${variantName}' expects ${mappedParams.length} bindings`, arm.location ?? expr.location));
            }
            pattern.bindings.forEach((binding, idx) => {
              if (binding === '_') return;
              const paramType = mappedParams[idx];
              if (!paramType) return;
              armScope.define(binding, arm.location ?? expr.location);
              armSymbols.define({
                name: binding,
                kind: 'variable',
                type: paramType,
                location: arm.location ?? expr.location,
                mutable: matchMutability,
              });
              if (di) {
                di.define(armScope, binding, true);
              }
            });
          }
        }
      } else if (pattern.type === 'BindingPattern') {
        hasWildcard = true;
        armScope.define(pattern.name, arm.location ?? expr.location);
        armSymbols.define({
          name: pattern.name,
          kind: 'variable',
          type: matchType ?? 'any',
          location: arm.location ?? expr.location,
          mutable: matchMutability,
        });
        if (di) {
          di.define(armScope, pattern.name, true);
        }
      } else {
        const genericBindingTypes = collectPatternBindingTypes(pattern, matchType ?? 'any', symbols);
        for (const [binding, bindingType] of genericBindingTypes.entries()) {
          armScope.define(binding, arm.location ?? expr.location);
          armSymbols.define({
            name: binding,
            kind: 'variable',
            type: bindingType,
            location: arm.location ?? expr.location,
            mutable: matchMutability,
          });
          if (di) {
            di.define(armScope, binding, true);
          }
        }
      }

      if (arm.guard) {
        const guardType = typeCheckExpr(
          arm.guard,
          armSymbols,
          diagnostics,
          armScope,
          options,
          undefined,
          resolving,
          pendingDeps,
          currentFunction,
          di
        );
        if (guardType && normalizeTypeForComparison(guardType) !== 'bool' && normalizeTypeForComparison(guardType) !== 'any') {
          diagnostics.push(diagAt(`Match guard must be 'bool'`, arm.guard.location ?? arm.location ?? expr.location));
        }
      }

      const bodyType = typeCheckExpr(
        arm.body,
        armSymbols,
        diagnostics,
        armScope,
        options,
        undefined,
        resolving,
        pendingDeps,
        currentFunction,
        di
      );
      if (bodyType) {
        if (!armType) {
          armType = bodyType;
        } else if (!areTypesEquivalent(armType, bodyType)) {
          diagnostics.push(diagAt(`Match arms must return the same type`, arm.location ?? expr.location));
        }
      }
      collectUnusedBindings(armScope, diagnostics, arm.location ?? expr.location);
      branchMoves.push(snapshotMoves(scope));
    }

    if (branchMoves.length > 0) {
      mergeMoves(scope, branchMoves);
    }
    if (hasEnumPattern && matchType && (!enumSym || !enumSym.enumVariants)) {
      diagnostics.push(diagAt(`Match expression must be an enum`, expr.location));
    } else if (hasEnumPattern && !hasWildcard && enumSym?.enumVariants) {
      const missing = enumSym.enumVariants.map((v) => v.name).filter((name) => !seen.has(name));
      if (missing.length > 0) {
        const related: DiagnosticRelatedInformation[] = [
          {
            location: expr.location ?? defaultLocation,
            message: `Covered variants: ${Array.from(seen).join(', ') || 'none'}`,
          },
          {
            location: expr.location ?? defaultLocation,
            message: `Missing variants: ${missing.join(', ')}`,
          },
        ];
        diagnostics.push(
          diagAt(
            `Missing case${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
            expr.location,
            'error',
            'MATCH_NOT_EXHAUSTIVE',
            related
          )
        );
      }
    }
    return armType ?? null;
  }

  return null;
}

function snapshotMoves(scope?: Scope): Map<Scope, Map<string, Location | undefined>> {
  const snapshot = new Map<Scope, Map<string, Location | undefined>>();
  for (let current = scope; current; current = current.parent) {
    snapshot.set(current, new Map(current.moved));
  }
  return snapshot;
}

function restoreMoves(snapshot: Map<Scope, Map<string, Location | undefined>>) {
  for (const [scope, moved] of snapshot) {
    scope.moved = new Map(moved);
  }
}

function mergeMoves(
  scope: Scope | undefined,
  branches: Array<Map<Scope, Map<string, Location | undefined>>>
) {
  let current: Scope | undefined = scope;
  while (current) {
    const currentScope = current;
    const merged = new Map<string, Location | undefined>();
    for (const branch of branches) {
      const moved = branch.get(currentScope);
      if (!moved) continue;
      for (const [name, loc] of moved) {
        if (!merged.has(name)) merged.set(name, loc);
      }
    }
    currentScope.moved = merged;
    current = currentScope.parent;
  }
}

class Scope {
    parent?: Scope;
    locals = new Map<string, Location | undefined>();
    reads = new Set<string>();
    writes = new Set<string>();
    narrowed = new Map<string, LuminaType>();
    borrowedMut = new Set<string>();
    borrowedShared = new Set<string>();
    moved = new Map<string, Location | undefined>();
    children: Scope[] = [];

    constructor(parent?: Scope) {
      this.parent = parent;
      if (parent) parent.children.push(this);
  }

  define(name: string, location?: Location) {
    this.locals.set(name, location);
    this.clearMovedPath(name, true);
  }

  read(name: string) {
    if (this.locals.has(name)) {
      this.reads.add(name);
      return;
    }
    if (this.parent) {
      // Track free-variable reads on this scope (used for closure capture analysis).
      this.reads.add(name);
      this.parent.read(name);
    }
  }

    write(name: string) {
      if (this.locals.has(name)) {
        this.writes.add(name);
        return;
      }
      this.parent?.write(name);
    }

    narrow(name: string, type: LuminaType) {
      this.narrowed.set(name, type);
    }

    lookupNarrowed(name: string): LuminaType | undefined {
      if (this.narrowed.has(name)) {
        return this.narrowed.get(name);
      }
      return this.parent?.lookupNarrowed(name);
    }

    canBorrowMut(name: string): boolean {
      if (this.borrowedMut.has(name) || this.borrowedShared.has(name)) return false;
      return this.parent ? this.parent.canBorrowMut(name) : true;
    }

  canBorrowShared(name: string): boolean {
    if (this.borrowedMut.has(name)) return false;
    return this.parent ? this.parent.canBorrowShared(name) : true;
  }

  isBorrowed(name: string): boolean {
    if (this.borrowedMut.has(name) || this.borrowedShared.has(name)) return true;
    return this.parent ? this.parent.isBorrowed(name) : false;
  }

  borrowMut(name: string): boolean {
      if (!this.canBorrowMut(name)) return false;
      this.borrowedMut.add(name);
      return true;
    }

    borrowShared(name: string): boolean {
      if (!this.canBorrowShared(name)) return false;
      this.borrowedShared.add(name);
      return true;
    }

    markMovedPath(path: string, location?: Location): Location | undefined {
      const base = path.split('.')[0];
      if (this.locals.has(base)) {
        const prev = this.moved.get(path);
        this.moved.set(path, location);
        return prev;
      }
      return this.parent?.markMovedPath(path, location);
    }

    findMoveConflictInfo(
      path: string,
      mode: 'exact' | 'prefix' | 'overlap'
    ): { path: string; location?: Location } | undefined {
      const check = (candidate: string): boolean => {
        if (mode === 'exact') return candidate === path;
        if (mode === 'prefix') return isMovePrefix(path, candidate);
        return isMovePrefix(candidate, path) || isMovePrefix(path, candidate);
      };
      for (const [movedPath, location] of this.moved) {
        if (check(movedPath)) return { path: movedPath, location };
      }
      let current = this.parent;
      while (current) {
        for (const [movedPath, location] of current.moved) {
          if (check(movedPath)) return { path: movedPath, location };
        }
        current = current.parent;
      }
      return undefined;
    }

    findMoveConflict(path: string, mode: 'exact' | 'prefix' | 'overlap'): Location | undefined {
      return this.findMoveConflictInfo(path, mode)?.location;
    }

    clearMovedPath(path: string, includeDescendants: boolean): boolean {
      const base = path.split('.')[0];
      if (this.locals.has(base)) {
        for (const key of Array.from(this.moved.keys())) {
          if (key === path || (includeDescendants && isMovePrefix(path, key))) {
            this.moved.delete(key);
          }
        }
        return true;
      }
      return this.parent?.clearMovedPath(path, includeDescendants) ?? false;
    }

    clearBorrows() {
      this.borrowedMut.clear();
      this.borrowedShared.clear();
    }
  }

class DefiniteAssignment {
  private assigned = new Map<Scope, Set<string>>();

  clone(): DefiniteAssignment {
    const next = new DefiniteAssignment();
    for (const [scope, names] of this.entries()) {
      next.assigned.set(scope, new Set(names));
    }
    return next;
  }

  define(scope: Scope, name: string, isAssigned: boolean) {
    const set = this.assigned.get(scope) ?? new Set<string>();
    if (isAssigned) set.add(name);
    this.assigned.set(scope, set);
  }

  assign(scope: Scope, name: string) {
    const set = this.assigned.get(scope) ?? new Set<string>();
    set.add(name);
    this.assigned.set(scope, set);
  }

  isAssigned(scope: Scope, name: string): boolean {
    const set = this.assigned.get(scope);
    return !!set && set.has(name);
  }

  mergeFromBranches(branches: DefiniteAssignment[]) {
    for (const [scope, names] of this.entries()) {
      const intersection = new Set<string>();
      for (const name of names) {
        if (branches.every((branch) => branch.isAssigned(scope, name))) {
          intersection.add(name);
        }
      }
      this.assigned.set(scope, intersection);
    }
  }

  private *entries(): IterableIterator<[Scope, Set<string>]> {
    for (const [scope, names] of this.assigned.entries()) {
      yield [scope, names];
    }
  }
}

function findDefScope(scope: Scope | undefined, name: string): Scope | null {
  let current = scope;
  while (current) {
    if (current.locals.has(name)) return current;
    current = current.parent;
  }
  return null;
}

function collectUnusedBindings(scope: Scope, diagnostics: Diagnostic[], fallbackLocation?: Location) {
  for (const [name, location] of scope.locals.entries()) {
    if (name.startsWith('_')) continue;
    if (!scope.reads.has(name)) {
      const detail = scope.writes.has(name) ? ' (assigned but never read)' : '';
      diagnostics.push(diagAt(`Unused binding '${name}'${detail}`, location ?? fallbackLocation, 'warning'));
    }
  }
  for (const child of scope.children) {
    collectUnusedBindings(child, diagnostics, fallbackLocation);
  }
}

function collectUnusedBindingsLocal(scope: Scope, diagnostics: Diagnostic[], fallbackLocation?: Location) {
  for (const [name, location] of scope.locals.entries()) {
    if (name.startsWith('_')) continue;
    if (!scope.reads.has(name)) {
      const detail = scope.writes.has(name) ? ' (assigned but never read)' : '';
      diagnostics.push(diagAt(`Unused binding '${name}'${detail}`, location ?? fallbackLocation, 'warning'));
    }
  }
}

function validateRecursiveStructs(
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  options?: { currentUri?: string; recursiveWrappers?: string[] }
) {
  const wrapperList = options?.recursiveWrappers ?? ['Option', 'Box', 'Ref'];
  const wrapperSet = new Set(wrapperList);
  const structs = symbols.list().filter((sym) => sym.kind === 'type' && sym.structFields);
  const visiting = new Set<string>();
  const checked = new Set<string>();

  const checkStruct = (name: string) => {
    if (checked.has(name)) return;
    if (visiting.has(name)) return;
    visiting.add(name);
    const sym = symbols.get(name);
    if (!sym || !sym.structFields) {
      visiting.delete(name);
      checked.add(name);
      return;
    }
    for (const [fieldName, fieldType] of sym.structFields.entries()) {
      const error = hasUnwrappedRecursion(fieldType, name, symbols, new Set(), false, wrapperSet);
      if (error) {
        diagnostics.push(
          diagAt(
            `Recursive field '${fieldName}' on '${name}' must be wrapped in an indirection type (Option/Box/Ref)`,
            sym.location,
            'error',
            'RECURSIVE_STRUCT',
            [
              {
                location: sym.location ?? defaultLocation,
                message: `Suggested fix: wrap '${fieldName}' in ${wrapperList.map((w) => `${w}<${name}>`).join(' / ')}`,
              },
            ]
          )
        );
        break;
      }
    }
    visiting.delete(name);
    checked.add(name);
  };

  for (const sym of structs) {
    checkStruct(sym.name);
  }
}

function collectTraitRegistry(
  program: LuminaProgram,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  options?: AnalyzeOptions
): TraitRegistry {
  const traits = new Map<string, TraitInfo>();
  const implsByKey = new Map<string, ImplInfo>();
  const implsByTrait = new Map<string, ImplInfo[]>();
  const declaredTraitNames = new Set<string>();

  for (const stmt of program.body) {
    if (stmt.type === 'TraitDecl') {
      declaredTraitNames.add(stmt.name);
    }
  }

  const registerTrait = (stmt: LuminaTraitDecl) => {
    if (traits.has(stmt.name)) {
      diagnostics.push(diagAt(`Trait '${stmt.name}' already defined`, stmt.location, 'error', 'TRAIT-001'));
      return;
    }
    const traitTypeParams = normalizeTypeParamsForRegistry(
      stmt.typeParams,
      symbols,
      diagnostics,
      stmt.location,
      undefined,
      declaredTraitNames
    );
    const traitTypeParamSet = new Set(traitTypeParams.map((param) => param.name));
    const methods = new Map<string, TraitMethodSig>();
    const associatedTypes = new Map<string, TraitAssocTypeInfo>();
    const superTraits: LuminaType[] = [];

    for (const superTrait of stmt.superTraits ?? []) {
      const known = ensureKnownType(superTrait, symbols, traitTypeParamSet, diagnostics, stmt.location, declaredTraitNames, true);
      const resolved = resolveTypeExpr(superTrait) ?? 'any';
      if (known === 'unknown') {
        diagnostics.push(
          diagAt(
            `Unknown supertrait '${resolved}' for trait '${stmt.name}'`,
            stmt.location,
            'error',
            'TRAIT-014'
          )
        );
        continue;
      }
      superTraits.push(resolved);
    }

    for (const assoc of stmt.associatedTypes ?? []) {
      if (associatedTypes.has(assoc.name)) {
        diagnostics.push(
          diagAt(
            `Duplicate associated type '${assoc.name}' in trait '${stmt.name}'`,
            assoc.location ?? stmt.location,
            'error',
            'TRAIT-010'
          )
        );
        continue;
      }
      const defaultType = assoc.typeName ? resolveTypeExpr(assoc.typeName) : null;
      if (assoc.typeName) {
        const known = ensureKnownType(
          assoc.typeName,
          symbols,
          traitTypeParamSet,
          diagnostics,
          assoc.location ?? stmt.location,
          declaredTraitNames,
          true
        );
        if (known === 'unknown') {
          diagnostics.push(
            diagAt(
              `Unknown type '${defaultType ?? 'unknown'}' in associated type '${assoc.name}'`,
              assoc.location ?? stmt.location
            )
          );
        }
      }
      associatedTypes.set(assoc.name, { name: assoc.name, defaultType, location: assoc.location });
    }
    for (const method of stmt.methods) {
      if (methods.has(method.name)) {
        diagnostics.push(
          diagAt(
            `Duplicate method '${method.name}' in trait '${stmt.name}'`,
            method.location ?? stmt.location,
            'error',
            'TRAIT-007'
          )
        );
        continue;
      }
      const sig = buildTraitMethodSignature(method, traitTypeParamSet, symbols, diagnostics, declaredTraitNames);
      methods.set(method.name, sig);
    }
    traits.set(stmt.name, {
      name: stmt.name,
      typeParams: traitTypeParams,
      superTraits,
      methods,
      associatedTypes,
      visibility: stmt.visibility ?? 'private',
      location: stmt.location,
      uri: options?.currentUri,
    });
  };

  const registerImpl = (stmt: LuminaImplDecl) => {
    const traitType = resolveTypeExpr(stmt.traitType);
    if (!traitType) {
      diagnostics.push(diagAt(`Invalid trait type in impl`, stmt.location, 'error', 'TRAIT-002'));
      return;
    }
    const traitParsed = parseTypeName(traitType);
    if (!traitParsed) {
      diagnostics.push(diagAt(`Invalid trait type '${traitType}' in impl`, stmt.location, 'error', 'TRAIT-002'));
      return;
    }
    const traitName = traitParsed.base;
    const traitInfo = traits.get(traitName);
    if (!traitInfo) {
      diagnostics.push(diagAt(`Unknown trait '${traitName}'`, stmt.location, 'error', 'TRAIT-002'));
      return;
    }

    const implTypeParams = normalizeTypeParamsForRegistry(
      stmt.typeParams,
      symbols,
      diagnostics,
      stmt.location,
      undefined,
      declaredTraitNames
    );
    const implTypeParamSet = new Set(implTypeParams.map((param) => param.name));

    if (traitInfo.typeParams.length !== traitParsed.args.length) {
      diagnostics.push(
        diagAt(
          `Trait '${traitName}' expects ${traitInfo.typeParams.length} type argument${traitInfo.typeParams.length === 1 ? '' : 's'}`,
          stmt.location,
          'error',
          'TRAIT-006'
        )
      );
    }

    for (const arg of traitParsed.args) {
      const known = ensureKnownType(arg, symbols, implTypeParamSet, diagnostics, stmt.location);
      if (known === 'unknown') {
        diagnostics.push(diagAt(`Unknown type '${arg}' in impl for '${traitName}'`, stmt.location));
      }
    }

    const forType = resolveTypeExpr(stmt.forType) ?? 'any';
    const knownForType = ensureKnownType(stmt.forType, symbols, implTypeParamSet, diagnostics, stmt.location);
    if (knownForType === 'unknown') {
      diagnostics.push(diagAt(`Unknown type '${forType}' in impl for '${traitName}'`, stmt.location));
    }

    const normalizedTraitType = normalizeTypeForComparison(traitType);
    const normalizedForType = normalizeTypeForComparison(forType);
    const implKey = `${normalizedTraitType}::${normalizedForType}`;
    if (implsByKey.has(implKey)) {
      diagnostics.push(diagAt(`Duplicate impl for '${traitType}' and '${forType}'`, stmt.location, 'error', 'TRAIT-003'));
      return;
    }

    const methods = new Map<string, LuminaFnDecl>();
    for (const method of stmt.methods) {
      if (methods.has(method.name)) {
        diagnostics.push(
          diagAt(
            `Duplicate method '${method.name}' in impl for '${traitName}'`,
            method.location ?? stmt.location,
            'error',
            'TRAIT-008'
          )
        );
        continue;
      }
      methods.set(method.name, method);
    }

    const assocTypes = new Map<string, LuminaType>();
    for (const assoc of stmt.associatedTypes ?? []) {
      if (assocTypes.has(assoc.name)) {
        diagnostics.push(
          diagAt(
            `Duplicate associated type '${assoc.name}' in impl for '${traitName}'`,
            assoc.location ?? stmt.location,
            'error',
            'TRAIT-011'
          )
        );
        continue;
      }
      const known = ensureKnownType(
        assoc.typeName,
        symbols,
        implTypeParamSet,
        diagnostics,
        assoc.location ?? stmt.location,
        declaredTraitNames,
        true
      );
      if (known === 'unknown') {
        diagnostics.push(
          diagAt(`Unknown type '${resolveTypeExpr(assoc.typeName) ?? 'unknown'}' in impl for '${traitName}'`, assoc.location ?? stmt.location)
        );
      }
      assocTypes.set(assoc.name, resolveTypeExpr(assoc.typeName) ?? 'any');
    }

    const mapping = buildTraitTypeMapping(traitInfo, traitParsed.args);
    mapping.set(SELF_TYPE_NAME, forType);

    for (const [name, assoc] of traitInfo.associatedTypes.entries()) {
      if (!assocTypes.has(name)) {
        if (assoc.defaultType) {
          assocTypes.set(name, substituteTypeParams(assoc.defaultType, mapping));
        } else {
          diagnostics.push(
            diagAt(
              `Trait '${traitName}' requires associated type '${name}'`,
              stmt.location,
              'error',
              'TRAIT-012'
            )
          );
        }
      }
    }

    for (const name of assocTypes.keys()) {
      if (!traitInfo.associatedTypes.has(name)) {
        diagnostics.push(
          diagAt(
            `Associated type '${name}' is not declared in trait '${traitName}'`,
            stmt.location,
            'error',
            'TRAIT-013'
          )
        );
      }
    }

    for (const [name, traitMethod] of traitInfo.methods.entries()) {
      const implMethod = methods.get(name);
      if (!implMethod) {
        if (!traitMethod.defaultBody) {
          diagnostics.push(diagAt(`Trait '${traitName}' requires method '${name}'`, stmt.location, 'error', 'TRAIT-004'));
        }
        continue;
      }
      validateImplMethodSignature(
        traitInfo,
        traitMethod,
        implMethod,
        mapping,
        assocTypes,
        implTypeParamSet,
        symbols,
        diagnostics,
        declaredTraitNames
      );
    }

    for (const [name, implMethod] of methods.entries()) {
      if (!traitInfo.methods.has(name)) {
        diagnostics.push(
          diagAt(
            `Method '${name}' is not declared in trait '${traitName}'`,
            implMethod.location ?? stmt.location,
            'error',
            'TRAIT-005'
          )
        );
      }
    }

    const implInfo: ImplInfo = {
      traitName,
      traitType,
      forType,
      typeParams: implTypeParams,
      methods,
      associatedTypes: assocTypes,
      visibility: stmt.visibility ?? 'private',
      location: stmt.location,
      uri: options?.currentUri,
    };
    implsByKey.set(implKey, implInfo);
    const list = implsByTrait.get(traitName) ?? [];
    list.push(implInfo);
    implsByTrait.set(traitName, list);
  };

  for (const stmt of program.body) {
    if (stmt.type === 'TraitDecl') {
      registerTrait(stmt);
    }
  }

  for (const stmt of program.body) {
    if (stmt.type === 'ImplDecl') {
      registerImpl(stmt);
    }
  }

  for (const impl of implsByKey.values()) {
    const trait = traits.get(impl.traitName);
    if (!trait || trait.superTraits.length === 0) continue;
    const traitParsed = parseTypeName(impl.traitType);
    const mapping = new Map<string, LuminaType>();
    if (traitParsed) {
      for (let i = 0; i < trait.typeParams.length; i++) {
        const paramName = trait.typeParams[i]?.name;
        if (!paramName) continue;
        mapping.set(paramName, traitParsed.args[i] ?? 'any');
      }
    }
    for (const superTrait of trait.superTraits) {
      const concreteSuperTrait = substituteTypeParams(superTrait, mapping);
      const requiredKey = `${normalizeTypeForComparison(concreteSuperTrait)}::${normalizeTypeForComparison(impl.forType)}`;
      if (!implsByKey.has(requiredKey)) {
        diagnostics.push(
          diagAt(
            `Impl '${impl.traitType} for ${impl.forType}' requires supertrait impl '${concreteSuperTrait} for ${impl.forType}'`,
            impl.location,
            'error',
            'TRAIT-015'
          )
        );
      }
    }
  }

  return { traits, implsByKey, implsByTrait };
}

function normalizeTypeParamsForRegistry(
  params: Array<{ name: string; bound?: LuminaTypeExpr[] }> | undefined,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  location?: Location,
  parentTypeParams?: Set<string>,
  traitNames?: Set<string>
): Array<{ name: string; bound?: LuminaType[] }> {
  const normalized: Array<{ name: string; bound?: LuminaType[] }> = [];
  if (!params || params.length === 0) return normalized;
  const seen = new Set<string>(parentTypeParams);
  for (const param of params) {
    if (!isValidTypeParam(param.name)) {
      diagnostics.push(diagAt(`Invalid type parameter '${param.name}'`, location));
      continue;
    }
    if (seen.has(param.name)) {
      diagnostics.push(diagAt(`Duplicate type parameter '${param.name}'`, location));
      continue;
    }
    seen.add(param.name);
    const bounds: LuminaType[] = [];
    for (const bound of param.bound ?? []) {
      const known = ensureKnownType(bound, symbols, seen, diagnostics, location, traitNames, true);
      if (known === 'unknown') {
        const resolved = resolveTypeExpr(bound);
        diagnostics.push(diagAt(`Unknown bound '${resolved ?? 'unknown'}' for type parameter '${param.name}'`, location));
        continue;
      }
      bounds.push(resolveTypeExpr(bound) ?? 'any');
    }
    normalized.push({ name: param.name, bound: bounds.length > 0 ? bounds : undefined });
  }
  return normalized;
}

function buildTraitMethodSignature(
  method: LuminaTraitMethod,
  traitTypeParamSet: Set<string>,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  traitNames?: Set<string>
): TraitMethodSig {
  const methodTypeParams = normalizeTypeParamsForRegistry(
    method.typeParams,
    symbols,
    diagnostics,
    method.location,
    traitTypeParamSet,
    traitNames
  );
  const methodTypeParamSet = new Set<string>(traitTypeParamSet);
  methodTypeParamSet.add(SELF_TYPE_NAME);
  for (const param of methodTypeParams) methodTypeParamSet.add(param.name);

  const params: LuminaType[] = [];
  for (const param of method.params) {
    if (!param.typeName) {
      diagnostics.push(
        diagAt(`Trait method '${method.name}' must specify a type for parameter '${param.name}'`, param.location ?? method.location)
      );
      params.push('any');
      continue;
    }
    const known = ensureKnownType(param.typeName, symbols, methodTypeParamSet, diagnostics, param.location ?? method.location);
    if (known === 'unknown') {
      diagnostics.push(
        diagAt(`Unknown type '${resolveTypeExpr(param.typeName) ?? 'unknown'}' in trait '${method.name}'`, param.location ?? method.location)
      );
    }
    params.push(resolveTypeExpr(param.typeName) ?? 'any');
  }

  let returnType: LuminaType = 'void';
  if (method.returnType) {
    const known = ensureKnownType(method.returnType, symbols, methodTypeParamSet, diagnostics, method.location);
    if (known === 'unknown') {
      diagnostics.push(diagAt(`Unknown return type for trait method '${method.name}'`, method.location));
    }
    returnType = resolveTypeExpr(method.returnType) ?? 'any';
  }

  return {
    name: method.name,
    params,
    returnType,
    typeParams: methodTypeParams,
    defaultBody: method.body ?? null,
    location: method.location,
  };
}

function buildTraitTypeMapping(trait: TraitInfo, traitArgs: LuminaType[]): Map<string, LuminaType> {
  const mapping = new Map<string, LuminaType>();
  for (let i = 0; i < trait.typeParams.length; i++) {
    const name = trait.typeParams[i].name;
    const arg = traitArgs[i];
    if (arg) {
      mapping.set(name, arg);
    }
  }
  return mapping;
}

type TraitMethodCandidate = {
  impl: ImplInfo;
  trait: TraitInfo;
  method: TraitMethodSig;
  mapping: Map<string, LuminaType>;
};

function findTraitMethodCandidates(
  registry: TraitRegistry,
  receiverType: LuminaType,
  methodName: string
): TraitMethodCandidate[] {
  const candidates: TraitMethodCandidate[] = [];
  const normalizedReceiver = normalizeTypeForComparison(receiverType);
  for (const impl of registry.implsByKey.values()) {
    if (normalizeTypeForComparison(impl.forType) !== normalizedReceiver) continue;
    const trait = registry.traits.get(impl.traitName);
    if (!trait) continue;
    const method = trait.methods.get(methodName);
    if (!method) continue;
    if (!impl.methods.has(methodName) && !method.defaultBody) continue;
    const parsedTrait = parseTypeName(impl.traitType);
    const mapping = buildTraitTypeMapping(trait, parsedTrait?.args ?? []);
    mapping.set(SELF_TYPE_NAME, receiverType);
    for (const [name, value] of impl.associatedTypes.entries()) {
      mapping.set(`${SELF_TYPE_NAME}::${name}`, value);
    }
    candidates.push({ impl, trait, method, mapping });
  }
  return candidates;
}

function validateImplMethodSignature(
  trait: TraitInfo,
  traitMethod: TraitMethodSig,
  implMethod: LuminaFnDecl,
  traitMapping: Map<string, LuminaType>,
  assocTypes: Map<string, LuminaType>,
  implTypeParamSet: Set<string>,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  traitNames?: Set<string>
) {
  const implMethodTypeParams = normalizeTypeParamsForRegistry(
    implMethod.typeParams,
    symbols,
    diagnostics,
    implMethod.location,
    implTypeParamSet,
    traitNames
  );
  const implMethodTypeParamSet = new Set<string>(implTypeParamSet);
  implMethodTypeParamSet.add(SELF_TYPE_NAME);
  for (const param of implMethodTypeParams) implMethodTypeParamSet.add(param.name);

  if (traitMethod.typeParams.length !== implMethodTypeParams.length) {
    diagnostics.push(
      diagAt(
        `Method '${traitMethod.name}' in impl for '${trait.name}' must declare ${traitMethod.typeParams.length} type parameter${traitMethod.typeParams.length === 1 ? '' : 's'}`,
        implMethod.location,
        'error',
        'TRAIT-006'
      )
    );
  }

  const fullMapping = new Map<string, LuminaType>(traitMapping);
  for (const [name, value] of assocTypes.entries()) {
    fullMapping.set(`${SELF_TYPE_NAME}::${name}`, value);
  }
  const expectedParams = traitMethod.params.map((param) => substituteTypeParams(param, fullMapping));
  const expectedReturn = substituteTypeParams(traitMethod.returnType, fullMapping);

  const actualParams: LuminaType[] = [];
  for (const param of implMethod.params) {
    if (!param.typeName) {
      diagnostics.push(
        diagAt(`Impl method '${implMethod.name}' must specify a type for parameter '${param.name}'`, param.location ?? implMethod.location)
      );
      actualParams.push('any');
      continue;
    }
    const known = ensureKnownType(param.typeName, symbols, implMethodTypeParamSet, diagnostics, param.location ?? implMethod.location);
    if (known === 'unknown') {
      diagnostics.push(
        diagAt(`Unknown type '${resolveTypeExpr(param.typeName) ?? 'unknown'}' in impl method '${implMethod.name}'`, param.location ?? implMethod.location)
      );
    }
    const resolvedParam = resolveTypeExpr(param.typeName) ?? 'any';
    const actualParam = substituteTypeParams(resolvedParam, fullMapping);
    actualParams.push(actualParam);
  }

  const resolvedReturn = implMethod.returnType ? resolveTypeExpr(implMethod.returnType) ?? 'any' : 'void';
  const actualReturn = substituteTypeParams(resolvedReturn, fullMapping);

  if (expectedParams.length !== actualParams.length) {
    diagnostics.push(
      diagAt(
        `Method '${traitMethod.name}' in impl for '${trait.name}' has ${actualParams.length} parameter${actualParams.length === 1 ? '' : 's'}, expected ${expectedParams.length}`,
        implMethod.location,
        'error',
        'TRAIT-006'
      )
    );
    return;
  }

  for (let i = 0; i < expectedParams.length; i++) {
    if (!areTypesEquivalent(expectedParams[i], actualParams[i])) {
      diagnostics.push(
        diagAt(
          `Method '${traitMethod.name}' in impl for '${trait.name}' has incompatible parameter type '${formatTypeForDiagnostic(actualParams[i])}' (expected '${formatTypeForDiagnostic(expectedParams[i])}')`,
          implMethod.location,
          'error',
          'TRAIT-006'
        )
      );
    }
  }

  if (!areTypesEquivalent(expectedReturn, actualReturn)) {
    diagnostics.push(
      diagAt(
        `Method '${traitMethod.name}' in impl for '${trait.name}' has return type '${formatTypeForDiagnostic(actualReturn)}' (expected '${formatTypeForDiagnostic(expectedReturn)}')`,
        implMethod.location,
        'error',
        'TRAIT-006'
      )
    );
  }
}

function hasUnwrappedRecursion(
  typeName: LuminaType,
  target: string,
  symbols: SymbolTable,
  seen: Set<string>,
  inWrapper: boolean,
  wrapperSet: Set<string>
): boolean {
  const parsed = parseTypeName(typeName);
  if (!parsed) {
    if (typeName === target) return !inWrapper;
    const sym = symbols.get(typeName);
    if (!sym || !sym.structFields) return false;
    const key = `${typeName}|${inWrapper ? 'w' : 'u'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const field of sym.structFields.values()) {
      if (hasUnwrappedRecursion(field, target, symbols, seen, inWrapper, wrapperSet)) return true;
    }
    return false;
  }

  if (parsed.base === target) {
    return !inWrapper;
  }

  const wrapped = inWrapper || wrapperSet.has(parsed.base);
  if (parsed.args.length > 0) {
    for (const arg of parsed.args) {
      if (hasUnwrappedRecursion(arg, target, symbols, seen, wrapped, wrapperSet)) return true;
    }
    return false;
  }

  const sym = symbols.get(parsed.base);
  if (!sym || !sym.structFields) return false;
  const key = `${parsed.base}|${wrapped ? 'w' : 'u'}`;
  if (seen.has(key)) return false;
  seen.add(key);
  for (const field of sym.structFields.values()) {
    if (hasUnwrappedRecursion(field, target, symbols, seen, wrapped, wrapperSet)) return true;
  }
  return false;
}

function ensureKnownType(
  typeName: LuminaTypeExpr,
  symbols: SymbolTable,
  typeParams: Set<string>,
  diagnostics: Diagnostic[],
  location?: Location,
  traitNames?: Set<string>,
  allowTraits = false
): 'ok' | 'missingTypeArgs' | 'unknown' {
  const resolved = resolveTypeExpr(typeName);
  if (!resolved) return 'unknown';
  const parsed = parseTypeName(resolved);
  if (parsed && parsed.args.length === 0 && !typeParams.has(parsed.base)) {
    const sym = symbols.get(parsed.base);
    if (sym?.kind === 'type' && sym.typeParams && sym.typeParams.length > 0) {
      diagnostics.push(diagAt(`Missing type arguments for generic type '${parsed.base}'`, location));
      return 'missingTypeArgs';
    }
  }
  return isKnownType(resolved, symbols, typeParams, traitNames, allowTraits) ? 'ok' : 'unknown';
}

function isKnownType(
  typeName: LuminaType,
  symbols: SymbolTable,
  typeParams: Set<string>,
  traitNames?: Set<string>,
  allowTraits = false
): boolean {
  if (isErrorTypeName(typeName)) return true;
  if (builtinTypes.has(typeName)) return true;
  if (typeParams.has(typeName)) return true;
  const parsed = parseTypeName(typeName);
  if (!parsed) return false;
  if (parsed.base === 'Array') {
    if (parsed.args.length !== 2) return false;
    if (!isKnownType(parsed.args[0], symbols, typeParams, traitNames, allowTraits)) return false;
    return isKnownConstTypeArg(parsed.args[1], typeParams);
  }
  const assoc = parseAssociatedType(parsed.base);
  if (assoc && typeParams.has(assoc.owner)) return true;
  if (allowTraits && traitNames?.has(parsed.base)) {
    for (const arg of parsed.args) {
      if (!isKnownType(arg, symbols, typeParams, traitNames, allowTraits)) return false;
    }
    return true;
  }
  if (parsed.base === 'Promise') {
    if (parsed.args.length !== 1) return false;
    return isKnownType(parsed.args[0], symbols, typeParams, traitNames, allowTraits);
  }
  if (typeParams.has(parsed.base)) return true;
  const sym = symbols.get(parsed.base);
  if (sym?.kind !== 'type') return false;
  if (sym.typeParams && sym.typeParams.length > 0 && parsed.args.length === 0) {
    return false;
  }
  if (sym.typeParams && parsed.args.length > 0) {
    if (sym.typeParams.length !== parsed.args.length) return false;
    for (let i = 0; i < sym.typeParams.length; i++) {
      const boundList = sym.typeParams[i].bound ?? [];
      for (const bound of boundList) {
        if (!isTypeAssignable(parsed.args[i], bound, symbols)) return false;
      }
    }
  }
  for (const arg of parsed.args) {
    if (isKnownType(arg, symbols, typeParams, traitNames, allowTraits)) continue;
    if (isKnownConstTypeArg(arg, typeParams)) continue;
    return false;
  }
  return true;
}

function isKnownConstTypeArg(arg: string, typeParams: Set<string>): boolean {
  const expr = parseConstExprText(arg);
  if (!expr) return false;
  const visit = (node: TypeConstExpr): boolean => {
    switch (node.kind) {
      case 'const-literal':
        return true;
      case 'const-param':
        return typeParams.has(node.name);
      case 'const-binary':
        return visit(node.left) && visit(node.right);
      default:
        return false;
    }
  };
  return visit(expr);
}

function parseAssociatedType(base: string): { owner: string; name: string } | null {
  const idx = base.indexOf('::');
  if (idx === -1) return null;
  return { owner: base.slice(0, idx), name: base.slice(idx + 2) };
}

function parseTypeName(typeName: string): { base: string; args: string[] } | null {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf('<');
  if (idx === -1) return { base: trimmed, args: [] };
  if (!trimmed.endsWith('>')) return null;
  const base = trimmed.slice(0, idx);
  const inner = trimmed.slice(idx + 1, -1);
  const args = splitTypeArgs(inner);
  return { base, args };
}

function hmKey(location?: Location): string | null {
  if (!location?.start) return null;
  return `${location.start.line}:${location.start.column}:${location.start.offset}`;
}

function hmTypeToLuminaType(type: import('./types.js').Type): LuminaType | null {
  if (type.kind === 'primitive') return normalizeTypeNameForDisplay(type.name);
  if (type.kind === 'promise') {
    const inner = hmTypeToLuminaType(type.inner) ?? 'any';
    return `Promise<${inner}>`;
  }
  if (type.kind === 'adt') {
    if (!type.params.length) return type.name;
    const args = type.params.map((param) => hmTypeToLuminaType(param) ?? 'any');
    return `${type.name}<${args.join(',')}>`;
  }
  if (type.kind === 'function') {
    return hmTypeToLuminaType(type.returnType);
  }
  if (type.kind === 'row') {
    return 'any';
  }
  return null;
}

function hmTypeToDisplay(type: import('./types.js').Type): string {
  if (type.kind === 'primitive') return normalizeTypeNameForDisplay(type.name);
  if (type.kind === 'variable') return `T${type.id}`;
  if (type.kind === 'promise') {
    return `Promise<${hmTypeToDisplay(type.inner)}>`;
  }
  if (type.kind === 'adt') {
    if (!type.params.length) return type.name;
    const args = type.params.map((param) => hmTypeToDisplay(param)).join(', ');
    return `${type.name}<${args}>`;
  }
  if (type.kind === 'row') {
    const fields = Array.from(type.fields.entries()).map(
      ([name, value]) => `${name}: ${hmTypeToDisplay(value)}`
    );
    const tail = type.tail ? hmTypeToDisplay(type.tail) : null;
    if (tail) {
      return `{ ${fields.join(', ')} | ${tail} }`;
    }
    return `{ ${fields.join(', ')} }`;
  }
  if (type.kind === 'function') {
    const args = type.args.map((arg) => hmTypeToDisplay(arg)).join(', ');
    const ret = hmTypeToDisplay(type.returnType);
    return `fn(${args}) -> ${ret}`;
  }
  return 'any';
}

function splitTypeArgs(input: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') depth++;
    if (ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function isValidTypeParam(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function isTraitBound(bound: LuminaType, registry?: TraitRegistry): boolean {
  if (!registry) return false;
  const parsed = parseTypeName(normalizeTypeForComparison(bound));
  if (!parsed) return false;
  return registry.traits.has(parsed.base);
}

function satisfiesTraitBound(actual: LuminaType, bound: LuminaType, registry?: TraitRegistry): boolean {
  if (!registry) return false;
  const actualNorm = normalizeTypeForComparison(actual);
  const boundNorm = normalizeTypeForComparison(bound);
  const parsedBound = parseTypeName(boundNorm);
  if (!parsedBound) return false;
  const traitName = parsedBound.base;
  if (!registry.traits.has(traitName)) return false;
  if (parsedBound.args.length === 0) {
    const impls = registry.implsByTrait.get(traitName) ?? [];
    return impls.some((impl) => normalizeTypeForComparison(impl.forType) === actualNorm);
  }
  const implKey = `${boundNorm}::${actualNorm}`;
  return registry.implsByKey.has(implKey);
}

function isImplicitlySendType(typeName: LuminaType, symbols: SymbolTable, seen: Set<string> = new Set()): boolean {
  const normalized = normalizeTypeForComparison(typeName);
  if (normalized === ERROR_TYPE) return true;
  if (normalized === 'any') return false;
  if (normalized === 'string' || normalized === 'bool' || normalized === 'void') return true;
  if (isIntTypeName(normalized) || isFloatTypeName(normalized)) return true;

  const parsed = parseTypeName(normalized);
  if (!parsed) return false;

  if (
    parsed.base === 'Thread' ||
    parsed.base === 'ThreadHandle' ||
    parsed.base === 'Mutex' ||
    parsed.base === 'Semaphore' ||
    parsed.base === 'AtomicI32' ||
    parsed.base === 'Promise'
  ) {
    return false;
  }

  if (parsed.base === 'Sender' || parsed.base === 'Receiver') {
    return parsed.args.every((arg) => {
      const normalizedArg = normalizeTypeForComparison(arg);
      if (normalizedArg === 'any') return true;
      return isImplicitlySendType(arg, symbols, seen);
    });
  }

  if (
    parsed.base === 'Vec' ||
    parsed.base === 'List' ||
    parsed.base === 'Deque' ||
    parsed.base === 'PriorityQueue' ||
    parsed.base === 'HashSet' ||
    parsed.base === 'BTreeSet' ||
    parsed.base === 'Option'
  ) {
    return parsed.args.every((arg) => isImplicitlySendType(arg, symbols, seen));
  }

  if (parsed.base === 'HashMap' || parsed.base === 'BTreeMap' || parsed.base === 'Result') {
    return parsed.args.every((arg) => isImplicitlySendType(arg, symbols, seen));
  }

  if (parsed.args.length === 0 && isValidTypeParam(parsed.base) && !symbols.has(parsed.base)) {
    return true;
  }

  const key = `${parsed.base}<${parsed.args.join(',')}>`;
  if (seen.has(key)) return true;
  seen.add(key);

  const sym = symbols.get(parsed.base);
  if (!sym || sym.kind !== 'type') return false;

  const mapping = new Map<string, LuminaType>();
  const typeParams = sym.typeParams ?? [];
  for (let i = 0; i < typeParams.length; i += 1) {
    const name = typeParams[i]?.name;
    if (!name) continue;
    mapping.set(name, parsed.args[i] ?? 'any');
  }

  if (sym.structFields) {
    for (const field of sym.structFields.values()) {
      const concrete = substituteTypeParams(field, mapping);
      if (!isImplicitlySendType(concrete, symbols, seen)) return false;
    }
    return true;
  }

  if (sym.enumVariants) {
    for (const variant of sym.enumVariants) {
      for (const param of variant.params) {
        const concrete = substituteTypeParams(param, mapping);
        if (!isImplicitlySendType(concrete, symbols, seen)) return false;
      }
    }
    return true;
  }

  return true;
}

function isTypeAssignable(
  actual: LuminaType,
  expected: LuminaType,
  symbols: SymbolTable,
  typeParams?: Map<string, LuminaType | undefined>
): boolean {
  const actualNorm = normalizeTypeForComparison(actual);
  const expectedNorm = normalizeTypeForComparison(expected);
  if (actualNorm === ERROR_TYPE || expectedNorm === ERROR_TYPE) return true;
  if (actualNorm === expectedNorm) return true;
  if (expectedNorm === 'any') return true;
  if (actualNorm === 'any') return true;
  if (typeParams && typeParams.has(expectedNorm)) return true;
  const actualParsed = parseTypeName(actualNorm);
  const expectedParsed = parseTypeName(expectedNorm);
  if (!actualParsed || !expectedParsed) return false;
  if (actualParsed.base !== expectedParsed.base) return false;
  if (actualParsed.args.length !== expectedParsed.args.length) return false;
  for (let i = 0; i < actualParsed.args.length; i++) {
    if (!isTypeAssignable(actualParsed.args[i], expectedParsed.args[i], symbols, typeParams)) return false;
  }
  return true;
}

function parseConstExprText(text: string): TypeConstExpr | null {
  const tokens = text.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[()+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;
  let index = 0;

  const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
  const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);

  const parsePrimary = (): TypeConstExpr | null => {
    const token = consume();
    if (!token) return null;
    if (/^\d+$/.test(token)) return { kind: 'const-literal', value: Number(token) };
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return { kind: 'const-param', name: token };
    if (token === '(') {
      const expr = parseAddSub();
      if (peek() !== ')') return null;
      consume();
      return expr;
    }
    return null;
  };

  const parseMulDiv = (): TypeConstExpr | null => {
    let left = parsePrimary();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '*' && op !== '/') break;
      consume();
      const right = parsePrimary();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parseAddSub = (): TypeConstExpr | null => {
    let left = parseMulDiv();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '+' && op !== '-') break;
      consume();
      const right = parseMulDiv();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parsed = parseAddSub();
  if (!parsed) return null;
  if (index !== tokens.length) return null;
  return parsed;
}

function evaluateConstExprText(text: string, bindings: Map<string, number>): number | null {
  const expr = parseConstExprText(text);
  if (!expr) return null;
  const evaluator = new ConstEvaluator();
  for (const [name, value] of bindings.entries()) evaluator.bind(name, value);
  return evaluator.evaluate(expr);
}

function unifyTypes(paramType: LuminaType, argType: LuminaType, mapping: Map<string, LuminaType>) {
  const paramNorm = normalizeTypeForComparison(paramType);
  const argNorm = normalizeTypeForComparison(argType);
  const paramParsed = parseTypeName(paramNorm);
  const argParsed = parseTypeName(argNorm);
  if (!paramParsed || !argParsed) return;

  if (mapping.has(paramParsed.base)) {
    return;
  }
  if (isValidTypeParam(paramParsed.base) && paramParsed.args.length === 0) {
    mapping.set(paramParsed.base, argNorm as LuminaType);
    return;
  }
  if (paramParsed.base !== argParsed.base) return;
  for (let i = 0; i < Math.min(paramParsed.args.length, argParsed.args.length); i++) {
    unifyTypes(paramParsed.args[i], argParsed.args[i], mapping);
  }
}

function substituteTypeParams(typeName: LuminaType, mapping: Map<string, LuminaType>): LuminaType {
  const parsed = parseTypeName(typeName);
  if (!parsed) return typeName;
  if (mapping.has(parsed.base) && parsed.args.length === 0) {
    return mapping.get(parsed.base) as LuminaType;
  }
  if (parsed.args.length === 0) return parsed.base;
  const args = parsed.args.map((arg) => substituteTypeParams(arg, mapping));
  return `${parsed.base}<${args.join(',')}>`;
}

function extractNumericConstBindings(mapping: Map<string, LuminaType>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, value] of mapping.entries()) {
    const text = String(value).trim();
    if (/^-?\d+$/.test(text)) out.set(key, Number(text));
  }
  return out;
}

function substituteConstParamsInType(typeName: LuminaType, mapping: Map<string, LuminaType>): LuminaType {
  const parsed = parseTypeName(typeName);
  if (!parsed) return typeName;
  if (parsed.args.length === 0) return parsed.base;

  const substitutedArgs = parsed.args.map((arg) => substituteTypeParams(arg, mapping));
  if (parsed.base === 'Array' && substitutedArgs.length >= 2) {
    const numericBindings = extractNumericConstBindings(mapping);
    const evaluated = evaluateConstExprText(substitutedArgs[1], numericBindings);
    if (evaluated !== null) substitutedArgs[1] = String(evaluated);
  }
  return `${parsed.base}<${substitutedArgs.join(',')}>`;
}

type CfgNode = { id: number; label: string };

function buildCfgDot(functionName: string, body: LuminaStatement[]): string {
  const nodes: CfgNode[] = [];
  const edges: Array<[number, number]> = [];
  let nextId = 0;

  const addNode = (label: string): number => {
    const id = nextId++;
    nodes.push({ id, label });
    return id;
  };

  const addEdge = (from: number | null, to: number | null) => {
    if (from === null || to === null) return;
    edges.push([from, to]);
  };

  const buildSequence = (stmts: LuminaStatement[]): { entry: number | null; exit: number | null } => {
    let entry: number | null = null;
    let last: number | null = null;
    for (const stmt of stmts) {
      const { entry: e, exit: x } = buildStmt(stmt);
      if (entry === null) entry = e;
      if (last !== null && e !== null) addEdge(last, e);
      last = x ?? last;
    }
    return { entry, exit: last };
  };

  const buildStmt = (stmt: LuminaStatement): { entry: number | null; exit: number | null } => {
    switch (stmt.type) {
      case 'If': {
        const cond = addNode('If');
        const thenSeq = buildSequence(stmt.thenBlock.body);
        const elseSeq = stmt.elseBlock ? buildSequence(stmt.elseBlock.body) : { entry: null, exit: null };
        addEdge(cond, thenSeq.entry ?? cond);
        addEdge(cond, elseSeq.entry ?? cond);
        const exit = addNode('IfEnd');
        addEdge(thenSeq.exit ?? cond, exit);
        addEdge(elseSeq.exit ?? cond, exit);
        return { entry: cond, exit };
      }
      case 'While': {
        const cond = addNode('While');
        const bodySeq = buildSequence(stmt.body.body);
        addEdge(cond, bodySeq.entry ?? cond);
        addEdge(bodySeq.exit ?? cond, cond);
        const exit = addNode('WhileEnd');
        addEdge(cond, exit);
        return { entry: cond, exit };
      }
      case 'For': {
        const cond = addNode('For');
        const bodySeq = buildSequence(stmt.body.body);
        addEdge(cond, bodySeq.entry ?? cond);
        addEdge(bodySeq.exit ?? cond, cond);
        const exit = addNode('ForEnd');
        addEdge(cond, exit);
        return { entry: cond, exit };
      }
      case 'WhileLet': {
        const cond = addNode('WhileLet');
        const bodySeq = buildSequence(stmt.body.body);
        addEdge(cond, bodySeq.entry ?? cond);
        addEdge(bodySeq.exit ?? cond, cond);
        const exit = addNode('WhileLetEnd');
        addEdge(cond, exit);
        return { entry: cond, exit };
      }
      case 'MatchStmt': {
        const cond = addNode('Match');
        const armExits: number[] = [];
        for (const arm of stmt.arms) {
          const armSeq = buildSequence(arm.body.body);
          addEdge(cond, armSeq.entry ?? cond);
          if (armSeq.exit !== null) armExits.push(armSeq.exit);
        }
        const exit = addNode('MatchEnd');
        for (const ex of armExits) addEdge(ex, exit);
        if (armExits.length === 0) addEdge(cond, exit);
        return { entry: cond, exit };
      }
      case 'Block': {
        return buildSequence(stmt.body);
      }
      case 'ErrorNode':
        return { entry: null, exit: null };
      default: {
        const id = addNode(stmt.type);
        return { entry: id, exit: id };
      }
    }
  };

  const seq = buildSequence(body);
  if (seq.entry === null) {
    const empty = addNode('Empty');
    seq.entry = empty;
    seq.exit = empty;
  }

  const lines = [`digraph ${functionName}_cfg {`];
  for (const node of nodes) {
    lines.push(`  n${node.id} [label="${node.label}"];`);
  }
  for (const [from, to] of edges) {
    lines.push(`  n${from} -> n${to};`);
  }
  lines.push('}');
  return lines.join('\n');
}
