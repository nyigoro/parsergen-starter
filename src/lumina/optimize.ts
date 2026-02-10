import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString, type IRCall, type IRIf, type IRBoolean, type IRWhile, type IRAssign } from './ir.js';

export function optimizeIR(node: IRNode): IRNode | null {
  const constants = new Map<string, IRNode>();
  const optimized = optimizeWithConstants(node, constants);
  if (optimized) validateIR(optimized);
  return optimized;
}

function optimizeWithConstants(node: IRNode, constants: Map<string, IRNode>): IRNode | null {
  switch (node.kind) {
    case 'Program': {
      const body: IRNode[] = [];
      for (const stmt of node.body) {
        const optimized = optimizeWithConstants(stmt, constants);
        if (optimized && optimized.kind !== 'Noop') {
          body.push(optimized);
          if (optimized.kind === 'Return') break;
        }
      }
      const program: IRProgram = { kind: 'Program', body, location: node.location };
      return removeDeadStores(program);
    }
    case 'Function': {
      const body: IRNode[] = [];
      const localConstants = new Map<string, IRNode>();
      for (const stmt of node.body) {
        const optimized = optimizeWithConstants(stmt, localConstants);
        if (optimized && optimized.kind !== 'Noop') {
          body.push(optimized);
          if (optimized.kind === 'Return') break;
        }
      }
      const fn: IRFunction = { ...node, body, location: node.location };
      const cleaned = removeDeadStores({ kind: 'Program', body: fn.body, location: fn.location });
      return { ...fn, body: cleaned.body };
    }
    case 'ExprStmt': {
      const expr = optimizeWithConstants(node.expr, constants);
      if (!expr || expr.kind === 'Noop') return null;
      const stmt: IRExprStmt = { kind: 'ExprStmt', expr, location: node.location };
      return stmt;
    }
    case 'Let': {
      const value = optimizeWithConstants(node.value, constants);
      const finalValue = value ?? node.value;
      if (isLiteral(finalValue)) {
        constants.set(node.name, finalValue);
      } else {
        constants.delete(node.name);
      }
      const letNode: IRLet = { kind: 'Let', name: node.name, value: finalValue, location: node.location };
      return letNode;
    }
    case 'Return': {
      const value = optimizeWithConstants(node.value, constants);
      const ret: IRReturn = { kind: 'Return', value: value ?? node.value, location: node.location };
      return ret;
    }
    case 'Binary': {
      const left = optimizeWithConstants(node.left, constants) ?? node.left;
      const right = optimizeWithConstants(node.right, constants) ?? node.right;
      if (left.kind === 'Number' && right.kind === 'Number') {
        const folded = foldNumeric(node.op, left, right);
        if (folded) return { ...folded, location: node.location };
      }
      if (left.kind === 'String' && right.kind === 'String' && node.op === '+') {
        return { kind: 'String', value: left.value + right.value, location: node.location } as IRString;
      }
      const foldedBoolean = foldBoolean(node.op, left, right);
      if (foldedBoolean) return { ...foldedBoolean, location: node.location };
      const simplified = simplifyAlgebra(node.op, left, right);
      if (simplified) return { ...simplified, location: node.location };
      const bin: IRBinary = { kind: 'Binary', op: node.op, left, right, location: node.location };
      return bin;
    }
    case 'Call': {
      const args = node.args.map((arg) => optimizeWithConstants(arg, constants) ?? arg);
      const call: IRCall = { kind: 'Call', callee: node.callee, args, location: node.location };
      return call;
    }
    case 'If': {
      const condition = optimizeWithConstants(node.condition, constants) ?? node.condition;
      const thenBody = node.thenBody.map((n) => optimizeWithConstants(n, new Map(constants))).filter((n): n is IRNode => n !== null && n.kind !== 'Noop');
      const elseBody = node.elseBody
        ? node.elseBody.map((n) => optimizeWithConstants(n, new Map(constants))).filter((n): n is IRNode => n !== null && n.kind !== 'Noop')
        : undefined;
      if (condition.kind === 'Boolean') {
        if (condition.value) {
          return { kind: 'Program', body: thenBody, location: node.location } as IRProgram;
        }
        return { kind: 'Program', body: elseBody ?? [], location: node.location } as IRProgram;
      }
      const ifNode: IRIf = { kind: 'If', condition, thenBody, elseBody, location: node.location };
      return ifNode;
    }
    case 'While': {
      const condition = optimizeWithConstants(node.condition, constants) ?? node.condition;
      const body = node.body.map((n) => optimizeWithConstants(n, new Map(constants))).filter((n): n is IRNode => n !== null && n.kind !== 'Noop');
      if (condition.kind === 'Boolean' && condition.value === false) return null;
      const whileNode: IRWhile = { kind: 'While', condition, body, location: node.location };
      return whileNode;
    }
    case 'Assign': {
      const value = optimizeWithConstants(node.value, constants) ?? node.value;
      if (isLiteral(value)) {
        constants.set(node.target, value);
      } else {
        constants.delete(node.target);
      }
      const assign: IRAssign = { kind: 'Assign', target: node.target, value, location: node.location };
      return assign;
    }
    case 'Number':
    case 'Boolean':
    case 'String':
      return node;
    case 'Identifier':
      if (node.name === '__noop__') return null;
      if (constants.has(node.name)) {
        const constant = constants.get(node.name);
        if (constant) return constant;
      }
      return node;
    case 'Noop':
      return null;
    default:
      return node;
  }
}

