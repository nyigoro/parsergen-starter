import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar, promiseType } from './types.js';
import { adt, fnType, moduleFunction, moduleFunctionWithScheme, primitive, schemeFromVars } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdSystemRuntimeDomainModules(): Pick<StdDomainModules,
  'pathModule' | 'envModule' | 'processModule' | 'jsonModule' | 'httpModule' | 'timeModule' | 'asyncModule' | 'regexModule' | 'cryptoModule'> {
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
  return {
    pathModule,
    envModule,
    processModule,
    jsonModule,
    httpModule,
    timeModule,
    asyncModule,
    regexModule,
    cryptoModule,
  };
}
