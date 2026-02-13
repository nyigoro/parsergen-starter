import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRPhi, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString, type IRCall, type IRIf, type IRBoolean, type IRWhile, type IRAssign, type IRMember, type IRIndex, type IREnumConstruct, type IRMatchExpr, type IRStructLiteral } from './ir.js';

export function optimizeIR(node: IRNode): IRNode | null {
  const constants = new Map<string, IRNode>();
  const ssa = convertToSSA(node);
  let optimized = optimizeWithConstants(ssa, constants);
  if (optimized && optimized.kind === 'Program') {
    optimized = removeUnusedFunctions(optimized);
    if (optimized && optimized.kind === 'Program') {
      optimized.ssa = true;
    }
  }
  if (optimized) validateIR(optimized);
  return optimized;
}

function convertToSSA(node: IRNode): IRNode {
  switch (node.kind) {
    case 'Program':
      return {
        ...node,
        body: node.body.map((child) => convertToSSA(child)),
      };
    case 'Function': {
      if (functionHasControlFlow(node)) return node;
      return convertFunctionToSSA(node);
    }
    default:
      return node;
  }
}

function functionHasControlFlow(fn: IRFunction): boolean {
  const visit = (n: IRNode): boolean => {
    switch (n.kind) {
      case 'MatchExpr':
      case 'Program':
        return true;
      case 'If':
        return visit(n.condition) || n.thenBody.some(visit) || (n.elseBody ? n.elseBody.some(visit) : false);
      case 'While':
        return visit(n.condition) || n.body.some(visit);
      case 'Let':
        return visit(n.value);
      case 'Phi':
        return visit(n.condition) || visit(n.thenValue) || visit(n.elseValue);
      case 'Assign':
        return visit(n.value);
      case 'Return':
        return visit(n.value);
      case 'ExprStmt':
        return visit(n.expr);
      case 'Binary':
        return visit(n.left) || visit(n.right);
      case 'Call':
        return n.args.some(visit);
      case 'StructLiteral':
        return n.fields.some((field) => visit(field.value));
      case 'Member':
        return visit(n.object);
      case 'Index':
        return visit(n.target);
      case 'Enum':
        return n.values.some(visit);
      default:
        return false;
    }
  };
  return fn.body.some(visit);
}

