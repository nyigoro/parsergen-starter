export type IRNode =
  | IRProgram
  | IRFunction
  | IRLet
  | IRReturn
  | IRExprStmt
  | IRBinary
  | IRNumber
  | IRString
  | IRIdentifier
  | IRNoop;

export interface IRProgram {
  kind: 'Program';
  body: IRNode[];
}

export interface IRFunction {
  kind: 'Function';
  name: string;
  params: string[];
  body: IRNode[];
}

export interface IRLet {
  kind: 'Let';
  name: string;
  value: IRNode;
}

export interface IRReturn {
  kind: 'Return';
  value: IRNode;
}

export interface IRExprStmt {
  kind: 'ExprStmt';
  expr: IRNode;
}

export interface IRBinary {
  kind: 'Binary';
  op: string;
  left: IRNode;
  right: IRNode;
}

export interface IRNumber {
  kind: 'Number';
  value: number;
}

export interface IRString {
  kind: 'String';
  value: string;
}

export interface IRIdentifier {
  kind: 'Identifier';
  name: string;
}

export interface IRNoop {
  kind: 'Noop';
}
