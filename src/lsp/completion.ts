import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import path from 'node:path';
import { URI } from 'vscode-uri';
import {
  createStdModuleRegistry,
  getPreludeExports,
  type ModuleExport,
  type ModuleFunction,
  type ModuleNamespace,
  type ModuleOverloadedFunction,
  type ModuleRegistry,
} from '../lumina/module-registry.js';
import { type SymbolInfo, type SymbolTable } from '../lumina/semantic.js';
import {
  type LuminaBlock,
  type LuminaMatchPattern,
  type LuminaProgram,
  type LuminaStatement,
} from '../lumina/ast.js';
import { ProjectContext } from '../project/context.js';

type Position = { line: number; character: number };
type ImportContext =
  | { kind: 'path'; prefix: string }
  | { kind: 'names'; source: string; prefix: string }
  | null;

type MemberChain = Array<{ name: string; call: boolean }>;
type ScopeBinding = {
  name: string;
  kind: CompletionItemKind;
  detail?: string;
};

type CompletionContext =
  | { kind: 'member'; chain: MemberChain }
  | { kind: 'namespace'; base: string }
  | { kind: 'import-path'; prefix: string }
  | { kind: 'import-names'; source: string; prefix: string }
  | { kind: 'scope'; prefix: string };

export type CompletionOptions = {
  doc: TextDocument;
  position: Position;
  symbols?: SymbolTable;
  ast?: unknown;
  moduleBindings?: Map<string, ModuleExport>;
  hmExprTypes?: Map<number, string>;
  preludeExportMap?: Map<string, ModuleExport>;
  moduleRegistry?: ModuleRegistry;
  project?: ProjectContext;
  uri?: string;
  resolveImportedSymbol?: (name: string) => SymbolInfo | undefined;
  resolveImportedMember?: (base: string, member: string) => SymbolInfo | undefined;
};

const defaultModuleRegistry = createStdModuleRegistry();
const defaultPreludeExportMap = new Map<string, ModuleExport>(
  getPreludeExports(defaultModuleRegistry).map((exp) => [exp.name, exp])
);

const luminaKeywords = [
  'fn',
  'let',
  'mut',
  'match',
  'if',
  'else',
  'while',
  'for',
  'return',
  'async',
  'await',
  'struct',
  'enum',
  'trait',
  'impl',
  'type',
  'pub',
  'use',
  'import',
  'comptime',
  'ref',
  'move',
];

function locationContains(
  location:
    | {
        start: { line: number; column: number; offset?: number };
        end: { line: number; column: number; offset?: number };
      }
    | undefined,
  position: Position
): boolean {
  if (!location) return false;
  const line = position.line + 1;
  const column = position.character + 1;
  if (line < location.start.line || line > location.end.line) return false;
  if (line === location.start.line && column < location.start.column) return false;
  if (line === location.end.line && column > location.end.column) return false;
  return true;
}

function startsAfter(
  location:
    | {
        start: { line: number; column: number };
      }
    | undefined,
  position: Position
): boolean {
  if (!location) return false;
  const line = position.line + 1;
  const column = position.character + 1;
  if (location.start.line > line) return true;
  if (location.start.line === line && location.start.column > column) return true;
  return false;
}

function getLineText(doc: TextDocument, line: number): string {
  const text = doc.getText();
  const start = doc.offsetAt({ line, character: 0 });
  let end = start;
  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') end += 1;
  return text.slice(start, end);
}

function getIdentifierPrefix(doc: TextDocument, position: Position): string {
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  let start = offset;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start -= 1;
  return text.slice(start, offset);
}

function getLexicalState(text: string, offset: number): {
  inLineComment: boolean;
  inBlockComment: boolean;
  inString: boolean;
} {
  let inLineComment = false;
  let inBlockComment = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < offset; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }
  return {
    inLineComment,
    inBlockComment,
    inString: quote !== null,
  };
}

