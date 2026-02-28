import { type LuminaProgram, type LuminaStatement, type LuminaExpr } from './ast.js';
import { type IRNode, type IRProgram, type IRFunction, type IRLet, type IRReturn, type IRExprStmt, type IRBinary, type IRNumber, type IRString, type IRIdentifier, type IRNoop, type IRCall, type IRIf, type IRBoolean, type IRWhile, type IRAssign, type IRMember, type IRIndex, type IREnumConstruct, type IRMatchExpr, type IRStructLiteral } from './ir.js';

export function lowerLumina(program: LuminaProgram): IRProgram {
  const ctx = createLowerContext(program);
  return {
    kind: 'Program',
    body: program.body.map((stmt) => lowerStatement(stmt, ctx)),
    location: program.location,
  };
}

type EnumVariantInfo = { enumName: string; name: string; hasPayload: boolean };

type LowerContext = {
  variantsByName: Map<string, EnumVariantInfo>;
  variantsByQualified: Map<string, EnumVariantInfo>;
  matchCounter: number;
};

function createLowerContext(program: LuminaProgram): LowerContext {
  const variantsByName = new Map<string, EnumVariantInfo>();
  const variantsByQualified = new Map<string, EnumVariantInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'EnumDecl') continue;
    for (const variant of stmt.variants) {
      const info: EnumVariantInfo = {
        enumName: stmt.name,
        name: variant.name,
        hasPayload: (variant.params ?? []).length > 0,
      };
      variantsByName.set(variant.name, info);
      variantsByQualified.set(`${stmt.name}.${variant.name}`, info);
    }
  }
  return { variantsByName, variantsByQualified, matchCounter: 0 };
}

