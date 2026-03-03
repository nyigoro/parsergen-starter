import type {
  LuminaArrayRepeatLiteral,
  LuminaBlock,
  LuminaCall,
  LuminaExpr,
  LuminaFnDecl,
  LuminaInterpolatedString,
  LuminaLambda,
  LuminaMatchArmExpr,
  LuminaMatchArmStmt,
  LuminaMatchPattern,
  LuminaProgram,
  LuminaStatement,
  LuminaStructLiteralField,
} from './ast.js';
import { normalizeTypeName } from './types.js';
import {
  hasMangledSentinel,
  hasUnresolvedMangledName,
  MANGLED_SENTINEL_CHARS,
} from './monomorphize.js';

const INLINE_THRESHOLD_AST_NODES = 35;
const INLINE_THRESHOLD_HOT_NODES = 70;
const INLINE_HOT_CALL_COUNT = 10;
const INLINE_MAX_CALLER_NODES = 120;
const THREAD_SPAWN_HARD_BOUNDARY = 'thread.spawn_worker';
const THREAD_SPAWN_SOFT_BOUNDARY = 'thread.spawn';
const SENTINEL_CHARS = [...MANGLED_SENTINEL_CHARS];

const NORMALIZED_ANY = normalizeTypeName({ kind: 'primitive', name: 'any' });

export interface InlineOptions {
  threshold?: number;
  hotThreshold?: number;
  hotCallCount?: number;
  maxCallerNodes?: number;
  debug?: boolean;
}

interface CallEdge {
  caller: string;
  callee: string;
  callSiteCount: number;
  isThreadBoundary: boolean;
  isSoftBoundary: boolean;
}

interface CallGraph {
  edges: Map<string, Map<string, CallEdge>>;
  callCounts: Map<string, number>;
  functionSizes: Map<string, number>;
}

interface SCC {
  id: number;
  members: Set<string>;
}

interface SCCGraph {
  sccs: Map<number, SCC>;
  nodeToSCC: Map<string, number>;
  recursiveComponents: Set<number>;
}

interface AlphaScope {
  renameMap: Map<string, string>;
  parent: AlphaScope | null;
  counter: { n: number };
}

export interface InlineDecision {
  callee: string;
  eligible: boolean;
  reason: string;
  callSiteCount: number;
  nodeCount: number;
}

export interface InlineResult {
  ast: LuminaProgram;
  decisions: InlineDecision[];
  inlinedCount: number;
  skippedCount: number;
}

interface ResolvedOptions {
  threshold: number;
  hotThreshold: number;
  hotCallCount: number;
  maxCallerNodes: number;
  debug: boolean;
}

interface InlineFnState {
  callerName: string;
  callerNodeCount: number;
}

type FnStatement = Extract<LuminaStatement, { type: 'FnDecl' }>;

const cloneExpr = <T extends LuminaExpr>(expr: T): T => JSON.parse(JSON.stringify(expr)) as T;
const cloneStmt = <T extends LuminaStatement>(stmt: T): T => JSON.parse(JSON.stringify(stmt)) as T;

const defaultOptions = (options: InlineOptions): ResolvedOptions => ({
  threshold: options.threshold ?? INLINE_THRESHOLD_AST_NODES,
  hotThreshold: options.hotThreshold ?? INLINE_THRESHOLD_HOT_NODES,
  hotCallCount: options.hotCallCount ?? INLINE_HOT_CALL_COUNT,
  maxCallerNodes: options.maxCallerNodes ?? INLINE_MAX_CALLER_NODES,
  debug: options.debug ?? false,
});

const resolveCallName = (expr: LuminaCall): string => {
  if (expr.enumName) return `${expr.enumName}.${expr.callee.name}`;
  return expr.callee.name;
};

const isHardThreadBoundary = (callee: string): boolean => callee === THREAD_SPAWN_HARD_BOUNDARY;
const isSoftThreadBoundary = (callee: string): boolean => callee === THREAD_SPAWN_SOFT_BOUNDARY;

const hasInvalidMangledName = (name: string): boolean =>
  hasMangledSentinel(name, SENTINEL_CHARS) ||
  hasUnresolvedMangledName(name) ||
  name.includes(`_${NORMALIZED_ANY}`);

function walkExpr(expr: LuminaExpr, onCall: (call: LuminaCall) => void): void {
  switch (expr.type) {
    case 'Call':
      if (expr.receiver) walkExpr(expr.receiver, onCall);
      for (const arg of expr.args ?? []) walkExpr(arg, onCall);
      onCall(expr);
      return;
    case 'Binary':
      walkExpr(expr.left, onCall);
      walkExpr(expr.right, onCall);
      return;
    case 'Member':
      walkExpr(expr.object, onCall);
      return;
    case 'Index':
      walkExpr(expr.object, onCall);
      walkExpr(expr.index, onCall);
      return;
    case 'Range':
      if (expr.start) walkExpr(expr.start, onCall);
      if (expr.end) walkExpr(expr.end, onCall);
      return;
    case 'ArrayLiteral':
    case 'TupleLiteral':
      for (const item of expr.elements) walkExpr(item, onCall);
      return;
    case 'ArrayRepeatLiteral': {
      const arr = expr as LuminaArrayRepeatLiteral;
      walkExpr(arr.value, onCall);
      walkExpr(arr.count, onCall);
      return;
    }
    case 'StructLiteral':
      for (const field of expr.fields as LuminaStructLiteralField[]) walkExpr(field.value, onCall);
      return;
    case 'MatchExpr':
      walkExpr(expr.value, onCall);
      for (const arm of expr.arms as LuminaMatchArmExpr[]) {
        if (arm.guard) walkExpr(arm.guard, onCall);
        walkExpr(arm.body, onCall);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms) {
        walkExpr(arm.value, onCall);
        walkExpr(arm.body, onCall);
      }
      return;
    case 'InterpolatedString':
      for (const part of (expr as LuminaInterpolatedString).parts) {
        if (typeof part !== 'string') walkExpr(part, onCall);
      }
      return;
    case 'Lambda': {
      const lambda = expr as LuminaLambda;
      for (const stmt of lambda.body.body) walkStmt(stmt, onCall);
      return;
    }
    case 'Try':
    case 'Await':
      walkExpr(expr.value, onCall);
      return;
    case 'Move':
      if (expr.target.type !== 'Identifier') walkExpr(expr.target.object, onCall);
      return;
    case 'Cast':
      walkExpr(expr.expr, onCall);
      return;
    case 'IsExpr':
      walkExpr(expr.value, onCall);
      return;
    default:
      return;
  }
}

