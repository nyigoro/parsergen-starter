export type IRNode =
  | IRProgram
  | IRFunction
  | IRLet
  | IRPhi
  | IRReturn
  | IRExprStmt
  | IRBinary
  | IRStructLiteral
  | IRMember
  | IRIndex
  | IRCall
  | IREnumConstruct
  | IRMatchExpr
  | IRIf
  | IRAssign
  | IRWhile
  | IRNumber
  | IRBoolean
  | IRString
  | IRIdentifier
  | IRNoop;

export interface IRProgram {
  kind: 'Program';
  body: IRNode[];
  ssa?: boolean;
  location?: import('../utils/index.js').Location;
}

export interface IRFunction {
  kind: 'Function';
  name: string;
  params: string[];
  body: IRNode[];
  location?: import('../utils/index.js').Location;
}

export interface IRLet {
  kind: 'Let';
  name: string;
  value: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRPhi {
  kind: 'Phi';
  name: string;
  condition: IRNode;
  thenValue: IRNode;
  elseValue: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRReturn {
  kind: 'Return';
  value: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRExprStmt {
  kind: 'ExprStmt';
  expr: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRBinary {
  kind: 'Binary';
  op: string;
  left: IRNode;
  right: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRStructLiteral {
  kind: 'StructLiteral';
  name: string;
  fields: Array<{ name: string; value: IRNode }>;
  location?: import('../utils/index.js').Location;
}

export interface IRMember {
  kind: 'Member';
  object: IRNode;
  property: string;
  location?: import('../utils/index.js').Location;
}

export interface IRIndex {
  kind: 'Index';
  target: IRNode;
  index: number;
  location?: import('../utils/index.js').Location;
}

export interface IRCall {
  kind: 'Call';
  callee: string;
  args: IRNode[];
  location?: import('../utils/index.js').Location;
}

export interface IREnumConstruct {
  kind: 'Enum';
  tag: string;
  values: IRNode[];
  location?: import('../utils/index.js').Location;
}

export interface IRMatchExpr {
  kind: 'MatchExpr';
  value: IRNode;
  arms: Array<{
    variant: string | null;
    bindings: string[];
    body: IRNode;
  }>;
  location?: import('../utils/index.js').Location;
}

export interface IRIf {
  kind: 'If';
  condition: IRNode;
  thenBody: IRNode[];
  elseBody?: IRNode[];
  location?: import('../utils/index.js').Location;
}

export interface IRWhile {
  kind: 'While';
  condition: IRNode;
  body: IRNode[];
  location?: import('../utils/index.js').Location;
}

export interface IRAssign {
  kind: 'Assign';
  target: string;
  value: IRNode;
  location?: import('../utils/index.js').Location;
}

export interface IRNumber {
  kind: 'Number';
  value: number;
  location?: import('../utils/index.js').Location;
}

export interface IRBoolean {
  kind: 'Boolean';
  value: boolean;
  location?: import('../utils/index.js').Location;
}

export interface IRString {
  kind: 'String';
  value: string;
  location?: import('../utils/index.js').Location;
}

export interface IRIdentifier {
  kind: 'Identifier';
  name: string;
  location?: import('../utils/index.js').Location;
}

export interface IRNoop {
  kind: 'Noop';
  location?: import('../utils/index.js').Location;
}
