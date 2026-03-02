import type {
  LuminaProgram,
  LuminaStatement,
  LuminaStructDecl,
  LuminaEnumDecl,
  LuminaImplDecl,
  LuminaTypeExpr,
  LuminaTypeParam,
  LuminaTraitDecl,
  LuminaTraitMethod,
  LuminaFnDecl,
  LuminaExpr,
  LuminaParam,
} from './ast.js';
import type { Diagnostic } from '../parser/index.js';
import type { Location } from '../utils/index.js';
import { normalizeTypeForComparison } from './type-utils.js';

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const SUPPORTED_DERIVES = new Set(['Clone', 'Debug', 'Eq']);
const BUILTIN_DERIVE_TRAITS = ['Clone', 'Debug', 'Eq'] as const;

type BuiltinDeriveTrait = (typeof BUILTIN_DERIVE_TRAITS)[number];

const diag = (code: string, message: string, location?: Location): Diagnostic => ({
  severity: 'error',
  code,
  message,
  source: 'lumina',
  location: location ?? defaultLocation,
});

const asTypeText = (typeExpr: LuminaTypeExpr): string => {
  if (typeof typeExpr === 'string') return typeExpr;
  if (typeExpr && typeof typeExpr === 'object' && typeExpr.kind === 'array') {
    const elem = asTypeText(typeExpr.element);
    return typeExpr.size ? `[${elem}; _]` : `[${elem}]`;
  }
  return 'unknown';
};

const normalizeTypeKey = (typeExpr: LuminaTypeExpr): string => normalizeTypeForComparison(asTypeText(typeExpr));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const typeExprMentionsParam = (typeExpr: LuminaTypeExpr, paramName: string): boolean => {
  if (typeof typeExpr === 'string') {
    return new RegExp(`\\b${escapeRegExp(paramName)}\\b`).test(typeExpr);
  }
  if (typeExpr && typeof typeExpr === 'object' && typeExpr.kind === 'array') {
    if (typeExprMentionsParam(typeExpr.element, paramName)) return true;
    const rawSize = JSON.stringify(typeExpr.size ?? null);
    return new RegExp(`\\b${escapeRegExp(paramName)}\\b`).test(rawSize);
  }
  return false;
};

