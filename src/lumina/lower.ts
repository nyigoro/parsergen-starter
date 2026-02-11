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
    case 'While': {
      const whileNode: IRWhile = {
        kind: 'While',
        condition: lowerExpr(stmt.condition, ctx),
        body: stmt.body.body.map((s) => lowerStatement(s, ctx)),
        location: stmt.location,
      };
      return whileNode;
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

        if (arm.pattern.type === 'WildcardPattern') {
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
          const call: IRCall = {
            kind: 'Call',
            callee: expr.right.callee.name,
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
        callee: expr.callee.name,
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
    case 'Identifier': {
      const id: IRIdentifier = { kind: 'Identifier', name: expr.name, location: expr.location };
      return id;
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
          variant: arm.pattern.type === 'WildcardPattern' ? null : arm.pattern.variant,
          bindings: arm.pattern.type === 'WildcardPattern' ? [] : arm.pattern.bindings,
          body: lowerExpr(arm.body, ctx),
        })),
        location: expr.location,
      };
      return matchExpr;
    }
    default:
      return { kind: 'Identifier', name: '__unknown__' };
  }
}
