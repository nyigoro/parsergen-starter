export type PositionLike = {
  line: number;
  character: number;
};

export type RangeLike = {
  start: PositionLike;
  end: PositionLike;
};

export type ParamChange =
  | { kind: 'rename'; index: number; oldName: string; newName: string }
  | { kind: 'reorder'; fromIndex: number; toIndex: number }
  | { kind: 'add'; index: number; name: string; type: string; defaultValue?: string }
  | { kind: 'remove'; index: number };

export type SignatureParamInfo = {
  name: string;
  type: string | null;
};

export interface ChangeSignatureArgs {
  uri: string;
  position: PositionLike;
  changes: ParamChange[];
}

export interface ChangeSignaturePreview {
  callSiteCount: number;
  fileCount: number;
  warnings: string[];
  error?: string;
}

export interface ChangeSignatureResult {
  ok: boolean;
  error?: string;
  callSiteCount?: number;
  fileCount?: number;
  warnings?: string[];
}

export interface ChangeSignatureActionArg {
  kind: 'function' | 'trait-method';
  uri: string;
  position: PositionLike;
  name?: string;
  params?: SignatureParamInfo[];
  traitName?: string;
}

export interface MoveSymbolArgs {
  uri: string;
  position: PositionLike;
  targetUri: string;
  newName?: string;
}

export interface MoveSymbolActionArg {
  uri: string;
  position: PositionLike;
  symbol?: string;
}

export interface MoveSymbolResult {
  ok: boolean;
  error?: string;
  symbolName?: string;
  targetUri?: string;
  newName?: string;
}

export interface ChangeReturnTypeArgs {
  uri: string;
  position: PositionLike;
  newReturnType: string;
}

export interface ChangeReturnTypeActionArg {
  uri: string;
  position: PositionLike;
  name?: string;
  currentReturnType?: string;
}

export interface ChangeReturnTypePreview {
  callSiteCount: number;
  fileCount: number;
  warnings: string[];
  error?: string;
}

export interface ChangeReturnTypeResult {
  ok: boolean;
  error?: string;
  callSiteCount?: number;
  fileCount?: number;
  warnings?: string[];
}

export interface ExtractModuleArgs {
  uri: string;
  range: RangeLike;
  targetUri: string;
  symbols?: string[];
}

export interface ExtractModuleActionArg {
  uri: string;
  range: RangeLike;
  symbols: string[];
}

export interface ExtractModuleResult {
  ok: boolean;
  error?: string;
  movedSymbols?: string[];
  targetUri?: string;
}