function walkStmt(stmt: LuminaStatement, onCall: (call: LuminaCall) => void): void {
  switch (stmt.type) {
    case 'ExprStmt':
      walkExpr(stmt.expr, onCall);
      return;
    case 'Return':
      walkExpr(stmt.value, onCall);
      return;
    case 'Let':
      walkExpr(stmt.value, onCall);
      return;
    case 'LetTuple':
      walkExpr(stmt.value, onCall);
      return;
    case 'LetElse':
      walkExpr(stmt.value, onCall);
      walkStmt(stmt.elseBlock, onCall);
      return;
    case 'Assign':
      walkExpr(stmt.value, onCall);
      if (stmt.target.type !== 'Identifier') walkExpr(stmt.target.object, onCall);
      return;
    case 'If':
      walkExpr(stmt.condition, onCall);
      walkStmt(stmt.thenBlock, onCall);
      if (stmt.elseBlock) walkStmt(stmt.elseBlock, onCall);
      return;
    case 'IfLet':
      walkExpr(stmt.value, onCall);
      walkStmt(stmt.thenBlock, onCall);
      if (stmt.elseBlock) walkStmt(stmt.elseBlock, onCall);
      return;
    case 'While':
      walkExpr(stmt.condition, onCall);
      walkStmt(stmt.body, onCall);
      return;
    case 'WhileLet':
      walkExpr(stmt.value, onCall);
      walkStmt(stmt.body, onCall);
      return;
    case 'For':
      walkExpr(stmt.iterable, onCall);
      walkStmt(stmt.body, onCall);
      return;
    case 'MatchStmt':
      walkExpr(stmt.value, onCall);
      for (const arm of stmt.arms as LuminaMatchArmStmt[]) {
        if (arm.guard) walkExpr(arm.guard, onCall);
        walkStmt(arm.body, onCall);
      }
      return;
    case 'Block':
      for (const inner of stmt.body) walkStmt(inner, onCall);
      return;
    default:
      return;
  }
}

function countExprNodes(expr: LuminaExpr): number {
  let total = 1;
  walkExpr(expr, () => {});
  switch (expr.type) {
    case 'Binary':
      return total + countExprNodes(expr.left) + countExprNodes(expr.right);
    case 'Call':
      return (
        total +
        (expr.receiver ? countExprNodes(expr.receiver) : 0) +
        (expr.args ?? []).reduce((sum, arg) => sum + countExprNodes(arg), 0)
      );
    case 'Member':
      return total + countExprNodes(expr.object);
    case 'Index':
      return total + countExprNodes(expr.object) + countExprNodes(expr.index);
    case 'Range':
      return total + (expr.start ? countExprNodes(expr.start) : 0) + (expr.end ? countExprNodes(expr.end) : 0);
    case 'ArrayLiteral':
    case 'TupleLiteral':
      return total + expr.elements.reduce((sum, item) => sum + countExprNodes(item), 0);
    case 'ArrayRepeatLiteral': {
      const arr = expr as LuminaArrayRepeatLiteral;
      return total + countExprNodes(arr.value) + countExprNodes(arr.count);
    }
    case 'StructLiteral':
      return total + expr.fields.reduce((sum, field) => sum + countExprNodes(field.value), 0);
    case 'MatchExpr':
      return (
        total +
        countExprNodes(expr.value) +
        expr.arms.reduce(
          (sum, arm) => sum + (arm.guard ? countExprNodes(arm.guard) : 0) + countExprNodes(arm.body),
          0
        )
      );
    case 'SelectExpr':
      return total + expr.arms.reduce((sum, arm) => sum + countExprNodes(arm.value) + countExprNodes(arm.body), 0);
    case 'InterpolatedString':
      return (
        total +
        expr.parts.reduce((sum, part) => sum + (typeof part === 'string' ? 0 : countExprNodes(part)), 0)
      );
    case 'Lambda':
      return total + countBlockNodes(expr.body);
    case 'Try':
    case 'Await':
      return total + countExprNodes(expr.value);
    case 'Move':
      return total + (expr.target.type !== 'Identifier' ? countExprNodes(expr.target.object) : 0);
    case 'Cast':
      return total + countExprNodes(expr.expr);
    case 'IsExpr':
      return total + countExprNodes(expr.value);
    default:
      return total;
  }
}

function countStmtNodes(stmt: LuminaStatement): number {
  switch (stmt.type) {
    case 'ExprStmt':
      return 1 + countExprNodes(stmt.expr);
    case 'Return':
      return 1 + countExprNodes(stmt.value);
    case 'Let':
      return 1 + countExprNodes(stmt.value);
    case 'LetTuple':
      return 1 + countExprNodes(stmt.value);
    case 'LetElse':
      return 1 + countExprNodes(stmt.value) + countBlockNodes(stmt.elseBlock);
    case 'Assign':
      return 1 + countExprNodes(stmt.value) + (stmt.target.type !== 'Identifier' ? countExprNodes(stmt.target.object) : 0);
    case 'If':
      return 1 + countExprNodes(stmt.condition) + countBlockNodes(stmt.thenBlock) + (stmt.elseBlock ? countBlockNodes(stmt.elseBlock) : 0);
    case 'IfLet':
      return 1 + countExprNodes(stmt.value) + countBlockNodes(stmt.thenBlock) + (stmt.elseBlock ? countBlockNodes(stmt.elseBlock) : 0);
    case 'While':
      return 1 + countExprNodes(stmt.condition) + countBlockNodes(stmt.body);
    case 'WhileLet':
      return 1 + countExprNodes(stmt.value) + countBlockNodes(stmt.body);
    case 'For':
      return 1 + countExprNodes(stmt.iterable) + countBlockNodes(stmt.body);
    case 'MatchStmt':
      return 1 + countExprNodes(stmt.value) + stmt.arms.reduce((sum, arm) => sum + countBlockNodes(arm.body) + (arm.guard ? countExprNodes(arm.guard) : 0), 0);
    case 'Block':
      return 1 + countBlockNodes(stmt);
    default:
      return 1;
  }
}

function countBlockNodes(block: LuminaBlock): number {
  return block.body.reduce((sum, stmt) => sum + countStmtNodes(stmt), 0);
}

function countASTNodes(fnBody: LuminaBlock, memo?: Map<string, number>, fnName?: string): number {
  if (memo && fnName && memo.has(fnName)) return memo.get(fnName) ?? 0;
  const total = countBlockNodes(fnBody);
  if (memo && fnName) memo.set(fnName, total);
  return total;
}

