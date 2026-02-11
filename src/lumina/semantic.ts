import { type Location } from '../utils/index.js';
import { type Diagnostic, type DiagnosticRelatedInformation } from '../parser/index.js';
import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaType } from './ast.js';
import { inferProgram } from './hm-infer.js';
import {
  createStdModuleRegistry,
  getPreludeExports,
  resolveModuleBindings,
  type ModuleExport,
  type ModuleRegistry,
} from './module-registry.js';
import { normalizeDiagnostic } from './diagnostics-util.js';

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type?: LuminaType;
  pendingReturn?: boolean;
  location?: Location;
  mutable?: boolean;
  visibility?: 'public' | 'private';
  extern?: boolean;
  uri?: string;
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  paramTypes?: LuminaType[];
  paramNames?: string[];
  paramRefs?: boolean[];
  externModule?: string | null;
  enumVariants?: Array<{ name: string; params: LuminaType[] }>;
  enumName?: string;
  structFields?: Map<string, LuminaType>;
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

const builtinTypes: Set<LuminaType> = new Set(['int', 'string', 'bool', 'void', 'any']);

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

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

const getLValueBaseName = (expr: LuminaExpr): string | null => {
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type !== 'Member') return null;
  let current: LuminaExpr = expr.object;
  while (current.type === 'Member') {
    current = current.object;
  }
  return current.type === 'Identifier' ? current.name : null;
};

