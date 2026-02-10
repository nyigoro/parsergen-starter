import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString } from './ir.js';

export function optimizeIR(node: IRNode): IRNode | null {
  switch (node.kind) {
    case 'Program': {
      const body = node.body
        .map(optimizeIR)
        .filter((n): n is IRNode => n !== null && n.kind !== 'Noop');
      const program: IRProgram = { kind: 'Program', body };
      return program;
    }
    case 'Function': {
      const body = node.body
        .map(optimizeIR)
        .filter((n): n is IRNode => n !== null && n.kind !== 'Noop');
      const fn: IRFunction = { ...node, body };
      return fn;
    }
    case 'ExprStmt': {
      const expr = optimizeIR(node.expr);
      if (!expr || expr.kind === 'Noop') return null;
      const stmt: IRExprStmt = { kind: 'ExprStmt', expr };
      return stmt;
    }
    case 'Let': {
      const value = optimizeIR(node.value);
      const letNode: IRLet = { kind: 'Let', name: node.name, value: value ?? node.value };
      return letNode;
    }
    case 'Return': {
      const value = optimizeIR(node.value);
      const ret: IRReturn = { kind: 'Return', value: value ?? node.value };
      return ret;
    }
    case 'Binary': {
      const left = optimizeIR(node.left) ?? node.left;
      const right = optimizeIR(node.right) ?? node.right;
      if (left.kind === 'Number' && right.kind === 'Number') {
        const folded = foldNumeric(node.op, left, right);
        if (folded) return folded;
      }
      if (left.kind === 'String' && right.kind === 'String' && node.op === '+') {
        return { kind: 'String', value: left.value + right.value } as IRString;
      }
      const bin: IRBinary = { kind: 'Binary', op: node.op, left, right };
      return bin;
    }
    case 'Number':
    case 'String':
      return node;
    case 'Identifier':
      if (node.name === '__noop__') return null;
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