function getImportContext(doc: TextDocument, position: Position): ImportContext {
  const lineText = getLineText(doc, position.line);
  const before = lineText.slice(0, position.character);
  const after = lineText.slice(position.character);

  const pathMatch = before.match(/\bimport\b.*\bfrom\s+["']([^"']*)$/);
  if (pathMatch) {
    return { kind: 'path', prefix: pathMatch[1] ?? '' };
  }

  const left = before.match(/\bimport\s*\{([^}]*)$/);
  const right = after.match(/^\s*\}\s*from\s*["']([^"']+)["']/);
  if (left && right) {
    const segment = left[1] ?? '';
    const prefixMatch = segment.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    return {
      kind: 'names',
      source: right[1],
      prefix: prefixMatch?.[1] ?? '',
    };
  }

  return null;
}

function getMemberChain(doc: TextDocument, position: Position): MemberChain | null {
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  if (offset <= 0) return null;
  const head = text.slice(0, offset);
  const match = /([A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\))?(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\))?)*)\s*\.$/m.exec(head);
  if (!match) return null;
  return match[1]
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((segment) => ({
      name: segment.replace(/\(\s*\)$/, ''),
      call: /\(\s*\)$/.test(segment),
    }));
}

function getNamespaceBase(doc: TextDocument, position: Position): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  if (offset < 2) return null;
  const head = text.slice(0, offset);
  const match = /([A-Za-z_][A-Za-z0-9_]*)::$/m.exec(head);
  return match?.[1] ?? null;
}

function getCompletionContext(doc: TextDocument, position: Position): CompletionContext | null {
  const text = doc.getText();
  const offset = doc.offsetAt(position);
  const lexical = getLexicalState(text, offset);
  if (lexical.inLineComment || lexical.inBlockComment) return null;

  const importContext = getImportContext(doc, position);
  if (importContext?.kind === 'path') {
    return { kind: 'import-path', prefix: importContext.prefix };
  }
  if (importContext?.kind === 'names') {
    return { kind: 'import-names', source: importContext.source, prefix: importContext.prefix };
  }
  if (lexical.inString) return null;

  const memberChain = getMemberChain(doc, position);
  if (memberChain && memberChain.length > 0) {
    return { kind: 'member', chain: memberChain };
  }

  const namespaceBase = getNamespaceBase(doc, position);
  if (namespaceBase) {
    return { kind: 'namespace', base: namespaceBase };
  }

  return { kind: 'scope', prefix: getIdentifierPrefix(doc, position) };
}

function detailForFunction(fn: ModuleFunction): string {
  const args = fn.paramTypes.map((type, index) => {
    const paramName = fn.paramNames?.[index];
    return paramName ? `${paramName}: ${type}` : type;
  });
  return `fn(${args.join(', ')}) -> ${fn.returnType}`;
}

function detailForOverload(fn: ModuleOverloadedFunction): string {
  return fn.variants.slice(0, 3).map((variant) => detailForFunction(variant)).join(' | ');
}

function detailForSymbol(sym: SymbolInfo): string | undefined {
  if (sym.kind === 'function') {
    const args = (sym.paramTypes ?? []).map((type, index) => {
      const paramName = sym.paramNames?.[index];
      return paramName ? `${paramName}: ${type}` : type;
    });
    return `fn(${args.join(', ')}) -> ${sym.type ?? 'void'}`;
  }
  if (sym.kind === 'type') return sym.typeAlias ? `type ${sym.typeAlias}` : 'type';
  return sym.type;
}

function moduleExportToCompletion(label: string, exp: ModuleExport, sortPrefix: string): CompletionItem {
  if (exp.kind === 'module') {
    return {
      label,
      kind: CompletionItemKind.Module,
      detail: exp.moduleId,
      insertText: label,
      sortText: `${sortPrefix}_${label}`,
    };
  }
  if (exp.kind === 'function') {
    return {
      label,
      kind: CompletionItemKind.Function,
      detail: detailForFunction(exp),
      documentation: exp.deprecatedMessage,
      insertText: label,
      sortText: `${sortPrefix}_${label}`,
    };
  }
  if (exp.kind === 'overloaded-function') {
    return {
      label,
      kind: CompletionItemKind.Function,
      detail: detailForOverload(exp),
      insertText: label,
      sortText: `${sortPrefix}_${label}`,
    };
  }
  return {
    label,
    kind: CompletionItemKind.Variable,
    detail: exp.valueType,
    insertText: label,
    sortText: `${sortPrefix}_${label}`,
  };
}

