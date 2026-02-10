export type LuminaType = 'int' | 'string' | 'bool' | 'void' | string;

export interface LuminaProgram {
  type: 'Program';
  body: LuminaStatement[];
}

export type LuminaStatement =
  | LuminaImport
  | LuminaTypeDecl
  | LuminaFnDecl
  | LuminaLet
  | LuminaReturn
  | LuminaExprStmt;

export interface LuminaImport {
  type: 'Import';
  spec: string[] | string;
  source: LuminaString;
}

export interface LuminaTypeDecl {
  type: 'TypeDecl';
  name: string;
  body: Array<{ name: string; typeName: LuminaType }>;
}

export interface LuminaFnDecl {
  type: 'FnDecl';
  name: string;
  params: Array<{ name: string; typeName: LuminaType }>;
  returnType: LuminaType | null;
  body: LuminaBlock;
}

export interface LuminaBlock {
  type: 'Block';
  body: LuminaStatement[];
}

export interface LuminaLet {
  type: 'Let';
  name: string;
  typeName: LuminaType;
  value: LuminaExpr;
}

export interface LuminaReturn {
  type: 'Return';
  value: LuminaExpr;
}

export interface LuminaExprStmt {
  type: 'ExprStmt';
  expr: LuminaExpr;
}

export type LuminaExpr =
  | LuminaBinary
  | LuminaNumber
  | LuminaString
  | LuminaIdentifier;

export interface LuminaBinary {
  type: 'Binary';
  op: string;
  left: LuminaExpr;
  right: LuminaExpr;
}

export interface LuminaNumber {
  type: 'Number';
  value: number;
}

export interface LuminaString {
  type: 'String';
  value: string;
}

export interface LuminaIdentifier {
  type: 'Identifier';
  name: string;
}
