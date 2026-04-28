import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import { adt, fnType, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdCollectionsSequencesDomainModules(): Pick<StdDomainModules,
  'listModule' | 'vecModule'> {
  const listModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const listT = adt('List', [t]);
    const listU = adt('List', [u]);
    const optionT = adt('Option', [t]);
    const mapType: Type = fnType([fnType([t], u), listT], listU);
    const filterType: Type = fnType([fnType([t], primitive('bool')), listT], listT);
    const foldType: Type = fnType([fnType([u, t], u), u, listT], u);
    const reverseType: Type = fnType([listT], listT);
    const lengthType: Type = fnType([listT], primitive('int'));
    const appendType: Type = fnType([listT, listT], listT);
    const takeType: Type = fnType([primitive('int'), listT], listT);
    const dropType: Type = fnType([primitive('int'), listT], listT);
    const findType: Type = fnType([fnType([t], primitive('bool')), listT], optionT);
    const anyType: Type = fnType([fnType([t], primitive('bool')), listT], primitive('bool'));
    const allType: Type = fnType([fnType([t], primitive('bool')), listT], primitive('bool'));

    return {
      kind: 'module',
      name: 'list',
      moduleId: 'std://list',
      exports: new Map([
        [
          'map',
          moduleFunctionWithScheme(
            'map',
            ['any', 'List<any>'],
            'List<any>',
            schemeFromVars(mapType, [t, u]),
            ['mapper', 'values'],
            'std://list'
          ),
        ],
        [
          'filter',
          moduleFunctionWithScheme(
            'filter',
            ['any', 'List<any>'],
            'List<any>',
            schemeFromVars(filterType, [t]),
            ['predicate', 'values'],
            'std://list'
          ),
        ],
        [
          'fold',
          moduleFunctionWithScheme(
            'fold',
            ['any', 'any', 'List<any>'],
            'any',
            schemeFromVars(foldType, [t, u]),
            ['folder', 'init', 'values'],
            'std://list'
          ),
        ],
        [
          'reverse',
          moduleFunctionWithScheme(
            'reverse',
            ['List<any>'],
            'List<any>',
            schemeFromVars(reverseType, [t]),
            ['values'],
            'std://list'
          ),
        ],
        [
          'length',
          moduleFunctionWithScheme(
            'length',
            ['List<any>'],
            'int',
            schemeFromVars(lengthType, [t]),
            ['values'],
            'std://list'
          ),
        ],
        [
          'append',
          moduleFunctionWithScheme(
            'append',
            ['List<any>', 'List<any>'],
            'List<any>',
            schemeFromVars(appendType, [t]),
            ['left', 'right'],
            'std://list'
          ),
        ],
        [
          'take',
          moduleFunctionWithScheme(
            'take',
            ['int', 'List<any>'],
            'List<any>',
            schemeFromVars(takeType, [t]),
            ['count', 'values'],
            'std://list'
          ),
        ],
        [
          'drop',
          moduleFunctionWithScheme(
            'drop',
            ['int', 'List<any>'],
            'List<any>',
            schemeFromVars(dropType, [t]),
            ['count', 'values'],
            'std://list'
          ),
        ],
        [
          'find',
          moduleFunctionWithScheme(
            'find',
            ['any', 'List<any>'],
            'Option<any>',
            schemeFromVars(findType, [t]),
            ['predicate', 'values'],
            'std://list'
          ),
        ],
        [
          'any',
          moduleFunctionWithScheme(
            'any',
            ['any', 'List<any>'],
            'bool',
            schemeFromVars(anyType, [t]),
            ['predicate', 'values'],
            'std://list'
          ),
        ],
        [
          'all',
          moduleFunctionWithScheme(
            'all',
            ['any', 'List<any>'],
            'bool',
            schemeFromVars(allType, [t]),
            ['predicate', 'values'],
            'std://list'
          ),
        ],
      ]),
    };
  })();

  const vecModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const vecT = adt('Vec', [t]);
    const vecU = adt('Vec', [u]);
    const optionT = adt('Option', [t]);
    const tupleTU = adt('Tuple', [t, u]);
    const tupleIntT = adt('Tuple', [primitive('int'), t]);
    const vecTupleTU = adt('Vec', [tupleTU]);
    const vecTupleIntT = adt('Vec', [tupleIntT]);
    const optionInt = adt('Option', [primitive('int')]);
    const newType: Type = fnType([], vecT);
    const pushType: Type = fnType([vecT, t], primitive('void'));
    const getType: Type = fnType([vecT, primitive('int')], optionT);
    const lenType: Type = fnType([vecT], primitive('int'));
    const popType: Type = fnType([vecT], optionT);
    const clearType: Type = fnType([vecT], primitive('void'));
    const mapType: Type = fnType([vecT, fnType([t], u)], vecU);
    const filterType: Type = fnType([vecT, fnType([t], primitive('bool'))], vecT);
    const foldType: Type = fnType([vecT, u, fnType([u, t], u)], u);
    const forEachType: Type = fnType([vecT, fnType([t], primitive('void'))], primitive('void'));
    const anyType: Type = fnType([vecT, fnType([t], primitive('bool'))], primitive('bool'));
    const allType: Type = fnType([vecT, fnType([t], primitive('bool'))], primitive('bool'));
    const findType: Type = fnType([vecT, fnType([t], primitive('bool'))], optionT);
    const positionType: Type = fnType([vecT, fnType([t], primitive('bool'))], optionInt);
    const takeType: Type = fnType([vecT, primitive('int')], vecT);
    const skipType: Type = fnType([vecT, primitive('int')], vecT);
    const zipType: Type = fnType([vecT, vecU], vecTupleTU);
    const enumerateType: Type = fnType([vecT], vecTupleIntT);

    return {
      kind: 'module',
      name: 'vec',
      moduleId: 'std://vec',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'Vec<any>',
            schemeFromVars(newType, [t]),
            [],
            'std://vec'
          ),
        ],
        [
          'push',
          moduleFunctionWithScheme(
            'push',
            ['Vec<any>', 'any'],
            'void',
            schemeFromVars(pushType, [t]),
            ['vec', 'value'],
            'std://vec'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['Vec<any>', 'int'],
            'Option<any>',
            schemeFromVars(getType, [t]),
            ['vec', 'index'],
            'std://vec'
          ),
        ],
        [
          'len',
          moduleFunctionWithScheme(
            'len',
            ['Vec<any>'],
            'int',
            schemeFromVars(lenType, [t]),
            ['vec'],
            'std://vec'
          ),
        ],
        [
          'pop',
          moduleFunctionWithScheme(
            'pop',
            ['Vec<any>'],
            'Option<any>',
            schemeFromVars(popType, [t]),
            ['vec'],
            'std://vec'
          ),
        ],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['Vec<any>'],
            'void',
            schemeFromVars(clearType, [t]),
            ['vec'],
            'std://vec'
          ),
        ],
        [
          'map',
          moduleFunctionWithScheme(
            'map',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(mapType, [t, u]),
            ['values', 'mapper'],
            'std://vec'
          ),
        ],
        [
          'filter',
          moduleFunctionWithScheme(
            'filter',
            ['Vec<any>', 'any'],
            'Vec<any>',
            schemeFromVars(filterType, [t]),
            ['values', 'predicate'],
            'std://vec'
          ),
        ],
        [
          'fold',
          moduleFunctionWithScheme(
            'fold',
            ['Vec<any>', 'any', 'any'],
            'any',
            schemeFromVars(foldType, [t, u]),
            ['values', 'init', 'folder'],
            'std://vec'
          ),
        ],
        [
          'for_each',
          moduleFunctionWithScheme(
            'for_each',
            ['Vec<any>', 'any'],
            'void',
            schemeFromVars(forEachType, [t]),
            ['values', 'action'],
            'std://vec'
          ),
        ],
        [
          'any',
          moduleFunctionWithScheme(
            'any',
            ['Vec<any>', 'any'],
            'bool',
            schemeFromVars(anyType, [t]),
            ['values', 'predicate'],
            'std://vec'
          ),
        ],
        [
          'all',
          moduleFunctionWithScheme(
            'all',
            ['Vec<any>', 'any'],
            'bool',
            schemeFromVars(allType, [t]),
            ['values', 'predicate'],
            'std://vec'
          ),
        ],
        [
          'find',
          moduleFunctionWithScheme(
            'find',
            ['Vec<any>', 'any'],
            'Option<any>',
            schemeFromVars(findType, [t]),
            ['values', 'predicate'],
            'std://vec'
          ),
        ],
        [
          'position',
          moduleFunctionWithScheme(
            'position',
            ['Vec<any>', 'any'],
            'Option<int>',
            schemeFromVars(positionType, [t]),
            ['values', 'predicate'],
            'std://vec'
          ),
        ],
        [
          'take',
          moduleFunctionWithScheme(
            'take',
            ['Vec<any>', 'int'],
            'Vec<any>',
            schemeFromVars(takeType, [t]),
            ['values', 'count'],
            'std://vec'
          ),
        ],
        [
          'skip',
          moduleFunctionWithScheme(
            'skip',
            ['Vec<any>', 'int'],
            'Vec<any>',
            schemeFromVars(skipType, [t]),
            ['values', 'count'],
            'std://vec'
          ),
        ],
        [
          'zip',
          moduleFunctionWithScheme(
            'zip',
            ['Vec<any>', 'Vec<any>'],
            'Vec<Tuple<any,any>>',
            schemeFromVars(zipType, [t, u]),
            ['left', 'right'],
            'std://vec'
          ),
        ],
        [
          'enumerate',
          moduleFunctionWithScheme(
            'enumerate',
            ['Vec<any>'],
            'Vec<Tuple<int,any>>',
            schemeFromVars(enumerateType, [t]),
            ['values'],
            'std://vec'
          ),
        ],
      ]),
    };
  })();

  return { listModule, vecModule };
}
