import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { promiseType } from './types.js';
import { adt, moduleFunction, primitive } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdSystemIoDomainModules(): Pick<StdDomainModules,
  'ioModule' | 'fsModule' | 'opfsModule'> {
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

  const opfsModule: ModuleNamespace = {
    kind: 'module',
    name: 'opfs',
    moduleId: 'std://opfs',
    exports: new Map<string, ModuleExport>([
      [
        'is_available',
        moduleFunction(
          'is_available',
          [],
          'bool',
          [],
          primitive('bool'),
          [],
          'std://opfs'
        ),
      ],
      [
        'readFile',
        moduleFunction(
          'readFile',
          ['string'],
          'Promise<Result<string,string>>',
          [primitive('string')],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['path'],
          'std://opfs'
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
          'std://opfs'
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
          'std://opfs'
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
          'std://opfs'
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
          'std://opfs'
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
          'std://opfs'
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
          'std://opfs'
        ),
      ],
    ]),
  };
  return { ioModule, fsModule, opfsModule };
}