function lowerStatement(stmt: LuminaStatement, ctx: LowerContext): IRNode {
  switch (stmt.type) {
    case 'FnDecl': {
      const fn: IRFunction = {
        kind: 'Function',
        name: stmt.name,
        params: stmt.params.map(p => p.name),
        body: stmt.body.body.map((s) => lowerStatement(s, ctx)),
        location: stmt.location,
      };
      return fn;
    }
    case 'Let': {
      const letNode: IRLet = {
        kind: 'Let',
        name: stmt.name,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };
      return letNode;
    }
    case 'LetTuple': {
      const tempName = `__tuple${ctx.matchCounter++}`;
      const tempLet: IRLet = {
        kind: 'Let',
        name: tempName,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };
      const body: IRNode[] = [tempLet];
      stmt.names.forEach((name, idx) => {
        const value: IRNode =
          idx === 0
            ? ({
                kind: 'Member',
                object: { kind: 'Identifier', name: tempName },
                property: 'sender',
              } as IRMember)
            : idx === 1
              ? ({
                  kind: 'Member',
                  object: { kind: 'Identifier', name: tempName },
                  property: 'receiver',
                } as IRMember)
              : ({
                  kind: 'Index',
                  target: { kind: 'Identifier', name: tempName },
                  index: idx,
                } as IRIndex);
        body.push({
          kind: 'Let',
          name,
          value,
          location: stmt.location,
        } as IRLet);
      });
      return { kind: 'Program', body, location: stmt.location } as IRProgram;
    }
    case 'LetElse': {
      const matchStmt = {
        type: 'IfLet',
        pattern: stmt.pattern,
        value: stmt.value,
        thenBlock: { type: 'Block', body: [] },
        elseBlock: stmt.elseBlock,
        location: stmt.location,
      } as unknown as LuminaStatement;
      return lowerStatement(matchStmt, ctx);
    }
    case 'Return': {
      const ret: IRReturn = {
        kind: 'Return',
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };
      return ret;
    }
    case 'ExprStmt': {
      const expr: IRExprStmt = {
        kind: 'ExprStmt',
        expr: lowerExpr(stmt.expr, ctx),
        location: stmt.location,
      };
      return expr;
    }
    case 'If': {
      const ifNode: IRIf = {
        kind: 'If',
        condition: lowerExpr(stmt.condition, ctx),
        thenBody: stmt.thenBlock.body.map((s) => lowerStatement(s, ctx)),
        elseBody: stmt.elseBlock ? stmt.elseBlock.body.map((s) => lowerStatement(s, ctx)) : undefined,
        location: stmt.location,
      };
      return ifNode;
    }
    case 'IfLet': {
      const tempName = `__ifLet${ctx.matchCounter++}`;
      const tempLet: IRLet = {
        kind: 'Let',
        name: tempName,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };
      const condition: IRNode =
        stmt.pattern.type === 'EnumPattern'
          ? ({
              kind: 'Binary',
              op: '==',
              left: {
                kind: 'Member',
                object: { kind: 'Identifier', name: tempName } as IRIdentifier,
                property: '$tag',
              } as IRMember,
              right: { kind: 'String', value: stmt.pattern.variant } as IRString,
              location: stmt.location,
            } as IRBinary)
          : ({ kind: 'Boolean', value: true } as IRBoolean);
      const ifNode: IRIf = {
        kind: 'If',
        condition,
        thenBody: stmt.thenBlock.body.map((s) => lowerStatement(s, ctx)),
        elseBody: stmt.elseBlock ? stmt.elseBlock.body.map((s) => lowerStatement(s, ctx)) : undefined,
        location: stmt.location,
      };
      return { kind: 'Program', body: [tempLet, ifNode], location: stmt.location } as IRProgram;
    }
    case 'While': {
      const whileNode: IRWhile = {
        kind: 'While',
        condition: lowerExpr(stmt.condition, ctx),
        body: stmt.body.body.map((s) => lowerStatement(s, ctx)),
        location: stmt.location,
      };
      return whileNode;
    }
    case 'For': {
      if (stmt.iterable.type !== 'Range') {
        return { kind: 'Noop', location: stmt.location } as IRNoop;
      }
      const startExpr = stmt.iterable.start ? lowerExpr(stmt.iterable.start, ctx) : ({ kind: 'Number', value: 0 } as IRNumber);
      const endExpr = stmt.iterable.end ? lowerExpr(stmt.iterable.end, ctx) : ({ kind: 'Identifier', name: stmt.iterator } as IRIdentifier);
      const init: IRLet = {
        kind: 'Let',
        name: stmt.iterator,
        value: startExpr,
        location: stmt.location,
      };
      const cond: IRBinary = {
        kind: 'Binary',
        op: stmt.iterable.inclusive ? '<=' : '<',
        left: { kind: 'Identifier', name: stmt.iterator } as IRIdentifier,
        right: endExpr,
        location: stmt.location,
      };
      const body = stmt.body.body.map((s) => lowerStatement(s, ctx));
      body.push({
        kind: 'Assign',
        target: stmt.iterator,
        value: {
          kind: 'Binary',
          op: '+',
          left: { kind: 'Identifier', name: stmt.iterator } as IRIdentifier,
          right: { kind: 'Number', value: 1 } as IRNumber,
        } as IRBinary,
        location: stmt.location,
      } as IRAssign);
      const whileNode: IRWhile = {
        kind: 'While',
        condition: cond,
        body,
        location: stmt.location,
      };
      return { kind: 'Program', body: [init, whileNode], location: stmt.location } as IRProgram;
    }
    case 'WhileLet': {
      const pattern = stmt.pattern;
      if (pattern.type !== 'EnumPattern') {
        return {
          kind: 'While',
          condition: { kind: 'Boolean', value: true } as IRBoolean,
          body: stmt.body.body.map((s) => lowerStatement(s, ctx)),
          location: stmt.location,
        } as IRWhile;
      }
      const tempName = `__whileLet${ctx.matchCounter++}`;
      const init: IRLet = {
        kind: 'Let',
        name: tempName,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };
      const cond: IRBinary = {
        kind: 'Binary',
        op: '==',
        left: {
          kind: 'Member',
          object: { kind: 'Identifier', name: tempName } as IRIdentifier,
          property: '$tag',
        } as IRMember,
        right: { kind: 'String', value: pattern.variant } as IRString,
        location: stmt.location,
      };
      const body: IRNode[] = [];
      pattern.bindings.forEach((binding, idx) => {
        if (binding === '_') return;
        const value: IRNode =
          pattern.bindings.length === 1
            ? ({
                kind: 'Member',
                object: { kind: 'Identifier', name: tempName } as IRIdentifier,
                property: '$payload',
              } as IRMember)
            : ({
                kind: 'Index',
                target: {
                  kind: 'Member',
                  object: { kind: 'Identifier', name: tempName } as IRIdentifier,
                  property: '$payload',
                } as IRMember,
                index: idx,
              } as IRIndex);
        body.push({ kind: 'Let', name: binding, value, location: stmt.location } as IRLet);
      });
      stmt.body.body.map((s) => lowerStatement(s, ctx)).forEach((n) => body.push(n));
      body.push({
        kind: 'Assign',
        target: tempName,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      } as IRAssign);
      const whileNode: IRWhile = {
        kind: 'While',
        condition: cond,
        body,
        location: stmt.location,
      };
      return { kind: 'Program', body: [init, whileNode], location: stmt.location } as IRProgram;
    }
    case 'Assign': {
      if (stmt.target.type === 'Identifier') {
        const assign: IRAssign = {
          kind: 'Assign',
          target: stmt.target.name,
          value: lowerExpr(stmt.value, ctx),
          location: stmt.location,
        };
        return assign;
      }
      const expr: IRExprStmt = {
        kind: 'ExprStmt',
        expr: {
          kind: 'Call',
          callee: '__set',
          args: [
            lowerExpr(stmt.target.object, ctx),
            { kind: 'String', value: stmt.target.property, location: stmt.location } as IRString,
            lowerExpr(stmt.value, ctx),
          ],
          location: stmt.location,
        } as IRCall,
        location: stmt.location,
      };
      return expr;
    }
    case 'Block': {
      return {
        kind: 'Program',
        body: stmt.body.map((s) => lowerStatement(s, ctx)),
        location: stmt.location,
      } as IRProgram;
    }
    case 'MatchStmt': {
      const tempName = `__match${ctx.matchCounter++}`;
      const tempLet: IRLet = {
        kind: 'Let',
        name: tempName,
        value: lowerExpr(stmt.value, ctx),
        location: stmt.location,
      };

      let rootIf: IRIf | null = null;
      let currentIf: IRIf | null = null;
      let wildcardBody: IRNode[] | null = null;

      for (const arm of stmt.arms) {
        const armBody: IRNode[] = [];
        if (arm.pattern.type === 'EnumPattern') {
          const variant = arm.pattern.enumName
            ? ctx.variantsByQualified.get(`${arm.pattern.enumName}.${arm.pattern.variant}`)
            : ctx.variantsByName.get(arm.pattern.variant);
          if (variant?.hasPayload && arm.pattern.bindings.length > 0) {
            arm.pattern.bindings.forEach((binding, index) => {
              if (binding === '_') return;
              armBody.push({
                kind: 'Let',
                name: binding,
                value: {
                  kind: 'Index',
                  target: {
                    kind: 'Member',
                    object: { kind: 'Identifier', name: tempName },
                    property: 'values',
                  } as IRMember,
                  index,
                } as IRIndex,
              } as IRLet);
            });
          }
        }
        arm.body.body.map((s) => lowerStatement(s, ctx)).forEach((n) => armBody.push(n));
        if (arm.guard) {
          armBody.unshift({
            kind: 'If',
            condition: lowerExpr(arm.guard, ctx),
            thenBody: [],
            elseBody: [],
          } as IRIf);
        }

        if (arm.pattern.type === 'WildcardPattern') {
          wildcardBody = armBody;
          continue;
        }
        if (arm.pattern.type !== 'EnumPattern') {
          wildcardBody = armBody;
          continue;
        }

        const condition: IRBinary = {
          kind: 'Binary',
          op: '==',
          left: {
            kind: 'Member',
            object: { kind: 'Identifier', name: tempName },
            property: 'tag',
          } as IRMember,
          right: { kind: 'String', value: arm.pattern.variant } as IRString,
        };

        const ifNode: IRIf = {
          kind: 'If',
          condition,
          thenBody: armBody,
          elseBody: undefined,
        };

        if (!rootIf) {
          rootIf = ifNode;
          currentIf = ifNode;
        } else if (currentIf) {
          currentIf.elseBody = [ifNode];
          currentIf = ifNode;
        }
      }

      if (currentIf && wildcardBody) {
        currentIf.elseBody = wildcardBody;
      }

      const body: IRNode[] = [tempLet];
      if (rootIf) body.push(rootIf);
      return { kind: 'Program', body, location: stmt.location } as IRProgram;
    }
    case 'Import':
    case 'TraitDecl':
    case 'ImplDecl':
    case 'TypeDecl':
    case 'StructDecl':
    case 'EnumDecl':
    case 'ErrorNode':
      return { kind: 'Noop' } as IRNoop;
    default:
      return { kind: 'Noop' } as IRNoop;
  }
}

