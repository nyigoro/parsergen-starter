import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { freshTypeVar, promiseType } from './types.js';
import {
  adt,
  fnType,
  moduleFunction,
  moduleFunctionWithScheme,
  moduleValue,
  primitive,
  schemeFromVars,
} from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdUiWebgpuDomainModules(): Pick<StdDomainModules,
  'webgpuModule'> {
  const webgpuModule: ModuleNamespace = {
    kind: 'module',
    name: 'webgpu',
    moduleId: 'std://webgpu',
    exports: (() => {
      const t = freshTypeVar();
      const vecT = adt('Vec', [t]);
      const computeScheme = schemeFromVars(
        fnType(
          [primitive('string'), primitive('string'), vecT, primitive('int'), primitive('int'), primitive('string')],
          promiseType(adt('Result', [vecT, primitive('string')]))
        ),
        [t]
      );
      return new Map<string, ModuleExport>([
        [
          'GPU_BUFFER_USAGE_STORAGE',
          moduleValue('GPU_BUFFER_USAGE_STORAGE', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'GPU_BUFFER_USAGE_UNIFORM',
          moduleValue('GPU_BUFFER_USAGE_UNIFORM', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'GPU_BUFFER_USAGE_VERTEX',
          moduleValue('GPU_BUFFER_USAGE_VERTEX', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'GPU_BUFFER_USAGE_INDEX',
          moduleValue('GPU_BUFFER_USAGE_INDEX', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'GPU_BUFFER_USAGE_COPY_SRC',
          moduleValue('GPU_BUFFER_USAGE_COPY_SRC', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'GPU_BUFFER_USAGE_COPY_DST',
          moduleValue('GPU_BUFFER_USAGE_COPY_DST', 'int', primitive('int'), 'std://webgpu'),
        ],
        [
          'is_available',
          moduleFunction(
            'is_available',
            [],
            'bool',
            [],
            primitive('bool'),
            [],
            'std://webgpu'
          ),
        ],
        [
          'request_adapter',
          moduleFunction(
            'request_adapter',
            [],
            'Promise<Result<any,string>>',
            [],
            promiseType(adt('Result', [primitive('any'), primitive('string')])),
            [],
            'std://webgpu'
          ),
        ],
        [
          'request_device',
          moduleFunction(
            'request_device',
            ['any'],
            'Promise<Result<any,string>>',
            [primitive('any')],
            promiseType(adt('Result', [primitive('any'), primitive('string')])),
            ['adapter'],
            'std://webgpu'
          ),
        ],
        [
          'buffer_create',
          moduleFunction(
            'buffer_create',
            ['any', 'int', 'int'],
            'Result<int,string>',
            [primitive('any'), primitive('int'), primitive('int')],
            adt('Result', [primitive('int'), primitive('string')]),
            ['device', 'size', 'usage'],
            'std://webgpu'
          ),
        ],
        [
          'buffer_write',
          moduleFunction(
            'buffer_write',
            ['any', 'int', 'Vec<any>', 'int', 'string'],
            'Result<void,string>',
            [primitive('any'), primitive('int'), adt('Vec', [primitive('any')]), primitive('int'), primitive('string')],
            adt('Result', [primitive('void'), primitive('string')]),
            ['device', 'buffer', 'data', 'offset', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'buffer_read',
          moduleFunction(
            'buffer_read',
            ['any', 'int', 'int', 'string'],
            'Promise<Result<Vec<any>,string>>',
            [primitive('any'), primitive('int'), primitive('int'), primitive('string')],
            promiseType(adt('Result', [adt('Vec', [primitive('any')]), primitive('string')])),
            ['device', 'buffer', 'size', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'buffer_destroy',
          moduleFunction(
            'buffer_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['buffer'],
            'std://webgpu'
          ),
        ],
        [
          'uniform_create',
          moduleFunction(
            'uniform_create',
            ['any', 'Vec<any>', 'string'],
            'Result<int,string>',
            [primitive('any'), adt('Vec', [primitive('any')]), primitive('string')],
            adt('Result', [primitive('int'), primitive('string')]),
            ['device', 'data', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'uniform_update',
          moduleFunction(
            'uniform_update',
            ['any', 'int', 'Vec<any>', 'string'],
            'Result<void,string>',
            [primitive('any'), primitive('int'), adt('Vec', [primitive('any')]), primitive('string')],
            adt('Result', [primitive('void'), primitive('string')]),
            ['device', 'uniform', 'data', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'uniform_destroy',
          moduleFunction(
            'uniform_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['uniform'],
            'std://webgpu'
          ),
        ],
        [
          'vertex_buffer',
          moduleFunction(
            'vertex_buffer',
            ['any', 'Vec<any>', 'string'],
            'Result<int,string>',
            [primitive('any'), adt('Vec', [primitive('any')]), primitive('string')],
            adt('Result', [primitive('int'), primitive('string')]),
            ['device', 'data', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'index_buffer',
          moduleFunction(
            'index_buffer',
            ['any', 'Vec<any>', 'string'],
            'Result<int,string>',
            [primitive('any'), adt('Vec', [primitive('any')]), primitive('string')],
            adt('Result', [primitive('int'), primitive('string')]),
            ['device', 'data', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'vertex_buffer_destroy',
          moduleFunction(
            'vertex_buffer_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['buffer'],
            'std://webgpu'
          ),
        ],
        [
          'index_buffer_destroy',
          moduleFunction(
            'index_buffer_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['buffer'],
            'std://webgpu'
          ),
        ],
        [
          'canvas',
          moduleFunction(
            'canvas',
            ['string'],
            'Result<int,string>',
            [primitive('string')],
            adt('Result', [primitive('int'), primitive('string')]),
            ['selector'],
            'std://webgpu'
          ),
        ],
        [
          'canvas_destroy',
          moduleFunction(
            'canvas_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['canvas'],
            'std://webgpu'
          ),
        ],
        [
          'present',
          moduleFunction(
            'present',
            ['any', 'int', 'int'],
            'Result<void,string>',
            [primitive('any'), primitive('int'), primitive('int')],
            adt('Result', [primitive('void'), primitive('string')]),
            ['device', 'canvas', 'pipeline'],
            'std://webgpu'
          ),
        ],
        [
          'render_pipeline',
          moduleFunction(
            'render_pipeline',
            ['any', 'any'],
            'Promise<Result<int,string>>',
            [primitive('any'), primitive('any')],
            promiseType(adt('Result', [primitive('int'), primitive('string')])),
            ['device', 'config'],
            'std://webgpu'
          ),
        ],
        [
          'render_pipeline_destroy',
          moduleFunction(
            'render_pipeline_destroy',
            ['int'],
            'void',
            [primitive('int')],
            primitive('void'),
            ['pipeline'],
            'std://webgpu'
          ),
        ],
        [
          'render_frame',
          moduleFunction(
            'render_frame',
            ['any', 'int', 'any'],
            'Result<void,string>',
            [primitive('any'), primitive('int'), primitive('any')],
            adt('Result', [primitive('void'), primitive('string')]),
            ['device', 'pipeline', 'config'],
            'std://webgpu'
          ),
        ],
        [
          'compute',
          moduleFunctionWithScheme(
            'compute',
            ['string', 'string', 'Vec<any>', 'int', 'int', 'string'],
            'Promise<Result<Vec<any>,string>>',
            computeScheme,
            ['wgsl', 'entryPoint', 'input', 'outputLength', 'workgroupSize', 'typeHint'],
            'std://webgpu'
          ),
        ],
        [
          'compute_i32',
          moduleFunction(
            'compute_i32',
            ['string', 'string', 'Vec<int>', 'int', 'int'],
            'Promise<Result<Vec<int>,string>>',
            [primitive('string'), primitive('string'), adt('Vec', [primitive('int')]), primitive('int'), primitive('int')],
            promiseType(adt('Result', [adt('Vec', [primitive('int')]), primitive('string')])),
            ['wgsl', 'entryPoint', 'input', 'outputLength', 'workgroupSize'],
            'std://webgpu'
          ),
        ],
      ]);
    })(),
  };
  return { webgpuModule };
}
