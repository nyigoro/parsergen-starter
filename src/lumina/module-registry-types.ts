export interface ModuleFunction {
  kind: 'function';
  name: string;
  paramTypes: import('./ast.js').LuminaType[];
  returnType: import('./ast.js').LuminaType;
  paramNames?: string[];
  hmType: import('./types.js').TypeScheme;
  moduleId: string;
  exportName?: string;
  runtimeName?: string;
  deprecatedMessage?: string;
}

export interface ModuleOverloadedFunction {
  kind: 'overloaded-function';
  name: string;
  variants: ModuleFunction[];
  moduleId: string;
  exportName?: string;
}

export interface ModuleValue {
  kind: 'value';
  name: string;
  valueType: import('./ast.js').LuminaType;
  hmType: import('./types.js').TypeScheme;
  moduleId: string;
  exportName?: string;
}

export interface ModuleNamespace {
  kind: 'module';
  name: string;
  moduleId: string;
  exports: Map<string, ModuleExport>;
}

export type ModuleExport = ModuleFunction | ModuleOverloadedFunction | ModuleValue | ModuleNamespace;
export type ModuleRegistry = Map<string, ModuleNamespace>;
