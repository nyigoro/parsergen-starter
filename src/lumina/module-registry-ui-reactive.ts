import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import { adt, fnType, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';

export function createStdUiReactiveDomainModules(): Pick<StdDomainModules, 'reactiveModule'> {
  const reactiveModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const signalT = adt('Signal', [t]);
    const memoT = adt('Memo', [t]);
    const effectT = adt('Effect');
    const thunkT = fnType([], t);
    const updaterT = fnType([t], t);

    const createSignalType: Type = fnType([t], signalT);
    const getType: Type = fnType([signalT], t);
    const setType: Type = fnType([signalT, t], primitive('bool'));
    const updateSignalType: Type = fnType([signalT, updaterT], t);
    const createMemoType: Type = fnType([thunkT], memoT);
    const memoGetType: Type = fnType([memoT], t);
    const createEffectType: Type = fnType([fnType([], primitive('void'))], effectT);
    const disposeEffectType: Type = fnType([effectT], primitive('void'));
    const batchType: Type = fnType([thunkT], t);
    const untrackType: Type = fnType([thunkT], t);

    return {
      kind: 'module',
      name: 'reactive',
      moduleId: 'std://reactive',
      exports: new Map<string, ModuleExport>([
        [
          'createSignal',
          moduleFunctionWithScheme(
            'createSignal',
            ['any'],
            'Signal<any>',
            schemeFromVars(createSignalType, [t]),
            ['initial'],
            'std://reactive'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['Signal<any>'],
            'any',
            schemeFromVars(getType, [t]),
            ['signal'],
            'std://reactive'
          ),
        ],
        [
          'set',
          moduleFunctionWithScheme(
            'set',
            ['Signal<any>', 'any'],
            'bool',
            schemeFromVars(setType, [t]),
            ['signal', 'value'],
            'std://reactive'
          ),
        ],
        [
          'updateSignal',
          moduleFunctionWithScheme(
            'updateSignal',
            ['Signal<any>', 'fn(any) -> any'],
            'any',
            schemeFromVars(updateSignalType, [t]),
            ['signal', 'updater'],
            'std://reactive'
          ),
        ],
        [
          'createMemo',
          moduleFunctionWithScheme(
            'createMemo',
            ['fn() -> any'],
            'Memo<any>',
            schemeFromVars(createMemoType, [t]),
            ['compute'],
            'std://reactive'
          ),
        ],
        [
          'memoGet',
          moduleFunctionWithScheme(
            'memoGet',
            ['Memo<any>'],
            'any',
            schemeFromVars(memoGetType, [t]),
            ['memo'],
            'std://reactive'
          ),
        ],
        [
          'createEffect',
          moduleFunctionWithScheme(
            'createEffect',
            ['fn() -> void'],
            'Effect',
            schemeFromVars(createEffectType, []),
            ['run'],
            'std://reactive'
          ),
        ],
        [
          'disposeEffect',
          moduleFunctionWithScheme(
            'disposeEffect',
            ['Effect'],
            'void',
            schemeFromVars(disposeEffectType, []),
            ['effect'],
            'std://reactive'
          ),
        ],
        [
          'batch',
          moduleFunctionWithScheme(
            'batch',
            ['fn() -> any'],
            'any',
            schemeFromVars(batchType, [t]),
            ['block'],
            'std://reactive'
          ),
        ],
        [
          'untrack',
          moduleFunctionWithScheme(
            'untrack',
            ['fn() -> any'],
            'any',
            schemeFromVars(untrackType, [t]),
            ['block'],
            'std://reactive'
          ),
        ],
      ]),
    };
  })();

  return { reactiveModule };
}