function buildCallGraph(ast: LuminaProgram): CallGraph {
  const edges = new Map<string, Map<string, CallEdge>>();
  const callCounts = new Map<string, number>();
  const functionSizes = new Map<string, number>();
  const nodeMemo = new Map<string, number>();
  const fns = ast.body.filter((stmt): stmt is FnStatement => stmt.type === 'FnDecl');

  for (const fn of fns) {
    functionSizes.set(fn.name, countASTNodes(fn.body, nodeMemo, fn.name));
    for (const stmt of fn.body.body) {
      walkStmt(stmt, (call) => {
        const callee = resolveCallName(call);
        if (hasInvalidMangledName(callee)) return;
        let perCaller = edges.get(fn.name);
        if (!perCaller) {
          perCaller = new Map();
          edges.set(fn.name, perCaller);
        }
        const existing = perCaller.get(callee);
        if (existing) {
          existing.callSiteCount += 1;
        } else {
          perCaller.set(callee, {
            caller: fn.name,
            callee,
            callSiteCount: 1,
            isThreadBoundary: isHardThreadBoundary(callee),
            isSoftBoundary: isSoftThreadBoundary(callee),
          });
        }
        callCounts.set(callee, (callCounts.get(callee) ?? 0) + 1);
      });
    }
  }

  return { edges, callCounts, functionSizes };
}

function computeSCCs(graph: CallGraph): SCCGraph {
  const nodes = new Set<string>();
  for (const name of graph.functionSizes.keys()) nodes.add(name);
  for (const [caller, perCaller] of graph.edges.entries()) {
    nodes.add(caller);
    for (const edge of perCaller.values()) {
      if (edge.isThreadBoundary) continue;
      if (graph.functionSizes.has(edge.callee)) nodes.add(edge.callee);
    }
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const sccs = new Map<number, SCC>();
  const nodeToSCC = new Map<string, number>();
  const recursiveComponents = new Set<number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    const outgoing = graph.edges.get(node);
    const next: string[] = [];
    if (outgoing) {
      for (const edge of outgoing.values()) {
        if (edge.isThreadBoundary) continue;
        if (!nodes.has(edge.callee)) continue;
        next.push(edge.callee);
      }
    }
    adjacency.set(node, next);
  }

  const strongConnect = (node: string) => {
    indices.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        const currentLow = lowLink.get(node) ?? 0;
        const neighborLow = lowLink.get(neighbor) ?? currentLow;
        lowLink.set(node, Math.min(currentLow, neighborLow));
      } else if (onStack.has(neighbor)) {
        const currentLow = lowLink.get(node) ?? 0;
        const neighborIndex = indices.get(neighbor) ?? currentLow;
        lowLink.set(node, Math.min(currentLow, neighborIndex));
      }
    }

    if ((lowLink.get(node) ?? -1) !== (indices.get(node) ?? -2)) return;
    const members = new Set<string>();
    while (stack.length > 0) {
      const popped = stack.pop();
      if (!popped) break;
      onStack.delete(popped);
      members.add(popped);
      if (popped === node) break;
    }
    const id = sccs.size;
    sccs.set(id, { id, members });
    for (const member of members) nodeToSCC.set(member, id);
    if (members.size > 1) recursiveComponents.add(id);
  };

  for (const node of nodes) {
    if (!indices.has(node)) strongConnect(node);
  }

  for (const [caller, perCaller] of graph.edges.entries()) {
    for (const edge of perCaller.values()) {
      if (edge.isThreadBoundary) continue;
      if (caller !== edge.callee) continue;
      const id = nodeToSCC.get(caller);
      if (id !== undefined) recursiveComponents.add(id);
    }
  }

  return { sccs, nodeToSCC, recursiveComponents };
}

function createAlphaScope(parent: AlphaScope | null, globalCounter: { n: number }): AlphaScope {
  return {
    renameMap: new Map<string, string>(),
    parent,
    counter: globalCounter,
  };
}

function resolveRenamed(scope: AlphaScope | null, name: string): string {
  let current: AlphaScope | null = scope;
  while (current) {
    const mapped = current.renameMap.get(name);
    if (mapped) return mapped;
    current = current.parent;
  }
  return name;
}

function bindRenamed(scope: AlphaScope, name: string): string {
  const fresh = `${name}__inl_${scope.counter.n++}`;
  scope.renameMap.set(name, fresh);
  return fresh;
}

function renamePattern(pattern: LuminaMatchPattern, scope: AlphaScope): LuminaMatchPattern {
  switch (pattern.type) {
    case 'BindingPattern':
      return { ...pattern, name: bindRenamed(scope, pattern.name) };
    case 'EnumPattern': {
      const renamedBindings = (pattern.bindings ?? []).map((binding) => bindRenamed(scope, binding));
      return {
        ...pattern,
        bindings: renamedBindings,
        patterns: pattern.patterns?.map((inner) => renamePattern(inner, scope)),
      };
    }
    case 'TuplePattern':
      return { ...pattern, elements: pattern.elements.map((inner) => renamePattern(inner, scope)) };
    case 'StructPattern':
      return {
        ...pattern,
        fields: pattern.fields.map((field) => ({ ...field, pattern: renamePattern(field.pattern, scope) })),
      };
    default:
      return pattern;
  }
}

