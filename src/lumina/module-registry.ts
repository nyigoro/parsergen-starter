import { type LuminaProgram, type LuminaImport, type LuminaType } from './ast.js';
import { type Type, type TypeScheme } from './types.js';

export interface ModuleFunction {
  kind: 'function';
  name: string;
  paramTypes: LuminaType[];
  returnType: LuminaType;
  paramNames?: string[];
  hmType: TypeScheme;
}

export interface ModuleNamespace {
  kind: 'module';
  name: string;
  exports: Map<string, ModuleExport>;
}

export type ModuleExport = ModuleFunction | ModuleNamespace;
export type ModuleRegistry = Map<string, ModuleNamespace>;

const primitive = (name: 'int' | 'string' | 'bool' | 'void' | 'any'): Type => ({
  kind: 'primitive',
  name,
});

const fnType = (args: Type[], returnType: Type): Type => ({
  kind: 'function',
  args,
  returnType,
});

const scheme = (type: Type, variables: number[] = []): TypeScheme => ({
  kind: 'scheme',
  variables,
  type,
});

const moduleFunction = (
  name: string,
  paramTypes: LuminaType[],
  returnType: LuminaType,
  hmArgs: Type[],
  hmReturn: Type,
  paramNames?: string[]
): ModuleFunction => ({
  kind: 'function',
  name,
  paramTypes,
  returnType,
  paramNames,
  hmType: scheme(fnType(hmArgs, hmReturn)),
});

const aliasModuleFunction = (fn: ModuleFunction, name: string): ModuleFunction => {
  if (fn.name === name) return fn;
  return { ...fn, name };
};

export function createStdModuleRegistry(): ModuleRegistry {
  const registry: ModuleRegistry = new Map();
  const ioModule: ModuleNamespace = {
    kind: 'module',
    name: 'io',
    exports: new Map([
      [
        'println',
        moduleFunction(
          'println',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value']
        ),
      ],
      [
        'print',
        moduleFunction(
          'print',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value']
        ),
      ],
    ]),
  };

  const preludeModule: ModuleNamespace = {
    kind: 'module',
    name: '@prelude',
    exports: new Map([
      [
        'println',
        moduleFunction(
          'println',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value']
        ),
      ],
      [
        'print',
        moduleFunction(
          'print',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value']
        ),
      ],
      [
        'len',
        moduleFunction(
          'len',
          ['string'],
          'int',
          [primitive('string')],
          primitive('int'),
          ['value']
        ),
      ],
      [
        'assert',
        moduleFunction(
          'assert',
          ['bool'],
          'void',
          [primitive('bool')],
          primitive('void'),
          ['condition']
        ),
      ],
    ]),
  };

  const stdModule: ModuleNamespace = {
    kind: 'module',
    name: '@std',
    exports: new Map([['io', ioModule]]),
  };

  registry.set('@std', stdModule);
  registry.set('@std/io', ioModule);
  registry.set('@prelude', preludeModule);
  return registry;
}

export function resolveModuleBindings(
  program: LuminaProgram,
  registry?: ModuleRegistry
): Map<string, ModuleExport> {
  const bindings = new Map<string, ModuleExport>();
  if (!registry) return bindings;
  for (const stmt of program.body) {
    if (stmt.type !== 'Import') continue;
    const node = stmt as LuminaImport;
    const source = node.source?.value;
    if (!source) continue;
    const module = registry.get(source);
    if (!module) continue;
    const spec = node.spec as unknown;
    if (typeof spec === 'string') {
      bindings.set(spec, module);
      continue;
    }
    if (Array.isArray(spec)) {
      for (const item of spec) {
        const specItem = item as { name?: string; alias?: string; namespace?: boolean };
        const name =
          typeof item === 'string'
            ? item
            : specItem && typeof specItem === 'object'
              ? specItem.name
              : undefined;
        if (!name) continue;
        const localName = specItem.alias ?? name;
        const isNamespace = Boolean(specItem?.namespace);
        if (isNamespace) {
          bindings.set(localName, module);
        } else {
          const exp = module.exports.get(name);
          if (exp) {
            bindings.set(localName, exp.kind === 'function' ? aliasModuleFunction(exp, localName) : exp);
          }
        }
      }
      continue;
    }
    if (spec && typeof spec === 'object' && 'name' in (spec as { name?: string })) {
      const specItem = spec as { name?: string; alias?: string; namespace?: boolean };
      const name = specItem.name;
      const localName = specItem.alias ?? name;
      const isNamespace = Boolean(specItem.namespace);
      if (!name || !localName) continue;
      if (isNamespace) {
        bindings.set(localName, module);
      } else {
        const exp = module.exports.get(name);
        if (exp) {
          bindings.set(localName, exp.kind === 'function' ? aliasModuleFunction(exp, localName) : exp);
        }
      }
    }
  }
  return bindings;
}

export function getPreludeExports(registry?: ModuleRegistry): ModuleExport[] {
  if (!registry) return [];
  const prelude = registry.get('@prelude');
  if (!prelude) return [];
  return Array.from(prelude.exports.values());
}
