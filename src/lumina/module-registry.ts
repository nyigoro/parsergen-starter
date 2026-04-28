import { type LuminaProgram, type LuminaImport } from './ast.js';
import {
  adt,
  aliasModuleFunction,
  aliasModuleOverloadedFunction,
  aliasModuleValue,
  fnType,
  moduleFunction,
  moduleFunctionWithScheme,
  primitive,
  schemeFromVars,
} from './module-registry-builders.js';
import { type Type, freshTypeVar, promiseType } from './types.js';
import {
  createStdCollectionsRegistryEntries,
  createStdCollectionsRootEntries,
  createStdConcurrencyRegistryEntries,
  createStdConcurrencyRootEntries,
  createStdFunctionalRegistryEntries,
  createStdFunctionalRootEntries,
  createStdSystemRegistryEntries,
  createStdSystemRootEntries,
  createStdUiRegistryEntries,
  createStdUiRootEntries,
  registerModuleRegistryEntries,
  type StdDomainModules,
} from './module-registry-domains.js';
import { createStdCollectionsDomainModules } from './module-registry-collections.js';
import { createStdConcurrencyDomainModules } from './module-registry-concurrency.js';
import { createStdFunctionalDomainModules } from './module-registry-functional.js';
import { createStdSystemDomainModules } from './module-registry-system.js';
import { createStdUiDomainModules } from './module-registry-ui.js';
export type {
  ModuleExport,
  ModuleFunction,
  ModuleNamespace,
  ModuleOverloadedFunction,
  ModuleRegistry,
  ModuleValue,
} from './module-registry-types.js';
import type {
  ModuleExport,
  ModuleFunction,
  ModuleNamespace,
  ModuleRegistry,
} from './module-registry-types.js';
export function createStdModuleRegistry(): ModuleRegistry {
  const registry: ModuleRegistry = new Map();
  const stdDomainModules: StdDomainModules = {
    ...createStdSystemDomainModules(),
    ...createStdCollectionsDomainModules(),
    ...createStdConcurrencyDomainModules(),
    ...createStdUiDomainModules(),
    ...createStdFunctionalDomainModules(),
  };
  const { iterModule, queryModule } = stdDomainModules;
  const preludeJoinT = freshTypeVar();
  const preludeJoinAllType: Type = fnType(
    [adt('Vec', [promiseType(preludeJoinT)])],
    promiseType(adt('Vec', [preludeJoinT]))
  );
  const preludeTimeoutType: Type = fnType([primitive('int')], promiseType(primitive('void')));
  const preludeExports = new Map<string, ModuleExport>([
    [
      'println',
      moduleFunction(
        'println',
        ['string'],
        'void',
        [primitive('string')],
        primitive('void'),
        ['value'],
        'std://prelude'
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
        ['value'],
        'std://prelude'
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
        ['value'],
        'std://prelude'
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
        ['condition'],
        'std://prelude'
      ),
    ],
    [
      'timeout',
      moduleFunctionWithScheme(
        'timeout',
        ['int'],
        'Promise<void>',
        schemeFromVars(preludeTimeoutType, []),
        ['ms'],
        'std://prelude'
      ),
    ],
    [
      'join_all',
      moduleFunctionWithScheme(
        'join_all',
        ['Vec<Promise<any>>'],
        'Promise<Vec<any>>',
        schemeFromVars(preludeJoinAllType, [preludeJoinT]),
        ['values'],
        'std://prelude'
      ),
    ],
  ]);
  for (const name of [
    'map_vec',
    'filter_vec',
    'filter_option',
    'zip_vec',
    'enumerate_vec',
    'flatten_vec',
    'flat_map_vec',
    'chunk_vec',
    'window_vec',
    'partition_vec',
    'take_vec',
    'skip_vec',
    'any_vec',
    'all_vec',
    'find_vec',
    'count_vec',
    'sum_vec',
    'sum_vec_f64',
    'unique_vec',
    'reverse_vec',
    'sort_vec',
    'sort_by_vec',
    'sort_by_desc_vec',
    'group_by_vec',
    'intersperse_vec',
    'join_vec',
  ]) {
    const exp = iterModule.exports.get(name);
    if (exp) preludeExports.set(name, exp);
  }
  for (const name of [
    'query',
    'where_q',
    'select_q',
    'order_by_q',
    'order_by_desc_q',
    'limit_q',
    'offset_q',
    'group_by_q',
    'count_q',
    'first_q',
    'to_vec_q',
    'join_q',
  ]) {
    const exp = queryModule.exports.get(name);
    if (exp) preludeExports.set(name, exp);
  }

  const preludeModule: ModuleNamespace = {
    kind: 'module',
    name: '@prelude',
    moduleId: 'std://prelude',
    exports: preludeExports,
  };

  const stdRootEntries = [
    ...createStdSystemRootEntries(stdDomainModules),
    ...createStdCollectionsRootEntries(stdDomainModules),
    ...createStdConcurrencyRootEntries(stdDomainModules),
    ...createStdUiRootEntries(stdDomainModules),
    ...createStdFunctionalRootEntries(stdDomainModules),
  ];
  const stdRegistryEntries = [
    ...createStdSystemRegistryEntries(stdDomainModules),
    ...createStdCollectionsRegistryEntries(stdDomainModules),
    ...createStdConcurrencyRegistryEntries(stdDomainModules),
    ...createStdUiRegistryEntries(stdDomainModules),
    ...createStdFunctionalRegistryEntries(stdDomainModules),
  ];
  const stdModule: ModuleNamespace = {
    kind: 'module',
    name: '@std',
    moduleId: 'std://root',
    exports: new Map(stdRootEntries),
  };
  registry.set('@std', stdModule);
  registerModuleRegistryEntries(registry, stdRegistryEntries);
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
      bindings.set(spec, { ...module, name: spec });
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
          bindings.set(localName, { ...module, name: localName });
        } else {
          const exp = module.exports.get(name);
          if (exp) {
            if (exp.kind === 'function') {
              bindings.set(localName, aliasModuleFunction(exp, localName));
            } else if (exp.kind === 'overloaded-function') {
              bindings.set(localName, aliasModuleOverloadedFunction(exp, localName));
            } else if (exp.kind === 'value') {
              bindings.set(localName, aliasModuleValue(exp, localName));
            } else {
              bindings.set(localName, exp);
            }
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
        bindings.set(localName, { ...module, name: localName });
      } else {
        const exp = module.exports.get(name);
        if (exp) {
          if (exp.kind === 'function') {
            bindings.set(localName, aliasModuleFunction(exp, localName));
          } else if (exp.kind === 'overloaded-function') {
            bindings.set(localName, aliasModuleOverloadedFunction(exp, localName));
          } else if (exp.kind === 'value') {
            bindings.set(localName, aliasModuleValue(exp, localName));
          } else {
            bindings.set(localName, exp);
          }
        }
      }
    }
  }
  return bindings;
}

export function resolveModuleFunctionCandidates(
  binding: ModuleExport | undefined,
  member?: string
): ModuleFunction[] {
  if (!binding) return [];
  const toCandidates = (exp: ModuleExport | undefined): ModuleFunction[] => {
    if (!exp) return [];
    if (exp.kind === 'function') return [exp];
    if (exp.kind === 'overloaded-function') return [...exp.variants];
    return [];
  };
  if (binding.kind === 'module') {
    if (!member) return [];
    return toCandidates(binding.exports.get(member));
  }
  if (member) return [];
  return toCandidates(binding);
}

export function getPreludeExports(registry?: ModuleRegistry): ModuleExport[] {
  if (!registry) return [];
  const prelude = registry.get('@prelude');
  if (!prelude) return [];
  return Array.from(prelude.exports.values());
}
