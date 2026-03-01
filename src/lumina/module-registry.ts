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
      [
        'readDir',
        moduleFunction(
          'readDir',
          ['string'],
          'Promise<Result<List<string>,string>>',
          [primitive('string')],
          promiseType(adt('Result', [adt('List', [primitive('string')]), primitive('string')])),
          ['path'],
          'std://fs'
        ),
      ],
      [
        'metadata',
        moduleFunction(
          'metadata',
          ['string'],
          'Promise<Result<FileMetadata,string>>',
          [primitive('string')],
          promiseType(adt('Result', [adt('FileMetadata'), primitive('string')])),
          ['path'],
          'std://fs'
        ),
      ],
      [
        'exists',
        moduleFunction(
          'exists',
          ['string'],
          'Promise<bool>',
          [primitive('string')],
          promiseType(primitive('bool')),
          ['path'],
          'std://fs'
        ),
      ],
      [
        'mkdir',
        moduleFunction(
          'mkdir',
          ['string', 'bool'],
          'Promise<Result<void,string>>',
          [primitive('string'), primitive('bool')],
          promiseType(adt('Result', [primitive('void'), primitive('string')])),
          ['path', 'recursive'],
          'std://fs'
        ),
      ],
      [
        'removeFile',
        moduleFunction(
          'removeFile',
          ['string'],
          'Promise<Result<void,string>>',
          [primitive('string')],
          promiseType(adt('Result', [primitive('void'), primitive('string')])),
          ['path'],
          'std://fs'
        ),
      ],
    ]),
  };

  const pathModule: ModuleNamespace = {
    kind: 'module',
    name: 'path',
    moduleId: 'std://path',
    exports: new Map<string, ModuleExport>([
      [
        'join',
        moduleFunction(
          'join',
          ['string', 'string'],
          'string',
          [primitive('string'), primitive('string')],
          primitive('string'),
          ['left', 'right'],
          'std://path'
        ),
      ],
      [
        'is_absolute',
        moduleFunction(
          'is_absolute',
          ['string'],
          'bool',
          [primitive('string')],
          primitive('bool'),
          ['value'],
          'std://path'
        ),
      ],
      [
        'extension',
        moduleFunction(
          'extension',
          ['string'],
          'Option<string>',
          [primitive('string')],
          adt('Option', [primitive('string')]),
          ['value'],
          'std://path'
        ),
      ],
      [
        'dirname',
        moduleFunction(
          'dirname',
          ['string'],
          'string',
          [primitive('string')],
          primitive('string'),
          ['value'],
          'std://path'
        ),
      ],
      [
        'basename',
        moduleFunction(
          'basename',
          ['string'],
          'string',
          [primitive('string')],
          primitive('string'),
          ['value'],
          'std://path'
        ),
      ],
      [
        'normalize',
        moduleFunction(
          'normalize',
          ['string'],
          'string',
          [primitive('string')],
          primitive('string'),
          ['value'],
          'std://path'
        ),
      ],
    ]),
  };

  const envModule: ModuleNamespace = {
    kind: 'module',
    name: 'env',
    moduleId: 'std://env',
    exports: new Map<string, ModuleExport>([
      [
        'var',
        moduleFunction(
          'var',
          ['string'],
          'Result<string,string>',
          [primitive('string')],
          adt('Result', [primitive('string'), primitive('string')]),
          ['name'],
          'std://env'
        ),
      ],
      [
        'set_var',
        moduleFunction(
          'set_var',
          ['string', 'string'],
          'Result<void,string>',
          [primitive('string'), primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['name', 'value'],
          'std://env'
        ),
      ],
      [
        'remove_var',
        moduleFunction(
          'remove_var',
          ['string'],
          'Result<void,string>',
          [primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['name'],
          'std://env'
        ),
      ],
      [
        'args',
        moduleFunction(
          'args',
          [],
          'Vec<string>',
          [],
          adt('Vec', [primitive('string')]),
          [],
          'std://env'
        ),
      ],
      [
        'cwd',
        moduleFunction(
          'cwd',
          [],
          'Result<string,string>',
          [],
          adt('Result', [primitive('string'), primitive('string')]),
          [],
          'std://env'
        ),
      ],
    ]),
  };

  const processModule: ModuleNamespace = {
    kind: 'module',
    name: 'process',
    moduleId: 'std://process',
    exports: new Map<string, ModuleExport>([
      [
        'spawn',
        moduleFunction(
          'spawn',
          ['string', 'Vec<string>'],
          'Result<ProcessOutput,string>',
          [primitive('string'), adt('Vec', [primitive('string')])],
          adt('Result', [adt('ProcessOutput'), primitive('string')]),
          ['command', 'args'],
          'std://process'
        ),
      ],
      [
        'exit',
        moduleFunction(
          'exit',
          ['int'],
          'void',
          [primitive('int')],
          primitive('void'),
          ['code'],
          'std://process'
        ),
      ],
      [
        'cwd',
        moduleFunction(
          'cwd',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://process'
        ),
      ],
      [
        'pid',
        moduleFunction(
          'pid',
          [],
          'int',
          [],
          primitive('int'),
          [],
          'std://process'
        ),
      ],
    ]),
  };

  const jsonModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const fromStringType = fnType([primitive('string')], adt('Result', [t, primitive('string')]));
    return {
      kind: 'module',
      name: 'json',
      moduleId: 'std://json',
      exports: new Map<string, ModuleExport>([
        [
          'to_string',
          moduleFunction(
            'to_string',
            ['any'],
            'Result<string,string>',
            [primitive('any')],
            adt('Result', [primitive('string'), primitive('string')]),
            ['value'],
            'std://json'
          ),
        ],
        [
          'to_pretty_string',
          moduleFunction(
            'to_pretty_string',
            ['any'],
            'Result<string,string>',
            [primitive('any')],
            adt('Result', [primitive('string'), primitive('string')]),
            ['value'],
            'std://json'
          ),
        ],
        [
          'from_string',
          moduleFunctionWithScheme(
            'from_string',
            ['string'],
            'Result<any,string>',
            schemeFromVars(fromStringType, [t]),
            ['source'],
            'std://json'
          ),
        ],
        [
          'parse',
          moduleFunctionWithScheme(
            'parse',
            ['string'],
            'Result<any,string>',
            schemeFromVars(fromStringType, [t]),
            ['source'],
            'std://json'
          ),
        ],
      ]),
    };
  })();

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

  const timeModule: ModuleNamespace = {
    kind: 'module',
    name: 'time',
    moduleId: 'std://time',
    exports: new Map<string, ModuleExport>([
      [
        'nowMs',
        moduleFunction('nowMs', [], 'int', [], primitive('int'), [], 'std://time'),
      ],
      [
        'nowIso',
        moduleFunction('nowIso', [], 'string', [], primitive('string'), [], 'std://time'),
      ],
      [
        'instantNow',
        moduleFunction('instantNow', [], 'int', [], primitive('int'), [], 'std://time'),
      ],
      [
        'elapsedMs',
        moduleFunction(
          'elapsedMs',
          ['int'],
          'int',
          [primitive('int')],
          primitive('int'),
          ['since'],
          'std://time'
        ),
      ],
      [
        'sleep',
        moduleFunction(
          'sleep',
          ['int'],
          'Promise<void>',
          [primitive('int')],
          promiseType(primitive('void')),
          ['ms'],
          'std://time'
        ),
      ],
    ]),
  };

  const asyncModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const promiseT = promiseType(t);
    const vecPromiseT = adt('Vec', [promiseT]);
    const vecT = adt('Vec', [t]);
    const timeoutType: Type = fnType([primitive('int')], promiseType(primitive('void')));
    const joinAllType: Type = fnType([vecPromiseT], promiseType(vecT));

    return {
      kind: 'module',
      name: 'async',
      moduleId: 'std://async',
      exports: new Map<string, ModuleExport>([
        [
          'timeout',
          moduleFunctionWithScheme(
            'timeout',
            ['int'],
            'Promise<void>',
            schemeFromVars(timeoutType, []),
            ['ms'],
            'std://async'
          ),
        ],
        [
          'join_all',
          moduleFunctionWithScheme(
            'join_all',
            ['Vec<Promise<any>>'],
            'Promise<Vec<any>>',
            schemeFromVars(joinAllType, [t]),
            ['values'],
            'std://async'
          ),
        ],
      ]),
    };
  })();

  const regexModule: ModuleNamespace = {
    kind: 'module',
    name: 'regex',
    moduleId: 'std://regex',
    exports: new Map<string, ModuleExport>([
      [
        'isValid',
        moduleFunction(
          'isValid',
          ['string', 'string'],
          'bool',
          [primitive('string'), primitive('string')],
          primitive('bool'),
          ['pattern', 'flags'],
          'std://regex'
        ),
      ],
      [
        'test',
        moduleFunction(
          'test',
          ['string', 'string', 'string'],
          'Result<bool,string>',
          [primitive('string'), primitive('string'), primitive('string')],
          adt('Result', [primitive('bool'), primitive('string')]),
          ['pattern', 'text', 'flags'],
          'std://regex'
        ),
      ],
      [
        'find',
        moduleFunction(
          'find',
          ['string', 'string', 'string'],
          'Option<string>',
          [primitive('string'), primitive('string'), primitive('string')],
          adt('Option', [primitive('string')]),
          ['pattern', 'text', 'flags'],
          'std://regex'
        ),
      ],
      [
        'findAll',
        moduleFunction(
          'findAll',
          ['string', 'string', 'string'],
          'Result<List<string>,string>',
          [primitive('string'), primitive('string'), primitive('string')],
          adt('Result', [adt('List', [primitive('string')]), primitive('string')]),
          ['pattern', 'text', 'flags'],
          'std://regex'
        ),
      ],
      [
        'replace',
        moduleFunction(
          'replace',
          ['string', 'string', 'string', 'string'],
          'Result<string,string>',
          [primitive('string'), primitive('string'), primitive('string'), primitive('string')],
          adt('Result', [primitive('string'), primitive('string')]),
          ['pattern', 'text', 'replacement', 'flags'],
          'std://regex'
        ),
      ],
    ]),
  };

  const cryptoModule: ModuleNamespace = {
    kind: 'module',
    name: 'crypto',
    moduleId: 'std://crypto',
    exports: new Map<string, ModuleExport>([
      [
        'isAvailable',
        moduleFunction(
          'isAvailable',
          [],
          'Promise<bool>',
          [],
          promiseType(primitive('bool')),
          [],
          'std://crypto'
        ),
      ],
      [
        'sha256',
        moduleFunction(
          'sha256',
          ['string'],
          'Promise<Result<string,string>>',
          [primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['value'],
          'std://crypto'
        ),
      ],
      [
        'hmacSha256',
        moduleFunction(
          'hmacSha256',
          ['string', 'string'],
          'Promise<Result<string,string>>',
          [primitive('string'), primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['key', 'value'],
          'std://crypto'
        ),
      ],
      [
        'randomBytes',
        moduleFunction(
          'randomBytes',
          ['int'],
          'Promise<Result<List<int>,string>>',
          [primitive('int')],
          promiseType(adt('Result', [adt('List', [primitive('int')]), primitive('string')])),
          ['length'],
          'std://crypto'
        ),
      ],
      [
        'randomInt',
        moduleFunction(
          'randomInt',
          ['int', 'int'],
          'Promise<Result<int,string>>',
          [primitive('int'), primitive('int')],
          promiseType(adt('Result', [primitive('int'), primitive('string')])),
          ['min', 'max'],
          'std://crypto'
        ),
      ],
      [
        'aesGcmEncrypt',
        moduleFunction(
          'aesGcmEncrypt',
          ['string', 'string'],
          'Promise<Result<string,string>>',
          [primitive('string'), primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['key', 'plaintext'],
          'std://crypto'
        ),
      ],
      [
        'aesGcmDecrypt',
        moduleFunction(
          'aesGcmDecrypt',
          ['string', 'string'],
          'Promise<Result<string,string>>',
          [primitive('string'), primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['key', 'payload'],
          'std://crypto'
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
        'slice',
        moduleFunction(
          'slice',
          ['string', 'Range'],
          'string',
          [primitive('string'), adt('Range')],
          primitive('string'),
          ['value', 'range'],
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

  const channelModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const senderT = adt('Sender', [t]);
    const receiverT = adt('Receiver', [t]);
    const channelT = adt('Channel', [t]);
    const optionT = adt('Option', [t]);
    const sendResultT = adt('Result', [primitive('void'), primitive('string')]);
    const recvResultT = adt('Result', [optionT, primitive('string')]);
    const newType: Type = fnType([], channelT);
    const sendType: Type = fnType([senderT, t], primitive('bool'));
    const trySendType: Type = fnType([senderT, t], primitive('bool'));
    const sendAsyncType: Type = fnType([senderT, t], promiseType(primitive('bool')));
    const sendResultType: Type = fnType([senderT, t], sendResultT);
    const sendAsyncResultType: Type = fnType([senderT, t], promiseType(sendResultT));
    const cloneSenderType: Type = fnType([senderT], senderT);
    const recvType: Type = fnType([receiverT], promiseType(optionT));
    const tryRecvType: Type = fnType([receiverT], optionT);
    const recvResultType: Type = fnType([receiverT], promiseType(recvResultT));
    const tryRecvResultType: Type = fnType([receiverT], recvResultT);
    const boundedType: Type = fnType([primitive('int')], channelT);
    const closeSenderType: Type = fnType([senderT], primitive('void'));
    const closeReceiverType: Type = fnType([receiverT], primitive('void'));
    const senderClosedType: Type = fnType([senderT], primitive('bool'));
    const receiverClosedType: Type = fnType([receiverT], primitive('bool'));
    const closeType: Type = fnType([channelT], primitive('void'));
    const availableType: Type = fnType([], primitive('bool'));

    return {
      kind: 'module',
      name: 'channel',
      moduleId: 'std://channel',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'Channel<any>',
            schemeFromVars(newType, [t]),
            [],
            'std://channel'
          ),
        ],
        [
          'send',
          moduleFunctionWithScheme(
            'send',
            ['Sender<any>', 'any'],
            'bool',
            schemeFromVars(sendType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_async',
          moduleFunctionWithScheme(
            'send_async',
            ['Sender<any>', 'any'],
            'Promise<bool>',
            schemeFromVars(sendAsyncType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'try_send',
          moduleFunctionWithScheme(
            'try_send',
            ['Sender<any>', 'any'],
            'bool',
            schemeFromVars(trySendType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_result',
          moduleFunctionWithScheme(
            'send_result',
            ['Sender<any>', 'any'],
            'Result<void,string>',
            schemeFromVars(sendResultType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_async_result',
          moduleFunctionWithScheme(
            'send_async_result',
            ['Sender<any>', 'any'],
            'Promise<Result<void,string>>',
            schemeFromVars(sendAsyncResultType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'clone_sender',
          moduleFunctionWithScheme(
            'clone_sender',
            ['Sender<any>'],
            'Sender<any>',
            schemeFromVars(cloneSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'bounded',
          moduleFunctionWithScheme(
            'bounded',
            ['int'],
            'Channel<any>',
            schemeFromVars(boundedType, [t]),
            ['capacity'],
            'std://channel'
          ),
        ],
        [
          'recv',
          moduleFunctionWithScheme(
            'recv',
            ['Receiver<any>'],
            'Promise<Option<any>>',
            schemeFromVars(recvType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'try_recv',
          moduleFunctionWithScheme(
            'try_recv',
            ['Receiver<any>'],
            'Option<any>',
            schemeFromVars(tryRecvType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'recv_result',
          moduleFunctionWithScheme(
            'recv_result',
            ['Receiver<any>'],
            'Promise<Result<Option<any>,string>>',
            schemeFromVars(recvResultType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'try_recv_result',
          moduleFunctionWithScheme(
            'try_recv_result',
            ['Receiver<any>'],
            'Result<Option<any>,string>',
            schemeFromVars(tryRecvResultType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'close_sender',
          moduleFunctionWithScheme(
            'close_sender',
            ['Sender<any>'],
            'void',
            schemeFromVars(closeSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'close_receiver',
          moduleFunctionWithScheme(
            'close_receiver',
            ['Receiver<any>'],
            'void',
            schemeFromVars(closeReceiverType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'drop_sender',
          moduleFunctionWithScheme(
            'drop_sender',
            ['Sender<any>'],
            'void',
            schemeFromVars(closeSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'drop_receiver',
          moduleFunctionWithScheme(
            'drop_receiver',
            ['Receiver<any>'],
            'void',
            schemeFromVars(closeReceiverType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'is_sender_closed',
          moduleFunctionWithScheme(
            'is_sender_closed',
            ['Sender<any>'],
            'bool',
            schemeFromVars(senderClosedType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'is_receiver_closed',
          moduleFunctionWithScheme(
            'is_receiver_closed',
            ['Receiver<any>'],
            'bool',
            schemeFromVars(receiverClosedType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'close',
          moduleFunctionWithScheme(
            'close',
            ['Channel<any>'],
            'void',
            schemeFromVars(closeType, [t]),
            ['channel'],
            'std://channel'
          ),
        ],
        [
          'is_available',
          moduleFunctionWithScheme(
            'is_available',
            [],
            'bool',
            schemeFromVars(availableType, []),
            [],
            'std://channel'
          ),
        ],
      ]),
    };
  })();

  const asyncChannelModule: ModuleNamespace = {
    kind: 'module',
    name: 'async_channel',
    moduleId: 'std://async_channel',
    exports: new Map(channelModule.exports),
  };

  const threadModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const threadT = adt('Thread');
    const threadHandleT = adt('ThreadHandle', [t]);
    const joinResultT = adt('Result', [t, primitive('string')]);
    const optionT = adt('Option', [t]);
    const resultT = adt('Result', [threadT, primitive('string')]);
    const spawnType: Type = fnType([fnType([], t)], threadHandleT);
    const spawnWorkerType: Type = fnType([primitive('string')], promiseType(resultT));
    const joinType: Type = fnType([threadHandleT], promiseType(joinResultT));
    const postType: Type = fnType([threadT, t], primitive('bool'));
    const recvType: Type = fnType([threadT], promiseType(optionT));
    const tryRecvType: Type = fnType([threadT], optionT);
    const terminateType: Type = fnType([threadT], promiseType(primitive('void')));
    const joinWorkerType: Type = fnType([threadT], promiseType(primitive('int')));
    const availableType: Type = fnType([], primitive('bool'));

    return {
      kind: 'module',
      name: 'thread',
      moduleId: 'std://thread',
      exports: new Map([
        [
          'spawn',
          moduleFunctionWithScheme(
            'spawn',
            ['fn() -> any'],
            'ThreadHandle<any>',
            schemeFromVars(spawnType, []),
            ['task'],
            'std://thread'
          ),
        ],
        [
          'spawn_worker',
          moduleFunctionWithScheme(
            'spawn_worker',
            ['string'],
            'Promise<Result<Thread,string>>',
            schemeFromVars(spawnWorkerType, []),
            ['specifier'],
            'std://thread'
          ),
        ],
        [
          'post',
          moduleFunctionWithScheme(
            'post',
            ['Thread', 'any'],
            'bool',
            schemeFromVars(postType, [t]),
            ['thread', 'value'],
            'std://thread'
          ),
        ],
        [
          'recv',
          moduleFunctionWithScheme(
            'recv',
            ['Thread'],
            'Promise<Option<any>>',
            schemeFromVars(recvType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'try_recv',
          moduleFunctionWithScheme(
            'try_recv',
            ['Thread'],
            'Option<any>',
            schemeFromVars(tryRecvType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'terminate',
          moduleFunctionWithScheme(
            'terminate',
            ['Thread'],
            'Promise<void>',
            schemeFromVars(terminateType, []),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'join',
          moduleFunctionWithScheme(
            'join',
            ['ThreadHandle<any>'],
            'Promise<Result<any,string>>',
            schemeFromVars(joinType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'join_worker',
          moduleFunctionWithScheme(
            'join_worker',
            ['Thread'],
            'Promise<int>',
            schemeFromVars(joinWorkerType, []),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'is_available',
          moduleFunctionWithScheme(
            'is_available',
            [],
            'bool',
            schemeFromVars(availableType, []),
            [],
            'std://thread'
          ),
        ],
      ]),
    };
  })();

  const syncModule: ModuleNamespace = (() => {
    const mutexT = adt('Mutex');
    const semaphoreT = adt('Semaphore');
    const atomicI32T = adt('AtomicI32');
    const mutexNewType: Type = fnType([], mutexT);
    const mutexAcquireType: Type = fnType([mutexT], promiseType(primitive('bool')));
    const mutexTryAcquireType: Type = fnType([mutexT], primitive('bool'));
    const mutexReleaseType: Type = fnType([mutexT], primitive('bool'));
    const mutexIsLockedType: Type = fnType([mutexT], primitive('bool'));
    const semaphoreNewType: Type = fnType([primitive('int')], semaphoreT);
    const semaphoreAcquireType: Type = fnType([semaphoreT], promiseType(primitive('bool')));
    const semaphoreTryAcquireType: Type = fnType([semaphoreT], primitive('bool'));
    const semaphoreReleaseType: Type = fnType([semaphoreT, primitive('int')], primitive('void'));
    const semaphoreAvailableType: Type = fnType([semaphoreT], primitive('int'));
    const atomicNewType: Type = fnType([primitive('int')], atomicI32T);
    const atomicAvailableType: Type = fnType([], primitive('bool'));
    const atomicLoadType: Type = fnType([atomicI32T], primitive('int'));
    const atomicStoreType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicAddType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicSubType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicCmpExType: Type = fnType([atomicI32T, primitive('int'), primitive('int')], primitive('int'));

    return {
      kind: 'module',
      name: 'sync',
      moduleId: 'std://sync',
      exports: new Map([
        [
          'mutex_new',
          moduleFunctionWithScheme(
            'mutex_new',
            [],
            'Mutex',
            schemeFromVars(mutexNewType, []),
            [],
            'std://sync'
          ),
        ],
        [
          'mutex_acquire',
          moduleFunctionWithScheme(
            'mutex_acquire',
            ['Mutex'],
            'Promise<bool>',
            schemeFromVars(mutexAcquireType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_try_acquire',
          moduleFunctionWithScheme(
            'mutex_try_acquire',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexTryAcquireType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_release',
          moduleFunctionWithScheme(
            'mutex_release',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexReleaseType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_is_locked',
          moduleFunctionWithScheme(
            'mutex_is_locked',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexIsLockedType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'semaphore_new',
          moduleFunctionWithScheme(
            'semaphore_new',
            ['int'],
            'Semaphore',
            schemeFromVars(semaphoreNewType, []),
            ['permits'],
            'std://sync'
          ),
        ],
        [
          'semaphore_acquire',
          moduleFunctionWithScheme(
            'semaphore_acquire',
            ['Semaphore'],
            'Promise<bool>',
            schemeFromVars(semaphoreAcquireType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'semaphore_try_acquire',
          moduleFunctionWithScheme(
            'semaphore_try_acquire',
            ['Semaphore'],
            'bool',
            schemeFromVars(semaphoreTryAcquireType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'semaphore_release',
          moduleFunctionWithScheme(
            'semaphore_release',
            ['Semaphore', 'int'],
            'void',
            schemeFromVars(semaphoreReleaseType, []),
            ['semaphore', 'count'],
            'std://sync'
          ),
        ],
        [
          'semaphore_available',
          moduleFunctionWithScheme(
            'semaphore_available',
            ['Semaphore'],
            'int',
            schemeFromVars(semaphoreAvailableType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_new',
          moduleFunctionWithScheme(
            'atomic_i32_new',
            ['int'],
            'AtomicI32',
            schemeFromVars(atomicNewType, []),
            ['initial'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_is_available',
          moduleFunctionWithScheme(
            'atomic_i32_is_available',
            [],
            'bool',
            schemeFromVars(atomicAvailableType, []),
            [],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_load',
          moduleFunctionWithScheme(
            'atomic_i32_load',
            ['AtomicI32'],
            'int',
            schemeFromVars(atomicLoadType, []),
            ['atomic'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_store',
          moduleFunctionWithScheme(
            'atomic_i32_store',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicStoreType, []),
            ['atomic', 'value'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_add',
          moduleFunctionWithScheme(
            'atomic_i32_add',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicAddType, []),
            ['atomic', 'delta'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_sub',
          moduleFunctionWithScheme(
            'atomic_i32_sub',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicSubType, []),
            ['atomic', 'delta'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_compare_exchange',
          moduleFunctionWithScheme(
            'atomic_i32_compare_exchange',
            ['AtomicI32', 'int', 'int'],
            'int',
            schemeFromVars(atomicCmpExType, []),
            ['atomic', 'expected', 'replacement'],
            'std://sync'
          ),
        ],
      ]),
    };
  })();

  const renderModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const signalT = adt('Signal', [t]);
    const memoT = adt('Memo', [t]);
    const effectT = adt('Effect');
    const vnodeT = adt('VNode');
    const rendererT = adt('Renderer');
    const renderRootT = adt('RenderRoot');
    const reactiveRenderRootT = adt('ReactiveRenderRoot');
    const containerT = freshTypeVar();
    const thunkT = fnType([], t);
    const effectFnT = fnType([], primitive('void'));
    const updaterT = fnType([t], t);

    const signalCtorType: Type = fnType([t], signalT);
    const signalGetType: Type = fnType([signalT], t);
    const signalSetType: Type = fnType([signalT, t], primitive('bool'));
    const signalUpdateType: Type = fnType([signalT, updaterT], t);
    const memoCtorType: Type = fnType([thunkT], memoT);
    const memoGetType: Type = fnType([memoT], t);
    const memoDisposeType: Type = fnType([memoT], primitive('void'));
    const effectCtorType: Type = fnType([effectFnT], effectT);
    const effectDisposeType: Type = fnType([effectT], primitive('void'));
    const batchType: Type = fnType([thunkT], t);
    const untrackType: Type = fnType([thunkT], t);
    const textValueT = freshTypeVar();
    const attrsT = freshTypeVar();
    const childrenT = freshTypeVar();
    const fragmentChildrenT = freshTypeVar();
    const rendererFactoryT = freshTypeVar();
    const clickReturnT = freshTypeVar();
    const textType: Type = fnType([textValueT], vnodeT);
    const elementType: Type = fnType([primitive('string'), attrsT, childrenT], vnodeT);
    const fragmentType: Type = fnType([fragmentChildrenT], vnodeT);
    const propsEmptyType: Type = fnType([], primitive('any'));
    const propsClassType: Type = fnType([primitive('string')], primitive('any'));
    const propsOnClickType: Type = fnType([fnType([], clickReturnT)], primitive('any'));
    const propsOnClickDeltaType: Type = fnType([adt('Signal', [primitive('int')]), primitive('int')], primitive('any'));
    const propsOnClickIncType: Type = fnType([adt('Signal', [primitive('int')])], primitive('any'));
    const propsOnClickDecType: Type = fnType([adt('Signal', [primitive('int')])], primitive('any'));
    const propsMergeType: Type = fnType([primitive('any'), primitive('any')], primitive('any'));
    const domGetElementByIdType: Type = fnType([primitive('string')], primitive('any'));
    const isVNodeType: Type = fnType([primitive('any')], primitive('bool'));
    const serializeType: Type = fnType([vnodeT], primitive('string'));
    const parseType: Type = fnType([primitive('string')], vnodeT);
    const createRendererType: Type = fnType([rendererFactoryT], rendererT);
    const createDomRendererType: Type = fnType([], rendererT);
    const createSsrRendererType: Type = fnType([], rendererT);
    const createCanvasRendererType: Type = fnType([], rendererT);
    const createTerminalRendererType: Type = fnType([], rendererT);
    const renderToStringType: Type = fnType([vnodeT], primitive('string'));
    const renderToTerminalType: Type = fnType([vnodeT], primitive('string'));
    const createRootType: Type = fnType([rendererT, containerT], renderRootT);
    const hydrateType: Type = fnType([rendererT, containerT, vnodeT], renderRootT);
    const mountType: Type = fnType([rendererT, containerT, vnodeT], renderRootT);
    const mountReactiveType: Type = fnType([rendererT, containerT, fnType([], vnodeT)], reactiveRenderRootT);
    const hydrateReactiveType: Type = fnType([rendererT, containerT, fnType([], vnodeT)], reactiveRenderRootT);
    const updateType: Type = fnType([renderRootT, vnodeT], primitive('void'));
    const unmountType: Type = fnType([renderRootT], primitive('void'));
    const disposeReactiveType: Type = fnType([reactiveRenderRootT], primitive('void'));

    return {
      kind: 'module',
      name: 'render',
      moduleId: 'std://render',
      exports: new Map([
        [
          'signal',
          moduleFunctionWithScheme(
            'signal',
            ['any'],
            'Signal<any>',
            schemeFromVars(signalCtorType, [t]),
            ['initial'],
            'std://render'
          ),
        ],
        [
          'get',
          moduleFunctionWithScheme(
            'get',
            ['Signal<any>'],
            'any',
            schemeFromVars(signalGetType, [t]),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'peek',
          moduleFunctionWithScheme(
            'peek',
            ['Signal<any>'],
            'any',
            schemeFromVars(signalGetType, [t]),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'set',
          moduleFunctionWithScheme(
            'set',
            ['Signal<any>', 'any'],
            'bool',
            schemeFromVars(signalSetType, [t]),
            ['signal', 'value'],
            'std://render'
          ),
        ],
        [
          'update_signal',
          moduleFunctionWithScheme(
            'update_signal',
            ['Signal<any>', 'fn(any) -> any'],
            'any',
            schemeFromVars(signalUpdateType, [t]),
            ['signal', 'updater'],
            'std://render'
          ),
        ],
        [
          'memo',
          moduleFunctionWithScheme(
            'memo',
            ['fn() -> any'],
            'Memo<any>',
            schemeFromVars(memoCtorType, [t]),
            ['compute'],
            'std://render'
          ),
        ],
        [
          'memo_get',
          moduleFunctionWithScheme(
            'memo_get',
            ['Memo<any>'],
            'any',
            schemeFromVars(memoGetType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'memo_peek',
          moduleFunctionWithScheme(
            'memo_peek',
            ['Memo<any>'],
            'any',
            schemeFromVars(memoGetType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'memo_dispose',
          moduleFunctionWithScheme(
            'memo_dispose',
            ['Memo<any>'],
            'void',
            schemeFromVars(memoDisposeType, [t]),
            ['memo'],
            'std://render'
          ),
        ],
        [
          'effect',
          moduleFunctionWithScheme(
            'effect',
            ['fn() -> void'],
            'Effect',
            schemeFromVars(effectCtorType, []),
            ['run'],
            'std://render'
          ),
        ],
        [
          'dispose_effect',
          moduleFunctionWithScheme(
            'dispose_effect',
            ['Effect'],
            'void',
            schemeFromVars(effectDisposeType, []),
            ['effect'],
            'std://render'
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
            'std://render'
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
            'std://render'
          ),
        ],
        [
          'text',
          moduleFunctionWithScheme(
            'text',
            ['any'],
            'VNode',
            schemeFromVars(textType, [textValueT]),
            ['value'],
            'std://render'
          ),
        ],
        [
          'element',
          moduleFunctionWithScheme(
            'element',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(elementType, [attrsT, childrenT]),
            ['tag', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'vnode',
          moduleFunctionWithScheme(
            'vnode',
            ['string', 'any', 'any'],
            'VNode',
            schemeFromVars(elementType, [attrsT, childrenT]),
            ['tag', 'props', 'children'],
            'std://render'
          ),
        ],
        [
          'props_empty',
          moduleFunctionWithScheme(
            'props_empty',
            [],
            'any',
            schemeFromVars(propsEmptyType, []),
            [],
            'std://render'
          ),
        ],
        [
          'props_class',
          moduleFunctionWithScheme(
            'props_class',
            ['string'],
            'any',
            schemeFromVars(propsClassType, []),
            ['className'],
            'std://render'
          ),
        ],
        [
          'props_on_click',
          moduleFunctionWithScheme(
            'props_on_click',
            ['fn() -> any'],
            'any',
            schemeFromVars(propsOnClickType, [clickReturnT]),
            ['handler'],
            'std://render'
          ),
        ],
        [
          'props_on_click_delta',
          moduleFunctionWithScheme(
            'props_on_click_delta',
            ['Signal<int>', 'int'],
            'any',
            schemeFromVars(propsOnClickDeltaType, []),
            ['signal', 'delta'],
            'std://render'
          ),
        ],
        [
          'props_on_click_inc',
          moduleFunctionWithScheme(
            'props_on_click_inc',
            ['Signal<int>'],
            'any',
            schemeFromVars(propsOnClickIncType, []),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'props_on_click_dec',
          moduleFunctionWithScheme(
            'props_on_click_dec',
            ['Signal<int>'],
            'any',
            schemeFromVars(propsOnClickDecType, []),
            ['signal'],
            'std://render'
          ),
        ],
        [
          'props_merge',
          moduleFunctionWithScheme(
            'props_merge',
            ['any', 'any'],
            'any',
            schemeFromVars(propsMergeType, []),
            ['left', 'right'],
            'std://render'
          ),
        ],
        [
          'dom_get_element_by_id',
          moduleFunctionWithScheme(
            'dom_get_element_by_id',
            ['string'],
            'any',
            schemeFromVars(domGetElementByIdType, []),
            ['id'],
            'std://render'
          ),
        ],
        [
          'fragment',
          moduleFunctionWithScheme(
            'fragment',
            ['any'],
            'VNode',
            schemeFromVars(fragmentType, [fragmentChildrenT]),
            ['children'],
            'std://render'
          ),
        ],
        [
          'is_vnode',
          moduleFunctionWithScheme(
            'is_vnode',
            ['any'],
            'bool',
            schemeFromVars(isVNodeType, []),
            ['value'],
            'std://render'
          ),
        ],
        [
          'serialize',
          moduleFunctionWithScheme(
            'serialize',
            ['VNode'],
            'string',
            schemeFromVars(serializeType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'parse',
          moduleFunctionWithScheme(
            'parse',
            ['string'],
            'VNode',
            schemeFromVars(parseType, []),
            ['json'],
            'std://render'
          ),
        ],
        [
          'create_renderer',
          moduleFunctionWithScheme(
            'create_renderer',
            ['any'],
            'Renderer',
            schemeFromVars(createRendererType, [rendererFactoryT]),
            ['renderer'],
            'std://render'
          ),
        ],
        [
          'create_dom_renderer',
          moduleFunctionWithScheme(
            'create_dom_renderer',
            [],
            'Renderer',
            schemeFromVars(createDomRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'createDomRenderer',
          moduleFunctionWithScheme(
            'createDomRenderer',
            [],
            'Renderer',
            schemeFromVars(createDomRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_ssr_renderer',
          moduleFunctionWithScheme(
            'create_ssr_renderer',
            [],
            'Renderer',
            schemeFromVars(createSsrRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_canvas_renderer',
          moduleFunctionWithScheme(
            'create_canvas_renderer',
            [],
            'Renderer',
            schemeFromVars(createCanvasRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'create_terminal_renderer',
          moduleFunctionWithScheme(
            'create_terminal_renderer',
            [],
            'Renderer',
            schemeFromVars(createTerminalRendererType, []),
            [],
            'std://render'
          ),
        ],
        [
          'render_to_string',
          moduleFunctionWithScheme(
            'render_to_string',
            ['VNode'],
            'string',
            schemeFromVars(renderToStringType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'render_to_terminal',
          moduleFunctionWithScheme(
            'render_to_terminal',
            ['VNode'],
            'string',
            schemeFromVars(renderToTerminalType, []),
            ['node'],
            'std://render'
          ),
        ],
        [
          'create_root',
          moduleFunctionWithScheme(
            'create_root',
            ['Renderer', 'any'],
            'RenderRoot',
            schemeFromVars(createRootType, [containerT]),
            ['renderer', 'container'],
            'std://render'
          ),
        ],
        [
          'hydrate',
          moduleFunctionWithScheme(
            'hydrate',
            ['Renderer', 'any', 'VNode'],
            'RenderRoot',
            schemeFromVars(hydrateType, [containerT]),
            ['renderer', 'container', 'node'],
            'std://render'
          ),
        ],
        [
          'mount_reactive',
          moduleFunctionWithScheme(
            'mount_reactive',
            ['Renderer', 'any', 'fn() -> VNode'],
            'ReactiveRenderRoot',
            schemeFromVars(mountReactiveType, [containerT]),
            ['renderer', 'container', 'view'],
            'std://render'
          ),
        ],
        [
          'hydrate_reactive',
          moduleFunctionWithScheme(
            'hydrate_reactive',
            ['Renderer', 'any', 'fn() -> VNode'],
            'ReactiveRenderRoot',
            schemeFromVars(hydrateReactiveType, [containerT]),
            ['renderer', 'container', 'view'],
            'std://render'
          ),
        ],
        [
          'mount',
          moduleFunctionWithScheme(
            'mount',
            ['Renderer', 'any', 'VNode'],
            'RenderRoot',
            schemeFromVars(mountType, [containerT]),
            ['renderer', 'container', 'node'],
            'std://render'
          ),
        ],
        [
          'update',
          moduleFunctionWithScheme(
            'update',
            ['RenderRoot', 'VNode'],
            'void',
            schemeFromVars(updateType, []),
            ['root', 'node'],
            'std://render'
          ),
        ],
        [
          'unmount',
          moduleFunctionWithScheme(
            'unmount',
            ['RenderRoot'],
            'void',
            schemeFromVars(unmountType, []),
            ['root'],
            'std://render'
          ),
        ],
        [
          'dispose_reactive',
          moduleFunctionWithScheme(
            'dispose_reactive',
            ['ReactiveRenderRoot'],
            'void',
            schemeFromVars(disposeReactiveType, []),
            ['root'],
            'std://render'
          ),
        ],
      ]),
    };
  })();

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
      exports: new Map([
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

  const preludeJoinT = freshTypeVar();
  const preludeJoinAllType: Type = fnType(
    [adt('Vec', [promiseType(preludeJoinT)])],
    promiseType(adt('Vec', [preludeJoinT]))
  );
  const preludeTimeoutType: Type = fnType([primitive('int')], promiseType(primitive('void')));

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
      ['vec', vecModule],
      ['hashmap', hashmapModule],
      ['hashset', hashsetModule],
      ['deque', dequeModule],
      ['btreemap', btreemapModule],
      ['btreeset', btreesetModule],
      ['priority_queue', priorityQueueModule],
      ['channel', channelModule],
      ['async_channel', asyncChannelModule],
      ['thread', threadModule],
      ['sync', syncModule],
      ['reactive', reactiveModule],
      ['render', renderModule],
      ['fs', fsModule],
      ['path', pathModule],
      ['env', envModule],
      ['process', processModule],
      ['json', jsonModule],
      ['http', httpModule],
      ['time', timeModule],
      ['async_util', asyncModule],
      ['regex', regexModule],
      ['crypto', cryptoModule],
    ]),
  };

  registry.set('@std', stdModule);
  registry.set('@std/io', ioModule);
  registry.set('@std/fs', fsModule);
  registry.set('@std/path', pathModule);
  registry.set('@std/env', envModule);
  registry.set('@std/process', processModule);
  registry.set('@std/json', jsonModule);
  registry.set('@std/http', httpModule);
  registry.set('@std/time', timeModule);
  registry.set('@std/async', asyncModule);
  registry.set('@std/async_util', asyncModule);
  registry.set('@std/regex', regexModule);
  registry.set('@std/crypto', cryptoModule);
  registry.set('@std/Option', optionModule);
  registry.set('@std/Result', resultModule);
  registry.set('@std/str', strModule);
  registry.set('@std/math', mathModule);
  registry.set('@std/list', listModule);
  registry.set('@std/vec', vecModule);
  registry.set('@std/hashmap', hashmapModule);
  registry.set('@std/hashset', hashsetModule);
  registry.set('@std/deque', dequeModule);
  registry.set('@std/btreemap', btreemapModule);
  registry.set('@std/btreeset', btreesetModule);
  registry.set('@std/priority_queue', priorityQueueModule);
  registry.set('@std/channel', channelModule);
  registry.set('@std/async_channel', asyncChannelModule);
  registry.set('@std/thread', threadModule);
  registry.set('@std/sync', syncModule);
  registry.set('@std/reactive', reactiveModule);
  registry.set('@std/render', renderModule);
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
