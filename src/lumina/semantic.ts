import { type Location } from '../utils/index.js';
import { type Diagnostic } from '../parser/index.js';
import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaType } from './ast.js';

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type?: LuminaType;
  location?: Location;
}

export class SymbolTable {
  private symbols = new Map<string, SymbolInfo>();

  define(symbol: SymbolInfo) {
    this.symbols.set(symbol.name, symbol);
  }

  has(name: string): boolean {
    return this.symbols.has(name);
  }

  get(name: string): SymbolInfo | undefined {
    return this.symbols.get(name);
  }

  list(): SymbolInfo[] {
    return Array.from(this.symbols.values());
  }
}

const builtinTypes: Set<LuminaType> = new Set(['int', 'string', 'bool', 'void']);

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const diagAt = (message: string, location?: Location, severity: Diagnostic['severity'] = 'error'): Diagnostic => ({
  severity,
  message,
  location: location ?? defaultLocation,
  code: severity === 'warning' ? 'LINT' : 'TYPE_ERROR',
  source: 'lumina',
});

export function analyzeLumina(program: LuminaProgram) {
  const diagnostics: Diagnostic[] = [];
  const symbols = new SymbolTable();

  for (const t of builtinTypes) symbols.define({ name: t, kind: 'type', type: t });

  for (const stmt of program.body) {
    if (stmt.type === 'TypeDecl') {
      symbols.define({ name: stmt.name, kind: 'type', type: stmt.name, location: stmt.location });
    } else if (stmt.type === 'FnDecl') {
      const ret = stmt.returnType ?? 'unknown';
      symbols.define({ name: stmt.name, kind: 'function', type: ret, location: stmt.location });
    }
  }

  for (const stmt of program.body) {
    typeCheckStatement(stmt, symbols, diagnostics, null);
  }

  return { symbols, diagnostics };
}

function typeCheckStatement(
  stmt: LuminaStatement,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  currentReturnType: LuminaType | null,
  scope?: Scope
) {
  switch (stmt.type) {
    case 'TypeDecl':
      return;
    case 'FnDecl': {
      const ret = stmt.returnType ?? null;
      const local = new SymbolTable();
      for (const sym of symbols.list()) {
        local.define(sym);
      }
      const fnScope = new Scope();
      for (const param of stmt.params) {
        if (!isKnownType(param.typeName, symbols)) {
          diagnostics.push(diagAt(`Unknown type '${param.typeName}' for parameter '${param.name}'`, param.location ?? stmt.location));
        }
        local.define({ name: param.name, kind: 'variable', type: param.typeName, location: param.location ?? stmt.location });
        fnScope.define(param.name, param.location ?? stmt.location);
      }
      for (const bodyStmt of stmt.body.body) {
        typeCheckStatement(bodyStmt, local, diagnostics, ret, fnScope);
      }
      collectUnusedBindings(fnScope, diagnostics, stmt.location);
      return;
    }
    case 'Let': {
      if (!isKnownType(stmt.typeName, symbols)) {
        diagnostics.push(diagAt(`Unknown type '${stmt.typeName}' for variable '${stmt.name}'`, stmt.location));
      }
      const valueType = typeCheckExpr(stmt.value, symbols, diagnostics, scope);
      if (valueType && stmt.typeName && valueType !== stmt.typeName) {
        diagnostics.push(diagAt(`Type mismatch: '${stmt.name}' is '${stmt.typeName}' but value is '${valueType}'`, stmt.location));
      }
      symbols.define({ name: stmt.name, kind: 'variable', type: stmt.typeName, location: stmt.location });
      scope?.define(stmt.name, stmt.location);
      return;
    }
    case 'Return': {
      const valueType = typeCheckExpr(stmt.value, symbols, diagnostics, scope);
      if (currentReturnType && valueType && valueType !== currentReturnType) {
        diagnostics.push(diagAt(`Return type '${valueType}' does not match '${currentReturnType}'`, stmt.location));
      }
      return;
    }
    case 'ExprStmt':
      typeCheckExpr(stmt.expr, symbols, diagnostics, scope);
      return;
    case 'Block': {
      const blockScope = new Scope(scope);
      for (const bodyStmt of stmt.body) {
        typeCheckStatement(bodyStmt, symbols, diagnostics, currentReturnType, blockScope);
      }
      collectUnusedBindings(blockScope, diagnostics, stmt.location);
      return;
    }
    case 'Import':
      return;
  }
}

function typeCheckExpr(expr: LuminaExpr, symbols: SymbolTable, diagnostics: Diagnostic[], scope?: Scope): LuminaType | null {
  if (expr.type === 'Number') return 'int';
  if (expr.type === 'String') return 'string';
  if (expr.type === 'Binary') {
    const left = typeCheckExpr(expr.left, symbols, diagnostics, scope);
    const right = typeCheckExpr(expr.right, symbols, diagnostics, scope);
    if (!left || !right) return null;
    if (expr.op === '+' && left === 'string' && right === 'string') return 'string';
    if (left !== 'int' || right !== 'int') {
      diagnostics.push(diagAt(`Operator '${expr.op}' requires int operands`, expr.location));
      return null;
    }
    return 'int';
  }
  if (expr.type === 'Identifier') {
    const name = expr.name;
    scope?.use(name);
    const sym = symbols.get(name);
    if (!sym) {
      diagnostics.push(diagAt(`Unknown identifier '${name}'`, expr.location));
      return null;
    }
    return sym.type ?? null;
  }
  return null;
}

class Scope {
  parent?: Scope;
  locals = new Map<string, Location | undefined>();
  used = new Set<string>();
  children: Scope[] = [];

  constructor(parent?: Scope) {
    this.parent = parent;
    if (parent) parent.children.push(this);
  }

  define(name: string, location?: Location) {
    this.locals.set(name, location);
  }

  use(name: string) {
    if (this.locals.has(name)) {
      this.used.add(name);
      return;
    }
    this.parent?.use(name);
  }
}

function collectUnusedBindings(scope: Scope, diagnostics: Diagnostic[], fallbackLocation?: Location) {
  for (const [name, location] of scope.locals.entries()) {
    if (name.startsWith('_')) continue;
    if (!scope.used.has(name)) {
      diagnostics.push(diagAt(`Unused binding '${name}'`, location ?? fallbackLocation, 'warning'));
    }
  }
  for (const child of scope.children) {
    collectUnusedBindings(child, diagnostics, fallbackLocation);
  }
}

function isKnownType(typeName: LuminaType, symbols: SymbolTable): boolean {
  if (builtinTypes.has(typeName)) return true;
  const sym = symbols.get(typeName);
  return sym?.kind === 'type';
}