function convertFunctionToSSA(fn: IRFunction): IRFunction {
  const version = new Map<string, number>();
  const current = new Map<string, string>();

  const baseName = (name: string): string => {
    if (!version.has(name)) {
      version.set(name, 0);
      current.set(name, name);
      return name;
    }
    const next = (version.get(name) ?? 0) + 1;
    version.set(name, next);
    const renamed = `${name}_${next}`;
    current.set(name, renamed);
    return renamed;
  };

  fn.params.forEach((param) => {
    version.set(param, 0);
    current.set(param, param);
  });

  const renameExpr = (expr: IRNode): IRNode => {
    switch (expr.kind) {
      case 'Identifier': {
        const mapped = current.get(expr.name) ?? expr.name;
        return mapped === expr.name ? expr : { ...expr, name: mapped };
      }
      case 'Binary':
        return { ...expr, left: renameExpr(expr.left), right: renameExpr(expr.right) };
      case 'Call':
        return { ...expr, args: expr.args.map(renameExpr) };
      case 'StructLiteral':
        return { ...expr, fields: expr.fields.map((field) => ({ ...field, value: renameExpr(field.value) })) };
      case 'Member':
        return { ...expr, object: renameExpr(expr.object) };
      case 'Index':
        return { ...expr, target: renameExpr(expr.target) };
      case 'Enum':
        return { ...expr, values: expr.values.map(renameExpr) };
      case 'MatchExpr':
        return {
          ...expr,
          value: renameExpr(expr.value),
          arms: expr.arms.map((arm) => ({
            ...arm,
            body: renameExpr(arm.body),
          })),
        };
      case 'Phi':
        return {
          ...expr,
          condition: renameExpr(expr.condition),
          thenValue: renameExpr(expr.thenValue),
          elseValue: renameExpr(expr.elseValue),
        };
      default:
        return expr;
    }
  };

  const renameBlock = (
    stmts: IRNode[],
    mapping: Map<string, string>,
    ssaEnabled = true
  ): { body: IRNode[]; mapping: Map<string, string> } => {
    const saved = new Map(current);
    current.clear();
    for (const [k, v] of mapping.entries()) current.set(k, v);

    const body: IRNode[] = [];
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'Let': {
          const value = renameExpr(stmt.value);
          if (ssaEnabled) {
            const renamed = baseName(stmt.name);
            body.push({ ...stmt, name: renamed, value });
          } else {
            body.push({ ...stmt, value });
          }
          break;
        }
        case 'Assign': {
          const value = renameExpr(stmt.value);
          if (ssaEnabled) {
            const renamed = baseName(stmt.target);
            body.push({ kind: 'Let', name: renamed, value, location: stmt.location } as IRLet);
          } else {
            const target = current.get(stmt.target) ?? stmt.target;
            body.push({ ...stmt, target, value });
          }
          break;
        }
        case 'Return':
          body.push({ ...stmt, value: renameExpr(stmt.value) });
          break;
        case 'ExprStmt':
          body.push({ ...stmt, expr: renameExpr(stmt.expr) });
          break;
        case 'If': {
          const cond = renameExpr(stmt.condition);
          const thenResult = renameBlock(stmt.thenBody, new Map(current), ssaEnabled);
          const elseResult = stmt.elseBody
            ? renameBlock(stmt.elseBody, new Map(current), ssaEnabled)
            : { body: [], mapping: new Map(current) };
          const ifNode: IRIf = {
            kind: 'If',
            condition: cond,
            thenBody: thenResult.body,
            elseBody: elseResult.body,
            location: stmt.location,
          };
          body.push(ifNode);

          if (!ssaEnabled) {
            break;
          }

          const join = new Set<string>([
            ...thenResult.mapping.keys(),
            ...elseResult.mapping.keys(),
          ]);
          for (const key of join) {
            const thenName = thenResult.mapping.get(key) ?? current.get(key) ?? key;
            const elseName = elseResult.mapping.get(key) ?? current.get(key) ?? key;
            if (thenName === elseName) {
              current.set(key, thenName);
              continue;
            }
            const phiName = baseName(key);
            const phi: IRPhi = {
              kind: 'Phi',
              name: phiName,
              condition: cond,
              thenValue: { kind: 'Identifier', name: thenName },
              elseValue: { kind: 'Identifier', name: elseName },
            };
            body.push(phi);
          }
          break;
        }
        case 'While': {
          const cond = renameExpr(stmt.condition);
          const bodyResult = renameBlock(stmt.body, new Map(current), false);
          const whileNode: IRWhile = {
            kind: 'While',
            condition: cond,
            body: bodyResult.body,
            location: stmt.location,
          };
          body.push(whileNode);
          break;
        }
        default:
          body.push(stmt);
          break;
      }
    }

    const outMapping = new Map(current);
    current.clear();
    for (const [k, v] of saved.entries()) current.set(k, v);
    return { body, mapping: outMapping };
  };

  const renamed = renameBlock(fn.body, new Map(current));
  return { ...fn, body: renamed.body };
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
      return removeDeadStores(program, true);
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
      const cleaned = removeDeadStores({ kind: 'Program', body: fn.body, location: fn.location }, false);
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
    case 'Phi': {
      const condition = optimizeWithConstants(node.condition, constants) ?? node.condition;
      const thenValue = optimizeWithConstants(node.thenValue, constants) ?? node.thenValue;
      const elseValue = optimizeWithConstants(node.elseValue, constants) ?? node.elseValue;
      if (condition.kind === 'Boolean') {
        const chosen = condition.value ? thenValue : elseValue;
        const letNode: IRLet = { kind: 'Let', name: node.name, value: chosen, location: node.location };
        if (isLiteral(chosen)) {
          constants.set(node.name, chosen);
        } else {
          constants.delete(node.name);
        }
        return letNode;
      }
      const phi: IRPhi = { kind: 'Phi', name: node.name, condition, thenValue, elseValue, location: node.location };
      return phi;
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
    case 'StructLiteral': {
      const fields = node.fields.map((field) => ({
        ...field,
        value: optimizeWithConstants(field.value, constants) ?? field.value,
      }));
      const structNode: IRStructLiteral = { kind: 'StructLiteral', name: node.name, fields, location: node.location };
      return structNode;
    }
    case 'Member': {
      const object = optimizeWithConstants(node.object, constants) ?? node.object;
      const member: IRMember = { kind: 'Member', object, property: node.property, location: node.location };
      return member;
    }
    case 'Index': {
      const target = optimizeWithConstants(node.target, constants) ?? node.target;
      const idx: IRIndex = { kind: 'Index', target, index: node.index, location: node.location };
      return idx;
    }
    case 'Enum': {
      const values = node.values.map((v) => optimizeWithConstants(v, constants) ?? v);
      const enumNode: IREnumConstruct = { kind: 'Enum', tag: node.tag, values, location: node.location };
      return enumNode;
    }
    case 'MatchExpr': {
      const value = optimizeWithConstants(node.value, constants) ?? node.value;
      const arms = node.arms.map((arm) => ({
        ...arm,
        body: optimizeWithConstants(arm.body, new Map(constants)) ?? arm.body,
      }));
      const matchNode: IRMatchExpr = { kind: 'MatchExpr', value, arms, location: node.location };
      return matchNode;
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
      const mutated = new Set<string>();
      for (const stmt of node.body) collectAssignedNames(stmt, mutated);
      const scoped = new Map(constants);
      for (const name of mutated) scoped.delete(name);
      const condition = optimizeWithConstants(node.condition, scoped) ?? node.condition;
      const body = node.body
        .map((n) => optimizeWithConstants(n, new Map(scoped)))
        .filter((n): n is IRNode => n !== null && n.kind !== 'Noop');
      for (const name of mutated) constants.delete(name);
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

function collectAssignedNames(node: IRNode, out: Set<string>): void {
  switch (node.kind) {
    case 'Let':
      out.add(node.name);
      collectAssignedNames(node.value, out);
      return;
    case 'Assign':
      out.add(node.target);
      collectAssignedNames(node.value, out);
      return;
    case 'If':
      collectAssignedNames(node.condition, out);
      node.thenBody.forEach((n) => collectAssignedNames(n, out));
      node.elseBody?.forEach((n) => collectAssignedNames(n, out));
      return;
    case 'While':
      collectAssignedNames(node.condition, out);
      node.body.forEach((n) => collectAssignedNames(n, out));
      return;
    case 'MatchExpr':
      collectAssignedNames(node.value, out);
      node.arms.forEach((arm) => collectAssignedNames(arm.body, out));
      return;
    case 'ExprStmt':
      collectAssignedNames(node.expr, out);
      return;
    case 'Return':
      collectAssignedNames(node.value, out);
      return;
    case 'Binary':
      collectAssignedNames(node.left, out);
      collectAssignedNames(node.right, out);
      return;
    case 'Call':
      node.args.forEach((arg) => collectAssignedNames(arg, out));
      return;
    case 'StructLiteral':
      node.fields.forEach((field) => collectAssignedNames(field.value, out));
      return;
    case 'Member':
      collectAssignedNames(node.object, out);
      return;
    case 'Index':
      collectAssignedNames(node.target, out);
      return;
    case 'Enum':
      node.values.forEach((value) => collectAssignedNames(value, out));
      return;
    case 'Phi':
      collectAssignedNames(node.condition, out);
      collectAssignedNames(node.thenValue, out);
      collectAssignedNames(node.elseValue, out);
      return;
    case 'Program':
      node.body.forEach((n) => collectAssignedNames(n, out));
      return;
    case 'Function':
      node.body.forEach((n) => collectAssignedNames(n, out));
      return;
    default:
      return;
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
      case 'Phi':
        visit(n.condition);
        visit(n.thenValue);
        visit(n.elseValue);
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
      case 'Member':
        if (!n.property) throw new Error('IR validation: Member property missing');
        visit(n.object);
        return;
      case 'Index':
        if (n.index === undefined) throw new Error('IR validation: Index missing');
        visit(n.target);
        return;
      case 'Enum':
        if (!n.tag) throw new Error('IR validation: Enum tag missing');
        n.values.forEach(visit);
        return;
      case 'StructLiteral':
        n.fields.forEach((field) => visit(field.value));
        return;
      case 'MatchExpr':
        visit(n.value);
        n.arms.forEach((arm) => visit(arm.body));
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

function removeDeadStores(program: IRProgram, preserveTopLevelLets: boolean): IRProgram {
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
      case 'Member':
        markExpr(expr.object);
        return;
      case 'Index':
        markExpr(expr.target);
        return;
      case 'Enum':
        expr.values.forEach(markExpr);
        return;
      case 'StructLiteral':
        expr.fields.forEach((field) => markExpr(field.value));
        return;
      case 'MatchExpr':
        markExpr(expr.value);
        expr.arms.forEach((arm) => markExpr(arm.body));
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
      case 'Phi':
        markExpr(expr.condition);
        markExpr(expr.thenValue);
        markExpr(expr.elseValue);
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
      case 'Phi':
        markExpr(stmt.condition);
        markExpr(stmt.thenValue);
        markExpr(stmt.elseValue);
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
      if (preserveTopLevelLets) {
        kept.push(stmt);
        markExpr(stmt.value);
        continue;
      }
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
    if (stmt.kind === 'Phi') {
      if (used.has(stmt.name)) {
        kept.push(stmt);
        markExpr(stmt.thenValue);
        markExpr(stmt.elseValue);
        markExpr(stmt.condition);
        used.delete(stmt.name);
      } else {
        markExpr(stmt.thenValue);
        markExpr(stmt.elseValue);
        markExpr(stmt.condition);
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

function removeUnusedFunctions(program: IRProgram): IRProgram {
  const functions = new Map<string, IRFunction>();
  const nonFunctions: IRNode[] = [];
  for (const node of program.body) {
    if (node.kind === 'Function') {
      functions.set(node.name, node);
    } else {
      nonFunctions.push(node);
    }
  }
  if (functions.size === 0) return program;

  const used = new Set<string>();
  const worklist: string[] = [];
  const enqueue = (name: string) => {
    if (!functions.has(name)) return;
    if (used.has(name)) return;
    used.add(name);
    worklist.push(name);
  };

  const scanNode = (node: IRNode) => {
    switch (node.kind) {
      case 'Call':
        enqueue(node.callee);
        node.args.forEach(scanNode);
        return;
      case 'Binary':
        scanNode(node.left);
        scanNode(node.right);
        return;
      case 'Member':
        scanNode(node.object);
        return;
      case 'Index':
        scanNode(node.target);
        return;
      case 'Enum':
        node.values.forEach(scanNode);
        return;
      case 'StructLiteral':
        node.fields.forEach((field) => scanNode(field.value));
        return;
      case 'MatchExpr':
        scanNode(node.value);
        node.arms.forEach((arm) => scanNode(arm.body));
        return;
      case 'If':
        scanNode(node.condition);
        node.thenBody.forEach(scanNode);
        node.elseBody?.forEach(scanNode);
        return;
      case 'While':
        scanNode(node.condition);
        node.body.forEach(scanNode);
        return;
      case 'Assign':
        scanNode(node.value);
        return;
      case 'Let':
        scanNode(node.value);
        return;
      case 'Phi':
        scanNode(node.condition);
        scanNode(node.thenValue);
        scanNode(node.elseValue);
        return;
      case 'Return':
        scanNode(node.value);
        return;
      case 'ExprStmt':
        scanNode(node.expr);
        return;
      case 'Program':
        node.body.forEach(scanNode);
        return;
      default:
        return;
    }
  };

  for (const node of nonFunctions) {
    scanNode(node);
  }
  enqueue('main');

  while (worklist.length > 0) {
    const next = worklist.pop();
    if (!next) break;
    const fn = functions.get(next);
    if (!fn) continue;
    fn.body.forEach(scanNode);
  }

  if (used.size === 0) return program;

  const body = program.body.filter((node) => {
    if (node.kind !== 'Function') return true;
    return used.has(node.name);
  });

  return { ...program, body };
}