function renameExpr(expr: LuminaExpr, scope: AlphaScope): LuminaExpr {
  switch (expr.type) {
    case 'Identifier':
      return { ...expr, name: resolveRenamed(scope, expr.name) };
    case 'Binary':
      return { ...expr, left: renameExpr(expr.left, scope), right: renameExpr(expr.right, scope) };
    case 'Call':
      return {
        ...expr,
        receiver: expr.receiver ? renameExpr(expr.receiver, scope) : expr.receiver,
        args: (expr.args ?? []).map((arg) => renameExpr(arg, scope)),
      };
    case 'Member':
      return { ...expr, object: renameExpr(expr.object, scope) };
    case 'Index':
      return { ...expr, object: renameExpr(expr.object, scope), index: renameExpr(expr.index, scope) };
    case 'Range':
      return {
        ...expr,
        start: expr.start ? renameExpr(expr.start, scope) : expr.start,
        end: expr.end ? renameExpr(expr.end, scope) : expr.end,
      };
    case 'ArrayLiteral':
      return { ...expr, elements: expr.elements.map((element) => renameExpr(element, scope)) };
    case 'ArrayRepeatLiteral':
      return { ...expr, value: renameExpr(expr.value, scope), count: renameExpr(expr.count, scope) };
    case 'TupleLiteral':
      return { ...expr, elements: expr.elements.map((element) => renameExpr(element, scope)) };
    case 'StructLiteral':
      return {
        ...expr,
        fields: expr.fields.map((field) => ({ ...field, value: renameExpr(field.value, scope) })),
      };
    case 'Lambda': {
      const child = createAlphaScope(scope, scope.counter);
      const params = expr.params.map((param) => ({ ...param, name: bindRenamed(child, param.name) }));
      return { ...expr, params, body: renameInBody(expr.body, child) };
    }
    case 'MatchExpr':
      return {
        ...expr,
        value: renameExpr(expr.value, scope),
        arms: expr.arms.map((arm) => {
          const armScope = createAlphaScope(scope, scope.counter);
          const pattern = renamePattern(arm.pattern, armScope);
          return {
            ...arm,
            pattern,
            guard: arm.guard ? renameExpr(arm.guard, armScope) : arm.guard,
            body: renameExpr(arm.body, armScope),
          };
        }),
      };
    case 'SelectExpr':
      return {
        ...expr,
        arms: expr.arms.map((arm) => {
          const armScope = createAlphaScope(scope, scope.counter);
          const binding = arm.binding ? bindRenamed(armScope, arm.binding) : null;
          return {
            ...arm,
            binding,
            value: renameExpr(arm.value, scope),
            body: renameExpr(arm.body, armScope),
          };
        }),
      };
    case 'InterpolatedString':
      return {
        ...expr,
        parts: expr.parts.map((part) => (typeof part === 'string' ? part : renameExpr(part, scope))),
      };
    case 'Move':
      return {
        ...expr,
        target:
          expr.target.type === 'Identifier'
            ? { ...expr.target, name: resolveRenamed(scope, expr.target.name) }
            : { ...expr.target, object: renameExpr(expr.target.object, scope) },
      };
    case 'Await':
    case 'Try':
      return { ...expr, value: renameExpr(expr.value, scope) };
    case 'Cast':
      return { ...expr, expr: renameExpr(expr.expr, scope) };
    case 'IsExpr':
      return { ...expr, value: renameExpr(expr.value, scope) };
    default:
      return expr;
  }
}

function renameStmt(stmt: LuminaStatement, scope: AlphaScope): LuminaStatement {
  switch (stmt.type) {
    case 'Let': {
      const value = renameExpr(stmt.value, scope);
      const name = bindRenamed(scope, stmt.name);
      return { ...stmt, name, value };
    }
    case 'LetTuple': {
      const value = renameExpr(stmt.value, scope);
      const names = stmt.names.map((name) => bindRenamed(scope, name));
      return { ...stmt, names, value };
    }
    case 'LetElse': {
      const value = renameExpr(stmt.value, scope);
      const elseBlock = renameInBody(stmt.elseBlock, createAlphaScope(scope, scope.counter));
      const patternScope = createAlphaScope(scope, scope.counter);
      const pattern = renamePattern(stmt.pattern, patternScope);
      for (const [from, to] of patternScope.renameMap.entries()) scope.renameMap.set(from, to);
      return { ...stmt, value, elseBlock, pattern };
    }
    case 'Assign':
      return {
        ...stmt,
        target:
          stmt.target.type === 'Identifier'
            ? { ...stmt.target, name: resolveRenamed(scope, stmt.target.name) }
            : { ...stmt.target, object: renameExpr(stmt.target.object, scope) },
        value: renameExpr(stmt.value, scope),
      };
    case 'Return':
      return { ...stmt, value: renameExpr(stmt.value, scope) };
    case 'ExprStmt':
      return { ...stmt, expr: renameExpr(stmt.expr, scope) };
    case 'If': {
      const thenScope = createAlphaScope(scope, scope.counter);
      const elseScope = createAlphaScope(scope, scope.counter);
      return {
        ...stmt,
        condition: renameExpr(stmt.condition, scope),
        thenBlock: renameInBody(stmt.thenBlock, thenScope),
        elseBlock: stmt.elseBlock ? renameInBody(stmt.elseBlock, elseScope) : stmt.elseBlock,
      };
    }
    case 'IfLet': {
      const ifScope = createAlphaScope(scope, scope.counter);
      const pattern = renamePattern(stmt.pattern, ifScope);
      return {
        ...stmt,
        pattern,
        value: renameExpr(stmt.value, scope),
        thenBlock: renameInBody(stmt.thenBlock, ifScope),
        elseBlock: stmt.elseBlock ? renameInBody(stmt.elseBlock, createAlphaScope(scope, scope.counter)) : stmt.elseBlock,
      };
    }
    case 'While':
      return {
        ...stmt,
        condition: renameExpr(stmt.condition, scope),
        body: renameInBody(stmt.body, createAlphaScope(scope, scope.counter)),
      };
    case 'WhileLet': {
      const whileScope = createAlphaScope(scope, scope.counter);
      return {
        ...stmt,
        pattern: renamePattern(stmt.pattern, whileScope),
        value: renameExpr(stmt.value, scope),
        body: renameInBody(stmt.body, whileScope),
      };
    }
    case 'For': {
      const forScope = createAlphaScope(scope, scope.counter);
      const iterator = bindRenamed(forScope, stmt.iterator);
      return {
        ...stmt,
        iterator,
        iterable: renameExpr(stmt.iterable, scope),
        body: renameInBody(stmt.body, forScope),
      };
    }
    case 'MatchStmt':
      return {
        ...stmt,
        value: renameExpr(stmt.value, scope),
        arms: stmt.arms.map((arm) => {
          const armScope = createAlphaScope(scope, scope.counter);
          return {
            ...arm,
            pattern: renamePattern(arm.pattern, armScope),
            guard: arm.guard ? renameExpr(arm.guard, armScope) : arm.guard,
            body: renameInBody(arm.body, armScope),
          };
        }),
      };
    case 'Block':
      return renameInBody(stmt, createAlphaScope(scope, scope.counter));
    default:
      return stmt;
  }
}

function renameInBody(body: LuminaBlock, scope: AlphaScope): LuminaBlock {
  return {
    ...body,
    body: body.body.map((stmt) => renameStmt(stmt, scope)),
  };
}

function substituteExpr(expr: LuminaExpr, bindings: Map<string, LuminaExpr>, guard = new Set<string>()): LuminaExpr {
  if (expr.type === 'Identifier') {
    const bound = bindings.get(expr.name);
    if (!bound) return expr;
    if (guard.has(expr.name)) return expr;
    const nextGuard = new Set(guard);
    nextGuard.add(expr.name);
    return substituteInExpr(cloneExpr(bound), bindings);
  }
  return substituteInExpr(expr, bindings);
}