function foldNumeric(op: string, left: IRNumber, right: IRNumber): IRNumber | null {
  switch (op) {
    case '+':
      return { kind: 'Number', value: left.value + right.value };
    case '-':
      return { kind: 'Number', value: left.value - right.value };
    case '*':
      return { kind: 'Number', value: left.value * right.value };
    case '/':
      return { kind: 'Number', value: left.value / right.value };
    default:
      return null;
  }
}

function foldBoolean(op: string, left: IRNode, right: IRNode): IRBoolean | null {
  if (left.kind === 'Boolean' && right.kind === 'Boolean') {
    switch (op) {
      case '&&':
        return { kind: 'Boolean', value: left.value && right.value };
      case '||':
        return { kind: 'Boolean', value: left.value || right.value };
      case '==':
        return { kind: 'Boolean', value: left.value === right.value };
      case '!=':
        return { kind: 'Boolean', value: left.value !== right.value };
      default:
        return null;
    }
  }
  if (left.kind === 'Number' && right.kind === 'Number') {
    switch (op) {
      case '==':
        return { kind: 'Boolean', value: left.value === right.value };
      case '!=':
        return { kind: 'Boolean', value: left.value !== right.value };
      case '<':
        return { kind: 'Boolean', value: left.value < right.value };
      case '<=':
        return { kind: 'Boolean', value: left.value <= right.value };
      case '>':
        return { kind: 'Boolean', value: left.value > right.value };
      case '>=':
        return { kind: 'Boolean', value: left.value >= right.value };
      default:
        return null;
    }
  }
  return null;
}

function simplifyAlgebra(op: string, left: IRNode, right: IRNode): IRNode | null {
  if (left.kind === 'Number' && right.kind === 'Number') return null;
  if (op === '+') {
    if (right.kind === 'Number' && right.value === 0) return left;
    if (left.kind === 'Number' && left.value === 0) return right;
  }
  if (op === '-') {
    if (right.kind === 'Number' && right.value === 0) return left;
  }
  if (op === '*') {
    if (right.kind === 'Number' && right.value === 1) return left;
    if (left.kind === 'Number' && left.value === 1) return right;
    if (right.kind === 'Number' && right.value === 0) return { kind: 'Number', value: 0 };
    if (left.kind === 'Number' && left.value === 0) return { kind: 'Number', value: 0 };
  }
  if (op === '/') {
    if (right.kind === 'Number' && right.value === 1) return left;
  }
  return null;
}

