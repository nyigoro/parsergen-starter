import { type SymbolInfo } from './semantic.js';
import { type LuminaType } from './ast.js';
import { type Type, type TypeScheme, freshTypeVar } from './types.js';
import { type ModuleExport, type ModuleFunction, type ModuleNamespace } from './module-registry.js';

const primitiveNames = new Set(['int', 'float', 'string', 'bool', 'void', 'any']);

const buildPrimitive = (name: string): Type => ({
  kind: 'primitive',
  name: name as 'int' | 'float' | 'string' | 'bool' | 'void' | 'any',
});

const splitTypeArgs = (input: string): string[] => {
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
};

const parseLuminaType = (typeName: LuminaType, typeParams: Map<string, Type>): Type => {
  const raw = typeof typeName === 'string' ? typeName : String(typeName);
  const direct = typeParams.get(raw);
  if (direct) return direct;
  if (primitiveNames.has(raw)) return buildPrimitive(raw);
  const idx = raw.indexOf('<');
  if (idx === -1) {
    return { kind: 'adt', name: raw, params: [] };
  }
  const base = raw.slice(0, idx);
  const inner = raw.slice(idx + 1, -1);
  const args = splitTypeArgs(inner).map((arg) => parseLuminaType(arg, typeParams));
  if (base === 'Promise' && args.length === 1) {
    return { kind: 'promise', inner: args[0] };
  }
  return { kind: 'adt', name: base, params: args };
};

export function buildModuleFunctionFromSymbol(sym: SymbolInfo): ModuleFunction | null {
  if (sym.kind !== 'function') return null;
  const paramTypes = sym.paramTypes ?? [];
  const returnType = sym.type ?? 'void';
  const typeParams = new Map<string, Type>();
  const typeVarIds: number[] = [];
  for (const tp of sym.typeParams ?? []) {
    const v = freshTypeVar();
    typeParams.set(tp.name, v);
    typeVarIds.push(v.id);
  }
  const hmArgs = paramTypes.map((p) => parseLuminaType(p, typeParams));
  const hmReturn = parseLuminaType(returnType, typeParams);
  const hmType: TypeScheme = {
    kind: 'scheme',
    variables: typeVarIds,
    type: { kind: 'function', args: hmArgs, returnType: hmReturn },
  };
  return {
    kind: 'function',
    name: sym.name,
    paramTypes,
    returnType,
    paramNames: sym.paramNames,
    hmType,
    moduleId: sym.uri ?? sym.externModule ?? 'file://unknown',
    exportName: sym.name,
  };
}

export function buildModuleNamespaceFromSymbols(
  name: string,
  symbols: SymbolInfo[],
  moduleId: string = name
): ModuleNamespace {
  const exports = new Map<string, ModuleExport>();
  for (const sym of symbols) {
    if (sym.kind !== 'function') continue;
    if (sym.visibility === 'private') continue;
    const fn = buildModuleFunctionFromSymbol(sym);
    if (fn) exports.set(sym.name, { ...fn, moduleId, exportName: fn.exportName ?? fn.name });
  }
  return { kind: 'module', name, moduleId, exports };
}
