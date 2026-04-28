import type { ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar } from './types.js';
import { adt, fnType, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdCollectionsAlgebraicDomainModules(): Pick<StdDomainModules,
  'optionModule' | 'resultModule'> {
  const optionModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const u = freshTypeVar();
    const optionT = adt('Option', [t]);
    const optionU = adt('Option', [u]);
    const mapType: Type = fnType([fnType([t], u), optionT], optionU);
    const andThenType: Type = fnType([fnType([t], optionU), optionT], optionU);
    const orElseType: Type = fnType([fnType([], optionT), optionT], optionT);
    const unwrapOrType: Type = fnType([t, optionT], t);
    const isSomeType: Type = fnType([optionT], primitive('bool'));
    const isNoneType: Type = fnType([optionT], primitive('bool'));
    const someType: Type = fnType([t], optionT);
    const noneType: Type = fnType([], optionT);

    return {
      kind: 'module',
      name: 'Option',
      moduleId: 'std://option',
      exports: new Map([
        [
          'map',
          moduleFunctionWithScheme(
            'map',
            ['any', 'Option<any>'],
            'Option<any>',
            schemeFromVars(mapType, [t, u]),
            ['mapper', 'value'],
            'std://option'
          ),
        ],
        [
          'and_then',
          moduleFunctionWithScheme(
            'and_then',
            ['any', 'Option<any>'],
            'Option<any>',
            schemeFromVars(andThenType, [t, u]),
            ['mapper', 'value'],
            'std://option'
          ),
        ],
        [
          'or_else',
          moduleFunctionWithScheme(
            'or_else',
            ['any', 'Option<any>'],
            'Option<any>',
            schemeFromVars(orElseType, [t]),
            ['fallback', 'value'],
            'std://option'
          ),
        ],
        [
          'unwrap_or',
          moduleFunctionWithScheme(
            'unwrap_or',
            ['any', 'Option<any>'],
            'any',
            schemeFromVars(unwrapOrType, [t]),
            ['default', 'value'],
            'std://option'
          ),
        ],
        [
          'is_some',
          moduleFunctionWithScheme(
            'is_some',
            ['Option<any>'],
            'bool',
            schemeFromVars(isSomeType, [t]),
            ['value'],
            'std://option'
          ),
        ],
        [
          'is_none',
          moduleFunctionWithScheme(
            'is_none',
            ['Option<any>'],
            'bool',
            schemeFromVars(isNoneType, [t]),
            ['value'],
            'std://option'
          ),
        ],
        [
          'Some',
          moduleFunctionWithScheme(
            'Some',
            ['any'],
            'Option<any>',
            schemeFromVars(someType, [t]),
            ['value'],
            'std://option'
          ),
        ],
        [
          'None',
          moduleFunctionWithScheme(
            'None',
            [],
            'Option<any>',
            schemeFromVars(noneType, [t]),
            [],
            'std://option'
          ),
        ],
      ]),
    };
  })();

  const resultModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const e = freshTypeVar();
    const u = freshTypeVar();
    const f = freshTypeVar();
    const resultTE = adt('Result', [t, e]);
    const resultUE = adt('Result', [u, e]);
    const resultTF = adt('Result', [t, f]);
    const mapType: Type = fnType([fnType([t], u), resultTE], resultUE);
    const andThenType: Type = fnType([fnType([t], resultUE), resultTE], resultUE);
    const orElseType: Type = fnType([fnType([e], resultTF), resultTE], resultTF);
    const unwrapOrType: Type = fnType([t, resultTE], t);
    const isOkType: Type = fnType([resultTE], primitive('bool'));
    const isErrType: Type = fnType([resultTE], primitive('bool'));
    const okType: Type = fnType([t], resultTE);
    const errType: Type = fnType([e], resultTE);

    return {
      kind: 'module',
      name: 'Result',
      moduleId: 'std://result',
      exports: new Map([
        [
          'map',
          moduleFunctionWithScheme(
            'map',
            ['any', 'Result<any,any>'],
            'Result<any,any>',
            schemeFromVars(mapType, [t, e, u]),
            ['mapper', 'value'],
            'std://result'
          ),
        ],
        [
          'and_then',
          moduleFunctionWithScheme(
            'and_then',
            ['any', 'Result<any,any>'],
            'Result<any,any>',
            schemeFromVars(andThenType, [t, e, u]),
            ['mapper', 'value'],
            'std://result'
          ),
        ],
        [
          'or_else',
          moduleFunctionWithScheme(
            'or_else',
            ['any', 'Result<any,any>'],
            'Result<any,any>',
            schemeFromVars(orElseType, [t, e, f]),
            ['mapper', 'value'],
            'std://result'
          ),
        ],
        [
          'unwrap_or',
          moduleFunctionWithScheme(
            'unwrap_or',
            ['any', 'Result<any,any>'],
            'any',
            schemeFromVars(unwrapOrType, [t, e]),
            ['default', 'value'],
            'std://result'
          ),
        ],
        [
          'is_ok',
          moduleFunctionWithScheme(
            'is_ok',
            ['Result<any,any>'],
            'bool',
            schemeFromVars(isOkType, [t, e]),
            ['value'],
            'std://result'
          ),
        ],
        [
          'is_err',
          moduleFunctionWithScheme(
            'is_err',
            ['Result<any,any>'],
            'bool',
            schemeFromVars(isErrType, [t, e]),
            ['value'],
            'std://result'
          ),
        ],
        [
          'Ok',
          moduleFunctionWithScheme(
            'Ok',
            ['any'],
            'Result<any,any>',
            schemeFromVars(okType, [t, e]),
            ['value'],
            'std://result'
          ),
        ],
        [
          'Err',
          moduleFunctionWithScheme(
            'Err',
            ['any'],
            'Result<any,any>',
            schemeFromVars(errType, [t, e]),
            ['error'],
            'std://result'
          ),
        ],
      ]),
    };
  })();

  return { optionModule, resultModule };
}