function substituteInExpr(expr: LuminaExpr, bindings: Map<string, LuminaExpr>): LuminaExpr {
  switch (expr.type) {
    case 'Identifier':
      return substituteExpr(expr, bindings);
    case 'Binary':
      return { ...expr, left: substituteInExpr(expr.left, bindings), right: substituteInExpr(expr.right, bindings) };
    case 'Call':
      return {
        ...expr,
        receiver: expr.receiver ? substituteInExpr(expr.receiver, bindings) : expr.receiver,
        args: (expr.args ?? []).map((arg) => substituteInExpr(arg, bindings)),
      };
    case 'Member':
      return { ...expr, object: substituteInExpr(expr.object, bindings) };
    case 'Index':
      return { ...expr, object: substituteInExpr(expr.object, bindings), index: substituteInExpr(expr.index, bindings) };
    case 'Range':
      return {
        ...expr,
        start: expr.start ? substituteInExpr(expr.start, bindings) : expr.start,
        end: expr.end ? substituteInExpr(expr.end, bindings) : expr.end,
      };
    case 'ArrayLiteral':
      return { ...expr, elements: expr.elements.map((item) => substituteInExpr(item, bindings)) };
    case 'ArrayRepeatLiteral':
      return { ...expr, value: substituteInExpr(expr.value, bindings), count: substituteInExpr(expr.count, bindings) };
    case 'TupleLiteral':
      return { ...expr, elements: expr.elements.map((item) => substituteInExpr(item, bindings)) };
    case 'StructLiteral':
      return {
        ...expr,
        fields: expr.fields.map((field) => ({ ...field, value: substituteInExpr(field.value, bindings) })),
      };
    case 'MatchExpr':
      return {
        ...expr,
        value: substituteInExpr(expr.value, bindings),
        arms: expr.arms.map((arm) => ({
          ...arm,
          guard: arm.guard ? substituteInExpr(arm.guard, bindings) : arm.guard,
          body: substituteInExpr(arm.body, bindings),
        })),
      };
    case 'SelectExpr':
      return {
        ...expr,
        arms: expr.arms.map((arm) => ({
          ...arm,
          value: substituteInExpr(arm.value, bindings),
          body: substituteInExpr(arm.body, bindings),
        })),
      };
    case 'InterpolatedString':
      return {
        ...expr,
        parts: expr.parts.map((part) => (typeof part === 'string' ? part : substituteInExpr(part, bindings))),
      };
    case 'Lambda':
      return expr;
    case 'Try':
    case 'Await':
      return { ...expr, value: substituteInExpr(expr.value, bindings) };
    case 'Move':
      return {
        ...expr,
        target:
          expr.target.type === 'Identifier'
            ? expr.target
            : { ...expr.target, object: substituteInExpr(expr.target.object, bindings) },
      };
    case 'Cast':
      return { ...expr, expr: substituteInExpr(expr.expr, bindings) };
    case 'IsExpr':
      return { ...expr, value: substituteInExpr(expr.value, bindings) };
    default:
      return expr;
  }
}

function identifierUsageCount(expr: LuminaExpr, name: string): number {
  let count = 0;
  walkExpr(expr, () => {});
  const visit = (node: LuminaExpr): void => {
    if (node.type === 'Identifier') {
      if (node.name === name) count += 1;
      return;
    }
    switch (node.type) {
      case 'Binary':
        visit(node.left);
        visit(node.right);
        return;
      case 'Call':
        if (node.receiver) visit(node.receiver);
        for (const arg of node.args ?? []) visit(arg);
        return;
      case 'Member':
        visit(node.object);
        return;
      case 'Index':
        visit(node.object);
        visit(node.index);
        return;
      case 'Range':
        if (node.start) visit(node.start);
        if (node.end) visit(node.end);
        return;
      case 'ArrayLiteral':
      case 'TupleLiteral':
        for (const item of node.elements) visit(item);
        return;
      case 'ArrayRepeatLiteral':
        visit(node.value);
        visit(node.count);
        return;
      case 'StructLiteral':
        for (const field of node.fields) visit(field.value);
        return;
      case 'MatchExpr':
        visit(node.value);
        for (const arm of node.arms) {
          if (arm.guard) visit(arm.guard);
          visit(arm.body);
        }
        return;
      case 'SelectExpr':
        for (const arm of node.arms) {
          visit(arm.value);
          visit(arm.body);
        }
        return;
      case 'InterpolatedString':
        for (const part of node.parts) {
          if (typeof part !== 'string') visit(part);
        }
        return;
      case 'Try':
      case 'Await':
        visit(node.value);
        return;
      case 'Move':
        if (node.target.type !== 'Identifier') visit(node.target.object);
        return;
      case 'Cast':
        visit(node.expr);
        return;
      case 'IsExpr':
        visit(node.value);
        return;
      default:
        return;
    }
  };

  visit(expr);
  return count;
}

function isPureExpr(expr: LuminaExpr): boolean {
  switch (expr.type) {
    case 'Identifier':
    case 'Number':
    case 'Boolean':
    case 'String':
    case 'Lambda':
      return true;
    case 'InterpolatedString':
      return expr.parts.every((part) => typeof part === 'string' || isPureExpr(part));
    case 'ArrayLiteral':
    case 'TupleLiteral':
      return expr.elements.every((item) => isPureExpr(item));
    case 'StructLiteral':
      return expr.fields.every((field) => isPureExpr(field.value));
    case 'Range':
      return (!expr.start || isPureExpr(expr.start)) && (!expr.end || isPureExpr(expr.end));
    case 'Binary':
      return isPureExpr(expr.left) && isPureExpr(expr.right);
    case 'Member':
      return isPureExpr(expr.object);
    case 'Index':
      return isPureExpr(expr.object) && isPureExpr(expr.index);
    case 'Cast':
      return isPureExpr(expr.expr);
    default:
      return false;
  }
}

function tryInlineCalleeExpression(
  callee: LuminaFnDecl,
  callNode: LuminaCall,
  globalCounter: { n: number }
): LuminaExpr | null {
  if ((callee.params ?? []).length !== (callNode.args ?? []).length) return null;
  if (callee.async) return null;

  const inlineScope = createAlphaScope(null, globalCounter);
  for (const param of callee.params) bindRenamed(inlineScope, param.name);
  const renamedBody = renameInBody(cloneStmt(callee.body), inlineScope);

  const env = new Map<string, LuminaExpr>();
  for (let i = 0; i < callee.params.length; i++) {
    const original = callee.params[i].name;
    const renamed = inlineScope.renameMap.get(original) ?? original;
    env.set(renamed, cloneExpr(callNode.args[i]));
  }

  for (const [original, renamed] of inlineScope.renameMap.entries()) {
    if (!callee.params.some((param) => param.name === original)) continue;
    const arg = env.get(renamed);
    if (!arg) continue;
    if (isPureExpr(arg)) continue;
    const uses = renamedBody.body.reduce((sum, stmt) => {
      if (stmt.type === 'Return') return sum + identifierUsageCount(stmt.value, renamed);
      if (stmt.type === 'Let') return sum + identifierUsageCount(stmt.value, renamed);
      return sum;
    }, 0);
    if (uses > 1) return null;
  }

  for (const stmt of renamedBody.body) {
    if (stmt.type === 'Let') {
      if (stmt.mutable) return null;
      env.set(stmt.name, substituteInExpr(stmt.value, env));
      continue;
    }
    if (stmt.type === 'Return') {
      return substituteInExpr(stmt.value, env);
    }
    return null;
  }

  return null;
}

