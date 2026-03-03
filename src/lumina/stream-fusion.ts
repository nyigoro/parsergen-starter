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
  LuminaProgram,
  LuminaStatement,
  LuminaStructLiteralField,
} from './ast.js';

type VecOpKind = 'filter' | 'map' | 'fold';
type VecStageKind = 'filter' | 'map';

interface VecOpCall {
  kind: VecOpKind;
  source: LuminaExpr;
  args: LuminaExpr[];
}

interface VecStage {
  kind: VecStageKind;
  fn: LuminaExpr;
}

interface FoldPipeline {
  source: LuminaExpr;
  stages: VecStage[];
  init: LuminaExpr;
  folder: LuminaExpr;
}

interface FusionMatch {
  helper: 'fused_filter_map_fold' | 'fused_map_fold' | 'fused_filter_fold' | 'fused_pipeline';
  args: LuminaExpr[];
}

const isVecQualifiedCall = (expr: LuminaCall, name: string): boolean => expr.enumName === 'vec' && !expr.receiver && expr.callee.name === name;
const isVecMethodCall = (expr: LuminaCall, name: string): boolean => !!expr.receiver && expr.callee.name === name;
const isPseudoMethodCall = (expr: LuminaCall, name: string): boolean =>
  !!expr.enumName && expr.enumName !== 'vec' && !expr.receiver && expr.callee.name === name;

function matchVecOpCall(expr: LuminaExpr): VecOpCall | null {
  if (expr.type !== 'Call') return null;

  if (isVecQualifiedCall(expr, 'filter') && expr.args.length === 2) {
    return { kind: 'filter', source: expr.args[0], args: [expr.args[1]] };
  }
  if (isVecQualifiedCall(expr, 'map') && expr.args.length === 2) {
    return { kind: 'map', source: expr.args[0], args: [expr.args[1]] };
  }
  if (isVecQualifiedCall(expr, 'fold') && expr.args.length === 3) {
    return { kind: 'fold', source: expr.args[0], args: [expr.args[1], expr.args[2]] };
  }

  if (isVecMethodCall(expr, 'filter') && expr.args.length === 1 && expr.receiver) {
    return { kind: 'filter', source: expr.receiver, args: [expr.args[0]] };
  }
  if (isVecMethodCall(expr, 'map') && expr.args.length === 1 && expr.receiver) {
    return { kind: 'map', source: expr.receiver, args: [expr.args[0]] };
  }
  if (isVecMethodCall(expr, 'fold') && expr.args.length === 2 && expr.receiver) {
    return { kind: 'fold', source: expr.receiver, args: [expr.args[0], expr.args[1]] };
  }

  // Parser can represent chained method syntax as enumName=<receiverIdentifier>, receiver=null.
  if (isPseudoMethodCall(expr, 'filter') && expr.args.length === 1) {
    return {
      kind: 'filter',
      source: { type: 'Identifier', name: expr.enumName as string, location: expr.location },
      args: [expr.args[0]],
    };
  }
  if (isPseudoMethodCall(expr, 'map') && expr.args.length === 1) {
    return {
      kind: 'map',
      source: { type: 'Identifier', name: expr.enumName as string, location: expr.location },
      args: [expr.args[0]],
    };
  }
  if (isPseudoMethodCall(expr, 'fold') && expr.args.length === 2) {
    return {
      kind: 'fold',
      source: { type: 'Identifier', name: expr.enumName as string, location: expr.location },
      args: [expr.args[0], expr.args[1]],
    };
  }

  return null;
}

function collectFoldPipeline(expr: LuminaExpr): FoldPipeline | null {
  const fold = matchVecOpCall(expr);
  if (!fold || fold.kind !== 'fold' || fold.args.length !== 2) return null;

  const stages: VecStage[] = [];
  let source = fold.source;
  while (true) {
    const op = matchVecOpCall(source);
    if (!op || op.kind === 'fold') break;
    stages.push({ kind: op.kind, fn: op.args[0] });
    source = op.source;
  }

  if (stages.length === 0) return null;

  return {
    source,
    stages: stages.reverse(),
    init: fold.args[0],
    folder: fold.args[1],
  };
}

