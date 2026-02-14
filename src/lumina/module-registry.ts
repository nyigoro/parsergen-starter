import { type LuminaProgram, type LuminaImport, type LuminaType } from './ast.js';
import { type Type, type TypeScheme, freshTypeVar, promiseType } from './types.js';

export interface ModuleFunction {
  kind: 'function';
  name: string;
  paramTypes: LuminaType[];
  returnType: LuminaType;
  paramNames?: string[];
  hmType: TypeScheme;
  moduleId: string;
  exportName?: string;
}

export interface ModuleValue {
  kind: 'value';
  name: string;
  valueType: LuminaType;
  hmType: TypeScheme;
  moduleId: string;
  exportName?: string;
}

export interface ModuleNamespace {
  kind: 'module';
  name: string;
  moduleId: string;
  exports: Map<string, ModuleExport>;
}

export type ModuleExport = ModuleFunction | ModuleValue | ModuleNamespace;
export type ModuleRegistry = Map<string, ModuleNamespace>;

const primitive = (name: 'int' | 'float' | 'string' | 'bool' | 'void' | 'any'): Type => ({
  kind: 'primitive',
  name,
});

const adt = (name: string, params: Type[] = []): Type => ({
  kind: 'adt',
  name,
  params,
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

const schemeFromVars = (type: Type, vars: Type[]): TypeScheme => ({
  kind: 'scheme',
  variables: vars.filter((v) => v.kind === 'variable').map((v) => v.id),
  type,
});

const moduleFunction = (
  name: string,
  paramTypes: LuminaType[],
  returnType: LuminaType,
  hmArgs: Type[],
  hmReturn: Type,
  paramNames?: string[],
  moduleId?: string
): ModuleFunction => ({
  kind: 'function',
  name,
  paramTypes,
  returnType,
  paramNames,
  hmType: scheme(fnType(hmArgs, hmReturn)),
  moduleId: moduleId ?? 'std://unknown',
  exportName: name,
});

const moduleFunctionWithScheme = (
  name: string,
  paramTypes: LuminaType[],
  returnType: LuminaType,
  hmType: TypeScheme,
  paramNames?: string[],
  moduleId?: string
): ModuleFunction => ({
  kind: 'function',
  name,
  paramTypes,
  returnType,
  paramNames,
  hmType,
  moduleId: moduleId ?? 'std://unknown',
  exportName: name,
});

const moduleValue = (
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

const aliasModuleFunction = (fn: ModuleFunction, name: string): ModuleFunction => {
  if (fn.name === name) return fn;
  return { ...fn, name, exportName: fn.exportName ?? fn.name };
};

const aliasModuleValue = (value: ModuleValue, name: string): ModuleValue => {
  if (value.name === name) return value;
  return { ...value, name, exportName: value.exportName ?? value.name };
};

export function createStdModuleRegistry(): ModuleRegistry {
  const registry: ModuleRegistry = new Map();
  const ioModule: ModuleNamespace = {
    kind: 'module',
    name: 'io',
    moduleId: 'std://io',
    exports: new Map<string, ModuleExport>([
      [
        'println',
        moduleFunction(
          'println',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value'],
          'std://io'
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
          'std://io'
        ),
      ],
      [
        'eprint',
        moduleFunction(
          'eprint',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value'],
          'std://io'
        ),
      ],
      [
        'eprintln',
        moduleFunction(
          'eprintln',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['value'],
          'std://io'
        ),
      ],
      [
        'readLine',
        moduleFunction(
          'readLine',
          [],
          'Option<string>',
          [],
          adt('Option', [primitive('string')]),
          [],
          'std://io'
        ),
      ],
      [
        'readLineAsync',
        moduleFunction(
          'readLineAsync',
          [],
          'Promise<Option<string>>',
          [],
          promiseType(adt('Option', [primitive('string')])),
          [],
          'std://io'
        ),
      ],
      [
        'read_file',
        moduleFunction(
          'read_file',
          ['string'],
          'Result<string,string>',
          [primitive('string')],
          adt('Result', [primitive('string'), primitive('string')]),
          ['path'],
          'std://io'
        ),
      ],
      [
        'write_file',
        moduleFunction(
          'write_file',
          ['string', 'string'],
          'Result<void,string>',
          [primitive('string'), primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['path', 'content'],
          'std://io'
        ),
      ],
    ]),
  };

  const fsModule: ModuleNamespace = {
    kind: 'module',
    name: 'fs',
    moduleId: 'std://fs',
    exports: new Map<string, ModuleExport>([
      [
        'readFile',
        moduleFunction(
          'readFile',
          ['string'],
          'Promise<Result<string,string>>',
          [primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['path'],
          'std://fs'
        ),
      ],
      [
        'writeFile',
        moduleFunction(
          'writeFile',
          ['string', 'string'],
          'Promise<Result<void,string>>',
          [primitive('string'), primitive('string')],
          promiseType(adt('Result', [primitive('void'), primitive('string')])),
          ['path', 'content'],
          'std://fs'
        ),
      ],
    ]),
  };

  const httpModule: ModuleNamespace = {
    kind: 'module',
    name: 'http',
    moduleId: 'std://http',
    exports: new Map<string, ModuleExport>([
      [
        'fetch',
        moduleFunction(
          'fetch',
          ['Request'],
          'Promise<Result<Response,string>>',
          [adt('Request')],
          promiseType(adt('Result', [adt('Response'), primitive('string')])),
          ['request'],
          'std://http'
        ),
      ],
    ]),
  };

  const strModule: ModuleNamespace = {
    kind: 'module',
    name: 'str',
    moduleId: 'std://str',
    exports: new Map<string, ModuleExport>([
      [
        'length',
        moduleFunction(
          'length',
          ['string'],
          'int',
          [primitive('string')],
          primitive('int'),
          ['value'],
          'std://str'
        ),
      ],
      [
        'concat',
        moduleFunction(
          'concat',
          ['string', 'string'],
          'string',
          [primitive('string'), primitive('string')],
          primitive('string'),
          ['a', 'b'],
          'std://str'
        ),
      ],
      [
        'substring',
        moduleFunction(
          'substring',
          ['string', 'int', 'int'],
          'string',
          [primitive('string'), primitive('int'), primitive('int')],
          primitive('string'),
          ['value', 'start', 'end'],
          'std://str'
        ),
      ],
      [
        'split',
        moduleFunction(
          'split',
          ['string', 'string'],
          'List<string>',
          [primitive('string'), primitive('string')],
          adt('List', [primitive('string')]),
          ['value', 'sep'],
          'std://str'
        ),
      ],
      [
        'trim',
        moduleFunction(
          'trim',
          ['string'],
          'string',
          [primitive('string')],
          primitive('string'),
          ['value'],
          'std://str'
        ),
      ],
      [
        'contains',
        moduleFunction(
          'contains',
          ['string', 'string'],
          'bool',
          [primitive('string'), primitive('string')],
          primitive('bool'),
          ['haystack', 'needle'],
          'std://str'
        ),
      ],
      [
        'eq',
        moduleFunction(
          'eq',
          ['string', 'string'],
          'bool',
          [primitive('string'), primitive('string')],
          primitive('bool'),
          ['a', 'b'],
          'std://str'
        ),
      ],
      [
        'char_at',
        moduleFunction(
          'char_at',
          ['string', 'int'],
          'Option<string>',
          [primitive('string'), primitive('int')],
          adt('Option', [primitive('string')]),
          ['value', 'index'],
          'std://str'
        ),
      ],
      [
        'is_whitespace',
        moduleFunction(
          'is_whitespace',
          ['string'],
          'bool',
          [primitive('string')],
          primitive('bool'),
          ['value'],
          'std://str'
        ),
      ],
      [
        'is_digit',
        moduleFunction(
          'is_digit',
          ['string'],
          'bool',
          [primitive('string')],
          primitive('bool'),
          ['value'],
          'std://str'
        ),
      ],
      [
        'to_int',
        moduleFunction(
          'to_int',
          ['string'],
          'Result<int,string>',
          [primitive('string')],
          adt('Result', [primitive('int'), primitive('string')]),
          ['value'],
          'std://str'
        ),
      ],
      [
        'to_float',
        moduleFunction(
          'to_float',
          ['string'],
          'Result<float,string>',
          [primitive('string')],
          adt('Result', [primitive('float'), primitive('string')]),
          ['value'],
          'std://str'
        ),
      ],
      [
        'from_int',
        moduleFunction(
          'from_int',
          ['int'],
          'string',
          [primitive('int')],
          primitive('string'),
          ['value'],
          'std://str'
        ),
      ],
      [
        'from_float',
        moduleFunction(
          'from_float',
          ['float'],
          'string',
          [primitive('float')],
          primitive('string'),
          ['value'],
          'std://str'
        ),
      ],
    ]),
  };

  const mathModule: ModuleNamespace = {
    kind: 'module',
    name: 'math',
    moduleId: 'std://math',
    exports: new Map<string, ModuleExport>([
      [
        'abs',
        moduleFunction(
          'abs',
          ['int'],
          'int',
          [primitive('int')],
          primitive('int'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'min',
        moduleFunction(
          'min',
          ['int', 'int'],
          'int',
          [primitive('int'), primitive('int')],
          primitive('int'),
          ['a', 'b'],
          'std://math'
        ),
      ],
      [
        'max',
        moduleFunction(
          'max',
          ['int', 'int'],
          'int',
          [primitive('int'), primitive('int')],
          primitive('int'),
          ['a', 'b'],
          'std://math'
        ),
      ],
      [
        'absf',
        moduleFunction(
          'absf',
          ['float'],
          'float',
          [primitive('float')],
          primitive('float'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'minf',
        moduleFunction(
          'minf',
          ['float', 'float'],
          'float',
          [primitive('float'), primitive('float')],
          primitive('float'),
          ['a', 'b'],
          'std://math'
        ),
      ],
      [
        'maxf',
        moduleFunction(
          'maxf',
          ['float', 'float'],
          'float',
          [primitive('float'), primitive('float')],
          primitive('float'),
          ['a', 'b'],
          'std://math'
        ),
      ],
      [
        'sqrt',
        moduleFunction(
          'sqrt',
          ['float'],
          'float',
          [primitive('float')],
          primitive('float'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'pow',
        moduleFunction(
          'pow',
          ['float', 'float'],
          'float',
          [primitive('float'), primitive('float')],
          primitive('float'),
          ['base', 'exp'],
          'std://math'
        ),
      ],
      [
        'floor',
        moduleFunction(
          'floor',
          ['float'],
          'int',
          [primitive('float')],
          primitive('int'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'ceil',
        moduleFunction(
          'ceil',
          ['float'],
          'int',
          [primitive('float')],
          primitive('int'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'round',
        moduleFunction(
          'round',
          ['float'],
          'int',
          [primitive('float')],
          primitive('int'),
          ['value'],
          'std://math'
        ),
      ],
      [
        'pi',
        moduleValue('pi', 'float', primitive('float'), 'std://math'),
      ],
      [
        'e',
        moduleValue('e', 'float', primitive('float'), 'std://math'),
      ],
    ]),
  };

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

  const preludeModule: ModuleNamespace = {
    kind: 'module',
    name: '@prelude',
    moduleId: 'std://prelude',
    exports: new Map([
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
    ]),
  };

  const stdModule: ModuleNamespace = {
    kind: 'module',
    name: '@std',
    moduleId: 'std://root',
    exports: new Map([
      ['io', ioModule],
      ['Option', optionModule],
      ['Result', resultModule],
      ['str', strModule],
      ['math', mathModule],
      ['list', listModule],
      ['fs', fsModule],
      ['http', httpModule],
    ]),
  };

  registry.set('@std', stdModule);
  registry.set('@std/io', ioModule);
  registry.set('@std/fs', fsModule);
  registry.set('@std/http', httpModule);
  registry.set('@std/Option', optionModule);
  registry.set('@std/Result', resultModule);
  registry.set('@std/str', strModule);
  registry.set('@std/math', mathModule);
  registry.set('@std/list', listModule);
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

export function getPreludeExports(registry?: ModuleRegistry): ModuleExport[] {
  if (!registry) return [];
  const prelude = registry.get('@prelude');
  if (!prelude) return [];
  return Array.from(prelude.exports.values());
}