export function analyzeLumina(
  program: LuminaProgram,
  options?: {
    externSymbols?: (name: string) => SymbolInfo | undefined;
    currentUri?: string;
    typeParams?: Map<string, LuminaType | undefined>;
    externalSymbols?: SymbolInfo[];
    importedNames?: Set<string>;
    moduleRegistry?: ModuleRegistry;
    moduleBindings?: Map<string, ModuleExport>;
    preludeExports?: ModuleExport[];
    diDebug?: boolean;
    skipFunctionBodies?: Set<string>;
    cachedFunctionReturns?: Map<string, LuminaType>;
    indexingOnly?: boolean;
    recursiveWrappers?: string[];
    useHm?: boolean;
    hmSourceText?: string;
    hmInferred?: {
      letTypes: Map<string, LuminaType>;
      fnReturns: Map<string, LuminaType>;
      fnByName: Map<string, LuminaType>;
      fnParams: Map<string, LuminaType[]>;
    };
  }
) {
  const diagnostics: Diagnostic[] = [];
  const symbols = new SymbolTable();
  const pendingDeps = new Map<string, Set<string>>();
  const diGraphs = new Map<string, string>();
  let activeOptions = options;
  const moduleRegistry = options?.moduleRegistry ?? createStdModuleRegistry();
  const moduleBindings = options?.moduleBindings ?? resolveModuleBindings(program, moduleRegistry);
  const preludeExports = options?.preludeExports ?? getPreludeExports(moduleRegistry);
  activeOptions = { ...options, moduleBindings };

  for (const t of builtinTypes) symbols.define({ name: t, kind: 'type', type: t });

  if (options?.externalSymbols) {
    for (const sym of options.externalSymbols) {
      if (options.currentUri && sym.uri && sym.uri === options.currentUri) continue;
      if (options.importedNames && !options.importedNames.has(sym.name)) continue;
      if (!symbols.has(sym.name)) {
        symbols.define(sym);
      }
    }
  }

  for (const exp of preludeExports) {
    if (exp.kind !== 'function') continue;
    if (!symbols.has(exp.name)) {
      symbols.define({
        name: exp.name,
        kind: 'function',
        type: exp.returnType,
        paramTypes: exp.paramTypes,
        paramNames: exp.paramNames,
        extern: true,
        visibility: 'public',
      });
    }
  }

  for (const [name, exp] of moduleBindings.entries()) {
    if (exp.kind !== 'function') continue;
    if (!symbols.has(name)) {
      symbols.define({
        name,
        kind: 'function',
        type: exp.returnType,
        paramTypes: exp.paramTypes,
        paramNames: exp.paramNames,
        extern: true,
        visibility: 'public',
      });
    }
  }

  // Pass 1: register type/function declarations (hoisting)
  for (const stmt of program.body) {
    if (stmt.type === 'ErrorNode') continue;
    if (stmt.type === 'TypeDecl') {
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: stmt.typeParams ?? [],
        extern: stmt.extern ?? false,
        externModule: stmt.externModule ?? null,
      });
    } else if (stmt.type === 'StructDecl') {
      const fields = new Map<string, LuminaType>();
      for (const field of stmt.body) {
        fields.set(field.name, field.typeName);
      }
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: stmt.typeParams ?? [],
        structFields: fields,
      });
    } else if (stmt.type === 'EnumDecl') {
      symbols.define({
        name: stmt.name,
        kind: 'type',
        type: stmt.name,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        uri: options?.currentUri,
        typeParams: stmt.typeParams ?? [],
        enumVariants: stmt.variants.map((v) => ({ name: v.name, params: v.params ?? [] })),
      });
    } else if (stmt.type === 'FnDecl') {
      const cachedReturn = options?.cachedFunctionReturns?.get(stmt.name);
      const hmReturn = options?.hmInferred?.fnByName.get(stmt.name);
      const hmParamTypes = options?.hmInferred?.fnParams.get(stmt.name);
      symbols.define({
        name: stmt.name,
        kind: 'function',
        type: stmt.returnType ?? cachedReturn ?? hmReturn ?? undefined,
        pendingReturn: stmt.returnType == null && cachedReturn == null && hmReturn == null,
        location: stmt.location,
        visibility: stmt.visibility ?? 'private',
        extern: stmt.extern ?? false,
        uri: options?.currentUri,
        typeParams: stmt.typeParams ?? [],
        paramTypes: stmt.params.map((p, idx) => p.typeName ?? hmParamTypes?.[idx] ?? 'any'),
        paramNames: stmt.params.map((p) => p.name),
        paramRefs: stmt.params.map((p) => !!p.ref),
        externModule: stmt.externModule ?? null,
      });
    }
  }

  if (options?.indexingOnly) {
    return { symbols, diagnostics, diGraphs: options?.diDebug ? diGraphs : undefined };
  }

  if (options?.useHm) {
    const hm = inferProgram(program, { moduleRegistry, moduleBindings, preludeExports });
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
    activeOptions = { ...options, hmInferred, moduleBindings };
    for (const diag of hm.diagnostics) {
      const normalized = normalizeDiagnostic(diag, sourceText, sourceFile);
      diagnostics.push({
        code: normalized.code,
        message: normalized.message,
        severity: normalized.severity === 'info' ? 'warning' : normalized.severity,
        location: diag.location ?? defaultLocation,
        source: diag.source ?? 'lumina',
      });
    }
  }

  const rootScope = new Scope();
  const resolving = new Set<string>();

  validateRecursiveStructs(symbols, diagnostics, options);

  // Pass 2: analyze non-function statements so top-level bindings are known.
  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl') continue;
    typeCheckStatement(stmt, symbols, diagnostics, null, rootScope, activeOptions, undefined, resolving, pendingDeps, undefined, undefined);
  }

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
        changed = true;
      } else if (inferred === 'void') {
        symbols.define({ ...sym, type: 'void', pendingReturn: false });
        changed = true;
      }
    }
    const cycles = detectPendingCycles(pendingDeps);
    if (cycles.length > 0) {
      for (const fnName of cycles) {
        diagnostics.push(diagAt(`Recursive inference detected for '${fnName}'`, program.location));
        const sym = symbols.get(fnName);
        if (sym) {
          symbols.define({ ...sym, type: 'any', pendingReturn: false });
        }
      }
      changed = false;
    }
  }

  for (const stmt of program.body) {
    if (stmt.type === 'ErrorNode') continue;
    if (stmt.type === 'FnDecl') {
      if (options?.skipFunctionBodies?.has(stmt.name)) continue;
      resolveFunctionBody(stmt, symbols, diagnostics, activeOptions, resolving, pendingDeps, rootScope, diGraphs);
    }
  }

  collectUnusedBindingsLocal(rootScope, diagnostics, program.location);

  return { symbols, diagnostics, diGraphs: options?.diDebug ? diGraphs : undefined };
}

