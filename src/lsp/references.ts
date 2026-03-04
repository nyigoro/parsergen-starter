import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location as LspLocation, Position } from 'vscode-languageserver/node';
import type { Location } from '../utils/index.js';
import { type LuminaTypeExpr, type LuminaMatchPattern } from '../lumina/ast.js';
import { ProjectContext } from '../project/context.js';
import { getWordAt } from './hover-signature.js';

export type ReferenceSite = {
  uri: string;
  location: Location;
};

function locationToLsp(location: Location): LspLocation {
  return {
    uri: '',
    range: {
      start: { line: location.start.line - 1, character: location.start.column - 1 },
      end: { line: location.end.line - 1, character: location.end.column - 1 },
    },
  };
}

function dedupeReferences(refs: ReferenceSite[]): ReferenceSite[] {
  const out: ReferenceSite[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.uri}:${ref.location.start.line}:${ref.location.start.column}:${ref.location.end.line}:${ref.location.end.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function addTypeExprWordRefs(
  typeExpr: LuminaTypeExpr | null | undefined,
  word: string,
  location: Location | undefined,
  out: Location[]
): void {
  if (!typeExpr || !location) return;
  if (typeof typeExpr !== 'string') {
    const arrayExpr = typeExpr as { kind?: string; element?: LuminaTypeExpr };
    if (arrayExpr.kind === 'array') {
      addTypeExprWordRefs(arrayExpr.element ?? null, word, location, out);
    }
    return;
  }
  const atoms = typeExpr.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  if (atoms.some((atom) => atom === word)) {
    out.push(location);
  }
}

function addPatternWordRefs(pattern: LuminaMatchPattern, word: string, out: Location[]): void {
  switch (pattern.type) {
    case 'EnumPattern':
      if (pattern.variant === word && pattern.location) out.push(pattern.location);
      if (pattern.enumName === word && pattern.location) out.push(pattern.location);
      if (pattern.patterns && pattern.patterns.length > 0) {
        pattern.patterns.forEach((nested) => addPatternWordRefs(nested, word, out));
      }
      return;
    case 'TuplePattern':
      pattern.elements.forEach((element) => addPatternWordRefs(element, word, out));
      return;
    case 'StructPattern':
      if (pattern.name === word && pattern.location) out.push(pattern.location);
      pattern.fields.forEach((field) => {
        if (field.name === word && field.location) out.push(field.location);
        addPatternWordRefs(field.pattern, word, out);
      });
      return;
    default:
      return;
  }
}

function collectAstWordReferences(program: unknown, word: string): Location[] {
  const refs: Location[] = [];
  if (!program || typeof program !== 'object') return refs;
  const prog = program as { type?: string; body?: unknown[] };
  if (prog.type !== 'Program' || !Array.isArray(prog.body)) return refs;

  const addIfMatch = (name: string | undefined, location?: Location) => {
    if (name === word && location) refs.push(location);
  };

  const visitExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object') return;
    const node = expr as Record<string, unknown> & { type?: string; location?: Location };
    switch (node.type) {
      case 'Identifier':
        addIfMatch(node.name as string | undefined, node.location);
        return;
      case 'Call': {
        const callee = node.callee as { name?: string; location?: Location } | undefined;
        addIfMatch(callee?.name, callee?.location ?? node.location);
        addIfMatch(node.enumName as string | undefined, node.location);
        visitExpr(node.receiver);
        visitExpr(node.callee);
        (node.args as unknown[] | undefined)?.forEach(visitExpr);
        return;
      }
      case 'Member':
        addIfMatch(node.property as string | undefined, node.location);
        visitExpr(node.object);
        return;
      case 'StructLiteral':
        addIfMatch(node.name as string | undefined, node.location);
        (node.fields as Array<{ name?: string; value?: unknown; location?: Location }> | undefined)?.forEach((field) => {
          addIfMatch(field.name, field.location ?? node.location);
          visitExpr(field.value);
        });
        return;
      case 'IsExpr':
        addIfMatch(node.enumName as string | undefined, node.location);
        addIfMatch(node.variant as string | undefined, node.location);
        visitExpr(node.value);
        return;
      case 'Binary':
        visitExpr(node.left);
        visitExpr(node.right);
        return;
      case 'Index':
        visitExpr(node.object);
        visitExpr(node.index);
        return;
      case 'Lambda':
        (node.params as Array<{ typeName?: LuminaTypeExpr | null; location?: Location }> | undefined)?.forEach((param) => {
          addTypeExprWordRefs(param.typeName ?? null, word, param.location ?? node.location, refs);
        });
        visitExpr(node.body);
        return;
      case 'Cast':
        addTypeExprWordRefs(node.targetType as LuminaTypeExpr | null, word, node.location, refs);
        visitExpr(node.expr);
        return;
      case 'MatchExpr':
        visitExpr(node.value);
        (node.arms as Array<{ pattern: LuminaMatchPattern; guard?: unknown; body?: unknown }> | undefined)?.forEach((arm) => {
          addPatternWordRefs(arm.pattern, word, refs);
          visitExpr(arm.guard);
          visitExpr(arm.body);
        });
        return;
      case 'ArrayLiteral':
        (node.elements as unknown[] | undefined)?.forEach(visitExpr);
        return;
      case 'TupleLiteral':
        (node.elements as unknown[] | undefined)?.forEach(visitExpr);
        return;
      default:
        visitExpr(node.value);
        visitExpr(node.left);
        visitExpr(node.right);
        visitExpr(node.condition);
        visitExpr(node.thenExpr);
        visitExpr(node.elseExpr);
        visitExpr(node.target);
        visitExpr(node.object);
        visitExpr(node.index);
        visitExpr(node.expr);
        (node.args as unknown[] | undefined)?.forEach(visitExpr);
        return;
    }
  };

  const visitStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object') return;
    const node = stmt as Record<string, unknown> & { type?: string; location?: Location };
    switch (node.type) {
      case 'Import': {
        const spec = node.spec;
        if (typeof spec === 'string') {
          addIfMatch(spec, node.location);
        } else if (Array.isArray(spec)) {
          for (const item of spec) {
            if (typeof item === 'string') {
              addIfMatch(item, node.location);
              continue;
            }
            if (item && typeof item === 'object') {
              const it = item as { name?: string; alias?: string; location?: Location };
              addIfMatch(it.name, it.location ?? node.location);
              addIfMatch(it.alias, it.location ?? node.location);
            }
          }
        } else if (spec && typeof spec === 'object') {
          const it = spec as { name?: string; alias?: string; location?: Location };
          addIfMatch(it.name, it.location ?? node.location);
          addIfMatch(it.alias, it.location ?? node.location);
        }
        return;
      }
      case 'FnDecl':
        addIfMatch(node.name as string | undefined, node.location);
        (node.params as Array<{ typeName?: LuminaTypeExpr | null; location?: Location }> | undefined)?.forEach((param) =>
          addTypeExprWordRefs(param.typeName ?? null, word, param.location ?? node.location, refs)
        );
        addTypeExprWordRefs(node.returnType as LuminaTypeExpr | null, word, node.location, refs);
        ((node.body as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        return;
      case 'TraitDecl':
      case 'StructDecl':
      case 'EnumDecl':
      case 'TypeDecl':
        addIfMatch(node.name as string | undefined, node.location);
        break;
      case 'ImplDecl':
        addTypeExprWordRefs(node.traitType as LuminaTypeExpr | null, word, node.location, refs);
        addTypeExprWordRefs(node.forType as LuminaTypeExpr | null, word, node.location, refs);
        (node.methods as unknown[] | undefined)?.forEach(visitStmt);
        return;
      case 'Let':
        addTypeExprWordRefs(node.typeName as LuminaTypeExpr | null, word, node.location, refs);
        visitExpr(node.value);
        return;
      case 'LetElse':
      case 'IfLet':
      case 'WhileLet':
        if (node.pattern) addPatternWordRefs(node.pattern as LuminaMatchPattern, word, refs);
        visitExpr(node.value);
        ((node.thenBlock as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        ((node.elseBlock as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        ((node.body as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        return;
      case 'MatchStmt':
        visitExpr(node.value);
        (node.arms as Array<{ pattern: LuminaMatchPattern; guard?: unknown; body?: { body?: unknown[] } }> | undefined)?.forEach((arm) => {
          addPatternWordRefs(arm.pattern, word, refs);
          visitExpr(arm.guard);
          (arm.body?.body ?? []).forEach(visitStmt);
        });
        return;
      case 'ExprStmt':
        visitExpr(node.expr);
        return;
      case 'Return':
        visitExpr(node.value);
        return;
      case 'Assign':
        visitExpr(node.target);
        visitExpr(node.value);
        return;
      case 'If':
      case 'While':
      case 'For':
        visitExpr(node.condition);
        visitExpr(node.iterable);
        ((node.thenBlock as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        ((node.elseBlock as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        ((node.body as { body?: unknown[] } | undefined)?.body ?? []).forEach(visitStmt);
        return;
      case 'Block':
        ((node.body as unknown[] | undefined) ?? []).forEach(visitStmt);
        return;
      default:
        return;
    }
  };

  prog.body.forEach(visitStmt);
  return refs;
}

export function collectReferencesByName(
  project: ProjectContext,
  name: string,
  options?: { includeDeclaration?: boolean; declarationHintUri?: string }
): ReferenceSite[] {
  const base = project.findReferences(name);
  const augmented: ReferenceSite[] = [...base];
  for (const doc of project.listDocuments()) {
    const ast = project.getDocumentAst(doc.uri);
    const extra = collectAstWordReferences(ast, name);
    for (const location of extra) {
      augmented.push({ uri: doc.uri, location });
    }
  }
  if (options?.includeDeclaration) {
    const decl = project.findSymbolLocation(name, options.declarationHintUri);
    if (decl) augmented.push(decl);
  }
  return dedupeReferences(augmented);
}

export function findReferencesAtPosition(
  project: ProjectContext,
  doc: TextDocument,
  uri: string,
  position: Position,
  includeDeclaration: boolean
): LspLocation[] {
  const word = getWordAt(doc, position.line, position.character);
  if (!word) return [];
  let refs = collectReferencesByName(project, word, {
    includeDeclaration,
    declarationHintUri: uri,
  });
  if (!includeDeclaration) {
    const decl = project.findSymbolLocation(word, uri);
    if (decl) {
      refs = refs.filter((ref) => {
        if (ref.uri !== decl.uri) return true;
        return !(
          ref.location.start.line === decl.location.start.line &&
          ref.location.start.column === decl.location.start.column &&
          ref.location.end.line === decl.location.end.line &&
          ref.location.end.column === decl.location.end.column
        );
      });
    }
  }
  return refs.map((ref) => {
    const lsp = locationToLsp(ref.location);
    lsp.uri = ref.uri;
    return lsp;
  });
}