function getEdge(graph: CallGraph, caller: string, callee: string): CallEdge | null {
  return graph.edges.get(caller)?.get(callee) ?? null;
}

function functionDepth(name: string, graph: CallGraph, memo: Map<string, number>, visiting: Set<string>): number {
  const cached = memo.get(name);
  if (cached !== undefined) return cached;
  if (visiting.has(name)) return 0;
  visiting.add(name);
  let depth = 0;
  const outgoing = graph.edges.get(name);
  if (outgoing) {
    for (const edge of outgoing.values()) {
      if (edge.isThreadBoundary) continue;
      if (!graph.functionSizes.has(edge.callee)) continue;
      depth = Math.max(depth, functionDepth(edge.callee, graph, memo, visiting) + 1);
    }
  }
  visiting.delete(name);
  memo.set(name, depth);
  return depth;
}

function shouldInlineCall(
  callNode: LuminaCall,
  callerName: string,
  fnState: InlineFnState,
  fnMap: Map<string, LuminaFnDecl>,
  graph: CallGraph,
  sccGraph: SCCGraph,
  options: ResolvedOptions
): InlineDecision {
  const calleeName = resolveCallName(callNode);
  const edge = getEdge(graph, callerName, calleeName);
  const calleeFn = fnMap.get(calleeName);
  const callSiteCount = edge?.callSiteCount ?? graph.callCounts.get(calleeName) ?? 0;
  const nodeCount = graph.functionSizes.get(calleeName) ?? (calleeFn ? countASTNodes(calleeFn.body) : 0);

  if (edge?.isThreadBoundary || isHardThreadBoundary(calleeName)) {
    return { callee: calleeName, eligible: false, reason: 'thread-hard-boundary', callSiteCount, nodeCount };
  }
  if (edge?.isSoftBoundary || isSoftThreadBoundary(calleeName)) {
    return { callee: calleeName, eligible: false, reason: 'thread-soft-boundary', callSiteCount, nodeCount };
  }
  if (callNode.receiver || callNode.enumName) {
    return { callee: calleeName, eligible: false, reason: 'non-direct-call', callSiteCount, nodeCount };
  }
  if (!calleeFn) {
    return { callee: calleeName, eligible: false, reason: 'unknown-callee', callSiteCount, nodeCount };
  }
  if (hasInvalidMangledName(calleeName)) {
    return { callee: calleeName, eligible: false, reason: 'sentinel-or-unresolved', callSiteCount, nodeCount };
  }
  if (fnState.callerNodeCount >= options.maxCallerNodes) {
    return { callee: calleeName, eligible: false, reason: 'caller-node-cap', callSiteCount, nodeCount };
  }

  const callerScc = sccGraph.nodeToSCC.get(callerName);
  const calleeScc = sccGraph.nodeToSCC.get(calleeName);
  if (callerScc !== undefined && calleeScc !== undefined && callerScc === calleeScc) {
    return { callee: calleeName, eligible: false, reason: 'recursive-scc', callSiteCount, nodeCount };
  }
  if (calleeScc !== undefined && sccGraph.recursiveComponents.has(calleeScc)) {
    return { callee: calleeName, eligible: false, reason: 'recursive-callee', callSiteCount, nodeCount };
  }

  const threshold = callSiteCount >= options.hotCallCount ? options.hotThreshold : options.threshold;
  if (nodeCount > threshold) {
    return { callee: calleeName, eligible: false, reason: 'callee-too-large', callSiteCount, nodeCount };
  }

  const projectedNodes = fnState.callerNodeCount + Math.max(0, nodeCount - 1);
  if (projectedNodes > options.maxCallerNodes) {
    return { callee: calleeName, eligible: false, reason: 'caller-node-cap', callSiteCount, nodeCount };
  }

  return { callee: calleeName, eligible: true, reason: 'inline', callSiteCount, nodeCount };
}

