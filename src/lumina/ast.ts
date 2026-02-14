import type { Location } from '../utils/index.js';

export type LuminaType = 'int' | 'string' | 'bool' | 'void' | string;

export interface LuminaTypeHole {
  kind: 'TypeHole';
  location?: Location;
}

export type LuminaTypeExpr = LuminaType | LuminaTypeHole;

export interface LuminaNode {
  id?: number;
}

export interface LuminaProgram extends LuminaNode {
  type: 'Program';
  body: LuminaStatement[];
  location?: Location;
}

export type LuminaStatement = (
  | LuminaImport
  | LuminaTraitDecl
  | LuminaImplDecl
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
  | LuminaBlock
  | LuminaErrorNode
) & LuminaNode;

export interface LuminaImportSpec {
  name: string;
  alias?: string;
  namespace?: boolean;
  location?: Location;
}

export interface LuminaImport {
  type: 'Import';
  spec: Array<string | LuminaImportSpec> | string | LuminaImportSpec;
  source: LuminaString;
  location?: Location;
}

export interface LuminaTypeDecl {
  type: 'TypeDecl';
  name: string;
  body: LuminaTypeField[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  extern?: boolean;
  externModule?: string;
  location?: Location;
}

export interface LuminaTraitDecl {
  type: 'TraitDecl';
  name: string;
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  methods: LuminaTraitMethod[];
  associatedTypes?: LuminaTraitAssocType[];
  visibility?: 'public' | 'private';
  location?: Location;
}

export interface LuminaTraitMethod {
  type: 'TraitMethod';
  name: string;
  params: LuminaParam[];
  returnType: LuminaTypeExpr | null;
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  body?: LuminaBlock | null;
  location?: Location;
}

export interface LuminaTraitAssocType {
  type: 'TraitAssocType';
  name: string;
  typeName?: LuminaTypeExpr | null;
  location?: Location;
}

export interface LuminaImplDecl {
  type: 'ImplDecl';
  traitType: LuminaTypeExpr;
  forType: LuminaTypeExpr;
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  methods: LuminaFnDecl[];
  associatedTypes?: LuminaImplAssocType[];
  visibility?: 'public' | 'private';
  location?: Location;
}

export interface LuminaImplAssocType {
  type: 'ImplAssocType';
  name: string;
  typeName: LuminaTypeExpr;
  location?: Location;
}

export interface LuminaStructDecl {
  type: 'StructDecl';
  name: string;
  body: LuminaTypeField[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  location?: Location;
}

export interface LuminaEnumDecl {
  type: 'EnumDecl';
  name: string;
  variants: LuminaEnumVariant[];
  visibility?: 'public' | 'private';
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  location?: Location;
}

export interface LuminaEnumVariant {
  name: string;
  params: LuminaTypeExpr[];
  location?: Location;
}

export interface LuminaTypeField {
  name: string;
  typeName: LuminaTypeExpr;
  location?: Location;
}

export interface LuminaFnDecl {
  type: 'FnDecl';
  name: string;
  async?: boolean;
  params: LuminaParam[];
  returnType: LuminaTypeExpr | null;
  body: LuminaBlock;
  visibility?: 'public' | 'private';
  extern?: boolean;
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
  externModule?: string;
  location?: Location;
}

export interface LuminaParam {
  name: string;
  typeName: LuminaTypeExpr | null;
  ref?: boolean;
  refMut?: boolean;
  location?: Location;
}

export interface LuminaBlock {
  type: 'Block';
  body: LuminaStatement[];
  location?: Location;
}

export interface LuminaErrorNode {
  type: 'ErrorNode';
  message: string;
  expected?: string[];
  location?: Location;
}

export interface LuminaLet {
  type: 'Let';
  name: string;
  typeName: LuminaTypeExpr | null;
  value: LuminaExpr;
  mutable?: boolean;
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

export type LuminaAssignTarget = LuminaIdentifier | LuminaMember;

export interface LuminaAssign {
  type: 'Assign';
  target: LuminaAssignTarget;
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

export type LuminaMatchPattern = (LuminaEnumPattern | LuminaWildcardPattern) & LuminaNode;

export interface LuminaEnumPattern {
  type: 'EnumPattern';
  variant: string;
  enumName?: string | null;
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

export type LuminaExpr = (
  | LuminaBinary
  | LuminaMember
  | LuminaCall
  | LuminaMove
  | LuminaAwait
  | LuminaTry
  | LuminaCast
  | LuminaStructLiteral
  | LuminaIsExpr
  | LuminaNumber
  | LuminaString
  | LuminaInterpolatedString
  | LuminaBoolean
  | LuminaIdentifier
  | LuminaMatchExpr
) & LuminaNode;

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
  raw?: string;
  suffix?: string | null;
  isFloat?: boolean;
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

export interface LuminaInterpolatedString {
  type: 'InterpolatedString';
  parts: Array<string | LuminaExpr>;
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

export interface LuminaMove {
  type: 'Move';
  target: LuminaIdentifier | LuminaMember;
  location?: Location;
}

export interface LuminaAwait {
  type: 'Await';
  value: LuminaExpr;
  location?: Location;
}

export interface LuminaTry {
  type: 'Try';
  value: LuminaExpr;
  location?: Location;
}

export interface LuminaCast {
  type: 'Cast';
  expr: LuminaExpr;
  targetType: LuminaTypeExpr;
  location?: Location;
}

export interface LuminaCall {
  type: 'Call';
  callee: LuminaIdentifier;
  args: LuminaExpr[];
  typeArgs?: string[];
  enumName?: string | null;
  location?: Location;
}

export interface LuminaIsExpr {
  type: 'IsExpr';
  value: LuminaExpr;
  variant: string;
  enumName?: string | null;
  location?: Location;
}

export interface LuminaStructLiteral {
  type: 'StructLiteral';
  name: string;
  typeArgs?: string[];
  fields: LuminaStructLiteralField[];
  location?: Location;
}

export interface LuminaStructLiteralField {
  name: string;
  value: LuminaExpr;
  location?: Location;
}
