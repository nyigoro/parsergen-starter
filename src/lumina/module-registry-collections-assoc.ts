import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import { adt, fnType, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdCollectionsAssocDomainModules(): Pick<StdDomainModules,
  'hashmapModule' | 'hashsetModule' | 'dequeModule' | 'btreemapModule' | 'btreesetModule' | 'priorityQueueModule'> {
  const hashmapModule: ModuleNamespace = (() => {
    const k = freshTypeVar();
    const v = freshTypeVar();
    const mapT = adt('HashMap', [k, v]);
    const optionV = adt('Option', [v]);
    const vecK = adt('Vec', [k]);
    const vecV = adt('Vec', [v]);
    const newType: Type = fnType([], mapT);
    const insertType: Type = fnType([mapT, k, v], optionV);
    const getType: Type = fnType([mapT, k], optionV);
    const removeType: Type = fnType([mapT, k], optionV);
    const containsType: Type = fnType([mapT, k], primitive('bool'));
    const lenType: Type = fnType([mapT], primitive('int'));
    const clearType: Type = fnType([mapT], primitive('void'));
    const keysType: Type = fnType([mapT], vecK);
    const valuesType: Type = fnType([mapT], vecV);

    return {
      kind: 'module',
      name: 'hashmap',
      moduleId: 'std://hashmap',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'HashMap<any, any>',
            schemeFromVars(newType, [k, v]),
            [],
            'std://hashmap'
          ),
        ],
        [
          'insert',
          moduleFunctionWithScheme(
            'insert',
            ['HashMap<any, any>', 'any', 'any'],
            'Option<any>',
            schemeFromVars(insertType, [k, v]),
            ['map', 'key', 'value'],
            'std://hashmap'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['HashMap<any, any>', 'any'],
            'Option<any>',
            schemeFromVars(getType, [k, v]),
            ['map', 'key'],
            'std://hashmap'
          ),
        ],
        [
          'remove',
          moduleFunctionWithScheme(
            'remove',
            ['HashMap<any, any>', 'any'],
            'Option<any>',
            schemeFromVars(removeType, [k, v]),
            ['map', 'key'],
            'std://hashmap'
          ),
        ],
        [
          'contains_key',
          moduleFunctionWithScheme(
            'contains_key',
            ['HashMap<any, any>', 'any'],
            'bool',
            schemeFromVars(containsType, [k, v]),
            ['map', 'key'],
            'std://hashmap'
          ),
        ],
        [
          'len',
          moduleFunctionWithScheme(
            'len',
            ['HashMap<any, any>'],
            'int',
            schemeFromVars(lenType, [k, v]),
            ['map'],
            'std://hashmap'
          ),
        ],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['HashMap<any, any>'],
            'void',
            schemeFromVars(clearType, [k, v]),
            ['map'],
            'std://hashmap'
          ),
        ],
        [
          'keys',
          moduleFunctionWithScheme(
            'keys',
            ['HashMap<any, any>'],
            'Vec<any>',
            schemeFromVars(keysType, [k, v]),
            ['map'],
            'std://hashmap'
          ),
        ],
        [
          'values',
          moduleFunctionWithScheme(
            'values',
            ['HashMap<any, any>'],
            'Vec<any>',
            schemeFromVars(valuesType, [k, v]),
            ['map'],
            'std://hashmap'
          ),
        ],
      ]),
    };
  })();

  const hashsetModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const setT = adt('HashSet', [t]);
    const vecT = adt('Vec', [t]);
    const newType: Type = fnType([], setT);
    const insertType: Type = fnType([setT, t], primitive('bool'));
    const containsType: Type = fnType([setT, t], primitive('bool'));
    const removeType: Type = fnType([setT, t], primitive('bool'));
    const lenType: Type = fnType([setT], primitive('int'));
    const clearType: Type = fnType([setT], primitive('void'));
    const valuesType: Type = fnType([setT], vecT);

    return {
      kind: 'module',
      name: 'hashset',
      moduleId: 'std://hashset',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'HashSet<any>',
            schemeFromVars(newType, [t]),
            [],
            'std://hashset'
          ),
        ],
        [
          'insert',
          moduleFunctionWithScheme(
            'insert',
            ['HashSet<any>', 'any'],
            'bool',
            schemeFromVars(insertType, [t]),
            ['set', 'value'],
            'std://hashset'
          ),
        ],
        [
          'contains',
          moduleFunctionWithScheme(
            'contains',
            ['HashSet<any>', 'any'],
            'bool',
            schemeFromVars(containsType, [t]),
            ['set', 'value'],
            'std://hashset'
          ),
        ],
        [
          'remove',
          moduleFunctionWithScheme(
            'remove',
            ['HashSet<any>', 'any'],
            'bool',
            schemeFromVars(removeType, [t]),
            ['set', 'value'],
            'std://hashset'
          ),
        ],
        [
          'len',
          moduleFunctionWithScheme(
            'len',
            ['HashSet<any>'],
            'int',
            schemeFromVars(lenType, [t]),
            ['set'],
            'std://hashset'
          ),
        ],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['HashSet<any>'],
            'void',
            schemeFromVars(clearType, [t]),
            ['set'],
            'std://hashset'
          ),
        ],
        [
          'values',
          moduleFunctionWithScheme(
            'values',
            ['HashSet<any>'],
            'Vec<any>',
            schemeFromVars(valuesType, [t]),
            ['set'],
            'std://hashset'
          ),
        ],
      ]),
    };
  })();

  const dequeModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const dequeT = adt('Deque', [t]);
    const optionT = adt('Option', [t]);
    const newType: Type = fnType([], dequeT);
    const pushFrontType: Type = fnType([dequeT, t], primitive('void'));
    const pushBackType: Type = fnType([dequeT, t], primitive('void'));
    const popFrontType: Type = fnType([dequeT], optionT);
    const popBackType: Type = fnType([dequeT], optionT);
    const lenType: Type = fnType([dequeT], primitive('int'));
    const clearType: Type = fnType([dequeT], primitive('void'));

    return {
      kind: 'module',
      name: 'deque',
      moduleId: 'std://deque',
      exports: new Map([
        ['new', moduleFunctionWithScheme('new', [], 'Deque<any>', schemeFromVars(newType, [t]), [], 'std://deque')],
        [
          'push_front',
          moduleFunctionWithScheme(
            'push_front',
            ['Deque<any>', 'any'],
            'void',
            schemeFromVars(pushFrontType, [t]),
            ['deque', 'value'],
            'std://deque'
          ),
        ],
        [
          'push_back',
          moduleFunctionWithScheme(
            'push_back',
            ['Deque<any>', 'any'],
            'void',
            schemeFromVars(pushBackType, [t]),
            ['deque', 'value'],
            'std://deque'
          ),
        ],
        [
          'pop_front',
          moduleFunctionWithScheme(
            'pop_front',
            ['Deque<any>'],
            'Option<any>',
            schemeFromVars(popFrontType, [t]),
            ['deque'],
            'std://deque'
          ),
        ],
        [
          'pop_back',
          moduleFunctionWithScheme(
            'pop_back',
            ['Deque<any>'],
            'Option<any>',
            schemeFromVars(popBackType, [t]),
            ['deque'],
            'std://deque'
          ),
        ],
        ['len', moduleFunctionWithScheme('len', ['Deque<any>'], 'int', schemeFromVars(lenType, [t]), ['deque'], 'std://deque')],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['Deque<any>'],
            'void',
            schemeFromVars(clearType, [t]),
            ['deque'],
            'std://deque'
          ),
        ],
      ]),
    };
  })();

  const btreemapModule: ModuleNamespace = (() => {
    const k = freshTypeVar();
    const v = freshTypeVar();
    const mapT = adt('BTreeMap', [k, v]);
    const optionV = adt('Option', [v]);
    const vecK = adt('Vec', [k]);
    const vecV = adt('Vec', [v]);
    const vecKV = adt('Vec', [adt('Tuple', [k, v])]);
    const newType: Type = fnType([], mapT);
    const insertType: Type = fnType([mapT, k, v], optionV);
    const getType: Type = fnType([mapT, k], optionV);
    const removeType: Type = fnType([mapT, k], optionV);
    const containsType: Type = fnType([mapT, k], primitive('bool'));
    const lenType: Type = fnType([mapT], primitive('int'));
    const clearType: Type = fnType([mapT], primitive('void'));
    const keysType: Type = fnType([mapT], vecK);
    const valuesType: Type = fnType([mapT], vecV);
    const entriesType: Type = fnType([mapT], vecKV);

    return {
      kind: 'module',
      name: 'btreemap',
      moduleId: 'std://btreemap',
      exports: new Map([
        ['new', moduleFunctionWithScheme('new', [], 'BTreeMap<any, any>', schemeFromVars(newType, [k, v]), [], 'std://btreemap')],
        [
          'insert',
          moduleFunctionWithScheme(
            'insert',
            ['BTreeMap<any, any>', 'any', 'any'],
            'Option<any>',
            schemeFromVars(insertType, [k, v]),
            ['map', 'key', 'value'],
            'std://btreemap'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['BTreeMap<any, any>', 'any'],
            'Option<any>',
            schemeFromVars(getType, [k, v]),
            ['map', 'key'],
            'std://btreemap'
          ),
        ],
        [
          'remove',
          moduleFunctionWithScheme(
            'remove',
            ['BTreeMap<any, any>', 'any'],
            'Option<any>',
            schemeFromVars(removeType, [k, v]),
            ['map', 'key'],
            'std://btreemap'
          ),
        ],
        [
          'contains_key',
          moduleFunctionWithScheme(
            'contains_key',
            ['BTreeMap<any, any>', 'any'],
            'bool',
            schemeFromVars(containsType, [k, v]),
            ['map', 'key'],
            'std://btreemap'
          ),
        ],
        ['len', moduleFunctionWithScheme('len', ['BTreeMap<any, any>'], 'int', schemeFromVars(lenType, [k, v]), ['map'], 'std://btreemap')],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['BTreeMap<any, any>'],
            'void',
            schemeFromVars(clearType, [k, v]),
            ['map'],
            'std://btreemap'
          ),
        ],
        [
          'keys',
          moduleFunctionWithScheme(
            'keys',
            ['BTreeMap<any, any>'],
            'Vec<any>',
            schemeFromVars(keysType, [k, v]),
            ['map'],
            'std://btreemap'
          ),
        ],
        [
          'values',
          moduleFunctionWithScheme(
            'values',
            ['BTreeMap<any, any>'],
            'Vec<any>',
            schemeFromVars(valuesType, [k, v]),
            ['map'],
            'std://btreemap'
          ),
        ],
        [
          'entries',
          moduleFunctionWithScheme(
            'entries',
            ['BTreeMap<any, any>'],
            'Vec<Tuple<any,any>>',
            schemeFromVars(entriesType, [k, v]),
            ['map'],
            'std://btreemap'
          ),
        ],
      ]),
    };
  })();

  const btreesetModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const setT = adt('BTreeSet', [t]);
    const vecT = adt('Vec', [t]);
    const newType: Type = fnType([], setT);
    const insertType: Type = fnType([setT, t], primitive('bool'));
    const containsType: Type = fnType([setT, t], primitive('bool'));
    const removeType: Type = fnType([setT, t], primitive('bool'));
    const lenType: Type = fnType([setT], primitive('int'));
    const clearType: Type = fnType([setT], primitive('void'));
    const valuesType: Type = fnType([setT], vecT);

    return {
      kind: 'module',
      name: 'btreeset',
      moduleId: 'std://btreeset',
      exports: new Map([
        ['new', moduleFunctionWithScheme('new', [], 'BTreeSet<any>', schemeFromVars(newType, [t]), [], 'std://btreeset')],
        [
          'insert',
          moduleFunctionWithScheme(
            'insert',
            ['BTreeSet<any>', 'any'],
            'bool',
            schemeFromVars(insertType, [t]),
            ['set', 'value'],
            'std://btreeset'
          ),
        ],
        [
          'contains',
          moduleFunctionWithScheme(
            'contains',
            ['BTreeSet<any>', 'any'],
            'bool',
            schemeFromVars(containsType, [t]),
            ['set', 'value'],
            'std://btreeset'
          ),
        ],
        [
          'remove',
          moduleFunctionWithScheme(
            'remove',
            ['BTreeSet<any>', 'any'],
            'bool',
            schemeFromVars(removeType, [t]),
            ['set', 'value'],
            'std://btreeset'
          ),
        ],
        ['len', moduleFunctionWithScheme('len', ['BTreeSet<any>'], 'int', schemeFromVars(lenType, [t]), ['set'], 'std://btreeset')],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['BTreeSet<any>'],
            'void',
            schemeFromVars(clearType, [t]),
            ['set'],
            'std://btreeset'
          ),
        ],
        [
          'values',
          moduleFunctionWithScheme(
            'values',
            ['BTreeSet<any>'],
            'Vec<any>',
            schemeFromVars(valuesType, [t]),
            ['set'],
            'std://btreeset'
          ),
        ],
      ]),
    };
  })();

  const priorityQueueModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const pqT = adt('PriorityQueue', [t]);
    const optionT = adt('Option', [t]);
    const newType: Type = fnType([], pqT);
    const pushType: Type = fnType([pqT, t], primitive('void'));
    const popType: Type = fnType([pqT], optionT);
    const peekType: Type = fnType([pqT], optionT);
    const lenType: Type = fnType([pqT], primitive('int'));
    const clearType: Type = fnType([pqT], primitive('void'));

    return {
      kind: 'module',
      name: 'priority_queue',
      moduleId: 'std://priority_queue',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'PriorityQueue<any>',
            schemeFromVars(newType, [t]),
            [],
            'std://priority_queue'
          ),
        ],
        [
          'push',
          moduleFunctionWithScheme(
            'push',
            ['PriorityQueue<any>', 'any'],
            'void',
            schemeFromVars(pushType, [t]),
            ['queue', 'value'],
            'std://priority_queue'
          ),
        ],
        [
          'pop',
          moduleFunctionWithScheme(
            'pop',
            ['PriorityQueue<any>'],
            'Option<any>',
            schemeFromVars(popType, [t]),
            ['queue'],
            'std://priority_queue'
          ),
        ],
        [
          'peek',
          moduleFunctionWithScheme(
            'peek',
            ['PriorityQueue<any>'],
            'Option<any>',
            schemeFromVars(peekType, [t]),
            ['queue'],
            'std://priority_queue'
          ),
        ],
        [
          'len',
          moduleFunctionWithScheme(
            'len',
            ['PriorityQueue<any>'],
            'int',
            schemeFromVars(lenType, [t]),
            ['queue'],
            'std://priority_queue'
          ),
        ],
        [
          'clear',
          moduleFunctionWithScheme(
            'clear',
            ['PriorityQueue<any>'],
            'void',
            schemeFromVars(clearType, [t]),
            ['queue'],
            'std://priority_queue'
          ),
        ],
      ]),
    };
  })();

  return {
    hashmapModule,
    hashsetModule,
    dequeModule,
    btreemapModule,
    btreesetModule,
    priorityQueueModule,
  };
}
