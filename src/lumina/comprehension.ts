import type {
  LuminaBlock,
  LuminaCall,
  LuminaExpr,
  LuminaFnDecl,
  LuminaIdentifier,
  LuminaImplDecl,
  LuminaLambda,
  LuminaProgram,
  LuminaStatement,
  LuminaTraitDecl,
} from './ast.js';
import type { Location } from '../utils/index.js';

type NodeWithId = { id?: number };

const maxIdInNode = (node: unknown): number => {
  let max = 0;
  const visit = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown> & NodeWithId;
    if (typeof obj.id === 'number' && Number.isFinite(obj.id)) {
      max = Math.max(max, Math.trunc(obj.id));
    }
    for (const child of Object.values(obj)) {
      visit(child);
    }
  };
  visit(node);
  return max;
};

const makeIdAllocator = (program: LuminaProgram): (() => number) => {
  let next = maxIdInNode(program) + 1;
  return () => next++;
};

const ensureId = <T extends object>(node: T, alloc: () => number): T & NodeWithId => {
  const obj = node as T & NodeWithId;
  if (typeof obj.id !== 'number') obj.id = alloc();
  return obj;
};

const collectIdentifierNames = (expr: LuminaExpr, out: Set<string>) => {
  switch (expr.type) {
    case 'Identifier':
      out.add(expr.name);
      return;
    case 'Binary':
      collectIdentifierNames(expr.left, out);
      collectIdentifierNames(expr.right, out);
      return;
    case 'Call':
      if (expr.receiver) collectIdentifierNames(expr.receiver, out);
      for (const arg of expr.args ?? []) collectIdentifierNames(arg.value, out);
      return;
    case 'Member':
      collectIdentifierNames(expr.object, out);
      return;
    case 'Index':
      collectIdentifierNames(expr.object, out);
      collectIdentifierNames(expr.index, out);
      return;
    case 'Range':
      if (expr.start) collectIdentifierNames(expr.start, out);
      if (expr.end) collectIdentifierNames(expr.end, out);
      return;
    case 'ArrayLiteral':
    case 'TupleLiteral':
      for (const element of expr.elements) collectIdentifierNames(element, out);
      return;
    case 'ArrayRepeatLiteral':
      collectIdentifierNames(expr.value, out);
      collectIdentifierNames(expr.count, out);
      return;
    case 'StructLiteral':
      for (const field of expr.fields) collectIdentifierNames(field.value, out);
      return;
    case 'MatchExpr':
      collectIdentifierNames(expr.value, out);
      for (const arm of expr.arms) {
        if (arm.guard) collectIdentifierNames(arm.guard, out);
        collectIdentifierNames(arm.body, out);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms ?? []) {
        if (arm?.value) collectIdentifierNames(arm.value, out);
        if (arm?.body) collectIdentifierNames(arm.body, out);
      }
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        collectIdentifierNames(part, out);
      }
      return;
    case 'Lambda':
      for (const stmt of expr.body.body ?? []) {
        collectIdentifierNamesInStmt(stmt, out);
      }
      return;
    case 'Try':
    case 'Await':
      collectIdentifierNames(expr.value, out);
      return;
    case 'Move':
      collectIdentifierNames(expr.target as unknown as LuminaExpr, out);
      return;
    case 'Cast':
      collectIdentifierNames(expr.expr, out);
      return;
    case 'IsExpr':
      collectIdentifierNames(expr.value, out);
      return;
    case 'MacroInvoke':
      for (const arg of expr.args) collectIdentifierNames(arg, out);
      return;
    case 'ListComprehension': {
      const comp = expr as unknown as {
        body: LuminaExpr;
        source: LuminaExpr;
        source2?: LuminaExpr;
        filter: LuminaExpr | null;
      };
      collectIdentifierNames(comp.source, out);
      if (comp.source2) collectIdentifierNames(comp.source2, out);
      if (comp.filter) collectIdentifierNames(comp.filter, out);
      collectIdentifierNames(comp.body, out);
      return;
    }
    default:
      return;
  }
};