function lowerExpr(expr: LuminaExpr, ctx: LowerContext): IRNode {
  switch (expr.type) {
    case 'Binary': {
      if (expr.op === '|>') {
        if (expr.right.type === 'Call') {
          const calleeName = expr.right.enumName
            ? `${expr.right.enumName}.${expr.right.callee.name}`
            : expr.right.callee.name;
          const call: IRCall = {
            kind: 'Call',
            callee: calleeName,
            args: [lowerExpr(expr.left, ctx), ...expr.right.args.map((arg) => lowerExpr(arg, ctx))],
            location: expr.location,
          };
          return call;
        }
        return lowerExpr(expr.left, ctx);
      }
      const bin: IRBinary = {
        kind: 'Binary',
        op: expr.op,
        left: lowerExpr(expr.left, ctx),
        right: lowerExpr(expr.right, ctx),
        location: expr.location,
      };
      return bin;
    }
    case 'Call': {
      const variant = expr.enumName
        ? ctx.variantsByQualified.get(`${expr.enumName}.${expr.callee.name}`)
        : ctx.variantsByName.get(expr.callee.name);
      if (variant) {
        const enumNode: IREnumConstruct = {
          kind: 'Enum',
          tag: variant.name,
          values: expr.args.map((arg) => lowerExpr(arg, ctx)),
          location: expr.location,
        };
        return enumNode;
      }
      const call: IRCall = {
        kind: 'Call',
        callee: expr.enumName ? `${expr.enumName}.${expr.callee.name}` : expr.callee.name,
        args: expr.args.map((arg) => lowerExpr(arg, ctx)),
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
    case 'InterpolatedString': {
      if (expr.parts.length === 0) {
        return { kind: 'String', value: '', location: expr.location } as IRString;
      }
      const loweredParts: IRNode[] = expr.parts.map((part) => {
        if (typeof part === 'string') {
          return { kind: 'String', value: part, location: expr.location } as IRString;
        }
        return {
          kind: 'Call',
          callee: '__lumina_stringify',
          args: [lowerExpr(part, ctx)],
          location: part.location ?? expr.location,
        } as IRCall;
      });
      let current: IRNode = loweredParts[0];
      for (let i = 1; i < loweredParts.length; i += 1) {
        current = {
          kind: 'Binary',
          op: '+',
          left: current,
          right: loweredParts[i],
          location: expr.location,
        } as IRBinary;
      }
      return current;
    }
    case 'TupleLiteral': {
      const tupleNode: IRStructLiteral = {
        kind: 'StructLiteral',
        name: 'Tuple',
        fields: expr.elements.map((element, idx) => ({
          name: String(idx),
          value: lowerExpr(element, ctx),
        })),
        location: expr.location,
      };
      return tupleNode;
    }
    case 'Range': {
      const startExpr = expr.start ? lowerExpr(expr.start, ctx) : ({ kind: 'Number', value: 0 } as IRNumber);
      const endExpr = expr.end ? lowerExpr(expr.end, ctx) : ({ kind: 'Number', value: 0 } as IRNumber);
      const inclusive: IRBoolean = { kind: 'Boolean', value: !!expr.inclusive };
      const hasStart: IRBoolean = { kind: 'Boolean', value: !!expr.start };
      const hasEnd: IRBoolean = { kind: 'Boolean', value: !!expr.end };
      const call: IRCall = {
        kind: 'Call',
        callee: '__lumina_range',
        args: [startExpr, endExpr, inclusive, hasStart, hasEnd],
        location: expr.location,
      };
      return call;
    }
    case 'Index': {
      const indexExpr = lowerExpr(expr.index, ctx);
      if (expr.index.type === 'Range') {
        const call: IRCall = {
          kind: 'Call',
          callee: 'str.slice',
          args: [lowerExpr(expr.object, ctx), indexExpr],
          location: expr.location,
        };
        return call;
      }
      const call: IRCall = {
        kind: 'Call',
        callee: '__lumina_index',
        args: [lowerExpr(expr.object, ctx), indexExpr],
        location: expr.location,
      };
      return call;
    }
    case 'Identifier': {
      const id: IRIdentifier = { kind: 'Identifier', name: expr.name, location: expr.location };
      return id;
    }
    case 'Move': {
      return lowerExpr(expr.target, ctx);
    }
    case 'Cast': {
      const targetType = typeof expr.targetType === 'string' ? expr.targetType : '_';
      return {
        kind: 'Cast',
        expr: lowerExpr(expr.expr, ctx),
        targetType,
        location: expr.location,
      };
    }
    case 'Try': {
      const call: IRCall = {
        kind: 'Call',
        callee: '__lumina_try',
        args: [lowerExpr(expr.value, ctx)],
        location: expr.location,
      };
      return call;
    }
    case 'Member': {
      if (expr.object.type === 'Identifier') {
        const qualified = `${expr.object.name}.${expr.property}`;
        const variant = ctx.variantsByQualified.get(qualified);
        if (variant && !variant.hasPayload) {
          const enumNode: IREnumConstruct = {
            kind: 'Enum',
            tag: variant.name,
            values: [],
            location: expr.location,
          };
          return enumNode;
        }
      }
      const member: IRMember = {
        kind: 'Member',
        object: lowerExpr(expr.object, ctx),
        property: expr.property,
        location: expr.location,
      };
      return member;
    }
    case 'StructLiteral': {
      const structNode: IRStructLiteral = {
        kind: 'StructLiteral',
        name: expr.name,
        fields: expr.fields.map((field) => ({
          name: field.name,
          value: lowerExpr(field.value, ctx),
        })),
        location: expr.location,
      };
      return structNode;
    }
    case 'MatchExpr': {
      const matchExpr: IRMatchExpr = {
        kind: 'MatchExpr',
        value: lowerExpr(expr.value, ctx),
        arms: expr.arms.map((arm) => ({
          variant: arm.pattern.type === 'EnumPattern' ? arm.pattern.variant : null,
          bindings: arm.pattern.type === 'EnumPattern' ? arm.pattern.bindings : [],
          body: arm.guard
            ? ({
                kind: 'MatchExpr',
                value: lowerExpr(arm.guard, ctx),
                arms: [
                  {
                    variant: null,
                    bindings: [],
                    body: lowerExpr(arm.body, ctx),
                  },
                ],
              } as IRMatchExpr)
            : lowerExpr(arm.body, ctx),
        })),
        location: expr.location,
      };
      return matchExpr;
    }
    default:
      return { kind: 'Identifier', name: '__unknown__' };
  }
}
