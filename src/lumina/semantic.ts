import { type Location } from '../utils/index.js';
import { type Diagnostic } from '../parser/index.js';
import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaType } from './ast.js';

export type SymbolKind = 'type' | 'function' | 'variable';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  type?: LuminaType;
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

const diag = (message: string): Diagnostic => ({
  severity: 'error',
  message,
  location: defaultLocation,
  code: 'TYPE_ERROR',
  source: 'lumina',
});

export function analyzeLumina(program: LuminaProgram) {
  const diagnostics: Diagnostic[] = [];
  const symbols = new SymbolTable();

  for (const t of builtinTypes) symbols.define({ name: t, kind: 'type', type: t });

  for (const stmt of program.body) {
    if (stmt.type === 'TypeDecl') {
      symbols.define({ name: stmt.name, kind: 'type', type: stmt.name });
    } else if (stmt.type === 'FnDecl') {
      const ret = stmt.returnType ?? 'unknown';
      symbols.define({ name: stmt.name, kind: 'function', type: ret });
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
  currentReturnType: LuminaType | null
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
      for (const param of stmt.params) {
        if (!isKnownType(param.typeName, symbols)) {
          diagnostics.push(diag(`Unknown type '${param.typeName}' for parameter '${param.name}'`));
        }
        local.define({ name: param.name, kind: 'variable', type: param.typeName });
      }
      for (const bodyStmt of stmt.body.body) {
        typeCheckStatement(bodyStmt, local, diagnostics, ret);
      }
      return;
    }
    case 'Let': {
      if (!isKnownType(stmt.typeName, symbols)) {
        diagnostics.push(diag(`Unknown type '${stmt.typeName}' for variable '${stmt.name}'`));
      }
      const valueType = typeCheckExpr(stmt.value, symbols, diagnostics);
      if (valueType && stmt.typeName && valueType !== stmt.typeName) {
        diagnostics.push(diag(`Type mismatch: '${stmt.name}' is '${stmt.typeName}' but value is '${valueType}'`));
      }
      symbols.define({ name: stmt.name, kind: 'variable', type: stmt.typeName });
      return;
    }
    case 'Return': {
      const valueType = typeCheckExpr(stmt.value, symbols, diagnostics);
      if (currentReturnType && valueType && valueType !== currentReturnType) {
        diagnostics.push(diag(`Return type '${valueType}' does not match '${currentReturnType}'`));
      }
      return;
    }
    case 'ExprStmt':
      typeCheckExpr(stmt.expr, symbols, diagnostics);
      return;
    case 'Import':
      return;
  }
}

function typeCheckExpr(expr: LuminaExpr, symbols: SymbolTable, diagnostics: Diagnostic[]): LuminaType | null {
  if (expr.type === 'Number') return 'int';
  if (expr.type === 'String') return 'string';
  if (expr.type === 'Binary') {
    const left = typeCheckExpr(expr.left, symbols, diagnostics);
    const right = typeCheckExpr(expr.right, symbols, diagnostics);
    if (!left || !right) return null;
    if (expr.op === '+' && left === 'string' && right === 'string') return 'string';
    if (left !== 'int' || right !== 'int') {
      diagnostics.push(diag(`Operator '${expr.op}' requires int operands`));
      return null;
    }
    return 'int';
  }
  if (expr.type === 'Identifier') {
    const name = expr.name;
    const sym = symbols.get(name);
    if (!sym) {
      diagnostics.push(diag(`Unknown identifier '${name}'`));
      return null;
    }
    return sym.type ?? null;
  }
  return null;
}

function isKnownType(typeName: LuminaType, symbols: SymbolTable): boolean {
  if (builtinTypes.has(typeName)) return true;
  const sym = symbols.get(typeName);
  return sym?.kind === 'type';
}