function rewriteExprForInlining(
  expr: LuminaExpr,
  fnState: InlineFnState,
  fnMap: Map<string, LuminaFnDecl>,
  graph: CallGraph,
  sccGraph: SCCGraph,
  options: ResolvedOptions,
  decisions: InlineDecision[],
  counter: { n: number }
): { expr: LuminaExpr; inlined: number; skipped: number } {
  const recurse = (inner: LuminaExpr): { expr: LuminaExpr; inlined: number; skipped: number } =>
    rewriteExprForInlining(inner, fnState, fnMap, graph, sccGraph, options, decisions, counter);

  const rebuild = (
    updated: LuminaExpr,
    inlined: number,
    skipped: number
  ): { expr: LuminaExpr; inlined: number; skipped: number } => ({ expr: updated, inlined, skipped });

  switch (expr.type) {
    case 'Binary': {
      const left = recurse(expr.left);
      const right = recurse(expr.right);
      return rebuild({ ...expr, left: left.expr, right: right.expr }, left.inlined + right.inlined, left.skipped + right.skipped);
    }
    case 'Call': {
      let inlined = 0;
      let skipped = 0;
      const rewrittenReceiver = expr.receiver ? recurse(expr.receiver) : null;
      if (rewrittenReceiver) {
        inlined += rewrittenReceiver.inlined;
        skipped += rewrittenReceiver.skipped;
      }
      const rewrittenArgs = (expr.args ?? []).map((arg) => recurse(arg));
      for (const item of rewrittenArgs) {
        inlined += item.inlined;
        skipped += item.skipped;
      }
      const nextCall: LuminaCall = {
        ...expr,
        receiver: rewrittenReceiver ? rewrittenReceiver.expr : expr.receiver,
        args: rewrittenArgs.map((item) => item.expr),
      };

      const decision = shouldInlineCall(nextCall, fnState.callerName, fnState, fnMap, graph, sccGraph, options);
      decisions.push(decision);
      if (!decision.eligible) return rebuild(nextCall, inlined, skipped + 1);

      const callee = fnMap.get(decision.callee);
      if (!callee) return rebuild(nextCall, inlined, skipped + 1);
      const inlinedExpr = tryInlineCalleeExpression(callee, nextCall, counter);
      if (!inlinedExpr) {
        decisions[decisions.length - 1] = { ...decision, eligible: false, reason: 'unsupported-callee-shape' };
        return rebuild(nextCall, inlined, skipped + 1);
      }
      fnState.callerNodeCount += Math.max(0, decision.nodeCount - 1);
      const nested = recurse(inlinedExpr);
      return rebuild(nested.expr, inlined + nested.inlined + 1, skipped + nested.skipped);
    }
    case 'Member': {
      const object = recurse(expr.object);
      return rebuild({ ...expr, object: object.expr }, object.inlined, object.skipped);
    }
    case 'Index': {
      const object = recurse(expr.object);
      const index = recurse(expr.index);
      return rebuild({ ...expr, object: object.expr, index: index.expr }, object.inlined + index.inlined, object.skipped + index.skipped);
    }
    case 'Range': {
      const start = expr.start ? recurse(expr.start) : null;
      const end = expr.end ? recurse(expr.end) : null;
      return rebuild(
        { ...expr, start: start?.expr ?? expr.start, end: end?.expr ?? expr.end },
        (start?.inlined ?? 0) + (end?.inlined ?? 0),
        (start?.skipped ?? 0) + (end?.skipped ?? 0)
      );
    }
    case 'ArrayLiteral':
    case 'TupleLiteral': {
      const items = expr.elements.map((item) => recurse(item));
      const inlinedTotal = items.reduce((sum, item) => sum + item.inlined, 0);
      const skippedTotal = items.reduce((sum, item) => sum + item.skipped, 0);
      return rebuild({ ...expr, elements: items.map((item) => item.expr) }, inlinedTotal, skippedTotal);
    }
    case 'ArrayRepeatLiteral': {
      const value = recurse(expr.value);
      const count = recurse(expr.count);
      return rebuild({ ...expr, value: value.expr, count: count.expr }, value.inlined + count.inlined, value.skipped + count.skipped);
    }
    case 'StructLiteral': {
      let inlinedTotal = 0;
      let skippedTotal = 0;
      const fields = expr.fields.map((field) => {
        const value = recurse(field.value);
        inlinedTotal += value.inlined;
        skippedTotal += value.skipped;
        return { ...field, value: value.expr };
      });
      return rebuild({ ...expr, fields }, inlinedTotal, skippedTotal);
    }
    case 'MatchExpr': {
      const value = recurse(expr.value);
      let inlinedTotal = value.inlined;
      let skippedTotal = value.skipped;
      const arms = expr.arms.map((arm) => {
        const guard = arm.guard ? recurse(arm.guard) : null;
        const body = recurse(arm.body);
        inlinedTotal += body.inlined + (guard?.inlined ?? 0);
        skippedTotal += body.skipped + (guard?.skipped ?? 0);
        return { ...arm, guard: guard?.expr ?? arm.guard, body: body.expr };
      });
      return rebuild({ ...expr, value: value.expr, arms }, inlinedTotal, skippedTotal);
    }
    case 'SelectExpr': {
      let inlinedTotal = 0;
      let skippedTotal = 0;
      const arms = expr.arms.map((arm) => {
        const value = recurse(arm.value);
        const body = recurse(arm.body);
        inlinedTotal += value.inlined + body.inlined;
        skippedTotal += value.skipped + body.skipped;
        return { ...arm, value: value.expr, body: body.expr };
      });
      return rebuild({ ...expr, arms }, inlinedTotal, skippedTotal);
    }
    case 'InterpolatedString': {
      let inlinedTotal = 0;
      let skippedTotal = 0;
      const parts = expr.parts.map((part) => {
        if (typeof part === 'string') return part;
        const transformed = recurse(part);
        inlinedTotal += transformed.inlined;
        skippedTotal += transformed.skipped;
        return transformed.expr;
      });
      return rebuild({ ...expr, parts }, inlinedTotal, skippedTotal);
    }
    case 'Lambda': {
      const body = rewriteBlockForInlining(expr.body, fnState, fnMap, graph, sccGraph, options, decisions, counter);
      return rebuild({ ...expr, body: body.block }, body.inlined, body.skipped);
    }
    case 'Try':
    case 'Await': {
      const value = recurse(expr.value);
      return rebuild({ ...expr, value: value.expr }, value.inlined, value.skipped);
    }
    case 'Move': {
      if (expr.target.type === 'Identifier') return rebuild(expr, 0, 0);
      const targetObject = recurse(expr.target.object);
      return rebuild(
        { ...expr, target: { ...expr.target, object: targetObject.expr } },
        targetObject.inlined,
        targetObject.skipped
      );
    }
    case 'Cast': {
      const inner = recurse(expr.expr);
      return rebuild({ ...expr, expr: inner.expr }, inner.inlined, inner.skipped);
    }
    case 'IsExpr': {
      const value = recurse(expr.value);
      return rebuild({ ...expr, value: value.expr }, value.inlined, value.skipped);
    }
    default:
      return rebuild(expr, 0, 0);
  }
}