function resolveFunctionBody(
  stmt: LuminaStatement,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  options: {
    externSymbols?: (name: string) => SymbolInfo | undefined;
    currentUri?: string;
    typeParams?: Map<string, LuminaType | undefined>;
    importedNames?: Set<string>;
    moduleBindings?: Map<string, ModuleExport>;
    diDebug?: boolean;
    skipFunctionBodies?: Set<string>;
    cachedFunctionReturns?: Map<string, LuminaType>;
    useHm?: boolean;
    hmInferred?: {
      letTypes: Map<string, LuminaType>;
      fnReturns: Map<string, LuminaType>;
      fnByName: Map<string, LuminaType>;
      fnParams: Map<string, LuminaType[]>;
    };
  } | undefined,
  resolving: Set<string>,
  pendingDeps: Map<string, Set<string>>,
  parentScope?: Scope,
  diGraphs?: Map<string, string>
): LuminaType | null {
  if (stmt.type !== 'FnDecl') return null;
  if (options?.skipFunctionBodies?.has(stmt.name)) {
    const cached = options.cachedFunctionReturns?.get(stmt.name);
    if (cached) return cached;
    return stmt.returnType ?? null;
  }
      const hmReturn = options?.hmInferred?.fnByName.get(stmt.name) ?? null;
  const ret = stmt.returnType ?? hmReturn ?? null;
  const local = new SymbolTable();
  for (const sym of symbols.list()) {
    local.define(sym);
  }
  const typeParams = new Map<string, LuminaType | undefined>();
  for (const param of stmt.typeParams ?? []) {
    typeParams.set(param.name, param.bound?.[0]);
  }
  const fnScope = new Scope(parentScope);
  const hmParamTypes = options?.hmInferred?.fnParams.get(stmt.name);
  stmt.params.forEach((param, idx) => {
    const inferredParam = param.typeName ?? hmParamTypes?.[idx] ?? null;
    if (!param.typeName && !options?.useHm) {
      diagnostics.push(diagAt(`Missing type annotation for parameter '${param.name}'`, param.location ?? stmt.location));
    }
    const paramType = inferredParam ?? 'any';
    if (param.typeName) {
      const known = ensureKnownType(param.typeName, symbols, new Set(typeParams.keys()), diagnostics, param.location ?? stmt.location);
      if (known === 'unknown') {
        const suggestion = suggestName(param.typeName, collectVisibleTypeSymbols(symbols, options));
        const related = suggestion
          ? [
              {
                location: param.location ?? stmt.location ?? defaultLocation,
                message: `Did you mean '${suggestion}'?`,
              },
            ]
          : undefined;
        diagnostics.push(diagAt(`Unknown type '${param.typeName}' for parameter '${param.name}'`, param.location ?? stmt.location, 'error', 'UNKNOWN_TYPE', related));
      }
    }
    local.define({ name: param.name, kind: 'variable', type: paramType, location: param.location ?? stmt.location });
    fnScope.define(param.name, param.location ?? stmt.location);
  });
  if (stmt.extern) {
    return ret ?? null;
  }
  if (options?.diDebug && diGraphs) {
    diGraphs.set(stmt.name, buildCfgDot(stmt.name, stmt.body.body));
  }
  const collector = ret ? undefined : { types: [] as LuminaType[] };
  const di = new DefiniteAssignment();
  for (const param of stmt.params) {
    di.define(fnScope, param.name, true);
  }
  for (const bodyStmt of stmt.body.body) {
    typeCheckStatement(bodyStmt, local, diagnostics, ret, fnScope, { ...options, typeParams }, collector, resolving, pendingDeps, stmt.name, di);
  }
  collectUnusedBindings(fnScope, diagnostics, stmt.location);
  if (ret) return ret;
  if (pendingDeps.get(stmt.name)?.size) {
    return null;
  }
  if (collector && collector.types.length > 0) {
    const [first, ...rest] = collector.types;
    const mismatch = rest.some((t) => t !== first);
    if (mismatch) {
      diagnostics.push(diagAt(`Inconsistent return types for '${stmt.name}'`, stmt.location));
      return null;
    }
    return first;
  }
  return 'void';
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
  options?: {
    externSymbols?: (name: string) => SymbolInfo | undefined;
    currentUri?: string;
    typeParams?: Map<string, LuminaType | undefined>;
    importedNames?: Set<string>;
    moduleBindings?: Map<string, ModuleExport>;
    useHm?: boolean;
    hmInferred?: {
      letTypes: Map<string, LuminaType>;
      fnReturns: Map<string, LuminaType>;
      fnByName: Map<string, LuminaType>;
      fnParams: Map<string, LuminaType[]>;
    };
  },
  returnCollector?: { types: LuminaType[] },
  resolving?: Set<string>,
  pendingDeps?: Map<string, Set<string>>,
  currentFunction?: string,
  di?: DefiniteAssignment
) {
  switch (stmt.type) {
    case 'ErrorNode':
      diagnostics.push(diagAt(stmt.message ?? 'Invalid syntax', stmt.location));
      return;
    case 'TypeDecl':
      if (stmt.extern) {
        return;
      }
      if (stmt.typeParams && stmt.typeParams.length > 0) {
        for (const param of stmt.typeParams) {
          if (!isValidTypeParam(param.name)) {
            diagnostics.push(diagAt(`Invalid type parameter '${param.name}'`, stmt.location));
          }
          if (param.bound) {
            for (const bound of param.bound) {
              if (!isKnownType(bound, symbols, new Set<string>(stmt.typeParams.map(p => p.name)))) {
                diagnostics.push(diagAt(`Unknown bound '${bound}' for type parameter '${param.name}'`, stmt.location));
              }
            }
          }
        }
      }
      {
        const typeParams = new Map<string, LuminaType | undefined>();
        for (const param of stmt.typeParams ?? []) {
          typeParams.set(param.name, param.bound?.[0]);
        }
        for (const field of stmt.body) {
          const known = ensureKnownType(field.typeName, symbols, new Set(typeParams.keys()), diagnostics, stmt.location);
          if (known === 'unknown') {
            const suggestion = suggestName(field.typeName, collectVisibleTypeSymbols(symbols, options));
            const related = suggestion
              ? [
                  {
                    location: stmt.location ?? defaultLocation,
                    message: `Did you mean '${suggestion}'?`,
                  },
                ]
              : undefined;
            diagnostics.push(diagAt(`Unknown type '${field.typeName}' for field '${field.name}'`, stmt.location, 'error', 'UNKNOWN_TYPE', related));
          }
        }
      }
      return;
    case 'StructDecl': {
      if (stmt.typeParams && stmt.typeParams.length > 0) {
        for (const param of stmt.typeParams) {
          if (!isValidTypeParam(param.name)) {
            diagnostics.push(diagAt(`Invalid type parameter '${param.name}'`, stmt.location));
          }
          if (param.bound) {
            for (const bound of param.bound) {
              if (!isKnownType(bound, symbols, new Set<string>(stmt.typeParams.map(p => p.name)))) {
                diagnostics.push(diagAt(`Unknown bound '${bound}' for type parameter '${param.name}'`, stmt.location));
              }
            }
          }
        }
      }
      {
        const typeParams = new Map<string, LuminaType | undefined>();
        for (const param of stmt.typeParams ?? []) {
          typeParams.set(param.name, param.bound?.[0]);
        }
        for (const field of stmt.body) {
          const known = ensureKnownType(field.typeName, symbols, new Set(typeParams.keys()), diagnostics, stmt.location);
          if (known === 'unknown') {
            const suggestion = suggestName(field.typeName, collectVisibleTypeSymbols(symbols, options));
            const related = suggestion
              ? [
                  {
                    location: stmt.location ?? defaultLocation,
                    message: `Did you mean '${suggestion}'?`,
                  },
                ]
              : undefined;
            diagnostics.push(diagAt(`Unknown type '${field.typeName}' for field '${field.name}'`, stmt.location, 'error', 'UNKNOWN_TYPE', related));
          }
        }
      }
      return;
    }
    case 'EnumDecl': {
      for (const variant of stmt.variants) {
        for (const param of variant.params ?? []) {
          if (!isKnownType(param, symbols, new Set<string>(stmt.typeParams?.map(p => p.name) ?? []))) {
            diagnostics.push(diagAt(`Unknown type '${param}' for enum variant '${variant.name}'`, variant.location ?? stmt.location));
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
      const expectedType = stmt.typeName ?? null;
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
      if (expectedType && valueType && valueType !== expectedType) {
        diagnostics.push(diagAt(`Type mismatch: '${stmt.name}' is '${expectedType}' but value is '${valueType}'`, stmt.location));
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
      if (di) {
        const thenDi = di.clone();
        const elseDi = di.clone();
        const thenScope = new Scope(scope);
        const elseScope = new Scope(scope);
        if (narrowing) {
          if (narrowing.when === 'then') {
            thenScope.narrow(narrowing.name, narrowing.type);
          } else {
            elseScope.narrow(narrowing.name, narrowing.type);
          }
        }
        if (elseNarrow) {
          elseScope.narrow(elseNarrow.name, elseNarrow.type);
        }
        typeCheckStatement(stmt.thenBlock, symbols, diagnostics, currentReturnType, thenScope, options, returnCollector, resolving, pendingDeps, currentFunction, thenDi);
        if (stmt.elseBlock) {
          typeCheckStatement(stmt.elseBlock, symbols, diagnostics, currentReturnType, elseScope, options, returnCollector, resolving, pendingDeps, currentFunction, elseDi);
        }
        di.mergeFromBranches([thenDi, elseDi]);
      } else {
        const thenScope = new Scope(scope);
        const elseScope = new Scope(scope);
        if (narrowing) {
          if (narrowing.when === 'then') {
            thenScope.narrow(narrowing.name, narrowing.type);
          } else {
            elseScope.narrow(narrowing.name, narrowing.type);
          }
        }
        if (elseNarrow) {
          elseScope.narrow(elseNarrow.name, elseNarrow.type);
        }
        typeCheckStatement(stmt.thenBlock, symbols, diagnostics, currentReturnType, thenScope, options, returnCollector, resolving, pendingDeps, currentFunction);
        if (stmt.elseBlock) {
          typeCheckStatement(stmt.elseBlock, symbols, diagnostics, currentReturnType, elseScope, options, returnCollector, resolving, pendingDeps, currentFunction);
        }
      }
      return;
    }
    case 'While': {
      const condType = typeCheckExpr(stmt.condition, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      if (condType && condType !== 'bool') {
        diagnostics.push(diagAt(`While condition must be 'bool'`, stmt.location));
      }
      if (di) {
        const bodyDi = di.clone();
        typeCheckStatement(stmt.body, symbols, diagnostics, currentReturnType, scope, options, returnCollector, resolving, pendingDeps, currentFunction, bodyDi);
      } else {
        typeCheckStatement(stmt.body, symbols, diagnostics, currentReturnType, scope, options, returnCollector, resolving, pendingDeps, currentFunction);
      }
      return;
    }
    case 'Assign': {
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
      const valueType = typeCheckExpr(stmt.value, symbols, diagnostics, scope, options, sym.type, resolving, pendingDeps, currentFunction, di);
      if (scope && di) {
        const defScope = findDefScope(scope, target);
        if (defScope) di.assign(defScope, target);
      }
      if (valueType && sym.type && valueType !== sym.type) {
        diagnostics.push(diagAt(`Type mismatch: '${target}' is '${sym.type}' but value is '${valueType}'`, stmt.location));
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
      if (currentReturnType && valueType && valueType !== currentReturnType) {
        diagnostics.push(diagAt(`Return type '${valueType}' does not match '${currentReturnType}'`, stmt.location));
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
      const blockDi = di ?? undefined;
      for (const bodyStmt of stmt.body) {
        typeCheckStatement(bodyStmt, symbols, diagnostics, currentReturnType, blockScope, options, returnCollector, resolving, pendingDeps, currentFunction, blockDi);
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
      const branchStates: DefiniteAssignment[] = [];
      const matchValueName = stmt.value.type === 'Identifier' ? stmt.value.name : null;
      for (const arm of stmt.arms) {
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
                });
                if (armDi) {
                  armDi.define(armScope, binding, true);
                }
              });
            }
          }
        }
        typeCheckStatement(arm.body, armSymbols, diagnostics, currentReturnType, armScope, options, returnCollector, resolving, pendingDeps, currentFunction, armDi);
        collectUnusedBindings(armScope, diagnostics, arm.location ?? stmt.location);
        if (armDi) branchStates.push(armDi);
      }
      if (di && branchStates.length > 0) {
        di.mergeFromBranches(branchStates);
      }
      if (matchType && (!enumSym || !enumSym.enumVariants)) {
        diagnostics.push(diagAt(`Match expression must be an enum`, stmt.location));
      } else if (!hasWildcard && enumSym?.enumVariants) {
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
    case 'Import':
      return;
  }
}

function typeCheckExpr(
  expr: LuminaExpr,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  scope?: Scope,
  options?: {
    externSymbols?: (name: string) => SymbolInfo | undefined;
    currentUri?: string;
    typeParams?: Map<string, LuminaType | undefined>;
    importedNames?: Set<string>;
    moduleBindings?: Map<string, ModuleExport>;
    useHm?: boolean;
    hmInferred?: {
      letTypes: Map<string, LuminaType>;
      fnReturns: Map<string, LuminaType>;
      fnByName: Map<string, LuminaType>;
      fnParams: Map<string, LuminaType[]>;
    };
  },
  expectedType?: LuminaType,
  resolving?: Set<string>,
  pendingDeps?: Map<string, Set<string>>,
  currentFunction?: string,
  di?: DefiniteAssignment,
  pipedArgType?: LuminaType
): LuminaType | null {
  const formatTypeForDiagnostic = (type: LuminaType | null | undefined): string => {
    if (!type) return 'unknown';
    const parsed = parseTypeName(type);
    if (!parsed) return type;
    if (parsed.args.length === 0) return parsed.base;
    const args = parsed.args.map((arg) => formatTypeForDiagnostic(arg));
    return `${parsed.base}<${args.join(',')}>`;
  };

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
  if (expr.type === 'Number') return 'int';
  if (expr.type === 'Boolean') return 'bool';
  if (expr.type === 'String') return 'string';
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
              if (baseSym?.kind === 'variable' && baseSym.mutable === false) {
                diagnostics.push(
                  diagAt(
                    `'${baseName}' should be mutable when passed by reference`,
                    expr.left.location ?? expr.location,
                    'warning',
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
    if (expr.op === '+' && left === 'string' && right === 'string') return 'string';
    if (expr.op === '&&' || expr.op === '||') {
      if (left !== 'bool' || right !== 'bool') {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires bool operands`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (expr.op === '==' || expr.op === '!=') {
      if (left !== right) {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires matching operand types`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') {
      if (left !== 'int' || right !== 'int') {
        diagnostics.push(diagAt(`Operator '${expr.op}' requires int operands`, expr.location));
        return null;
      }
      return 'bool';
    }
    if (left !== 'int' || right !== 'int') {
      diagnostics.push(diagAt(`Operator '${expr.op}' requires int operands`, expr.location));
      return null;
    }
    return 'int';
  }
    if (expr.type === 'Identifier') {
      const name = expr.name;
      scope?.read(name);
      const narrowed = scope?.lookupNarrowed(name);
      const sym = symbols.get(name) ?? options?.externSymbols?.(name);
      let hmType: LuminaType | null = null;
      if (options?.hmInferred && scope) {
        const defScope = findDefScope(scope, name);
        const defLocation = defScope?.locals.get(name);
        const hmKeyForDef = hmKey(defLocation ?? undefined);
        if (hmKeyForDef) {
          hmType = options.hmInferred.letTypes.get(hmKeyForDef) ?? null;
        }
      }
      if (!sym) {
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
      const defScope = findDefScope(scope, name);
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

      if (expr.enumName) {
        const moduleExport = options?.moduleBindings?.get(expr.enumName);
        if (moduleExport?.kind === 'module') {
          const member = moduleExport.exports.get(callee);
          if (!member || member.kind !== 'function') {
            diagnostics.push(diagAt(`Unknown module member '${expr.enumName}.${callee}'`, expr.location, 'error', 'UNKNOWN_MEMBER'));
            return null;
          }
          const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
          if (member.paramTypes.length !== effectiveArgCount) {
            diagnostics.push(diagAt(`Argument count mismatch for '${expr.enumName}.${callee}'`, expr.location));
            return member.returnType;
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
                    member.paramTypes[i],
                    resolving,
                    pendingDeps,
                    currentFunction,
                    di
                  );
            const expected = member.paramTypes[i];
            if (argType && !isTypeAssignable(argType, expected, symbols, options?.typeParams)) {
              reportCallArgMismatch(
                `${expr.enumName}.${callee}`,
                i,
                expected,
                argType,
                expr.args[pipedArgType ? i - 1 : i]?.location ?? expr.location,
                member.paramNames?.[i] ?? null
              );
            }
          }
          return member.returnType;
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
                if (!isTypeAssignable(value, bound, symbols, options?.typeParams)) {
                  diagnostics.push(
                    diagAt(
                      `Type argument '${value}' does not satisfy bound '${bound}' for '${param.name}'`,
                      expr.location,
                      'error',
                      'BOUND_MISMATCH',
                      [
                        {
                          location: expr.location ?? defaultLocation,
                          message: `Expected: ${bound}, Actual: ${value}`,
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

      scope?.read(callee);
      const sym = symbols.get(callee) ?? options?.externSymbols?.(callee);
      if (!sym || sym.kind !== 'function') {
        const enumVariant = findEnumVariant(symbols, callee, options);
        if (enumVariant) {
          const enumSym = symbols.get(enumVariant.enumName);
          const typeParamDefs = enumSym?.typeParams ?? [];
          const mapping = new Map<string, LuminaType>();
          const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
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
                  if (!isTypeAssignable(value, bound, symbols, options?.typeParams)) {
                    diagnostics.push(
                      diagAt(
                        `Type argument '${value}' does not satisfy bound '${bound}' for '${param.name}'`,
                        expr.location,
                        'error',
                        'BOUND_MISMATCH',
                        [
                          {
                            location: expr.location ?? defaultLocation,
                            message: `Expected: ${bound}, Actual: ${value}`,
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
      if (resolving?.has(callee)) {
        diagnostics.push(diagAt(`Recursive inference detected for '${callee}'`, expr.location));
      }
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
    const effectiveArgCount = expr.args.length + (pipedArgType ? 1 : 0);
    if (paramTypes.length !== effectiveArgCount) {
      diagnostics.push(diagAt(`Argument count mismatch for '${callee}'`, expr.location));
      return sym.type ?? null;
    }

    for (let i = 0; i < effectiveArgCount; i++) {
      const refRequired = paramRefs[i] ?? false;
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
            if (baseSym?.kind === 'variable' && baseSym.mutable === false) {
              diagnostics.push(
                diagAt(
                  `'${baseName}' should be mutable when passed by reference`,
                  argExpr.location ?? expr.location,
                  'warning',
                  'REF_MUT_REQUIRED'
                )
              );
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
          if (!isTypeAssignable(value, bound, symbols, options?.typeParams)) {
            diagnostics.push(
              diagAt(
                `Type argument '${value}' does not satisfy bound '${bound}' for '${param.name}'`,
                expr.location,
                'error',
                'BOUND_MISMATCH',
                [
                  {
                    location: expr.location ?? defaultLocation,
                    message: `Expected: ${bound}, Actual: ${value}`,
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
      const actual = typeCheckExpr(field.value, symbols, diagnostics, scope, options, expected, resolving, pendingDeps, currentFunction, di);
      if (actual) {
        unifyTypes(expected, actual, mapping);
      }
      const resolvedExpected = substituteTypeParams(expected, mapping);
      if (actual && !isTypeAssignable(actual, resolvedExpected, symbols, options?.typeParams)) {
        diagnostics.push(diagAt(`Type mismatch for '${field.name}': expected '${resolvedExpected}', got '${actual}'`, field.location ?? expr.location));
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
      const moduleExport = options?.moduleBindings?.get(expr.object.name);
      if (moduleExport?.kind === 'module') {
        const member = moduleExport.exports.get(expr.property);
        if (member?.kind === 'function') {
          return member.returnType;
        }
        diagnostics.push(diagAt(`Unknown module member '${expr.object.name}.${expr.property}'`, expr.location, 'error', 'UNKNOWN_MEMBER'));
        return null;
      }
      if (options?.importedNames?.has(expr.object.name)) {
        return 'any';
      }
    }
    const objectType = typeCheckExpr(expr.object, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
    if (!objectType) return null;
    const parsed = parseTypeName(objectType);
    const structName = parsed?.base ?? objectType;
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
      const matchType = typeCheckExpr(expr.value, symbols, diagnostics, scope, options, undefined, resolving, pendingDeps, currentFunction, di);
      const parsedMatch = matchType ? parseTypeName(matchType) : null;
      const matchBase = parsedMatch?.base ?? matchType ?? null;
      const enumSym = matchBase ? symbols.get(matchBase) : undefined;
      const variants = enumSym?.enumVariants ?? [];
      const seen = new Set<string>();
      let hasWildcard = false;
      let armType: LuminaType | null = null;
      const matchValueName = expr.value.type === 'Identifier' ? expr.value.name : null;
      for (const arm of expr.arms) {
        const armScope = new Scope(scope);
        const armSymbols = new SymbolTable();
        for (const sym of symbols.list()) {
          armSymbols.define(sym);
        }
        const pattern = arm.pattern;
        if (pattern.type === 'WildcardPattern') {
          hasWildcard = true;
        } else if (pattern.type === 'EnumPattern') {
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
              });
              if (di) {
                di.define(armScope, binding, true);
              }
            });
          }
        }
      }
        const bodyType = typeCheckExpr(arm.body, armSymbols, diagnostics, armScope, options, undefined, resolving, pendingDeps, currentFunction, di);
      if (bodyType) {
        if (!armType) armType = bodyType;
        else if (armType !== bodyType) {
          diagnostics.push(diagAt(`Match arms must return the same type`, arm.location ?? expr.location));
        }
      }
      collectUnusedBindings(armScope, diagnostics, arm.location ?? expr.location);
    }
    if (matchType && (!enumSym || !enumSym.enumVariants)) {
      diagnostics.push(diagAt(`Match expression must be an enum`, expr.location));
    } else if (!hasWildcard && enumSym?.enumVariants) {
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

class Scope {
    parent?: Scope;
    locals = new Map<string, Location | undefined>();
    reads = new Set<string>();
    writes = new Set<string>();
    narrowed = new Map<string, LuminaType>();
    children: Scope[] = [];

    constructor(parent?: Scope) {
      this.parent = parent;
      if (parent) parent.children.push(this);
  }

  define(name: string, location?: Location) {
    this.locals.set(name, location);
  }

  read(name: string) {
    if (this.locals.has(name)) {
      this.reads.add(name);
      return;
    }
    this.parent?.read(name);
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
  typeName: LuminaType,
  symbols: SymbolTable,
  typeParams: Set<string>,
  diagnostics: Diagnostic[],
  location?: Location
): 'ok' | 'missingTypeArgs' | 'unknown' {
  const parsed = parseTypeName(typeName);
  if (parsed && parsed.args.length === 0 && !typeParams.has(parsed.base)) {
    const sym = symbols.get(parsed.base);
    if (sym?.kind === 'type' && sym.typeParams && sym.typeParams.length > 0) {
      diagnostics.push(diagAt(`Missing type arguments for generic type '${parsed.base}'`, location));
      return 'missingTypeArgs';
    }
  }
  return isKnownType(typeName, symbols, typeParams) ? 'ok' : 'unknown';
}

function isKnownType(typeName: LuminaType, symbols: SymbolTable, typeParams: Set<string>): boolean {
  if (builtinTypes.has(typeName)) return true;
  if (typeParams.has(typeName)) return true;
  const parsed = parseTypeName(typeName);
  if (!parsed) return false;
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
    if (!isKnownType(arg, symbols, typeParams)) return false;
  }
  return true;
}

function parseTypeName(typeName: string): { base: string; args: string[] } | null {
  const idx = typeName.indexOf('<');
  if (idx === -1) return { base: typeName, args: [] };
  if (!typeName.endsWith('>')) return null;
  const base = typeName.slice(0, idx);
  const inner = typeName.slice(idx + 1, -1);
  const args = splitTypeArgs(inner);
  return { base, args };
}

function hmKey(location?: Location): string | null {
  if (!location?.start) return null;
  return `${location.start.line}:${location.start.column}:${location.start.offset}`;
}

function hmTypeToLuminaType(type: import('./types.js').Type): LuminaType | null {
  if (type.kind === 'primitive') return type.name;
  if (type.kind === 'adt') {
    if (!type.params.length) return type.name;
    const args = type.params.map((param) => hmTypeToLuminaType(param) ?? 'any');
    return `${type.name}<${args.join(',')}>`;
  }
  if (type.kind === 'function') {
    return hmTypeToLuminaType(type.returnType);
  }
  return null;
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

function isTypeAssignable(
  actual: LuminaType,
  expected: LuminaType,
  symbols: SymbolTable,
  typeParams?: Map<string, LuminaType | undefined>
): boolean {
  if (actual === expected) return true;
  if (expected === 'any') return true;
  if (typeParams && typeParams.has(expected)) return true;
  const actualParsed = parseTypeName(actual);
  const expectedParsed = parseTypeName(expected);
  if (!actualParsed || !expectedParsed) return false;
  if (actualParsed.base !== expectedParsed.base) return false;
  if (actualParsed.args.length !== expectedParsed.args.length) return false;
  for (let i = 0; i < actualParsed.args.length; i++) {
    if (!isTypeAssignable(actualParsed.args[i], expectedParsed.args[i], symbols, typeParams)) return false;
  }
  return true;
}

function unifyTypes(paramType: LuminaType, argType: LuminaType, mapping: Map<string, LuminaType>) {
  const paramParsed = parseTypeName(paramType);
  const argParsed = parseTypeName(argType);
  if (!paramParsed || !argParsed) return;

  if (mapping.has(paramParsed.base)) {
    return;
  }
  if (isValidTypeParam(paramParsed.base) && paramParsed.args.length === 0) {
    mapping.set(paramParsed.base, argType);
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
