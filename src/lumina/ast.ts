import type { Location } from '../utils/index.js';

export type LuminaType = 'int' | 'string' | 'bool' | 'void' | string;

export interface LuminaTypeHole {
  kind: 'TypeHole';
  location?: Location;
}

export interface LuminaConstLiteral extends LuminaNode {
  type: 'ConstLiteral';
  value: number;
  location?: Location;
}

export interface LuminaConstBinary extends LuminaNode {
  type: 'ConstBinary';
  op: '+' | '-' | '*' | '/';
  left: LuminaConstExpr;
  right: LuminaConstExpr;
  location?: Location;
}

export interface LuminaConstParam extends LuminaNode {
  type: 'ConstParam';
  name: string;
  location?: Location;
}

export type LuminaConstExpr = LuminaConstLiteral | LuminaConstBinary | LuminaConstParam;

export interface LuminaArrayType {
  kind: 'array';
  element: LuminaTypeExpr;
  size?: LuminaConstExpr;
  location?: Location;
}

export type LuminaTypeExpr = LuminaType | LuminaTypeHole | LuminaArrayType;

export interface LuminaTypeParam {
  name: string;
  bound?: LuminaTypeExpr[];
  isConst?: boolean;
  constType?: 'usize' | 'i32' | 'i64';
  higherKindArity?: number;
}

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
  | LuminaMacroRulesDecl
  | LuminaTraitDecl
  | LuminaImplDecl
  | LuminaTypeDecl
  | LuminaStructDecl
  | LuminaEnumDecl
  | LuminaFnDecl
  | LuminaLet
  | LuminaLetTuple
  | LuminaLetElse
  | LuminaReturn
  | LuminaIf
  | LuminaIfLet
  | LuminaWhile
  | LuminaWhileLet
  | LuminaFor
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

export interface LuminaMacroRulesDecl {
  type: 'MacroRulesDecl';
  name: string;
  body: string;
  location?: Location;
}

export interface LuminaTypeDecl {
  type: 'TypeDecl';
  name: string;
  body: LuminaTypeField[];
  visibility?: 'public' | 'private';
  typeParams?: LuminaTypeParam[];
  extern?: boolean;
  externModule?: string;
  location?: Location;
}

export interface LuminaTraitDecl {
  type: 'TraitDecl';
  name: string;
  typeParams?: LuminaTypeParam[];
  superTraits?: LuminaTypeExpr[];
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
  typeParams?: LuminaTypeParam[];
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
  typeParams?: LuminaTypeParam[];
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
  derives?: string[];
  visibility?: 'public' | 'private';
  typeParams?: LuminaTypeParam[];
  location?: Location;
}

export interface LuminaEnumDecl {
  type: 'EnumDecl';
  name: string;
  variants: LuminaEnumVariant[];
  visibility?: 'public' | 'private';
  typeParams?: LuminaTypeParam[];
  location?: Location;
}

export interface LuminaEnumVariant {
  name: string;
  params: LuminaTypeExpr[];
  resultType?: LuminaTypeExpr | null;
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
  typeParams?: LuminaTypeParam[];
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

export interface LuminaLetTuple {
  type: 'LetTuple';
  names: string[];
  value: LuminaExpr;
  mutable?: boolean;
  location?: Location;
}

export interface LuminaLetElse {
  type: 'LetElse';
  pattern: LuminaMatchPattern;
  value: LuminaExpr;
  elseBlock: LuminaBlock;
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

export interface LuminaWhileLet {
  type: 'WhileLet';
  pattern: LuminaMatchPattern;
  value: LuminaExpr;
  body: LuminaBlock;
  location?: Location;
}

export interface LuminaFor {
  type: 'For';
  iterator: string;
  iterable: LuminaExpr;
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

export interface LuminaIfLet {
  type: 'IfLet';
  pattern: LuminaMatchPattern;
  value: LuminaExpr;
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

export type LuminaMatchPattern = (
  | LuminaEnumPattern
  | LuminaWildcardPattern
  | LuminaBindingPattern
  | LuminaLiteralPattern
  | LuminaTuplePattern
  | LuminaStructPattern
) &
  LuminaNode;

export interface LuminaEnumPattern {
  type: 'EnumPattern';
  variant: string;
  enumName?: string | null;
  bindings: string[];
  patterns?: LuminaMatchPattern[];
  location?: Location;
}

export interface LuminaWildcardPattern {
  type: 'WildcardPattern';
  location?: Location;
}

export interface LuminaBindingPattern {
  type: 'BindingPattern';
  name: string;
  location?: Location;
}

export interface LuminaLiteralPattern {
  type: 'LiteralPattern';
  value: string | number | boolean;
  location?: Location;
}

export interface LuminaTuplePattern {
  type: 'TuplePattern';
  elements: LuminaMatchPattern[];
  location?: Location;
}

export interface LuminaStructPatternField {
  name: string;
  pattern: LuminaMatchPattern;
  location?: Location;
}

export interface LuminaStructPattern {
  type: 'StructPattern';
  name: string;
  fields: LuminaStructPatternField[];
  location?: Location;
}

export interface LuminaMatchArmStmt {
  pattern: LuminaMatchPattern;
  guard?: LuminaExpr | null;
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
  guard?: LuminaExpr | null;
  body: LuminaExpr;
  location?: Location;
}

export interface LuminaSelectArm {
  binding: string | null;
  value: LuminaExpr;
  body: LuminaExpr;
  location?: Location;
}

export type LuminaExpr = (
  | LuminaBinary
  | LuminaLambda
  | LuminaMember
  | LuminaCall
  | LuminaMove
  | LuminaAwait
  | LuminaTry
  | LuminaCast
  | LuminaStructLiteral
  | LuminaRange
  | LuminaArrayLiteral
  | LuminaArrayRepeatLiteral
  | LuminaTupleLiteral
  | LuminaMacroInvoke
  | LuminaIndex
  | LuminaIsExpr
  | LuminaNumber
  | LuminaString
  | LuminaInterpolatedString
  | LuminaSelectExpr
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

export interface LuminaLambda {
  type: 'Lambda';
  async?: boolean;
  capture?: 'move';
  captures?: string[];
  params: LuminaParam[];
  returnType: LuminaTypeExpr | null;
  body: LuminaBlock;
  typeParams?: LuminaTypeParam[];
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

export interface LuminaSelectExpr {
  type: 'SelectExpr';
  arms: LuminaSelectArm[];
  location?: Location;
}

export interface LuminaRange {
  type: 'Range';
  start: LuminaExpr | null;
  end: LuminaExpr | null;
  inclusive: boolean;
  location?: Location;
}

export interface LuminaArrayLiteral {
  type: 'ArrayLiteral';
  elements: LuminaExpr[];
  location?: Location;
}

export interface LuminaArrayRepeatLiteral {
  type: 'ArrayRepeatLiteral';
  value: LuminaExpr;
  count: LuminaExpr;
  location?: Location;
}

export interface LuminaTupleLiteral {
  type: 'TupleLiteral';
  elements: LuminaExpr[];
  location?: Location;
}

export interface LuminaMacroInvoke {
  type: 'MacroInvoke';
  name: string;
  args: LuminaExpr[];
  delimiter: '[]' | '()' | '{}';
  location?: Location;
}

export interface LuminaIndex {
  type: 'Index';
  object: LuminaExpr;
  index: LuminaExpr;
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
  receiver?: LuminaExpr | null;
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
