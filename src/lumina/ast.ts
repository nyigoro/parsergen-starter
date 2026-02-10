import type { Location } from '../utils/index.js';

export type LuminaType = 'int' | 'string' | 'bool' | 'void' | string;

export interface LuminaProgram {
  type: 'Program';
  body: LuminaStatement[];
  location?: Location;
}

export type LuminaStatement =
  | LuminaImport
  | LuminaTypeDecl
  | LuminaStructDecl
  | LuminaEnumDecl
  | LuminaFnDecl
  | LuminaLet
  | LuminaReturn
  | LuminaIf
  | LuminaWhile
  | LuminaAssign
  | LuminaMatchStmt
  | LuminaExprStmt
  | LuminaBlock;

export interface LuminaImport {
  type: 'Import';
  spec: string[] | string;
  source: LuminaString;
  location?: Location;
}

export interface LuminaTypeDecl {
  type: 'TypeDecl';
  name: string;
  body: LuminaTypeField[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  extern?: boolean;
  externModule?: string;
  location?: Location;
}

export interface LuminaStructDecl {
  type: 'StructDecl';
  name: string;
  body: LuminaTypeField[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  location?: Location;
}

export interface LuminaEnumDecl {
  type: 'EnumDecl';
  name: string;
  variants: LuminaEnumVariant[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  location?: Location;
}

export interface LuminaEnumVariant {
  name: string;
  params: LuminaType[];
  location?: Location;
}

export interface LuminaTypeField {
  name: string;
  typeName: LuminaType;
  location?: Location;
}

export interface LuminaFnDecl {
  type: 'FnDecl';
  name: string;
  params: LuminaParam[];
  returnType: LuminaType | null;
  body: LuminaBlock;
  visibility?: 'public' | 'private';
  extern?: boolean;
  typeParams?: Array<{ name: string; bound?: LuminaType[] }>;
  externModule?: string;
  location?: Location;
}

export interface LuminaParam {
  name: string;
  typeName: LuminaType;
  location?: Location;
}

export interface LuminaBlock {
  type: 'Block';
  body: LuminaStatement[];
  location?: Location;
}

export interface LuminaLet {
  type: 'Let';
  name: string;
  typeName: LuminaType;
  value: LuminaExpr;
  location?: Location;
}

export interface LuminaReturn {
  type: 'Return';
  value: LuminaExpr;
  location?: Location;
}

export interface LuminaWhile {
  type: 'While';
  condition: LuminaExpr;
  body: LuminaBlock;
  location?: Location;
}

export interface LuminaAssign {
  type: 'Assign';
  target: LuminaIdentifier;
  value: LuminaExpr;
  location?: Location;
}

export interface LuminaIf {
  type: 'If';
  condition: LuminaExpr;
  thenBlock: LuminaBlock;
  elseBlock?: LuminaBlock | null;
  location?: Location;
}

export interface LuminaExprStmt {
  type: 'ExprStmt';
  expr: LuminaExpr;
  location?: Location;
}

export interface LuminaMatchStmt {
  type: 'MatchStmt';
  value: LuminaExpr;
  arms: LuminaMatchArmStmt[];
  location?: Location;
}

export type LuminaMatchPattern = LuminaEnumPattern | LuminaWildcardPattern;

export interface LuminaEnumPattern {
  type: 'EnumPattern';
  variant: string;
  bindings: string[];
  location?: Location;
}

export interface LuminaWildcardPattern {
  type: 'WildcardPattern';
  location?: Location;
}

export interface LuminaMatchArmStmt {
  pattern: LuminaMatchPattern;
  body: LuminaBlock;
  location?: Location;
}

export interface LuminaMatchExpr {
  type: 'MatchExpr';
  value: LuminaExpr;
  arms: LuminaMatchArmExpr[];
  location?: Location;
}

export interface LuminaMatchArmExpr {
  pattern: LuminaMatchPattern;
  body: LuminaExpr;
  location?: Location;
}

export type LuminaExpr =
  | LuminaBinary
  | LuminaMember
  | LuminaCall
  | LuminaNumber
  | LuminaString
  | LuminaBoolean
  | LuminaIdentifier
  | LuminaMatchExpr;

export interface LuminaBinary {
  type: 'Binary';
  op: string;
  left: LuminaExpr;
  right: LuminaExpr;
  location?: Location;
}

export interface LuminaNumber {
  type: 'Number';
  value: number;
  location?: Location;
}

export interface LuminaBoolean {
  type: 'Boolean';
  value: boolean;
  location?: Location;
}

export interface LuminaString {
  type: 'String';
  value: string;
  location?: Location;
}

export interface LuminaIdentifier {
  type: 'Identifier';
  name: string;
  location?: Location;
}

export interface LuminaMember {
  type: 'Member';
  object: LuminaExpr;
  property: string;
  location?: Location;
}

export interface LuminaCall {
  type: 'Call';
  callee: LuminaIdentifier;
  args: LuminaExpr[];
  typeArgs?: string[];
  location?: Location;
}
