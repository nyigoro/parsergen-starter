import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import {
  adt,
  fnType,
  moduleFunctionWithScheme,
  schemeFromVars,
} from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdFunctionalDomainModules(): Pick<StdDomainModules,
  'functorModule' | 'applicativeModule' | 'monadModule' | 'foldableModule' | 'traversableModule'> {
  const functorModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const e = freshTypeVar();
    const k = freshTypeVar();
    const v = freshTypeVar();

    const mapOptionType: Type = fnType([adt('Option', [t]), fnType([t], u)], adt('Option', [u]));
    const mapResultType: Type = fnType([adt('Result', [t, e]), fnType([t], u)], adt('Result', [u, e]));
    const mapVecType: Type = fnType([adt('Vec', [t]), fnType([t], u)], adt('Vec', [u]));
    const mapHashMapValuesType: Type = fnType([adt('HashMap', [k, v]), fnType([v], u)], adt('HashMap', [k, u]));

    return {
      kind: 'module',
      name: 'functor',
      moduleId: 'std://functor',
      exports: new Map([
        [
          'map_option',
          moduleFunctionWithScheme(
            'map_option',
            ['Option<any>', 'any'],
            'Option<any>',
            schemeFromVars(mapOptionType, [t, u]),
            ['value', 'mapper'],
            'std://functor'
          ),
        ],
        [
          'map_result',
          moduleFunctionWithScheme(
            'map_result',
            ['Result<any,any>', 'any'],
            'Result<any,any>',
            schemeFromVars(mapResultType, [t, u, e]),
            ['value', 'mapper'],
            'std://functor'
          ),
        ],
        [
          'map_vec',
          moduleFunctionWithScheme(
            'map_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(mapVecType, [t, u]),
            ['values', 'mapper'],
            'std://functor'
          ),
        ],
        [
          'map_hashmap_values',
          moduleFunctionWithScheme(
            'map_hashmap_values',
            ['HashMap<any,any>', 'any'],
            'HashMap<any,any>',
            schemeFromVars(mapHashMapValuesType, [k, v, u]),
            ['values', 'mapper'],
            'std://functor'
          ),
        ],
      ]),
    };
  })();

  const applicativeModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const e = freshTypeVar();
    const k = freshTypeVar();
    const fnTU = fnType([t], u);

    const pureOptionType: Type = fnType([t], adt('Option', [t]));
    const pureResultType: Type = fnType([t], adt('Result', [t, e]));
    const pureVecType: Type = fnType([t], adt('Vec', [t]));
    const pureHashMapType: Type = fnType([k, t], adt('HashMap', [k, t]));
    const apOptionType: Type = fnType([adt('Option', [fnTU]), adt('Option', [t])], adt('Option', [u]));
    const apResultType: Type = fnType([adt('Result', [fnTU, e]), adt('Result', [t, e])], adt('Result', [u, e]));
    const apVecType: Type = fnType([adt('Vec', [fnTU]), adt('Vec', [t])], adt('Vec', [u]));
    const apHashMapValuesType: Type = fnType(
      [adt('HashMap', [k, fnTU]), adt('HashMap', [k, t])],
      adt('HashMap', [k, u])
    );

    return {
      kind: 'module',
      name: 'applicative',
      moduleId: 'std://applicative',
      exports: new Map([
        [
          'pure_option',
          moduleFunctionWithScheme(
            'pure_option',
            ['any'],
            'Option<any>',
            schemeFromVars(pureOptionType, [t]),
            ['value'],
            'std://applicative'
          ),
        ],
        [
          'pure_result',
          moduleFunctionWithScheme(
            'pure_result',
            ['any'],
            'Result<any,any>',
            schemeFromVars(pureResultType, [t, e]),
            ['value'],
            'std://applicative'
          ),
        ],
        [
          'pure_vec',
          moduleFunctionWithScheme(
            'pure_vec',
            ['any'],
            'Vec<any>',
            schemeFromVars(pureVecType, [t]),
            ['value'],
            'std://applicative'
          ),
        ],
        [
          'pure_hashmap',
          moduleFunctionWithScheme(
            'pure_hashmap',
            ['any', 'any'],
            'HashMap<any,any>',
            schemeFromVars(pureHashMapType, [k, t]),
            ['key', 'value'],
            'std://applicative'
          ),
        ],
        [
          'ap_option',
          moduleFunctionWithScheme(
            'ap_option',
            ['Option<any>', 'Option<any>'],
            'Option<any>',
            schemeFromVars(apOptionType, [t, u]),
            ['fns', 'value'],
            'std://applicative'
          ),
        ],
        [
          'ap_result',
          moduleFunctionWithScheme(
            'ap_result',
            ['Result<any,any>', 'Result<any,any>'],
            'Result<any,any>',
            schemeFromVars(apResultType, [t, u, e]),
            ['fns', 'value'],
            'std://applicative'
          ),
        ],
        [
          'ap_vec',
          moduleFunctionWithScheme(
            'ap_vec',
            ['Vec<any>', 'Vec<any>'],
            'Vec<any>',
            schemeFromVars(apVecType, [t, u]),
            ['fns', 'values'],
            'std://applicative'
          ),
        ],
        [
          'ap_hashmap_values',
          moduleFunctionWithScheme(
            'ap_hashmap_values',
            ['HashMap<any,any>', 'HashMap<any,any>'],
            'HashMap<any,any>',
            schemeFromVars(apHashMapValuesType, [k, t, u]),
            ['fns', 'values'],
            'std://applicative'
          ),
        ],
      ]),
    };
  })();

  const monadModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const e = freshTypeVar();
    const k = freshTypeVar();

    const flatMapOptionType: Type = fnType(
      [adt('Option', [t]), fnType([t], adt('Option', [u]))],
      adt('Option', [u])
    );
    const flatMapResultType: Type = fnType(
      [adt('Result', [t, e]), fnType([t], adt('Result', [u, e]))],
      adt('Result', [u, e])
    );
    const flatMapVecType: Type = fnType([adt('Vec', [t]), fnType([t], adt('Vec', [u]))], adt('Vec', [u]));
    const flatMapHashMapValuesType: Type = fnType(
      [adt('HashMap', [k, t]), fnType([t], adt('HashMap', [k, u]))],
      adt('HashMap', [k, u])
    );
    const joinOptionType: Type = fnType([adt('Option', [adt('Option', [t])])], adt('Option', [t]));
    const joinResultType: Type = fnType([adt('Result', [adt('Result', [t, e]), e])], adt('Result', [t, e]));
    const joinVecType: Type = fnType([adt('Vec', [adt('Vec', [t])])], adt('Vec', [t]));
    const joinHashMapValuesType: Type = fnType(
      [adt('HashMap', [k, adt('HashMap', [k, t])])],
      adt('HashMap', [k, t])
    );

    return {
      kind: 'module',
      name: 'monad',
      moduleId: 'std://monad',
      exports: new Map([
        [
          'flat_map_option',
          moduleFunctionWithScheme(
            'flat_map_option',
            ['Option<any>', 'any'],
            'Option<any>',
            schemeFromVars(flatMapOptionType, [t, u]),
            ['value', 'mapper'],
            'std://monad'
          ),
        ],
        [
          'flat_map_result',
          moduleFunctionWithScheme(
            'flat_map_result',
            ['Result<any,any>', 'any'],
            'Result<any,any>',
            schemeFromVars(flatMapResultType, [t, u, e]),
            ['value', 'mapper'],
            'std://monad'
          ),
        ],
        [
          'flat_map_vec',
          moduleFunctionWithScheme(
            'flat_map_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(flatMapVecType, [t, u]),
            ['values', 'mapper'],
            'std://monad'
          ),
        ],
        [
          'flat_map_hashmap_values',
          moduleFunctionWithScheme(
            'flat_map_hashmap_values',
            ['HashMap<any,any>', 'any'],
            'HashMap<any,any>',
            schemeFromVars(flatMapHashMapValuesType, [k, t, u]),
            ['values', 'mapper'],
            'std://monad'
          ),
        ],
        [
          'join_option',
          moduleFunctionWithScheme(
            'join_option',
            ['Option<Option<any>>'],
            'Option<any>',
            schemeFromVars(joinOptionType, [t]),
            ['value'],
            'std://monad'
          ),
        ],
        [
          'join_result',
          moduleFunctionWithScheme(
            'join_result',
            ['Result<Result<any,any>,any>'],
            'Result<any,any>',
            schemeFromVars(joinResultType, [t, e]),
            ['value'],
            'std://monad'
          ),
        ],
        [
          'join_vec',
          moduleFunctionWithScheme(
            'join_vec',
            ['Vec<Vec<any>>'],
            'Vec<any>',
            schemeFromVars(joinVecType, [t]),
            ['values'],
            'std://monad'
          ),
        ],
        [
          'join_hashmap_values',
          moduleFunctionWithScheme(
            'join_hashmap_values',
            ['HashMap<any,HashMap<any,any>>'],
            'HashMap<any,any>',
            schemeFromVars(joinHashMapValuesType, [k, t]),
            ['values'],
            'std://monad'
          ),
        ],
      ]),
    };
  })();

  const foldableModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const e = freshTypeVar();
    const k = freshTypeVar();
    const v = freshTypeVar();

    const foldOptionType: Type = fnType([adt('Option', [t]), u, fnType([u, t], u)], u);
    const foldResultType: Type = fnType([adt('Result', [t, e]), u, fnType([u, t], u)], u);
    const foldVecType: Type = fnType([adt('Vec', [t]), u, fnType([u, t], u)], u);
    const foldHashMapValuesType: Type = fnType([adt('HashMap', [k, v]), u, fnType([u, v], u)], u);

    return {
      kind: 'module',
      name: 'foldable',
      moduleId: 'std://foldable',
      exports: new Map([
        [
          'fold_option',
          moduleFunctionWithScheme(
            'fold_option',
            ['Option<any>', 'any', 'any'],
            'any',
            schemeFromVars(foldOptionType, [t, u]),
            ['value', 'init', 'folder'],
            'std://foldable'
          ),
        ],
        [
          'fold_result',
          moduleFunctionWithScheme(
            'fold_result',
            ['Result<any,any>', 'any', 'any'],
            'any',
            schemeFromVars(foldResultType, [t, u, e]),
            ['value', 'init', 'folder'],
            'std://foldable'
          ),
        ],
        [
          'fold_vec',
          moduleFunctionWithScheme(
            'fold_vec',
            ['Vec<any>', 'any', 'any'],
            'any',
            schemeFromVars(foldVecType, [t, u]),
            ['values', 'init', 'folder'],
            'std://foldable'
          ),
        ],
        [
          'fold_hashmap_values',
          moduleFunctionWithScheme(
            'fold_hashmap_values',
            ['HashMap<any,any>', 'any', 'any'],
            'any',
            schemeFromVars(foldHashMapValuesType, [k, v, u]),
            ['values', 'init', 'folder'],
            'std://foldable'
          ),
        ],
      ]),
    };
  })();

  const traversableModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const e = freshTypeVar();

    const traverseVecOptionType: Type = fnType(
      [adt('Vec', [t]), fnType([t], adt('Option', [u]))],
      adt('Option', [adt('Vec', [u])])
    );
    const traverseVecResultType: Type = fnType(
      [adt('Vec', [t]), fnType([t], adt('Result', [u, e]))],
      adt('Result', [adt('Vec', [u]), e])
    );
    const sequenceVecOptionType: Type = fnType([adt('Vec', [adt('Option', [t])])], adt('Option', [adt('Vec', [t])]));
    const sequenceVecResultType: Type = fnType(
      [adt('Vec', [adt('Result', [t, e])])],
      adt('Result', [adt('Vec', [t]), e])
    );

    return {
      kind: 'module',
      name: 'traversable',
      moduleId: 'std://traversable',
      exports: new Map([
        [
          'traverse_vec_option',
          moduleFunctionWithScheme(
            'traverse_vec_option',
            ['Vec<any>', 'any'],
            'Option<Vec<any>>',
            schemeFromVars(traverseVecOptionType, [t, u]),
            ['values', 'mapper'],
            'std://traversable'
          ),
        ],
        [
          'traverse_vec_result',
          moduleFunctionWithScheme(
            'traverse_vec_result',
            ['Vec<any>', 'any'],
            'Result<Vec<any>,any>',
            schemeFromVars(traverseVecResultType, [t, u, e]),
            ['values', 'mapper'],
            'std://traversable'
          ),
        ],
        [
          'sequence_vec_option',
          moduleFunctionWithScheme(
            'sequence_vec_option',
            ['Vec<Option<any>>'],
            'Option<Vec<any>>',
            schemeFromVars(sequenceVecOptionType, [t]),
            ['values'],
            'std://traversable'
          ),
        ],
        [
          'sequence_vec_result',
          moduleFunctionWithScheme(
            'sequence_vec_result',
            ['Vec<Result<any,any>>'],
            'Result<Vec<any>,any>',
            schemeFromVars(sequenceVecResultType, [t, e]),
            ['values'],
            'std://traversable'
          ),
        ],
      ]),
    };
  })();
  return {
    functorModule,
    applicativeModule,
    monadModule,
    foldableModule,
    traversableModule
  };
}