function rewriteStmtForInlining(
  stmt: LuminaStatement,
  fnState: InlineFnState,
  fnMap: Map<string, LuminaFnDecl>,
  graph: CallGraph,
  sccGraph: SCCGraph,
  options: ResolvedOptions,
  decisions: InlineDecision[],
  counter: { n: number }
): { stmt: LuminaStatement; inlined: number; skipped: number } {
  const rewriteExpr = (value: LuminaExpr) =>
    rewriteExprForInlining(value, fnState, fnMap, graph, sccGraph, options, decisions, counter);
  const rewriteBlock = (block: LuminaBlock) =>
    rewriteBlockForInlining(block, fnState, fnMap, graph, sccGraph, options, decisions, counter);

  switch (stmt.type) {
    case 'Let': {
      const value = rewriteExpr(stmt.value);
      return { stmt: { ...stmt, value: value.expr }, inlined: value.inlined, skipped: value.skipped };
    }
    case 'LetTuple': {
      const value = rewriteExpr(stmt.value);
      return { stmt: { ...stmt, value: value.expr }, inlined: value.inlined, skipped: value.skipped };
    }
    case 'LetElse': {
      const value = rewriteExpr(stmt.value);
      const elseBlock = rewriteBlock(stmt.elseBlock);
      return {
        stmt: { ...stmt, value: value.expr, elseBlock: elseBlock.block },
        inlined: value.inlined + elseBlock.inlined,
        skipped: value.skipped + elseBlock.skipped,
      };
    }
    case 'Assign': {
      const value = rewriteExpr(stmt.value);
      const targetObject =
        stmt.target.type === 'Identifier'
          ? null
          : rewriteExpr(stmt.target.object);
      return {
        stmt: {
          ...stmt,
          target:
            stmt.target.type === 'Identifier'
              ? stmt.target
              : { ...stmt.target, object: targetObject?.expr ?? stmt.target.object },
          value: value.expr,
        },
        inlined: value.inlined + (targetObject?.inlined ?? 0),
        skipped: value.skipped + (targetObject?.skipped ?? 0),
      };
    }
    case 'Return': {
      const value = rewriteExpr(stmt.value);
      return { stmt: { ...stmt, value: value.expr }, inlined: value.inlined, skipped: value.skipped };
    }
    case 'ExprStmt': {
      const expr = rewriteExpr(stmt.expr);
      return { stmt: { ...stmt, expr: expr.expr }, inlined: expr.inlined, skipped: expr.skipped };
    }
    case 'If': {
      const cond = rewriteExpr(stmt.condition);
      const thenBlock = rewriteBlock(stmt.thenBlock);
      const elseBlock = stmt.elseBlock ? rewriteBlock(stmt.elseBlock) : null;
      return {
        stmt: { ...stmt, condition: cond.expr, thenBlock: thenBlock.block, elseBlock: elseBlock?.block ?? stmt.elseBlock },
        inlined: cond.inlined + thenBlock.inlined + (elseBlock?.inlined ?? 0),
        skipped: cond.skipped + thenBlock.skipped + (elseBlock?.skipped ?? 0),
      };
    }
    case 'IfLet': {
      const value = rewriteExpr(stmt.value);
      const thenBlock = rewriteBlock(stmt.thenBlock);
      const elseBlock = stmt.elseBlock ? rewriteBlock(stmt.elseBlock) : null;
      return {
        stmt: { ...stmt, value: value.expr, thenBlock: thenBlock.block, elseBlock: elseBlock?.block ?? stmt.elseBlock },
        inlined: value.inlined + thenBlock.inlined + (elseBlock?.inlined ?? 0),
        skipped: value.skipped + thenBlock.skipped + (elseBlock?.skipped ?? 0),
      };
    }
    case 'While': {
      const condition = rewriteExpr(stmt.condition);
      const body = rewriteBlock(stmt.body);
      return {
        stmt: { ...stmt, condition: condition.expr, body: body.block },
        inlined: condition.inlined + body.inlined,
        skipped: condition.skipped + body.skipped,
      };
    }
    case 'WhileLet': {
      const value = rewriteExpr(stmt.value);
      const body = rewriteBlock(stmt.body);
      return {
        stmt: { ...stmt, value: value.expr, body: body.block },
        inlined: value.inlined + body.inlined,
        skipped: value.skipped + body.skipped,
      };
    }
    case 'For': {
      const iterable = rewriteExpr(stmt.iterable);
      const body = rewriteBlock(stmt.body);
      return {
        stmt: { ...stmt, iterable: iterable.expr, body: body.block },
        inlined: iterable.inlined + body.inlined,
        skipped: iterable.skipped + body.skipped,
      };
    }
    case 'MatchStmt': {
      const value = rewriteExpr(stmt.value);
      let inlined = value.inlined;
      let skipped = value.skipped;
      const arms = stmt.arms.map((arm) => {
        const guard = arm.guard ? rewriteExpr(arm.guard) : null;
        const body = rewriteBlock(arm.body);
        inlined += (guard?.inlined ?? 0) + body.inlined;
        skipped += (guard?.skipped ?? 0) + body.skipped;
        return { ...arm, guard: guard?.expr ?? arm.guard, body: body.block };
      });
      return { stmt: { ...stmt, value: value.expr, arms }, inlined, skipped };
    }
    case 'Block': {
      const body = rewriteBlock(stmt);
      return { stmt: body.block, inlined: body.inlined, skipped: body.skipped };
    }
    default:
      return { stmt, inlined: 0, skipped: 0 };
  }
}

function rewriteBlockForInlining(
  block: LuminaBlock,
  fnState: InlineFnState,
  fnMap: Map<string, LuminaFnDecl>,
  graph: CallGraph,
  sccGraph: SCCGraph,
  options: ResolvedOptions,
  decisions: InlineDecision[],
  counter: { n: number }
): { block: LuminaBlock; inlined: number; skipped: number } {
  let inlined = 0;
  let skipped = 0;
  const body = block.body.map((stmt) => {
    const next = rewriteStmtForInlining(stmt, fnState, fnMap, graph, sccGraph, options, decisions, counter);
    inlined += next.inlined;
    skipped += next.skipped;
    return next.stmt;
  });
  return { block: { ...block, body }, inlined, skipped };
}

export function inlinePass(ast: LuminaProgram, options: InlineOptions = {}): InlineResult {
  const resolved = defaultOptions(options);
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  const graph = buildCallGraph(cloned);
  const sccGraph = computeSCCs(graph);
  const fnMap = new Map<string, LuminaFnDecl>();
  for (const stmt of cloned.body) {
    if (stmt.type === 'FnDecl') fnMap.set(stmt.name, stmt);
  }

  const depthMemo = new Map<string, number>();
  const ordered = Array.from(fnMap.keys()).sort((left, right) => {
    const leftDepth = functionDepth(left, graph, depthMemo, new Set());
    const rightDepth = functionDepth(right, graph, depthMemo, new Set());
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    const leftSize = graph.functionSizes.get(left) ?? 0;
    const rightSize = graph.functionSizes.get(right) ?? 0;
    if (leftSize !== rightSize) return leftSize - rightSize;
    return left.localeCompare(right);
  });

  const decisions: InlineDecision[] = [];
  let inlinedCount = 0;
  let skippedCount = 0;
  const counter = { n: 0 };

  for (const fnName of ordered) {
    const fn = fnMap.get(fnName);
    if (!fn) continue;
    const fnState: InlineFnState = {
      callerName: fnName,
      callerNodeCount: graph.functionSizes.get(fnName) ?? countASTNodes(fn.body),
    };
    const rewritten = rewriteBlockForInlining(fn.body, fnState, fnMap, graph, sccGraph, resolved, decisions, counter);
    fnMap.set(fnName, { ...fn, body: rewritten.block });
    inlinedCount += rewritten.inlined;
    skippedCount += rewritten.skipped;
  }

  const body = cloned.body.map((stmt) => {
    if (stmt.type !== 'FnDecl') return stmt;
    return fnMap.get(stmt.name) ?? stmt;
  });

  return {
    ast: { ...cloned, body },
    decisions,
    inlinedCount,
    skippedCount,
  };
}

export { INLINE_THRESHOLD_AST_NODES, INLINE_THRESHOLD_HOT_NODES, INLINE_HOT_CALL_COUNT, INLINE_MAX_CALLER_NODES };
