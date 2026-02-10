import { type LuminaProgram, type LuminaStatement, type LuminaExpr } from './ast.js';
import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString, type IRIdentifier, type IRNoop } from './ir.js';

export function lowerLumina(program: LuminaProgram): IRProgram {
  return {
    kind: 'Program',
    body: program.body.map(lowerStatement),
  };
}

function lowerStatement(stmt: LuminaStatement): IRNode {
  switch (stmt.type) {
    case 'FnDecl': {
      const fn: IRFunction = {
        kind: 'Function',
        name: stmt.name,
        params: stmt.params.map(p => p.name),
        body: stmt.body.body.map(lowerStatement),
      };
      return fn;
    }
    case 'Let': {
      const letNode: IRLet = {
        kind: 'Let',
        name: stmt.name,
        value: lowerExpr(stmt.value),
      };
      return letNode;
    }
    case 'Return': {
      const ret: IRReturn = {
        kind: 'Return',
        value: lowerExpr(stmt.value),
      };
      return ret;
    }
    case 'ExprStmt': {
      const expr: IRExprStmt = {
        kind: 'ExprStmt',
        expr: lowerExpr(stmt.expr),
      };
      return expr;
    }
    case 'Import':
    case 'TypeDecl':
      return { kind: 'Noop' } as IRNoop;
    default:
      return { kind: 'Noop' } as IRNoop;
  }
}

function lowerExpr(expr: LuminaExpr): IRNode {
  switch (expr.type) {
    case 'Binary': {
      const bin: IRBinary = {
        kind: 'Binary',
        op: expr.op,
        left: lowerExpr(expr.left),
        right: lowerExpr(expr.right),
      };
      return bin;
    }
    case 'Number': {
      const num: IRNumber = { kind: 'Number', value: expr.value };
      return num;
    }
    case 'String': {
      const str: IRString = { kind: 'String', value: expr.value };
      return str;
    }
    case 'Identifier': {
      const id: IRIdentifier = { kind: 'Identifier', name: expr.name };
      return id;
    }
    default:
      return { kind: 'Identifier', name: '__unknown__' };
  }
}