function isLiteral(node: IRNode): node is IRNumber | IRBoolean | IRString {
  return node.kind === 'Number' || node.kind === 'Boolean' || node.kind === 'String';
}

function validateIR(node: IRNode) {
  const visit = (n: IRNode) => {
    switch (n.kind) {
      case 'Program':
        n.body.forEach(visit);
        return;
      case 'Function':
        n.body.forEach(visit);
        return;
      case 'Let':
        visit(n.value);
        return;
      case 'Assign':
        if (!n.target) throw new Error('IR validation: Assign target missing');
        visit(n.value);
        return;
      case 'Return':
        visit(n.value);
        return;
      case 'ExprStmt':
        visit(n.expr);
        return;
      case 'If':
        visit(n.condition);
        n.thenBody.forEach(visit);
        n.elseBody?.forEach(visit);
        return;
      case 'While':
        visit(n.condition);
        n.body.forEach(visit);
        return;
      case 'Binary':
        if (!n.op) throw new Error('IR validation: Binary op missing');
        visit(n.left);
        visit(n.right);
        return;
      case 'Call':
        if (!n.callee) throw new Error('IR validation: Call callee missing');
        n.args.forEach(visit);
        return;
      case 'Identifier':
        if (!n.name) throw new Error('IR validation: Identifier name missing');
        return;
      case 'Number':
      case 'Boolean':
      case 'String':
      case 'Noop':
        return;
      default: {
        const _exhaustive: never = n;
        return _exhaustive;
      }
    }
  };

  visit(node);
}

function removeDeadStores(program: IRProgram): IRProgram {
  const used = new Set<string>();
  const body = [...program.body].reverse();
  const kept: IRNode[] = [];

  const markExpr = (expr: IRNode) => {
    switch (expr.kind) {
      case 'Identifier':
        used.add(expr.name);
        return;
      case 'Binary':
        markExpr(expr.left);
        markExpr(expr.right);
        return;
      case 'Call':
        expr.args.forEach(markExpr);
        return;
      case 'If':
        markExpr(expr.condition);
        expr.thenBody.forEach(markStmt);
        expr.elseBody?.forEach(markStmt);
        return;
      case 'While':
        markExpr(expr.condition);
        expr.body.forEach(markStmt);
        return;
      case 'Assign':
        markExpr(expr.value);
        used.add(expr.target);
        return;
      case 'ExprStmt':
        markExpr(expr.expr);
        return;
      case 'Return':
        markExpr(expr.value);
        return;
      case 'Let':
        markExpr(expr.value);
        return;
      default:
        return;
    }
  };

  const markStmt = (stmt: IRNode) => {
    switch (stmt.kind) {
      case 'Let':
        markExpr(stmt.value);
        return;
      case 'Assign':
        markExpr(stmt.value);
        used.add(stmt.target);
        return;
      case 'Return':
        markExpr(stmt.value);
        return;
      case 'ExprStmt':
        markExpr(stmt.expr);
        return;
      case 'If':
        markExpr(stmt.condition);
        stmt.thenBody.forEach(markStmt);
        stmt.elseBody?.forEach(markStmt);
        return;
      case 'While':
        markExpr(stmt.condition);
        stmt.body.forEach(markStmt);
        return;
      case 'Program':
        stmt.body.forEach(markStmt);
        return;
      default:
        return;
    }
  };

  for (const stmt of body) {
    if (stmt.kind === 'Let') {
      if (used.has(stmt.name)) {
        kept.push(stmt);
        markExpr(stmt.value);
        used.delete(stmt.name);
      } else {
        // dead store; still visit value for side effects
        markExpr(stmt.value);
      }
      continue;
    }
    if (stmt.kind === 'Assign') {
      if (used.has(stmt.target)) {
        kept.push(stmt);
        markExpr(stmt.value);
        used.delete(stmt.target);
      } else {
        markExpr(stmt.value);
      }
      continue;
    }
    kept.push(stmt);
    markStmt(stmt);
  }

  kept.reverse();
  return { ...program, body: kept };
}
