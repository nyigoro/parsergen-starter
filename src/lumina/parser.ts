import { type ParserOptions, parseInput, type ParseError } from '../parser/index.js';
import { type CompiledGrammar } from '../grammar/index.js';
import { type LuminaProgram, type LuminaStatement, type LuminaTypeExpr, type LuminaTypeHole } from './ast.js';
import { type Location } from '../utils/index.js';

export interface LuminaParseOptions extends ParserOptions {
  grammarSource?: string;
  startRule?: string;
}

export class LuminaSyntaxError extends Error {
  location?: Location;
  expected?: string[];
  found?: string | null;
  input?: string;

  constructor(message: string, details: ParseError) {
    super(message);
    this.name = 'LuminaSyntaxError';
    this.location = details.location;
    this.expected = details.expected;
    this.found = details.found ?? null;
    this.input = details.input;
  }
}

export function parseLumina(
  grammar: CompiledGrammar<LuminaProgram>,
  input: string,
  options: LuminaParseOptions = {}
): LuminaProgram {
  return parseLuminaTyped<LuminaProgram>(grammar, input, options);
}

export function parseLuminaTyped<T>(
  grammar: CompiledGrammar<T>,
  input: string,
  options: LuminaParseOptions = {}
): T {
  const result = parseInput<T>(grammar as CompiledGrammar, input, options);
  if (result && typeof result === 'object' && 'success' in result && result.success) {
    const parsed = result.result;
    if (isLuminaProgram(parsed)) {
      normalizeTypeHoles(parsed);
    }
    return parsed;
  }
  const error = result as ParseError;
  const loc = error.location?.start;
  const source = options.grammarSource ?? 'input';
  const suffix = loc ? ` at ${source}:${loc.line}:${loc.column}` : ` at ${source}`;
  throw new LuminaSyntaxError(`[Lumina Syntax Error] ${error.error}${suffix}`, error);
}

function isLuminaProgram(value: unknown): value is LuminaProgram {
  return !!value && typeof value === 'object' && 'type' in value && (value as { type?: string }).type === 'Program';
}

function makeTypeHole(location?: Location): LuminaTypeHole {
  return { kind: 'TypeHole', location };
}

function normalizeTypeExpr(typeExpr: LuminaTypeExpr | null | undefined, location?: Location): LuminaTypeExpr | null | undefined {
  if (typeExpr === '_') {
    return makeTypeHole(location);
  }
  return typeExpr;
}

function normalizeTypeArray(types: LuminaTypeExpr[] | undefined, location?: Location) {
  if (!types) return;
  for (let i = 0; i < types.length; i += 1) {
    types[i] = normalizeTypeExpr(types[i], location) as LuminaTypeExpr;
  }
}

function normalizeTypeParams(params: Array<{ name: string; bound?: LuminaTypeExpr[] }> | undefined, location?: Location) {
  if (!params) return;
  for (const param of params) {
    normalizeTypeArray(param.bound, location);
  }
}

function normalizeTypeHoles(program: LuminaProgram) {
  for (const stmt of program.body) {
    normalizeStatement(stmt);
  }
}

function normalizeStatement(stmt: LuminaStatement) {
  switch (stmt.type) {
    case 'TypeDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      for (const field of stmt.body) {
        field.typeName = normalizeTypeExpr(field.typeName, field.location) as LuminaTypeExpr;
      }
      return;
    }
    case 'StructDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      for (const field of stmt.body) {
        field.typeName = normalizeTypeExpr(field.typeName, field.location) as LuminaTypeExpr;
      }
      return;
    }
    case 'EnumDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      for (const variant of stmt.variants) {
        normalizeTypeArray(variant.params, variant.location);
      }
      return;
    }
    case 'TraitDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      for (const method of stmt.methods) {
        normalizeTypeParams(method.typeParams, method.location);
        for (const param of method.params) {
          param.typeName = normalizeTypeExpr(param.typeName, param.location) as LuminaTypeExpr | null;
        }
        method.returnType = normalizeTypeExpr(method.returnType, method.location) as LuminaTypeExpr | null;
      }
      return;
    }
    case 'ImplDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      stmt.traitType = normalizeTypeExpr(stmt.traitType, stmt.location) as LuminaTypeExpr;
      stmt.forType = normalizeTypeExpr(stmt.forType, stmt.location) as LuminaTypeExpr;
      for (const method of stmt.methods) {
        normalizeStatement(method);
      }
      return;
    }
    case 'FnDecl': {
      normalizeTypeParams(stmt.typeParams, stmt.location);
      for (const param of stmt.params) {
        param.typeName = normalizeTypeExpr(param.typeName, param.location) as LuminaTypeExpr | null;
      }
      stmt.returnType = normalizeTypeExpr(stmt.returnType, stmt.location) as LuminaTypeExpr | null;
      normalizeStatement(stmt.body);
      return;
    }
    case 'Let': {
      stmt.typeName = normalizeTypeExpr(stmt.typeName, stmt.location) as LuminaTypeExpr | null;
      return;
    }
    case 'Block': {
      for (const inner of stmt.body) normalizeStatement(inner);
      return;
    }
    case 'If': {
      normalizeStatement(stmt.thenBlock);
      if (stmt.elseBlock) normalizeStatement(stmt.elseBlock);
      return;
    }
    case 'While': {
      normalizeStatement(stmt.body);
      return;
    }
    case 'MatchStmt': {
      for (const arm of stmt.arms) {
        normalizeStatement(arm.body);
      }
      return;
    }
    default:
      return;
  }
}