const isEqUnsupportedTypeExpr = (typeExpr: LuminaTypeExpr): boolean => {
  const text = asTypeText(typeExpr);
  return /\bfn\s*\(/i.test(text) || /\bFn</.test(text) || /->/.test(text);
};

const collectUsedTypeParams = (decl: LuminaStructDecl | LuminaEnumDecl): Set<string> => {
  const used = new Set<string>();
  const markUsage = (typeExpr: LuminaTypeExpr) => {
    for (const param of decl.typeParams ?? []) {
      if (param.isConst) continue;
      if (typeExprMentionsParam(typeExpr, param.name)) used.add(param.name);
    }
  };

  if (decl.type === 'StructDecl') {
    for (const field of decl.body ?? []) markUsage(field.typeName);
    return used;
  }

  for (const variant of decl.variants ?? []) {
    for (const paramType of variant.params ?? []) markUsage(paramType);
    if (variant.resultType) markUsage(variant.resultType);
  }
  return used;
};

const cloneTypeParams = (params: LuminaTypeParam[] | undefined): LuminaTypeParam[] | undefined =>
  params?.map((param) => ({
    name: param.name,
    bound: param.bound ? [...param.bound] : undefined,
    isConst: !!param.isConst,
    constType: param.constType,
    higherKindArity: param.higherKindArity,
  }));

const synthesizeTypeParamBounds = (
  decl: LuminaStructDecl | LuminaEnumDecl,
  traitName: BuiltinDeriveTrait,
  diagnostics: Diagnostic[]
): LuminaTypeParam[] => {
  const used = collectUsedTypeParams(decl);
  const params = cloneTypeParams(decl.typeParams) ?? [];
  for (const param of params) {
    if (param.isConst) continue;
    if (!used.has(param.name)) continue;
    if ((param.higherKindArity ?? 0) > 0) {
      diagnostics.push(
        diag(
          'DERIVE-002',
          `Cannot synthesize '${traitName}' bound for higher-kinded parameter '${param.name}' in '${decl.name}'`,
          decl.location
        )
      );
      continue;
    }
    const bounds = [...(param.bound ?? [])];
    if (!bounds.some((bound) => normalizeTypeForComparison(asTypeText(bound)) === traitName)) {
      bounds.push(traitName);
    }
    param.bound = bounds;
  }
  return params;
};

const buildTargetType = (decl: LuminaStructDecl | LuminaEnumDecl): string => {
  const params = decl.typeParams ?? [];
  if (params.length === 0) return decl.name;
  return `${decl.name}<${params.map((param) => param.name).join(',')}>`;
};

const makeIdentifier = (name: string, location?: Location): LuminaExpr => ({ type: 'Identifier', name, location });

const makeReturnMethod = (
  methodName: string,
  helperName: string,
  params: LuminaParam[],
  returnType: LuminaTypeExpr,
  location?: Location
): LuminaFnDecl => ({
  type: 'FnDecl',
  name: methodName,
  async: false,
  params,
  returnType,
  whereClauses: [],
  body: {
    type: 'Block',
    body: [
      {
        type: 'Return',
        value: {
          type: 'Call',
          callee: { type: 'Identifier', name: helperName, location },
          args: params.map((param) => makeIdentifier(param.name, location)),
          typeArgs: [],
          location,
        },
        location,
      },
    ],
    location,
  },
  typeParams: [],
  visibility: 'private',
  extern: false,
  location,
});

const makeDeriveMethod = (traitName: BuiltinDeriveTrait, location?: Location): LuminaFnDecl => {
  const selfParam: LuminaParam = { name: 'self', typeName: 'Self', location };
  switch (traitName) {
    case 'Clone':
      return makeReturnMethod('clone', '__lumina_clone', [selfParam], 'Self', location);
    case 'Debug':
      return makeReturnMethod('debug', '__lumina_debug', [selfParam], 'string', location);
    case 'Eq':
      return makeReturnMethod(
        'eq',
        '__lumina_eq',
        [selfParam, { name: 'other', typeName: 'Self', location }],
        'bool',
        location
      );
  }
};

const makeBuiltinTraitDecl = (traitName: BuiltinDeriveTrait): LuminaTraitDecl => {
  const location = defaultLocation;
  const method = (() => {
    switch (traitName) {
      case 'Clone':
        return {
          type: 'TraitMethod',
          name: 'clone',
          params: [{ name: 'self', typeName: 'Self', location }],
          returnType: 'Self',
          typeParams: [],
          whereClauses: [],
          body: null,
          location,
        } as LuminaTraitMethod;
      case 'Debug':
        return {
          type: 'TraitMethod',
          name: 'debug',
          params: [{ name: 'self', typeName: 'Self', location }],
          returnType: 'string',
          typeParams: [],
          whereClauses: [],
          body: null,
          location,
        } as LuminaTraitMethod;
      case 'Eq':
        return {
          type: 'TraitMethod',
          name: 'eq',
          params: [
            { name: 'self', typeName: 'Self', location },
            { name: 'other', typeName: 'Self', location },
          ],
          returnType: 'bool',
          typeParams: [],
          whereClauses: [],
          body: null,
          location,
        } as LuminaTraitMethod;
    }
  })();

  return {
    type: 'TraitDecl',
    name: traitName,
    typeParams: [],
    superTraits: [],
    methods: [method],
    associatedTypes: [],
    visibility: 'private',
    location,
  };
};

type ImplMeta = { syntheticDerive: string | null };

const collectExistingImpls = (body: LuminaStatement[]): Map<string, ImplMeta> => {
  const map = new Map<string, ImplMeta>();
  for (const stmt of body) {
    if (stmt.type !== 'ImplDecl') continue;
    const key = `${normalizeTypeKey(stmt.traitType)}::${normalizeTypeKey(stmt.forType)}`;
    map.set(key, { syntheticDerive: stmt.syntheticDerive ?? null });
  }
  return map;
};

const validateEqFieldConstraints = (
  decl: LuminaStructDecl | LuminaEnumDecl,
  diagnostics: Diagnostic[]
): boolean => {
  if (decl.type === 'StructDecl') {
    for (const field of decl.body ?? []) {
      if (isEqUnsupportedTypeExpr(field.typeName)) {
        diagnostics.push(
          diag(
            'DERIVE-003',
            `Cannot derive Eq for '${decl.name}' because field '${field.name}' has a non-comparable function type`,
            field.location ?? decl.location
          )
        );
        return false;
      }
    }
    return true;
  }

  for (const variant of decl.variants ?? []) {
    for (const paramType of variant.params ?? []) {
      if (isEqUnsupportedTypeExpr(paramType)) {
        diagnostics.push(
          diag(
            'DERIVE-003',
            `Cannot derive Eq for '${decl.name}' because variant '${variant.name}' has a non-comparable function payload`,
            variant.location ?? decl.location
          )
        );
        return false;
      }
    }
  }
  return true;
};

export function expandDerivesInProgram(program: LuminaProgram): { program: LuminaProgram; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];

  const existingTraitNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type === 'TraitDecl') existingTraitNames.add(stmt.name);
  }

  const syntheticTraits: LuminaTraitDecl[] = [];
  for (const traitName of BUILTIN_DERIVE_TRAITS) {
    if (!existingTraitNames.has(traitName)) {
      syntheticTraits.push(makeBuiltinTraitDecl(traitName));
      existingTraitNames.add(traitName);
    }
  }

  if (syntheticTraits.length > 0) {
    let insertAt = 0;
    while (insertAt < program.body.length && program.body[insertAt]?.type === 'Import') insertAt += 1;
    program.body.splice(insertAt, 0, ...syntheticTraits);
  }

  const existingImpls = collectExistingImpls(program.body);
  const synthesizedImpls: LuminaImplDecl[] = [];

  for (const stmt of program.body) {
    if (stmt.type !== 'StructDecl' && stmt.type !== 'EnumDecl') continue;
    const deriveList = stmt.derives ?? [];
    if (deriveList.length === 0) continue;

    const targetType = buildTargetType(stmt);
    for (const deriveName of deriveList) {
      if (!SUPPORTED_DERIVES.has(deriveName)) {
        diagnostics.push(
          diag('DERIVE-001', `Unsupported derive '${deriveName}' on '${stmt.name}'`, stmt.location)
        );
        continue;
      }
      const traitName = deriveName as BuiltinDeriveTrait;
      if (traitName === 'Eq' && !validateEqFieldConstraints(stmt, diagnostics)) {
        continue;
      }

      const implKey = `${normalizeTypeForComparison(traitName)}::${normalizeTypeForComparison(targetType)}`;
      const existing = existingImpls.get(implKey);
      if (existing) {
        if (existing.syntheticDerive === traitName) {
          continue;
        }
        diagnostics.push(
          diag(
            'DERIVE-004',
            `Cannot derive '${traitName}' for '${targetType}' because an explicit impl already exists`,
            stmt.location
          )
        );
        continue;
      }

      const impl: LuminaImplDecl = {
        type: 'ImplDecl',
        traitType: traitName,
        forType: targetType,
        typeParams: synthesizeTypeParamBounds(stmt, traitName, diagnostics),
        whereClauses: [],
        methods: [makeDeriveMethod(traitName, stmt.location)],
        associatedTypes: [],
        visibility: 'private',
        syntheticDerive: traitName,
        location: stmt.location,
      };
      synthesizedImpls.push(impl);
      existingImpls.set(implKey, { syntheticDerive: traitName });
    }
  }

  if (synthesizedImpls.length > 0) {
    program.body.push(...synthesizedImpls);
  }

  return { program, diagnostics };
}
