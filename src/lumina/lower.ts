import { type LuminaProgram, type LuminaStatement, type LuminaExpr } from './ast.js';
import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString, type IRIdentifier, type IRNoop, type IRCall, type IRIf, type IRBoolean, type IRWhile, type IRAssign } from './ir.js';

export function lowerLumina(program: LuminaProgram): IRProgram {
  return {
    kind: 'Program',
    body: program.body.map(lowerStatement),
    location: program.location,
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
        location: stmt.location,
      };
      return fn;
    }
    case 'Let': {
      const letNode: IRLet = {
        kind: 'Let',
        name: stmt.name,
        value: lowerExpr(stmt.value),
        location: stmt.location,
      };
      return letNode;
    }
    case 'Return': {
      const ret: IRReturn = {
        kind: 'Return',
        value: lowerExpr(stmt.value),
        location: stmt.location,
      };
      return ret;
    }
    case 'ExprStmt': {
      const expr: IRExprStmt = {
        kind: 'ExprStmt',
        expr: lowerExpr(stmt.expr),
        location: stmt.location,
      };
      return expr;
    }
    case 'If': {
      const ifNode: IRIf = {
        kind: 'If',
        condition: lowerExpr(stmt.condition),
        thenBody: stmt.thenBlock.body.map(lowerStatement),
        elseBody: stmt.elseBlock ? stmt.elseBlock.body.map(lowerStatement) : undefined,
        location: stmt.location,
      };
      return ifNode;
    }
    case 'While': {
      const whileNode: IRWhile = {
        kind: 'While',
        condition: lowerExpr(stmt.condition),
        body: stmt.body.body.map(lowerStatement),
        location: stmt.location,
      };
      return whileNode;
    }
    case 'Assign': {
      const assign: IRAssign = {
        kind: 'Assign',
        target: stmt.target.name,
        value: lowerExpr(stmt.value),
        location: stmt.location,
      };
      return assign;
    }
    case 'Block': {
      return {
        kind: 'Program',
        body: stmt.body.map(lowerStatement),
        location: stmt.location,
      } as IRProgram;
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
        location: expr.location,
      };
      return bin;
    }
    case 'Call': {
      const call: IRCall = {
        kind: 'Call',
        callee: expr.callee.name,
        args: expr.args.map(lowerExpr),
        location: expr.location,
      };
      return call;
    }
    case 'Number': {
      const num: IRNumber = { kind: 'Number', value: expr.value, location: expr.location };
      return num;
    }
    case 'Boolean': {
      const bool: IRBoolean = { kind: 'Boolean', value: expr.value, location: expr.location };
      return bool;
    }
    case 'String': {
      const str: IRString = { kind: 'String', value: expr.value, location: expr.location };
      return str;
    }
    case 'Identifier': {
      const id: IRIdentifier = { kind: 'Identifier', name: expr.name, location: expr.location };
      return id;
    }
    default:
      return { kind: 'Identifier', name: '__unknown__' };
  }
}
