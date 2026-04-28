import { type LuminaType } from './ast.js';
import { type Type, type TypeScheme } from './types.js';
import type {
  ModuleFunction,
  ModuleNamespace,
  ModuleOverloadedFunction,
  ModuleValue,
} from './module-registry-types.js';

export const primitive = (name: 'int' | 'float' | 'string' | 'bool' | 'void' | 'any'): Type => ({
  kind: 'primitive',
  name,
});

export const adt = (name: string, params: Type[] = []): Type => ({
  kind: 'adt',
  name,
  params,
});

export const fnType = (args: Type[], returnType: Type): Type => ({
  kind: 'function',
  args,
  returnType,
});

export const scheme = (type: Type, variables: number[] = []): TypeScheme => ({
  kind: 'scheme',
  variables,
  type,
});

export const schemeFromVars = (type: Type, vars: Type[]): TypeScheme => ({
  kind: 'scheme',
  variables: vars.filter((v) => v.kind === 'variable').map((v) => v.id),
  type,
});

export const moduleFunction = (
  name: string,
  paramTypes: LuminaType[],
  returnType: LuminaType,
  hmArgs: Type[],
  hmReturn: Type,
  paramNames?: string[],
  moduleId?: string,
  options?: { runtimeName?: string; deprecatedMessage?: string }
): ModuleFunction => ({
  kind: 'function',
  name,
  paramTypes,
  returnType,
  paramNames,
  hmType: scheme(fnType(hmArgs, hmReturn)),
  moduleId: moduleId ?? 'std://unknown',
  exportName: name,
  runtimeName: options?.runtimeName,
  deprecatedMessage: options?.deprecatedMessage,
});

export const moduleFunctionWithScheme = (
  name: string,
  paramTypes: LuminaType[],
  returnType: LuminaType,
  hmType: TypeScheme,
  paramNames?: string[],
  moduleId?: string,
  options?: { runtimeName?: string; deprecatedMessage?: string }
): ModuleFunction => ({
  kind: 'function',
  name,
  paramTypes,
  returnType,
  paramNames,
  hmType,
  moduleId: moduleId ?? 'std://unknown',
  exportName: name,
  runtimeName: options?.runtimeName,
  deprecatedMessage: options?.deprecatedMessage,
});

export const moduleOverloadedFunction = (
  name: string,
  variants: ModuleFunction[],
  moduleId?: string
): ModuleOverloadedFunction => ({
  kind: 'overloaded-function',
  name,
  variants: variants.map((variant) => ({ ...variant, name })),
  moduleId: moduleId ?? variants[0]?.moduleId ?? 'std://unknown',
  exportName: name,
});

export const moduleValue = (
  name: string,
  valueType: LuminaType,
  hmValue: Type,
  moduleId?: string
): ModuleValue => ({
  kind: 'value',
  name,
  valueType,
  hmType: scheme(hmValue),
  moduleId: moduleId ?? 'std://unknown',
  exportName: name,
});

export const aliasModuleFunction = (fn: ModuleFunction, name: string): ModuleFunction => {
  if (fn.name === name) return fn;
  return { ...fn, name, exportName: fn.exportName ?? fn.name };
};

export const aliasModuleOverloadedFunction = (
  fn: ModuleOverloadedFunction,
  name: string
): ModuleOverloadedFunction => {
  if (fn.name === name) return fn;
  return {
    ...fn,
    name,
    exportName: fn.exportName ?? fn.name,
    variants: fn.variants.map((variant) => ({
      ...variant,
      name,
      exportName: variant.exportName ?? variant.name,
    })),
  };
};

export const aliasModuleValue = (value: ModuleValue, name: string): ModuleValue => {
  if (value.name === name) return value;
  return { ...value, name, exportName: value.exportName ?? value.name };
};

export const createModuleNamespace = (
  name: string,
  moduleId: string,
  exports: Map<string, import('./module-registry-types.js').ModuleExport>
): ModuleNamespace => ({
  kind: 'module',
  name,
  moduleId,
  exports,
});