const collectIdentifierNamesInStmt = (stmt: LuminaStatement, out: Set<string>) => {
  switch (stmt.type) {
    case 'Let':
      collectIdentifierNames(stmt.value, out);
      return;
    case 'LetTuple':
      collectIdentifierNames(stmt.value, out);
      return;
    case 'LetElse':
      collectIdentifierNames(stmt.value, out);
      for (const inner of stmt.elseBlock.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'Assign':
      collectIdentifierNames(stmt.target as unknown as LuminaExpr, out);
      collectIdentifierNames(stmt.value, out);
      return;
    case 'Return':
      collectIdentifierNames(stmt.value, out);
      return;
    case 'ExprStmt':
      collectIdentifierNames(stmt.expr, out);
      return;
    case 'If':
      collectIdentifierNames(stmt.condition, out);
      for (const inner of stmt.thenBlock.body ?? []) collectIdentifierNamesInStmt(inner, out);
      if (stmt.elseBlock) for (const inner of stmt.elseBlock.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'IfLet':
      collectIdentifierNames(stmt.value, out);
      for (const inner of stmt.thenBlock.body ?? []) collectIdentifierNamesInStmt(inner, out);
      if (stmt.elseBlock) for (const inner of stmt.elseBlock.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'While':
      collectIdentifierNames(stmt.condition, out);
      for (const inner of stmt.body.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'WhileLet':
      collectIdentifierNames(stmt.value, out);
      for (const inner of stmt.body.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'For':
      collectIdentifierNames(stmt.iterable, out);
      for (const inner of stmt.body.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    case 'MatchStmt':
      collectIdentifierNames(stmt.value, out);
      for (const arm of stmt.arms) {
        if (arm.guard) collectIdentifierNames(arm.guard, out);
        for (const inner of arm.body.body ?? []) collectIdentifierNamesInStmt(inner, out);
      }
      return;
    case 'Block':
      for (const inner of stmt.body ?? []) collectIdentifierNamesInStmt(inner, out);
      return;
    default:
      return;
  }
};

const uniqueName = (base: string, used: Set<string>): string => {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
};

export function desugarListComprehensions(program: LuminaProgram): LuminaProgram {
  const allocId = makeIdAllocator(program);

  const mkIdent = (name: string, location?: Location): LuminaIdentifier =>
    ensureId({ type: 'Identifier', name, location } satisfies LuminaIdentifier, allocId);

  const mkCall = (enumName: string, callee: string, args: LuminaExpr[], location?: Location): LuminaCall =>
    ensureId(
      {
        type: 'Call',
        callee: mkIdent(callee, location),
        args: args.map((arg) => ({ named: false, value: arg, location: arg.location })),
        typeArgs: [],
        enumName,
        receiver: null,
        location,
      } satisfies LuminaCall,
      allocId
    );

  const mkBlock = (body: LuminaStatement[], location?: Location): LuminaBlock =>
    ensureId({ type: 'Block', body, location } satisfies LuminaBlock, allocId);

  const mkLambda = (params: string[], body: LuminaStatement[], location?: Location): LuminaLambda =>
    ensureId(
      {
        type: 'Lambda',
        async: false,
        params: params.map((name) => ({ name, typeName: null, location })),
        returnType: null,
        body: mkBlock(body, location),
        typeParams: [],
        location,
      } satisfies LuminaLambda,
      allocId
    );

  const transformExpr = (expr: LuminaExpr): LuminaExpr => {
    if (expr.type === 'ListComprehension') {
      const comp = expr as unknown as {
        type: 'ListComprehension';
        body: LuminaExpr;
        binding: string;
        source: LuminaExpr;
        binding2?: string;
        source2?: LuminaExpr;
        filter: LuminaExpr | null;
        location?: Location;
      };

      const loc = comp.location ?? expr.location;
      const used = new Set<string>();
      collectIdentifierNames(comp.source, used);
      if (comp.source2) collectIdentifierNames(comp.source2, used);
      if (comp.filter) collectIdentifierNames(comp.filter, used);
      collectIdentifierNames(comp.body, used);
      used.add(comp.binding);
      if (comp.binding2) used.add(comp.binding2);

      const accName = uniqueName('__lumina_comp_acc', used);
      used.add(accName);
      const innerAccName = uniqueName('__lumina_comp_acc_inner', used);

      const accId = mkIdent(accName, loc);
      const init = mkCall('vec', 'new', [], loc);

      const pushBody = (accVar: LuminaIdentifier, value: LuminaExpr): LuminaStatement => ({
        type: 'ExprStmt',
        expr: mkCall('vec', 'push', [accVar, value], loc),
        location: loc,
      });

      const mkReturn = (value: LuminaExpr): LuminaStatement => ({ type: 'Return', value, location: loc });

      const transformedSource = transformExpr(comp.source);

      if (comp.source2 && comp.binding2) {
        const transformedSource2 = transformExpr(comp.source2);
        const transformedBody = transformExpr(comp.body);
        const transformedFilter = comp.filter ? transformExpr(comp.filter) : null;

        const innerAccId = mkIdent(innerAccName, loc);
        const innerBodyStmts: LuminaStatement[] = [];
        if (transformedFilter) {
          innerBodyStmts.push({
            type: 'If',
            condition: transformedFilter,
            thenBlock: mkBlock([pushBody(innerAccId, transformedBody)], loc),
            elseBlock: null,
            location: loc,
          });
        } else {
          innerBodyStmts.push(pushBody(innerAccId, transformedBody));
        }
        innerBodyStmts.push(mkReturn(innerAccId));
        const innerLambda = mkLambda([innerAccName, comp.binding2], innerBodyStmts, loc);

        const outerLambda = mkLambda(
          [accName, comp.binding],
          [mkReturn(mkCall('vec', 'fold', [transformedSource2, accId, innerLambda], loc))],
          loc
        );

        return mkCall('vec', 'fold', [transformedSource, init, outerLambda], loc);
      }

      const transformedBody = transformExpr(comp.body);
      const transformedFilter = comp.filter ? transformExpr(comp.filter) : null;

      const bodyStmts: LuminaStatement[] = [];
      if (transformedFilter) {
        bodyStmts.push({
          type: 'If',
          condition: transformedFilter,
          thenBlock: mkBlock([pushBody(accId, transformedBody)], loc),
          elseBlock: null,
          location: loc,
        });
      } else {
        bodyStmts.push(pushBody(accId, transformedBody));
      }
      bodyStmts.push(mkReturn(accId));
      const folder = mkLambda([accName, comp.binding], bodyStmts, loc);
      return mkCall('vec', 'fold', [transformedSource, init, folder], loc);
    }

    switch (expr.type) {
      case 'Binary':
        return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) };
      case 'Call':
        return {
          ...expr,
          receiver: expr.receiver ? transformExpr(expr.receiver) : expr.receiver,
          args: (expr.args ?? []).map((arg) => ({
            ...arg,
            value: transformExpr(arg.value),
          })),
        };
      case 'Member':
        return { ...expr, object: transformExpr(expr.object) };
      case 'Index':
        return { ...expr, object: transformExpr(expr.object), index: transformExpr(expr.index) };
      case 'Range':
        return {
          ...expr,
          start: expr.start ? transformExpr(expr.start) : expr.start,
          end: expr.end ? transformExpr(expr.end) : expr.end,
        };
      case 'ArrayLiteral':
      case 'TupleLiteral':
        return { ...expr, elements: expr.elements.map((element) => transformExpr(element)) };
      case 'ArrayRepeatLiteral':
        return { ...expr, value: transformExpr(expr.value), count: transformExpr(expr.count) };
      case 'StructLiteral':
        return { ...expr, fields: expr.fields.map((field) => ({ ...field, value: transformExpr(field.value) })) };
      case 'MatchExpr':
        return {
          ...expr,
          value: transformExpr(expr.value),
          arms: expr.arms.map((arm) => ({
            ...arm,
            guard: arm.guard ? transformExpr(arm.guard) : arm.guard,
            body: transformExpr(arm.body),
          })),
        };
      case 'SelectExpr':
        return {
          ...expr,
          arms: expr.arms.map((arm) => ({
            ...arm,
            value: transformExpr(arm.value),
            body: transformExpr(arm.body),
          })),
        };
      case 'InterpolatedString':
        return {
          ...expr,
          parts: expr.parts.map((part) => (typeof part === 'string' ? part : transformExpr(part))),
        };
      case 'Lambda':
        return { ...expr, body: transformBlock(expr.body) };
      case 'Try':
      case 'Await':
        return { ...expr, value: transformExpr(expr.value) };
      case 'Move':
        return {
          ...expr,
          target:
            expr.target.type === 'Identifier'
              ? expr.target
              : {
                  ...expr.target,
                  object: transformExpr(expr.target.object),
                },
        };
      case 'Cast':
        return { ...expr, expr: transformExpr(expr.expr) };
      case 'IsExpr':
        return { ...expr, value: transformExpr(expr.value) };
      case 'MacroInvoke':
        return { ...expr, args: expr.args.map((arg) => transformExpr(arg)) };
      default:
        return expr;
    }
  };

  const transformStmt = (stmt: LuminaStatement): LuminaStatement => {
    switch (stmt.type) {
      case 'Let':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'LetTuple':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'LetElse':
        return { ...stmt, value: transformExpr(stmt.value), elseBlock: transformBlock(stmt.elseBlock) };
      case 'Assign':
        return {
          ...stmt,
          target:
            stmt.target.type === 'Identifier'
              ? stmt.target
              : {
                  ...stmt.target,
                  object: transformExpr(stmt.target.object),
                },
          value: transformExpr(stmt.value),
        };
      case 'Return':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'ExprStmt':
        return { ...stmt, expr: transformExpr(stmt.expr) };
      case 'If':
        return {
          ...stmt,
          condition: transformExpr(stmt.condition),
          thenBlock: transformBlock(stmt.thenBlock),
          elseBlock: stmt.elseBlock ? transformBlock(stmt.elseBlock) : stmt.elseBlock,
        };
      case 'IfLet':
        return {
          ...stmt,
          value: transformExpr(stmt.value),
          thenBlock: transformBlock(stmt.thenBlock),
          elseBlock: stmt.elseBlock ? transformBlock(stmt.elseBlock) : stmt.elseBlock,
        };
      case 'While':
        return { ...stmt, condition: transformExpr(stmt.condition), body: transformBlock(stmt.body) };
      case 'WhileLet':
        return { ...stmt, value: transformExpr(stmt.value), body: transformBlock(stmt.body) };
      case 'For':
        return { ...stmt, iterable: transformExpr(stmt.iterable), body: transformBlock(stmt.body) };
      case 'MatchStmt':
        return {
          ...stmt,
          value: transformExpr(stmt.value),
          arms: stmt.arms.map((arm) => ({
            ...arm,
            guard: arm.guard ? transformExpr(arm.guard) : arm.guard,
            body: transformBlock(arm.body),
          })),
        };
      case 'Block':
        return transformBlock(stmt);
      default:
        return stmt;
    }
  };

  const transformBlock = (block: LuminaBlock): LuminaBlock => ({
    ...block,
    body: block.body.map((stmt) => transformStmt(stmt)),
  });

  const transformFnBody = (fn: LuminaFnDecl): LuminaFnDecl => ({ ...fn, body: transformBlock(fn.body) });

  const transformTrait = (trait: LuminaTraitDecl): LuminaTraitDecl => ({
    ...trait,
    methods: (trait.methods ?? []).map((method) =>
      method.body ? { ...method, body: transformBlock(method.body) } : method
    ),
  });

  const transformImpl = (impl: LuminaImplDecl): LuminaImplDecl => ({
    ...impl,
    methods: (impl.methods ?? []).map((method) => transformFnBody(method as LuminaFnDecl)),
  });

  const nextBody = program.body.map((stmt) => {
    if (stmt.type === 'FnDecl') return transformFnBody(stmt);
    if (stmt.type === 'TraitDecl') return transformTrait(stmt);
    if (stmt.type === 'ImplDecl') return transformImpl(stmt);
    return stmt;
  });

  return { ...program, body: nextBody };
}
