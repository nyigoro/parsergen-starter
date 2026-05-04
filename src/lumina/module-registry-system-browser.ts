import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { promiseType } from './types.js';
import { adt, fnType, moduleFunction, primitive } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdSystemBrowserDomainModules(): Pick<StdDomainModules,
  'urlModule' | 'routerModule' | 'webStorageModule' | 'domModule' | 'webWorkerModule' | 'webStreamsModule'> {
  const urlType = adt('URL');
  const urlConfigType = adt('URLConfig');
  const domElementType = adt('DOMElement');
  const eventHandleType = adt('EventHandle');
  const workerHandleType = adt('WorkerHandle');
  const readableStreamType = adt('ReadableStream');

  const urlModule: ModuleNamespace = {
    kind: 'module',
    name: 'url',
    moduleId: 'std://url',
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
          'std://url'
        ),
      ],
      [
        'parse',
        moduleFunction(
          'parse',
          ['string'],
          'Result<URL,string>',
          [primitive('string')],
          adt('Result', [urlType, primitive('string')]),
          ['raw'],
          'std://url'
        ),
      ],
      [
        'build',
        moduleFunction(
          'build',
          ['URLConfig'],
          'Result<string,string>',
          [urlConfigType],
          adt('Result', [primitive('string'), primitive('string')]),
          ['config'],
          'std://url'
        ),
      ],
      [
        'get_origin',
        moduleFunction(
          'get_origin',
          ['URL'],
          'string',
          [urlType],
          primitive('string'),
          ['url'],
          'std://url'
        ),
      ],
      [
        'get_pathname',
        moduleFunction(
          'get_pathname',
          ['URL'],
          'string',
          [urlType],
          primitive('string'),
          ['url'],
          'std://url'
        ),
      ],
      [
        'get_search',
        moduleFunction(
          'get_search',
          ['URL'],
          'string',
          [urlType],
          primitive('string'),
          ['url'],
          'std://url'
        ),
      ],
      [
        'get_hash',
        moduleFunction(
          'get_hash',
          ['URL'],
          'string',
          [urlType],
          primitive('string'),
          ['url'],
          'std://url'
        ),
      ],
      [
        'set_pathname',
        moduleFunction(
          'set_pathname',
          ['URL', 'string'],
          'URL',
          [urlType, primitive('string')],
          urlType,
          ['url', 'path'],
          'std://url'
        ),
      ],
      [
        'set_search',
        moduleFunction(
          'set_search',
          ['URL', 'string'],
          'URL',
          [urlType, primitive('string')],
          urlType,
          ['url', 'params'],
          'std://url'
        ),
      ],
      [
        'append_param',
        moduleFunction(
          'append_param',
          ['URL', 'string', 'string'],
          'URL',
          [urlType, primitive('string'), primitive('string')],
          urlType,
          ['url', 'key', 'value'],
          'std://url'
        ),
      ],
    ]),
  };

  const webStorageModule: ModuleNamespace = {
    kind: 'module',
    name: 'web_storage',
    moduleId: 'std://web_storage',
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
          'std://web_storage'
        ),
      ],
      [
        'local_get',
        moduleFunction(
          'local_get',
          ['string'],
          'Option<string>',
          [primitive('string')],
          adt('Option', [primitive('string')]),
          ['key'],
          'std://web_storage'
        ),
      ],
      [
        'local_set',
        moduleFunction(
          'local_set',
          ['string', 'string'],
          'Result<void,string>',
          [primitive('string'), primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['key', 'value'],
          'std://web_storage'
        ),
      ],
      [
        'local_remove',
        moduleFunction(
          'local_remove',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['key'],
          'std://web_storage'
        ),
      ],
      [
        'local_clear',
        moduleFunction(
          'local_clear',
          [],
          'void',
          [],
          primitive('void'),
          [],
          'std://web_storage'
        ),
      ],
      [
        'local_length',
        moduleFunction(
          'local_length',
          [],
          'int',
          [],
          primitive('int'),
          [],
          'std://web_storage'
        ),
      ],
      [
        'session_get',
        moduleFunction(
          'session_get',
          ['string'],
          'Option<string>',
          [primitive('string')],
          adt('Option', [primitive('string')]),
          ['key'],
          'std://web_storage'
        ),
      ],
      [
        'session_set',
        moduleFunction(
          'session_set',
          ['string', 'string'],
          'Result<void,string>',
          [primitive('string'), primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['key', 'value'],
          'std://web_storage'
        ),
      ],
      [
        'session_remove',
        moduleFunction(
          'session_remove',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['key'],
          'std://web_storage'
        ),
      ],
      [
        'session_clear',
        moduleFunction(
          'session_clear',
          [],
          'void',
          [],
          primitive('void'),
          [],
          'std://web_storage'
        ),
      ],
      [
        'session_length',
        moduleFunction(
          'session_length',
          [],
          'int',
          [],
          primitive('int'),
          [],
          'std://web_storage'
        ),
      ],
    ]),
  };

  const domModule: ModuleNamespace = {
    kind: 'module',
    name: 'dom',
    moduleId: 'std://dom',
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
          'std://dom'
        ),
      ],
      [
        'query',
        moduleFunction(
          'query',
          ['string'],
          'Option<DOMElement>',
          [primitive('string')],
          adt('Option', [domElementType]),
          ['selector'],
          'std://dom'
        ),
      ],
      [
        'call_global_1',
        moduleFunction(
          'call_global_1',
          ['string', 'any'],
          'any',
          [primitive('string'), primitive('any')],
          primitive('any'),
          ['name', 'arg'],
          'std://dom'
        ),
      ],
      [
        'call_global_1_string',
        moduleFunction(
          'call_global_1_string',
          ['string', 'any'],
          'string',
          [primitive('string'), primitive('any')],
          primitive('string'),
          ['name', 'arg'],
          'std://dom'
        ),
      ],
      [
        'query_all',
        moduleFunction(
          'query_all',
          ['string'],
          'Vec<DOMElement>',
          [primitive('string')],
          adt('Vec', [domElementType]),
          ['selector'],
          'std://dom'
        ),
      ],
      [
        'create',
        moduleFunction(
          'create',
          ['string'],
          'DOMElement',
          [primitive('string')],
          domElementType,
          ['tag'],
          'std://dom'
        ),
      ],
      [
        'get_attr',
        moduleFunction(
          'get_attr',
          ['DOMElement', 'string'],
          'Option<string>',
          [domElementType, primitive('string')],
          adt('Option', [primitive('string')]),
          ['el', 'name'],
          'std://dom'
        ),
      ],
      [
        'set_attr',
        moduleFunction(
          'set_attr',
          ['DOMElement', 'string', 'string'],
          'void',
          [domElementType, primitive('string'), primitive('string')],
          primitive('void'),
          ['el', 'name', 'value'],
          'std://dom'
        ),
      ],
      [
        'remove_attr',
        moduleFunction(
          'remove_attr',
          ['DOMElement', 'string'],
          'void',
          [domElementType, primitive('string')],
          primitive('void'),
          ['el', 'name'],
          'std://dom'
        ),
      ],
      [
        'get_text',
        moduleFunction(
          'get_text',
          ['DOMElement'],
          'string',
          [domElementType],
          primitive('string'),
          ['el'],
          'std://dom'
        ),
      ],
      [
        'set_text',
        moduleFunction(
          'set_text',
          ['DOMElement', 'string'],
          'void',
          [domElementType, primitive('string')],
          primitive('void'),
          ['el', 'text'],
          'std://dom'
        ),
      ],
      [
        'get_html',
        moduleFunction(
          'get_html',
          ['DOMElement'],
          'string',
          [domElementType],
          primitive('string'),
          ['el'],
          'std://dom'
        ),
      ],
      [
        'set_html',
        moduleFunction(
          'set_html',
          ['DOMElement', 'string'],
          'void',
          [domElementType, primitive('string')],
          primitive('void'),
          ['el', 'html'],
          'std://dom'
        ),
      ],
      [
        'append_child',
        moduleFunction(
          'append_child',
          ['DOMElement', 'DOMElement'],
          'void',
          [domElementType, domElementType],
          primitive('void'),
          ['parent', 'child'],
          'std://dom'
        ),
      ],
      [
        'remove_child',
        moduleFunction(
          'remove_child',
          ['DOMElement', 'DOMElement'],
          'void',
          [domElementType, domElementType],
          primitive('void'),
          ['parent', 'child'],
          'std://dom'
        ),
      ],
      [
        'add_event',
        moduleFunction(
          'add_event',
          ['DOMElement', 'string', 'any'],
          'EventHandle',
          [domElementType, primitive('string'), primitive('any')],
          eventHandleType,
          ['el', 'event', 'handler'],
          'std://dom'
        ),
      ],
      [
        'remove_event',
        moduleFunction(
          'remove_event',
          ['EventHandle'],
          'void',
          [eventHandleType],
          primitive('void'),
          ['handle'],
          'std://dom'
        ),
      ],
      [
        'get_style',
        moduleFunction(
          'get_style',
          ['DOMElement', 'string'],
          'string',
          [domElementType, primitive('string')],
          primitive('string'),
          ['el', 'prop'],
          'std://dom'
        ),
      ],
      [
        'set_style',
        moduleFunction(
          'set_style',
          ['DOMElement', 'string', 'string'],
          'void',
          [domElementType, primitive('string'), primitive('string')],
          primitive('void'),
          ['el', 'prop', 'value'],
          'std://dom'
        ),
      ],
    ]),
  };

  const routerModule: ModuleNamespace = {
    kind: 'module',
    name: 'router',
    moduleId: 'std://router-runtime',
    exports: new Map<string, ModuleExport>([
      [
        'getCurrentPath',
        moduleFunction(
          'getCurrentPath',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://router-runtime'
        ),
      ],
      [
        'getCurrentHash',
        moduleFunction(
          'getCurrentHash',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://router-runtime'
        ),
      ],
      [
        'getCurrentSearch',
        moduleFunction(
          'getCurrentSearch',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://router-runtime'
        ),
      ],
      [
        'matchRoute',
        moduleFunction(
          'matchRoute',
          ['string', 'string'],
          'bool',
          [primitive('string'), primitive('string')],
          primitive('bool'),
          ['pattern', 'path'],
          'std://router-runtime'
        ),
      ],
      [
        'extractParams',
        moduleFunction(
          'extractParams',
          ['string', 'string'],
          'any',
          [primitive('string'), primitive('string')],
          primitive('any'),
          ['pattern', 'path'],
          'std://router-runtime'
        ),
      ],
      [
        'parseSearchParams',
        moduleFunction(
          'parseSearchParams',
          ['string'],
          'any',
          [primitive('string')],
          primitive('any'),
          ['search'],
          'std://router-runtime'
        ),
      ],
      [
        'push',
        moduleFunction(
          'push',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['path'],
          'std://router-runtime'
        ),
      ],
      [
        'replace',
        moduleFunction(
          'replace',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['path'],
          'std://router-runtime'
        ),
      ],
      [
        'onPopState',
        moduleFunction(
          'onPopState',
          ['fn(string) -> void'],
          'void',
          [fnType([primitive('string')], primitive('void'))],
          primitive('void'),
          ['handler'],
          'std://router-runtime'
        ),
      ],
      [
        'offPopState',
        moduleFunction(
          'offPopState',
          ['fn(string) -> void'],
          'void',
          [fnType([primitive('string')], primitive('void'))],
          primitive('void'),
          ['handler'],
          'std://router-runtime'
        ),
      ],
      [
        'getBasePath',
        moduleFunction(
          'getBasePath',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://router-runtime'
        ),
      ],
      [
        'getScrollRestoration',
        moduleFunction(
          'getScrollRestoration',
          [],
          'string',
          [],
          primitive('string'),
          [],
          'std://router-runtime'
        ),
      ],
      [
        'setScrollRestoration',
        moduleFunction(
          'setScrollRestoration',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['mode'],
          'std://router-runtime'
        ),
      ],
      [
        'scrollToTop',
        moduleFunction(
          'scrollToTop',
          [],
          'void',
          [],
          primitive('void'),
          [],
          'std://router-runtime'
        ),
      ],
    ]),
  };

  const webWorkerModule: ModuleNamespace = {
    kind: 'module',
    name: 'web_worker',
    moduleId: 'std://web_worker',
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
          'std://web_worker'
        ),
      ],
      [
        'spawn',
        moduleFunction(
          'spawn',
          ['string'],
          'Promise<Result<WorkerHandle,string>>',
          [primitive('string')],
          promiseType(adt('Result', [workerHandleType, primitive('string')])),
          ['url'],
          'std://web_worker'
        ),
      ],
      [
        'spawn_inline',
        moduleFunction(
          'spawn_inline',
          ['string'],
          'Promise<Result<WorkerHandle,string>>',
          [primitive('string')],
          promiseType(adt('Result', [workerHandleType, primitive('string')])),
          ['source'],
          'std://web_worker'
        ),
      ],
      [
        'post',
        moduleFunction(
          'post',
          ['WorkerHandle', 'string'],
          'Result<void,string>',
          [workerHandleType, primitive('string')],
          adt('Result', [primitive('void'), primitive('string')]),
          ['handle', 'msg'],
          'std://web_worker'
        ),
      ],
      [
        'on_message',
        moduleFunction(
          'on_message',
          ['WorkerHandle', 'any'],
          'void',
          [workerHandleType, primitive('any')],
          primitive('void'),
          ['handle', 'handler'],
          'std://web_worker'
        ),
      ],
      [
        'on_error',
        moduleFunction(
          'on_error',
          ['WorkerHandle', 'any'],
          'void',
          [workerHandleType, primitive('any')],
          primitive('void'),
          ['handle', 'handler'],
          'std://web_worker'
        ),
      ],
      [
        'terminate',
        moduleFunction(
          'terminate',
          ['WorkerHandle'],
          'void',
          [workerHandleType],
          primitive('void'),
          ['handle'],
          'std://web_worker'
        ),
      ],
      [
        'is_worker_context',
        moduleFunction(
          'is_worker_context',
          [],
          'bool',
          [],
          primitive('bool'),
          [],
          'std://web_worker'
        ),
      ],
      [
        'self_post',
        moduleFunction(
          'self_post',
          ['string'],
          'void',
          [primitive('string')],
          primitive('void'),
          ['msg'],
          'std://web_worker'
        ),
      ],
      [
        'self_on_message',
        moduleFunction(
          'self_on_message',
          ['any'],
          'void',
          [primitive('any')],
          primitive('void'),
          ['handler'],
          'std://web_worker'
        ),
      ],
    ]),
  };

  const webStreamsModule: ModuleNamespace = {
    kind: 'module',
    name: 'web_streams',
    moduleId: 'std://web_streams',
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
          'std://web_streams'
        ),
      ],
      [
        'from_fetch',
        moduleFunction(
          'from_fetch',
          ['string'],
          'Promise<Result<ReadableStream,string>>',
          [primitive('string')],
          promiseType(adt('Result', [readableStreamType, primitive('string')])),
          ['url'],
          'std://web_streams'
        ),
      ],
      [
        'from_string',
        moduleFunction(
          'from_string',
          ['string'],
          'ReadableStream',
          [primitive('string')],
          readableStreamType,
          ['s'],
          'std://web_streams'
        ),
      ],
      [
        'from_bytes',
        moduleFunction(
          'from_bytes',
          ['Vec<int>'],
          'ReadableStream',
          [adt('Vec', [primitive('int')])],
          readableStreamType,
          ['data'],
          'std://web_streams'
        ),
      ],
      [
        'read_chunk',
        moduleFunction(
          'read_chunk',
          ['ReadableStream'],
          'Promise<Result<Option<Vec<int>>,string>>',
          [readableStreamType],
          promiseType(adt('Result', [adt('Option', [adt('Vec', [primitive('int')])]), primitive('string')])),
          ['stream'],
          'std://web_streams'
        ),
      ],
      [
        'read_all',
        moduleFunction(
          'read_all',
          ['ReadableStream'],
          'Promise<Result<Vec<int>,string>>',
          [readableStreamType],
          promiseType(adt('Result', [adt('Vec', [primitive('int')]), primitive('string')])),
          ['stream'],
          'std://web_streams'
        ),
      ],
      [
        'read_text',
        moduleFunction(
          'read_text',
          ['ReadableStream'],
          'Promise<Result<string,string>>',
          [readableStreamType],
          promiseType(adt('Result', [primitive('string'), primitive('string')])),
          ['stream'],
          'std://web_streams'
        ),
      ],
      [
        'pipe',
        moduleFunction(
          'pipe',
          ['ReadableStream', 'any'],
          'ReadableStream',
          [readableStreamType, primitive('any')],
          readableStreamType,
          ['src', 'transform'],
          'std://web_streams'
        ),
      ],
      [
        'cancel',
        moduleFunction(
          'cancel',
          ['ReadableStream'],
          'void',
          [readableStreamType],
          primitive('void'),
          ['stream'],
          'std://web_streams'
        ),
      ],
    ]),
  };

  return {
    urlModule,
    routerModule,
    webStorageModule,
    domModule,
    webWorkerModule,
    webStreamsModule,
  };
}