function symbolToCompletion(sym: SymbolInfo, label = sym.name, sortPrefix = '0'): CompletionItem {
  let kind = CompletionItemKind.Variable;
  if (sym.kind === 'function') kind = CompletionItemKind.Function;
  else if (sym.kind === 'type') kind = CompletionItemKind.Class;
  return {
    label,
    kind,
    detail: detailForSymbol(sym),
    insertText: label,
    sortText: `${sortPrefix}_${label}`,
  };
}

function keywordToCompletion(label: string, sortPrefix = '9'): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Keyword,
    insertText: label,
    sortText: `${sortPrefix}_${label}`,
  };
}

function filterByPrefix(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  const lower = prefix.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().startsWith(lower));
}

function dedupeItems(items: CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>();
  const out: CompletionItem[] = [];
  for (const item of items) {
    const key = `${item.kind ?? ''}:${item.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extractPatternBindings(pattern: LuminaMatchPattern): ScopeBinding[] {
  switch (pattern.type) {
    case 'BindingPattern':
      return [{ name: pattern.name, kind: CompletionItemKind.Variable }];
    case 'RefBindingPattern':
      return [{ name: pattern.name, kind: CompletionItemKind.Variable }];
    case 'TuplePattern':
      return pattern.elements.flatMap(extractPatternBindings);
    case 'EnumPattern':
      return (pattern.patterns ?? []).flatMap(extractPatternBindings);
    case 'StructPattern':
      return pattern.fields.flatMap((field) => extractPatternBindings(field.pattern));
    default:
      return [];
  }
}

function collectVisibleLocals(program: LuminaProgram | null, position: Position): ScopeBinding[] {
  if (!program) return [];
  const collected: ScopeBinding[] = [];

  const collectBlock = (block: LuminaBlock | null | undefined): boolean => {
    if (!block || !locationContains(block.location, position)) return false;
    collectStatements(block.body);
    return true;
  };

  const collectStatements = (statements: LuminaStatement[]) => {
    for (const stmt of statements) {
      if (startsAfter(stmt.location, position)) break;
      switch (stmt.type) {
        case 'Let':
          collected.push({
            name: stmt.name,
            kind: CompletionItemKind.Variable,
            detail: stmt.typeName ?? undefined,
          });
          break;
        case 'LetTuple':
          for (const name of stmt.names) {
            collected.push({ name, kind: CompletionItemKind.Variable });
          }
          break;
        case 'Block':
          if (collectBlock(stmt)) return;
          break;
        case 'If':
          if (collectBlock(stmt.thenBlock)) return;
          if (collectBlock(stmt.elseBlock ?? undefined)) return;
          break;
        case 'While':
          if (collectBlock(stmt.body)) return;
          break;
        case 'For':
          if (locationContains(stmt.body.location, position)) {
            collected.push({ name: stmt.iterator, kind: CompletionItemKind.Variable });
            collectStatements(stmt.body.body);
            return;
          }
          break;
        case 'IfLet':
          if (locationContains(stmt.thenBlock.location, position)) {
            collected.push(...extractPatternBindings(stmt.pattern));
            collectStatements(stmt.thenBlock.body);
            return;
          }
          if (collectBlock(stmt.elseBlock ?? undefined)) return;
          break;
        case 'WhileLet':
          if (locationContains(stmt.body.location, position)) {
            collected.push(...extractPatternBindings(stmt.pattern));
            collectStatements(stmt.body.body);
            return;
          }
          break;
        case 'MatchStmt':
          for (const arm of stmt.arms) {
            if (locationContains(arm.body.location, position)) {
              collected.push(...extractPatternBindings(arm.pattern));
              collectStatements(arm.body.body);
              return;
            }
          }
          break;
        default:
          break;
      }
    }
  };

  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl' && locationContains(stmt.body.location, position)) {
      for (const param of stmt.params) {
        collected.push({
          name: param.name,
          kind: CompletionItemKind.Variable,
          detail: param.typeName ?? undefined,
        });
      }
      collectStatements(stmt.body.body);
      break;
    }
  }

  return collected;
}

function resolveFieldType(symbols: SymbolTable | undefined, typeName: string, field: string): string | null {
  if (!symbols) return null;
  const baseType = typeName.split('<')[0]?.trim() ?? typeName;
  const structSym = symbols.get(baseType);
  return structSym?.structFields?.get(field) ?? null;
}

function resolveMethodReturnType(symbols: SymbolTable | undefined, typeName: string, method: string): string | null {
  if (!symbols) return null;
  const baseType = typeName.split('<')[0]?.trim() ?? typeName;
  const methodSym = symbols.get(`${baseType}_${method}`);
  if (methodSym?.kind === 'function' && methodSym.type) return methodSym.type;
  return null;
}

function resolveCallableReturnType(
  name: string,
  options: CompletionOptions
): string | null {
  const binding = options.moduleBindings?.get(name);
  if (binding?.kind === 'function') return binding.returnType;
  if (binding?.kind === 'overloaded-function') return binding.variants[0]?.returnType ?? null;
  if (binding?.kind === 'value') return binding.valueType;

  const sym = options.symbols?.get(name);
  if (sym?.kind === 'function' && sym.type) return sym.type;
  if (sym?.kind === 'variable' && sym.type) return sym.type;

  const imported = options.resolveImportedSymbol?.(name);
  if (imported?.kind === 'function' && imported.type) return imported.type;
  if (imported?.kind === 'variable' && imported.type) return imported.type;

  const prelude = (options.preludeExportMap ?? defaultPreludeExportMap).get(name);
  if (prelude?.kind === 'function') return prelude.returnType;
  if (prelude?.kind === 'overloaded-function') return prelude.variants[0]?.returnType ?? null;
  if (prelude?.kind === 'value') return prelude.valueType;

  return null;
}

function findLocalBindingType(
  options: CompletionOptions,
  name: string
): string | null {
  const local = collectVisibleLocals(options.ast as LuminaProgram | null, options.position).find((binding) => binding.name === name);
  if (local?.detail) return local.detail;
  const sym = options.symbols?.get(name);
  if (sym?.type) return sym.type;
  return null;
}

function resolveChainTarget(
  chain: MemberChain,
  options: CompletionOptions
): { kind: 'module'; module: ModuleNamespace } | { kind: 'type'; typeName: string } | null {
  if (chain.length === 0) return null;
  let current:
    | { kind: 'module'; module: ModuleNamespace }
    | { kind: 'type'; typeName: string }
    | null = null;

  const first = chain[0];
  const firstBinding = options.moduleBindings?.get(first.name);
  if (!first.call && firstBinding?.kind === 'module') {
    current = { kind: 'module', module: firstBinding };
  } else {
    const initialType = first.call ? resolveCallableReturnType(first.name, options) : findLocalBindingType(options, first.name);
    if (initialType) {
      current = { kind: 'type', typeName: initialType };
    } else if (!first.call && firstBinding?.kind === 'value') {
      current = { kind: 'type', typeName: firstBinding.valueType };
    }
  }

  for (let i = 1; i < chain.length && current; i += 1) {
    const segment = chain[i];
    if (current.kind === 'module') {
      const exp = current.module.exports.get(segment.name);
      if (!exp) return null;
      if (segment.call) {
        if (exp.kind === 'function') {
          current = { kind: 'type', typeName: exp.returnType };
          continue;
        }
        if (exp.kind === 'overloaded-function') {
          current = { kind: 'type', typeName: exp.variants[0]?.returnType ?? 'any' };
          continue;
        }
        return null;
      }
      if (exp.kind === 'module') {
        current = { kind: 'module', module: exp };
      } else if (exp.kind === 'value') {
        current = { kind: 'type', typeName: exp.valueType };
      } else if (exp.kind === 'function') {
        current = { kind: 'type', typeName: exp.returnType };
      } else if (exp.kind === 'overloaded-function') {
        current = { kind: 'type', typeName: exp.variants[0]?.returnType ?? 'any' };
      }
      continue;
    }

    if (segment.call) {
      const methodReturn = resolveMethodReturnType(options.symbols, current.typeName, segment.name);
      if (!methodReturn) return null;
      current = { kind: 'type', typeName: methodReturn };
      continue;
    }

    const fieldType = resolveFieldType(options.symbols, current.typeName, segment.name);
    if (!fieldType) return null;
    current = { kind: 'type', typeName: fieldType };
  }

  return current;
}

function collectTypeMembers(typeName: string, options: CompletionOptions): CompletionItem[] {
  const symbols = options.symbols;
  if (!symbols) return [];
  const baseType = typeName.split('<')[0]?.trim() ?? typeName;
  const structSym = symbols.get(baseType);
  const items: CompletionItem[] = [];

  for (const [field, fieldType] of structSym?.structFields ?? []) {
    items.push({
      label: field,
      kind: CompletionItemKind.Field,
      detail: fieldType,
      insertText: field,
      sortText: `1_${field}`,
    });
  }

  for (const sym of symbols.list()) {
    if (sym.kind !== 'function') continue;
    if (!sym.name.startsWith(`${baseType}_`)) continue;
    const methodName = sym.name.slice(baseType.length + 1);
    items.push({
      label: methodName,
      kind: CompletionItemKind.Method,
      detail: detailForSymbol(sym),
      insertText: methodName,
      sortText: `1_${methodName}`,
    });
  }

  return dedupeItems(items);
}

function collectNamespaceItems(base: string, options: CompletionOptions): CompletionItem[] {
  const binding = options.moduleBindings?.get(base);
  if (binding?.kind === 'module') {
    return Array.from(binding.exports.entries()).map(([label, exp]) =>
      moduleExportToCompletion(label, exp, '1')
    );
  }

  const sym =
    options.symbols?.get(base) ??
    options.resolveImportedSymbol?.(base);
  if (sym?.enumVariants) {
    return sym.enumVariants.map((variant) => ({
      label: variant.name,
      kind: CompletionItemKind.EnumMember,
      detail: variant.resultType ?? sym.name,
      insertText: variant.name,
      sortText: `1_${variant.name}`,
    }));
  }

  return [];
}

function collectScopeItems(options: CompletionOptions): CompletionItem[] {
  const items: CompletionItem[] = [];
  const locals = collectVisibleLocals(options.ast as LuminaProgram | null, options.position);

  for (const local of locals) {
    items.push({
      label: local.name,
      kind: local.kind,
      detail: local.detail,
      insertText: local.name,
      sortText: `0_${local.name}`,
    });
  }

  for (const sym of options.symbols?.list() ?? []) {
    if (sym.kind === 'function' && /^[A-Z][A-Za-z0-9]*_/.test(sym.name)) continue;
    items.push(symbolToCompletion(sym, sym.name, '2'));
  }

  for (const [name, binding] of options.moduleBindings ?? []) {
    items.push(moduleExportToCompletion(name, binding, '1'));
  }

  for (const [name, exp] of options.preludeExportMap ?? defaultPreludeExportMap) {
    items.push(moduleExportToCompletion(name, exp, '3'));
  }

  return dedupeItems(items);
}

function collectImportPathItems(options: CompletionOptions): CompletionItem[] {
  const registry = options.moduleRegistry ?? defaultModuleRegistry;
  const items: CompletionItem[] = [];

  for (const key of registry.keys()) {
    if (key === '@prelude') continue;
    items.push({
      label: key,
      kind: CompletionItemKind.Module,
      detail: 'stdlib module',
      insertText: key,
      sortText: `0_${key}`,
    });
  }

  if (options.project && options.uri) {
    for (const doc of options.project.listDocuments()) {
      if (doc.uri === options.uri) continue;
      let label: string | null = null;
      if (options.uri.startsWith('virtual://') && doc.uri.startsWith('virtual://')) {
        const current = options.uri.replace(/^virtual:\/\//, '');
        const target = doc.uri.replace(/^virtual:\/\//, '');
        const currentDir = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : '';
        const relative = currentDir ? requireRelativeVirtualPath(currentDir, target) : `./${target}`;
        label = relative;
      } else if (options.uri.startsWith('file://') && doc.uri.startsWith('file://')) {
        const currentFs = URI.parse(options.uri).fsPath;
        const targetFs = URI.parse(doc.uri).fsPath;
        const relative = normalizeRelativePath(currentFs, targetFs);
        label = relative;
      }
      if (!label) continue;
      items.push({
        label,
        kind: CompletionItemKind.File,
        insertText: label,
        sortText: `1_${label}`,
      });
    }
  }

  return dedupeItems(items);
}

function requireRelativeVirtualPath(currentDir: string, target: string): string {
  const currentParts = currentDir.split('/').filter(Boolean);
  const targetParts = target.split('/').filter(Boolean);
  while (currentParts.length > 0 && targetParts.length > 0 && currentParts[0] === targetParts[0]) {
    currentParts.shift();
    targetParts.shift();
  }
  const prefix = currentParts.map(() => '..');
  const relative = [...prefix, ...targetParts].join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function normalizeRelativePath(currentFs: string, targetFs: string): string {
  const currentDir = path.dirname(currentFs);
  let relative = path.relative(currentDir, targetFs).replace(/\\/g, '/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

function collectImportNameItems(source: string, options: CompletionOptions): CompletionItem[] {
  const registry = options.moduleRegistry ?? defaultModuleRegistry;
  const mod = registry.get(source);
  if (mod) {
    return Array.from(mod.exports.entries()).map(([label, exp]) => moduleExportToCompletion(label, exp, '0'));
  }

  if (options.project && options.uri) {
    const resolvedUri = options.project.resolveImportUri(options.uri, source);
    const symbols = options.project.getSymbols(resolvedUri);
    if (symbols) {
      return symbols
        .list()
        .filter((sym) => sym.visibility !== 'private')
        .map((sym) => symbolToCompletion(sym, sym.name, '0'));
    }
  }

  return [];
}

function collectKeywordItems(): CompletionItem[] {
  return luminaKeywords.map((keyword) => keywordToCompletion(keyword));
}

export function resolveCompletions(options: CompletionOptions): CompletionItem[] {
  const context = getCompletionContext(options.doc, options.position);
  if (!context) return [];

  switch (context.kind) {
    case 'member': {
      const target = resolveChainTarget(context.chain, options);
      if (!target) return [];
      return target.kind === 'module'
        ? dedupeItems(Array.from(target.module.exports.entries()).map(([label, exp]) => moduleExportToCompletion(label, exp, '0')))
        : collectTypeMembers(target.typeName, options);
    }
    case 'namespace':
      return collectNamespaceItems(context.base, options);
    case 'import-path':
      return filterByPrefix(collectImportPathItems(options), context.prefix);
    case 'import-names':
      return filterByPrefix(collectImportNameItems(context.source, options), context.prefix);
    case 'scope': {
      const scopeItems = filterByPrefix(collectScopeItems(options), context.prefix);
      const keywordItems = filterByPrefix(collectKeywordItems(), context.prefix);
      return dedupeItems([...scopeItems, ...keywordItems]);
    }
    default:
      return [];
  }
}

export function buildCompletionItems(options: CompletionOptions): CompletionItem[] {
  return resolveCompletions(options);
}
