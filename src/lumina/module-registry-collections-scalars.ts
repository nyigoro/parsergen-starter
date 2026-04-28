import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { adt, moduleFunction, moduleOverloadedFunction, moduleValue, primitive } from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdCollectionsScalarsDomainModules(): Pick<StdDomainModules,
  'strModule' | 'mathModule'> {
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
        moduleOverloadedFunction(
          'abs',
          [
            moduleFunction(
              'abs',
              ['int'],
              'int',
              [primitive('int')],
              primitive('int'),
              ['value'],
              'std://math',
              { runtimeName: 'math.abs' }
            ),
            moduleFunction(
              'abs',
              ['float'],
              'float',
              [primitive('float')],
              primitive('float'),
              ['value'],
              'std://math',
              { runtimeName: 'math.abs' }
            ),
          ],
          'std://math'
        ),
      ],
      [
        'min',
        moduleOverloadedFunction(
          'min',
          [
            moduleFunction(
              'min',
              ['int', 'int'],
              'int',
              [primitive('int'), primitive('int')],
              primitive('int'),
              ['a', 'b'],
              'std://math',
              { runtimeName: 'math.min' }
            ),
            moduleFunction(
              'min',
              ['float', 'float'],
              'float',
              [primitive('float'), primitive('float')],
              primitive('float'),
              ['a', 'b'],
              'std://math',
              { runtimeName: 'math.min' }
            ),
          ],
          'std://math'
        ),
      ],
      [
        'max',
        moduleOverloadedFunction(
          'max',
          [
            moduleFunction(
              'max',
              ['int', 'int'],
              'int',
              [primitive('int'), primitive('int')],
              primitive('int'),
              ['a', 'b'],
              'std://math',
              { runtimeName: 'math.max' }
            ),
            moduleFunction(
              'max',
              ['float', 'float'],
              'float',
              [primitive('float'), primitive('float')],
              primitive('float'),
              ['a', 'b'],
              'std://math',
              { runtimeName: 'math.max' }
            ),
          ],
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
          'std://math',
          {
            runtimeName: 'math.abs',
            deprecatedMessage: `math.absf is deprecated; use math.abs`,
          }
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
          'std://math',
          {
            runtimeName: 'math.min',
            deprecatedMessage: `math.minf is deprecated; use math.min`,
          }
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
          'std://math',
          {
            runtimeName: 'math.max',
            deprecatedMessage: `math.maxf is deprecated; use math.max`,
          }
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
        moduleOverloadedFunction(
          'pow',
          [
            moduleFunction(
              'pow',
              ['int', 'int'],
              'int',
              [primitive('int'), primitive('int')],
              primitive('int'),
              ['base', 'exp'],
              'std://math',
              { runtimeName: 'math.pow' }
            ),
            moduleFunction(
              'pow',
              ['float', 'float'],
              'float',
              [primitive('float'), primitive('float')],
              primitive('float'),
              ['base', 'exp'],
              'std://math',
              { runtimeName: 'math.pow' }
            ),
          ],
          'std://math'
        ),
      ],
      [
        'powf',
        moduleFunction(
          'powf',
          ['float', 'float'],
          'float',
          [primitive('float'), primitive('float')],
          primitive('float'),
          ['base', 'exp'],
          'std://math',
          {
            runtimeName: 'math.pow',
            deprecatedMessage: `math.powf is deprecated; use math.pow`,
          }
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

  return { strModule, mathModule };
}