function stageLiteral(stage: VecStage): LuminaExpr {
  return {
    type: 'StructLiteral',
    name: 'FusionStage',
    fields: [
      {
        name: 'kind',
        value: {
          type: 'String',
          value: stage.kind,
          location: stage.fn.location,
        },
        location: stage.fn.location,
      },
      {
        name: 'f',
        value: stage.fn,
        location: stage.fn.location,
      },
    ],
    location: stage.fn.location,
  };
}

function buildStageArray(stages: VecStage[]): LuminaExpr {
  return {
    type: 'ArrayLiteral',
    elements: stages.map((stage) => stageLiteral(stage)),
    location: stages[0]?.fn.location,
  };
}

function tryMatchFusion(expr: LuminaExpr): FusionMatch | null {
  const pipeline = collectFoldPipeline(expr);
  if (!pipeline) return null;

  const { source, stages, init, folder } = pipeline;

  if (stages.length === 2 && stages[0].kind === 'filter' && stages[1].kind === 'map') {
    return {
      helper: 'fused_filter_map_fold',
      args: [source, stages[0].fn, stages[1].fn, init, folder],
    };
  }
  if (stages.length === 1 && stages[0].kind === 'map') {
    return {
      helper: 'fused_map_fold',
      args: [source, stages[0].fn, init, folder],
    };
  }
  if (stages.length === 1 && stages[0].kind === 'filter') {
    return {
      helper: 'fused_filter_fold',
      args: [source, stages[0].fn, init, folder],
    };
  }

  return {
    helper: 'fused_pipeline',
    args: [source, buildStageArray(stages), init, folder],
  };
}

function rewritePipeBinary(expr: LuminaExpr): LuminaExpr {
  if (expr.type !== 'Binary' || expr.op !== '|>') return expr;
  if (expr.right.type !== 'Call') return expr;
  const left = transformExpr(expr.left);
  const right = transformExpr(expr.right) as LuminaCall;
  if (right.receiver) {
    return { ...right, receiver: left };
  }
  return { ...right, args: [left, ...(right.args ?? [])] };
}

function transformExpr(expr: LuminaExpr): LuminaExpr {
  if (expr.type === 'Binary' && expr.op === '|>') {
    return transformExpr(rewritePipeBinary(expr));
  }

  const transformed = (() => {
    switch (expr.type) {
      case 'Binary':
        return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) };
      case 'Call':
        return {
          ...expr,
          receiver: expr.receiver ? transformExpr(expr.receiver) : expr.receiver,
          args: (expr.args ?? []).map((arg) => transformExpr(arg)),
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
      case 'ArrayRepeatLiteral': {
        const arr = expr as LuminaArrayRepeatLiteral;
        return { ...arr, value: transformExpr(arr.value), count: transformExpr(arr.count) };
      }
      case 'StructLiteral':
        return {
          ...expr,
          fields: expr.fields.map((field: LuminaStructLiteralField) => ({ ...field, value: transformExpr(field.value) })),
        };
      case 'MatchExpr':
        return {
          ...expr,
          value: transformExpr(expr.value),
          arms: expr.arms.map((arm: LuminaMatchArmExpr) => ({
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
          parts: (expr as LuminaInterpolatedString).parts.map((part) =>
            typeof part === 'string' ? part : transformExpr(part)
          ),
        };
      case 'Lambda': {
        const lambda = expr as LuminaLambda;
        return { ...lambda, body: transformBlock(lambda.body) };
      }
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
      default:
        return expr;
    }
  })();

  const fusion = tryMatchFusion(transformed);
  if (!fusion) return transformed;
  return {
    type: 'Call',
    callee: { type: 'Identifier', name: fusion.helper },
    args: fusion.args,
    enumName: 'vec',
    receiver: null,
    location: transformed.location,
  };
}

function transformStmt(stmt: LuminaStatement): LuminaStatement {
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
        arms: stmt.arms.map((arm: LuminaMatchArmStmt) => ({
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
}

function transformBlock(block: LuminaBlock): LuminaBlock {
  return {
    ...block,
    body: block.body.map((stmt) => transformStmt(stmt)),
  };
}

export function fuseVecPipelines(program: LuminaProgram): LuminaProgram {
  const body = program.body.map((stmt) => {
    if (stmt.type !== 'FnDecl') return stmt;
    const fn = stmt as LuminaFnDecl;
    return {
      ...fn,
      body: transformBlock(fn.body),
    };
  });
  return { ...program, body };
}
