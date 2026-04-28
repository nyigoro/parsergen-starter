import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import { adt, fnType, moduleFunction, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdCollectionsPipelineDomainModules(): Pick<StdDomainModules,
  'iterModule' | 'queryModule'> {
  const iterModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const k = freshTypeVar();
    const vecT = adt('Vec', [t]);
    const vecU = adt('Vec', [u]);
    const vecVecT = adt('Vec', [vecT]);
    const optionT = adt('Option', [t]);
    const tupleTU = adt('Tuple', [t, u]);
    const tupleIntT = adt('Tuple', [primitive('int'), t]);
    const tupleVecTVecT = adt('Tuple', [vecT, vecT]);
    const vecTupleTU = adt('Vec', [tupleTU]);
    const vecTupleIntT = adt('Vec', [tupleIntT]);
    const mapKVecT = adt('HashMap', [k, vecT]);

    return {
      kind: 'module',
      name: 'iter',
      moduleId: 'std://iter',
      exports: new Map([
        [
          'map_vec',
          moduleFunctionWithScheme(
            'map_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t], u)], vecU), [t, u]),
            ['values', 'mapper'],
            'std://iter'
          ),
        ],
        [
          'filter_vec',
          moduleFunctionWithScheme(
            'filter_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t], primitive('bool'))], vecT), [t]),
            ['values', 'pred'],
            'std://iter'
          ),
        ],
        [
          'filter_option',
          moduleFunctionWithScheme(
            'filter_option',
            ['Option<any>', 'any'],
            'Option<any>',
            schemeFromVars(fnType([optionT, fnType([t], primitive('bool'))], optionT), [t]),
            ['value', 'pred'],
            'std://iter'
          ),
        ],
        [
          'zip_vec',
          moduleFunctionWithScheme(
            'zip_vec',
            ['Vec<any>', 'Vec<any>'],
            'Vec<Tuple<any,any>>',
            schemeFromVars(fnType([vecT, vecU], vecTupleTU), [t, u]),
            ['left', 'right'],
            'std://iter'
          ),
        ],
        [
          'enumerate_vec',
          moduleFunctionWithScheme(
            'enumerate_vec',
            ['Vec<any>'],
            'Vec<Tuple<int,any>>',
            schemeFromVars(fnType([vecT], vecTupleIntT), [t]),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'flatten_vec',
          moduleFunctionWithScheme(
            'flatten_vec',
            ['Vec<Vec<any>>'],
            'Vec<any>',
            schemeFromVars(fnType([vecVecT], vecT), [t]),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'flat_map_vec',
          moduleFunctionWithScheme(
            'flat_map_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t], vecU)], vecU), [t, u]),
            ['values', 'mapper'],
            'std://iter'
          ),
        ],
        [
          'chunk_vec',
          moduleFunctionWithScheme(
            'chunk_vec',
            ['Vec<any>', 'int'],
            'Vec<Vec<any>>',
            schemeFromVars(fnType([vecT, primitive('int')], vecVecT), [t]),
            ['values', 'size'],
            'std://iter'
          ),
        ],
        [
          'window_vec',
          moduleFunctionWithScheme(
            'window_vec',
            ['Vec<any>', 'int'],
            'Vec<Vec<any>>',
            schemeFromVars(fnType([vecT, primitive('int')], vecVecT), [t]),
            ['values', 'size'],
            'std://iter'
          ),
        ],
        [
          'partition_vec',
          moduleFunctionWithScheme(
            'partition_vec',
            ['Vec<any>', 'any'],
            'Tuple<Vec<any>,Vec<any>>',
            schemeFromVars(fnType([vecT, fnType([t], primitive('bool'))], tupleVecTVecT), [t]),
            ['values', 'pred'],
            'std://iter'
          ),
        ],
        [
          'take_vec',
          moduleFunctionWithScheme(
            'take_vec',
            ['Vec<any>', 'int'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, primitive('int')], vecT), [t]),
            ['values', 'n'],
            'std://iter'
          ),
        ],
        [
          'skip_vec',
          moduleFunctionWithScheme(
            'skip_vec',
            ['Vec<any>', 'int'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, primitive('int')], vecT), [t]),
            ['values', 'n'],
            'std://iter'
          ),
        ],
        [
          'any_vec',
          moduleFunctionWithScheme(
            'any_vec',
            ['Vec<any>', 'any'],
            'bool',
            schemeFromVars(fnType([vecT, fnType([t], primitive('bool'))], primitive('bool')), [t]),
            ['values', 'pred'],
            'std://iter'
          ),
        ],
        [
          'all_vec',
          moduleFunctionWithScheme(
            'all_vec',
            ['Vec<any>', 'any'],
            'bool',
            schemeFromVars(fnType([vecT, fnType([t], primitive('bool'))], primitive('bool')), [t]),
            ['values', 'pred'],
            'std://iter'
          ),
        ],
        [
          'find_vec',
          moduleFunctionWithScheme(
            'find_vec',
            ['Vec<any>', 'any'],
            'Option<any>',
            schemeFromVars(fnType([vecT, fnType([t], primitive('bool'))], optionT), [t]),
            ['values', 'pred'],
            'std://iter'
          ),
        ],
        [
          'count_vec',
          moduleFunctionWithScheme(
            'count_vec',
            ['Vec<any>'],
            'int',
            schemeFromVars(fnType([vecT], primitive('int')), [t]),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'sum_vec',
          moduleFunction(
            'sum_vec',
            ['Vec<int>'],
            'int',
            [adt('Vec', [primitive('int')])],
            primitive('int'),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'sum_vec_f64',
          moduleFunction(
            'sum_vec_f64',
            ['Vec<f64>'],
            'f64',
            [adt('Vec', [primitive('float')])],
            primitive('float'),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'unique_vec',
          moduleFunctionWithScheme(
            'unique_vec',
            ['Vec<any>'],
            'Vec<any>',
            schemeFromVars(fnType([vecT], vecT), [t]),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'reverse_vec',
          moduleFunctionWithScheme(
            'reverse_vec',
            ['Vec<any>'],
            'Vec<any>',
            schemeFromVars(fnType([vecT], vecT), [t]),
            ['values'],
            'std://iter'
          ),
        ],
        [
          'sort_vec',
          moduleFunctionWithScheme(
            'sort_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t, t], primitive('int'))], vecT), [t]),
            ['values', 'cmp'],
            'std://iter'
          ),
        ],
        [
          'sort_by_vec',
          moduleFunctionWithScheme(
            'sort_by_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t], k)], vecT), [t, k]),
            ['values', 'key'],
            'std://iter'
          ),
        ],
        [
          'sort_by_desc_vec',
          moduleFunctionWithScheme(
            'sort_by_desc_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, fnType([t], k)], vecT), [t, k]),
            ['values', 'key'],
            'std://iter'
          ),
        ],
        [
          'group_by_vec',
          moduleFunctionWithScheme(
            'group_by_vec',
            ['Vec<any>', 'any'],
            'HashMap<any,Vec<any>>',
            schemeFromVars(fnType([vecT, fnType([t], k)], mapKVecT), [t, k]),
            ['values', 'key'],
            'std://iter'
          ),
        ],
        [
          'intersperse_vec',
          moduleFunctionWithScheme(
            'intersperse_vec',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(fnType([vecT, t], vecT), [t]),
            ['values', 'sep'],
            'std://iter'
          ),
        ],
        [
          'join_vec',
          moduleFunctionWithScheme(
            'join_vec',
            ['Vec<any>', 'Vec<any>', 'any', 'any'],
            'Vec<Tuple<any,any>>',
            schemeFromVars(fnType([vecT, vecU, fnType([t], k), fnType([u], k)], vecTupleTU), [t, u, k]),
            ['left', 'right', 'left_key', 'right_key'],
            'std://iter'
          ),
        ],
      ]),
    };
  })();

  const queryModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const k = freshTypeVar();
    const vecT = adt('Vec', [t]);
    const vecU = adt('Vec', [u]);
    const tupleTU = adt('Tuple', [t, u]);
    const optionT = adt('Option', [t]);
    const mapKVecT = adt('HashMap', [k, vecT]);
    const queryT: Type = { kind: 'row', fields: new Map([['items', vecT]]), tail: null };
    const queryU: Type = { kind: 'row', fields: new Map([['items', vecU]]), tail: null };
    const queryTupleTU: Type = { kind: 'row', fields: new Map([['items', adt('Vec', [tupleTU])]]), tail: null };

    return {
      kind: 'module',
      name: 'query',
      moduleId: 'std://query',
      exports: new Map([
        [
          'query',
          moduleFunctionWithScheme(
            'query',
            ['Vec<any>'],
            'Query<any>',
            schemeFromVars(fnType([vecT], queryT), [t]),
            ['items'],
            'std://query'
          ),
        ],
        [
          'where_q',
          moduleFunctionWithScheme(
            'where_q',
            ['Query<any>', 'any'],
            'Query<any>',
            schemeFromVars(fnType([queryT, fnType([t], primitive('bool'))], queryT), [t]),
            ['q', 'pred'],
            'std://query'
          ),
        ],
        [
          'select_q',
          moduleFunctionWithScheme(
            'select_q',
            ['Query<any>', 'any'],
            'Query<any>',
            schemeFromVars(fnType([queryT, fnType([t], u)], queryU), [t, u]),
            ['q', 'mapper'],
            'std://query'
          ),
        ],
        [
          'order_by_q',
          moduleFunctionWithScheme(
            'order_by_q',
            ['Query<any>', 'any'],
            'Query<any>',
            schemeFromVars(fnType([queryT, fnType([t], k)], queryT), [t, k]),
            ['q', 'key'],
            'std://query'
          ),
        ],
        [
          'order_by_desc_q',
          moduleFunctionWithScheme(
            'order_by_desc_q',
            ['Query<any>', 'any'],
            'Query<any>',
            schemeFromVars(fnType([queryT, fnType([t], k)], queryT), [t, k]),
            ['q', 'key'],
            'std://query'
          ),
        ],
        [
          'limit_q',
          moduleFunctionWithScheme(
            'limit_q',
            ['Query<any>', 'int'],
            'Query<any>',
            schemeFromVars(fnType([queryT, primitive('int')], queryT), [t]),
            ['q', 'n'],
            'std://query'
          ),
        ],
        [
          'offset_q',
          moduleFunctionWithScheme(
            'offset_q',
            ['Query<any>', 'int'],
            'Query<any>',
            schemeFromVars(fnType([queryT, primitive('int')], queryT), [t]),
            ['q', 'n'],
            'std://query'
          ),
        ],
        [
          'group_by_q',
          moduleFunctionWithScheme(
            'group_by_q',
            ['Query<any>', 'any'],
            'HashMap<any,Vec<any>>',
            schemeFromVars(fnType([queryT, fnType([t], k)], mapKVecT), [t, k]),
            ['q', 'key'],
            'std://query'
          ),
        ],
        [
          'count_q',
          moduleFunctionWithScheme(
            'count_q',
            ['Query<any>'],
            'int',
            schemeFromVars(fnType([queryT], primitive('int')), [t]),
            ['q'],
            'std://query'
          ),
        ],
        [
          'first_q',
          moduleFunctionWithScheme(
            'first_q',
            ['Query<any>'],
            'Option<any>',
            schemeFromVars(fnType([queryT], optionT), [t]),
            ['q'],
            'std://query'
          ),
        ],
        [
          'to_vec_q',
          moduleFunctionWithScheme(
            'to_vec_q',
            ['Query<any>'],
            'Vec<any>',
            schemeFromVars(fnType([queryT], vecT), [t]),
            ['q'],
            'std://query'
          ),
        ],
        [
          'join_q',
          moduleFunctionWithScheme(
            'join_q',
            ['Query<any>', 'Query<any>', 'any', 'any'],
            'Query<Tuple<any,any>>',
            schemeFromVars(fnType([queryT, queryU, fnType([t], k), fnType([u], k)], queryTupleTU), [t, u, k]),
            ['left', 'right', 'left_key', 'right_key'],
            'std://query'
          ),
        ],
      ]),
    };
  })();
  return { iterModule, queryModule };
}
