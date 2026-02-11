import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type CompiledGrammar } from '../grammar/index.js';
import { extractImports } from './imports.js';
import { parseWithPanicRecovery, type PanicRecoveryOptions } from './panic.js';
import { parseInput, ParserUtils, type Diagnostic } from '../parser/index.js';
import { type Location } from '../utils/index.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { analyzeLumina, type SymbolTable as LuminaSymbolTable, type SymbolInfo } from '../lumina/semantic.js';
import { type LuminaType } from '../lumina/ast.js';

export interface SourceDocument {
  uri: string;
  fsPath: string;
  text: string;
  version: number;
  imports: string[];
  diagnostics: Diagnostic[];
  symbols?: LuminaSymbolTable;
  ast?: unknown;
  references?: Map<string, Location[]>;
  importedNames?: Set<string>;
  signatures?: Map<string, string>;
  functionHashes?: Map<string, string>;
  inferredReturns?: Map<string, LuminaType>;
}

export interface SignatureChange {
  signatureChanged: boolean;
  changedSymbols: string[];
}

export class DependencyGraph {
  private edges = new Map<string, Set<string>>();

  set(file: string, deps: string[]) {
    this.edges.set(file, new Set(deps));
  }

  get(file: string): string[] {
    return Array.from(this.edges.get(file) ?? []);
  }

  getDependents(target: string): string[] {
    const dependents: string[] = [];
    for (const [file, deps] of this.edges.entries()) {
      if (deps.has(target)) dependents.push(file);
    }
    return dependents;
  }
}

export class ProjectContext {
  private documents = new Map<string, SourceDocument>();
  private graph = new DependencyGraph();
  private parser: CompiledGrammar<unknown> | null = null;
  private recoveryOptions: PanicRecoveryOptions;
  private luminaLexer = createLuminaLexer();
  private loading = new Set<string>();
  private virtualFiles = new Map<string, string>();
  private debugIncremental = false;
  private preludeSymbols: LuminaSymbolTable | null = null;
  private preludeNames = new Set<string>();
  private preludeLoaded = false;
  private preludePath = path.resolve('std/prelude.lm');

  constructor(
    parser?: CompiledGrammar<unknown>,
    recoveryOptions: PanicRecoveryOptions = {},
    virtualFiles?: Map<string, string> | Record<string, string>,
    options?: { debugIncremental?: boolean }
  ) {
    this.parser = parser ?? null;
    this.debugIncremental = options?.debugIncremental ?? false;
    if (virtualFiles) {
      if (virtualFiles instanceof Map) {
        for (const [spec, text] of virtualFiles.entries()) {
          this.virtualFiles.set(this.normalizeVirtualSpec(spec), text);
        }
      } else {
        for (const [spec, text] of Object.entries(virtualFiles)) {
          this.virtualFiles.set(this.normalizeVirtualSpec(spec), text);
        }
      }
    }
    this.recoveryOptions = {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: [
        'import',
        'type',
        'struct',
        'enum',
        'fn',
        'let',
        'return',
        'if',
        'else',
        'for',
        'while',
        'match',
        'extern',
        'pub',
      ],
      lexer: (input: string) => {
        const lexer = this.luminaLexer.reset(input);
        return {
          [Symbol.iterator]: function* () {
            for (const token of lexer as Iterable<LuminaToken>) {
              yield token;
            }
          },
        };
      },
      ...recoveryOptions,
    };
  }

  setParser(parser: CompiledGrammar<unknown>) {
    this.parser = parser;
    this.ensurePreludeLoaded();
  }

  setIncrementalDebug(enabled: boolean) {
    this.debugIncremental = enabled;
  }

  registerVirtualFile(spec: string, text: string, version: number = 1) {
    const normalized = this.normalizeVirtualSpec(spec);
    this.virtualFiles.set(normalized, text);
    const uri = this.virtualUriFor(normalized);
    this.addOrUpdateDocument(uri, text, version);
  }

  addOrUpdateDocument(uri: string, text: string, version: number = 1): SignatureChange {
    this.ensurePreludeLoaded();
    const fsPath = this.toFsPath(uri);
    const normalizedUri = this.toUri(fsPath);
    const imports = extractImports(text);
      const existing = this.documents.get(normalizedUri);
      const doc: SourceDocument = {
        uri: normalizedUri,
        fsPath,
        text,
        version: existing ? existing.version + 1 : version,
        imports,
        diagnostics: [],
        signatures: existing?.signatures,
        functionHashes: existing?.functionHashes,
        inferredReturns: existing?.inferredReturns,
      };
    this.documents.set(normalizedUri, doc);
    this.graph.set(normalizedUri, imports.map((imp) => this.resolveImport(fsPath, imp)));
    for (const dep of this.graph.get(normalizedUri)) {
      this.ensureDocumentLoaded(dep);
    }
    const { signatureChanged, changedSymbols } = this.parseDocument(normalizedUri);
    return { signatureChanged, changedSymbols };
  }

  removeDocument(uri: string) {
    const normalized = this.toUri(this.toFsPath(uri));
    this.documents.delete(normalized);
    this.graph.set(normalized, []);
  }

  parseDocument(uri: string): SignatureChange {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc || !this.parser) return { signatureChanged: false, changedSymbols: [] };
    const result = parseWithPanicRecovery(this.parser, doc.text, this.recoveryOptions);
    doc.diagnostics = result.diagnostics;
    doc.ast = undefined;
    doc.references = undefined;
    doc.importedNames = undefined;
    const prevSignatures = doc.signatures ?? new Map<string, string>();
    let signatureChanged = false;
    let changedSymbols: string[] = [];
    if (result.result && typeof result.result === 'object' && 'success' in result.result && (result.result as { success: boolean }).success) {
      const payload = (result.result as { result: unknown }).result ?? result.result;
      if (payload && typeof payload === 'object' && 'type' in (payload as object)) {
        doc.ast = payload;
        const nextFunctionHashes = collectFunctionBodyHashes(payload as never, doc.text);
        const prevFunctionHashes = doc.functionHashes ?? new Map<string, string>();
        const skipFunctionBodies = new Set<string>();
        for (const [name, hash] of nextFunctionHashes.entries()) {
          const prev = prevFunctionHashes.get(name);
          if (prev && prev === hash) {
            skipFunctionBodies.add(name);
          }
        }
        const cachedReturns = doc.inferredReturns ?? new Map<string, LuminaType>();
        const nextSignatures = collectSignatures(payload as never);
        changedSymbols = diffSignatureNames(prevSignatures, nextSignatures);
        signatureChanged = changedSymbols.length > 0;
        doc.signatures = nextSignatures;
        doc.functionHashes = nextFunctionHashes;
        if (this.debugIncremental && skipFunctionBodies.size > 0) {
          // eslint-disable-next-line no-console -- debug-only logging
          console.log(`[ProjectContext] Skipping ${skipFunctionBodies.size} function bodies in ${normalized}: ${Array.from(skipFunctionBodies).join(', ')}`);
        }
        const rawImports = collectImportNames(payload as never);
        const importedNames = new Set<string>(rawImports);
        for (const name of this.preludeNames) {
          importedNames.add(name);
        }
        doc.importedNames = importedNames;
        const analysis = analyzeLumina(payload as never, {
          currentUri: normalized,
          externSymbols: (name: string) => {
            const prelude = this.preludeSymbols?.get(name);
            if (prelude) return prelude as SymbolInfo;
            if (!rawImports.has(name)) return undefined;
            return this.getExternalSymbol(name);
          },
          externalSymbols: [
            ...this.getExternalSymbols(rawImports, normalized),
            ...(this.preludeSymbols ? this.preludeSymbols.list() : []),
          ],
          importedNames,
          skipFunctionBodies,
          cachedFunctionReturns: cachedReturns,
        });
        doc.symbols = analysis.symbols;
        doc.inferredReturns = new Map<string, LuminaType>();
        for (const sym of analysis.symbols.list()) {
          if (sym.kind === 'function' && sym.type) {
            doc.inferredReturns.set(sym.name, sym.type);
          }
        }
        doc.diagnostics.push(...analysis.diagnostics);
        doc.references = collectReferences(payload as never);
      }
    }
    doc.diagnostics.push(...lintMissingSemicolons(doc.text));
    return { signatureChanged, changedSymbols };
  }

  parseAll() {
    for (const uri of this.documents.keys()) {
      this.parseDocument(uri);
    }
  }

  getDiagnostics(uri?: string): Diagnostic[] {
    if (uri) {
      const normalized = this.toUri(this.toFsPath(uri));
      return this.documents.get(normalized)?.diagnostics ?? [];
    }
    const all: Diagnostic[] = [];
    for (const doc of this.documents.values()) {
      all.push(...doc.diagnostics);
    }
    return all;
  }

  getDependencies(uri: string): string[] {
    const normalized = this.toUri(this.toFsPath(uri));
    return this.graph.get(normalized);
  }

  getSymbols(uri: string): LuminaSymbolTable | undefined {
    const normalized = this.toUri(this.toFsPath(uri));
    return this.documents.get(normalized)?.symbols;
  }

  getDocumentAst(uri: string): unknown | undefined {
    const normalized = this.toUri(this.toFsPath(uri));
    return this.documents.get(normalized)?.ast;
  }

  getDependents(uri: string): string[] {
    const normalized = this.toUri(this.toFsPath(uri));
    return this.graph.getDependents(normalized);
  }

  getDependentsForSymbols(uri: string, symbols: string[]): string[] {
    const normalized = this.toUri(this.toFsPath(uri));
    const dependents = this.graph.getDependents(normalized);
    if (symbols.length === 0) return dependents;
    return dependents.filter((dep) => {
      const doc = this.documents.get(dep);
      if (!doc || !doc.importedNames) return true;
      for (const name of symbols) {
        if (doc.importedNames.has(name)) return true;
      }
      return false;
    });
  }

  indexDocument(uri: string) {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc || !this.parser) return;
    const result = parseWithPanicRecovery(this.parser, doc.text, this.recoveryOptions);
    if (!result.result || typeof result.result !== 'object' || !('success' in result.result) || !(result.result as { success: boolean }).success) {
      return;
    }
    const payload = (result.result as { result: unknown }).result ?? result.result;
    if (!payload || typeof payload !== 'object' || !('type' in (payload as object))) return;
    doc.ast = payload;
    const rawImports = collectImportNames(payload as never);
    const importedNames = new Set<string>(rawImports);
    for (const name of this.preludeNames) {
      importedNames.add(name);
    }
    doc.importedNames = importedNames;
    const analysis = analyzeLumina(payload as never, {
      currentUri: normalized,
      externSymbols: (name: string) => {
        const prelude = this.preludeSymbols?.get(name);
        if (prelude) return prelude as SymbolInfo;
        if (!rawImports.has(name)) return undefined;
        return this.getExternalSymbol(name);
      },
      externalSymbols: [
        ...this.getExternalSymbols(rawImports, normalized),
        ...(this.preludeSymbols ? this.preludeSymbols.list() : []),
      ],
      importedNames,
      indexingOnly: true,
    });
    doc.symbols = analysis.symbols;
  }

  listDocuments(): SourceDocument[] {
    return Array.from(this.documents.values());
  }

  findSymbolLocation(name: string, uri?: string): { uri: string; location: Location } | null {
    if (uri) {
      const normalized = this.toUri(this.toFsPath(uri));
      const doc = this.documents.get(normalized);
      const sym = doc?.symbols?.get(name);
      if (sym?.location) return { uri: normalized, location: sym.location };
    }
    for (const doc of this.documents.values()) {
      const sym = doc.symbols?.get(name);
      if (sym?.location) return { uri: doc.uri, location: sym.location };
    }
    return null;
  }

  hasSymbolGlobal(name: string, exclude?: { uri: string; location?: Location }): boolean {
    for (const doc of this.documents.values()) {
      const sym = doc.symbols?.get(name);
      if (!sym) continue;
      if (exclude && exclude.uri === doc.uri && exclude.location && sym.location) {
        if (
          sym.location.start.line === exclude.location.start.line &&
          sym.location.start.column === exclude.location.start.column
        ) {
          continue;
        }
      }
      return true;
    }
    return false;
  }

  hasImportNameGlobal(name: string): boolean {
    for (const doc of this.documents.values()) {
      if (doc.importedNames?.has(name)) return true;
    }
    return false;
  }

  hasImportNameInDoc(name: string, uri: string): boolean {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    return doc?.importedNames?.has(name) ?? false;
  }

  findReferences(name: string): Array<{ uri: string; location: Location }> {
    const results: Array<{ uri: string; location: Location }> = [];
    for (const doc of this.documents.values()) {
      const refs = doc.references?.get(name) ?? [];
      for (const location of refs) {
        results.push({ uri: doc.uri, location });
      }
    }
    return results;
  }

  findLocalBindingAt(
    uri: string,
    position: { line: number; character: number }
  ): { name: string; location: Location; scopeRange: Location } | null {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc || !doc.ast) return null;
    const pos = { line: position.line + 1, column: position.character + 1 };
    const program = doc.ast as { body?: unknown[] };
    if (!Array.isArray(program.body)) return null;

    for (const stmt of program.body) {
      const fn = stmt as { type?: string; params?: Array<{ name: string; location?: Location }>; body?: { body?: unknown[]; location?: Location } };
      if (fn.type !== 'FnDecl' || !fn.body?.location) continue;
      const scopeRange = fn.body.location;
      if (fn.params) {
        for (const param of fn.params) {
          if (param.location && locationContains(param.location, pos)) {
            return { name: param.name, location: param.location, scopeRange };
          }
        }
      }
      const body = fn.body.body ?? [];
      for (const bodyStmt of body) {
        const letStmt = bodyStmt as { type?: string; name?: string; location?: Location };
        if (letStmt.type === 'Let' && letStmt.location && locationContains(letStmt.location, pos)) {
          return { name: letStmt.name ?? '', location: letStmt.location, scopeRange };
        }
      }
    }
    return null;
  }

  hasLocalConflictInScope(
    newName: string,
    uri: string,
    scopeRange: Location,
    excludeLocation?: Location
  ): boolean {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc || !doc.ast) return false;
    const program = doc.ast as { body?: unknown[] };
    if (!Array.isArray(program.body)) return false;

    for (const stmt of program.body) {
      const fn = stmt as { type?: string; params?: Array<{ name: string; location?: Location }>; body?: { body?: unknown[]; location?: Location } };
      if (fn.type !== 'FnDecl' || !fn.body?.location) continue;
      if (!locationsEqual(fn.body.location, scopeRange)) continue;
      if (fn.params) {
        for (const param of fn.params) {
          if (!param.location) continue;
          if (excludeLocation && locationsEqual(param.location, excludeLocation)) continue;
          if (param.name === newName) return true;
        }
      }
      const body = fn.body.body ?? [];
      for (const bodyStmt of body) {
        const letStmt = bodyStmt as { type?: string; name?: string; location?: Location };
        if (letStmt.type !== 'Let' || !letStmt.location) continue;
        if (excludeLocation && locationsEqual(letStmt.location, excludeLocation)) continue;
        if (letStmt.name === newName) return true;
      }
    }

    return false;
  }

  findReferencesInScope(
    name: string,
    uri: string,
    scopeRange: Location
  ): Array<{ uri: string; location: Location }> {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc) return [];
    const refs = doc.references?.get(name) ?? [];
    return refs
      .filter((loc) => locationContains(scopeRange, { line: loc.start.line, column: loc.start.column }))
      .map((location) => ({ uri: normalized, location }));
  }

  private resolveImport(fromFsPath: string, imp: string): string {
    if (fromFsPath.startsWith('virtual://')) {
      if (imp.startsWith('.')) {
        const base = this.normalizeVirtualSpec(fromFsPath);
        const baseDir = path.posix.dirname(base);
        const resolved = path.posix.normalize(path.posix.join(baseDir, imp));
        const withExt = this.ensureVirtualExtension(resolved);
        return this.virtualUriFor(withExt);
      }
      const virtualTarget = this.resolveVirtualSpec(imp);
      if (virtualTarget) return this.virtualUriFor(virtualTarget);
      return imp;
    }
    if (imp.startsWith('.')) {
      const base = path.dirname(fromFsPath);
      const resolved = path.resolve(base, imp);
      const withExt = this.ensureExtension(resolved);
      return this.toUri(withExt);
    }
    const virtualTarget = this.resolveVirtualSpec(imp);
    if (virtualTarget) return this.virtualUriFor(virtualTarget);
    return imp;
  }

  private getExternalSymbol(name: string): import('../lumina/semantic.js').SymbolInfo | undefined {
    for (const doc of this.documents.values()) {
      const sym = doc.symbols?.get(name);
      if (sym) return sym as import('../lumina/semantic.js').SymbolInfo;
    }
    return undefined;
  }

  private getExternalSymbols(names: Set<string>, currentUri: string): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    for (const name of names) {
      for (const doc of this.documents.values()) {
        if (doc.uri === currentUri) continue;
        const sym = doc.symbols?.get(name);
        if (sym) {
          results.push(sym as SymbolInfo);
          break;
        }
      }
    }
    return results;
  }

  private ensureExtension(resolved: string): string {
    if (path.extname(resolved)) return resolved;
    const candidates = ['.lum', '.lumina'].map((ext) => resolved + ext);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return resolved + '.lum';
  }

  private ensureDocumentLoaded(uri: string) {
    if (this.documents.has(uri)) return;
    if (uri.startsWith('virtual://')) {
      if (this.loading.has(uri)) return;
      const spec = this.normalizeVirtualSpec(uri);
      const text = this.virtualFiles.get(spec);
      if (!text) return;
      try {
        this.loading.add(uri);
        this.addOrUpdateDocument(uri, text, 1);
      } finally {
        this.loading.delete(uri);
      }
      return;
    }
    if (!uri.startsWith('file://')) return;
    if (this.loading.has(uri)) return;
    const fsPath = this.toFsPath(uri);
    if (!fs.existsSync(fsPath)) return;
    try {
      this.loading.add(uri);
      const text = fs.readFileSync(fsPath, 'utf-8');
      this.addOrUpdateDocument(uri, text, 1);
    } finally {
      this.loading.delete(uri);
    }
  }

  private ensurePreludeLoaded() {
    if (this.preludeLoaded) return;
    if (!this.parser) return;
    this.preludeLoaded = true;
    if (!fs.existsSync(this.preludePath)) return;
    try {
      const text = fs.readFileSync(this.preludePath, 'utf-8');
      const parsed = parseInput(this.parser, text);
      if (ParserUtils.isParseError(parsed)) return;
      const ast = (parsed as { result: unknown }).result;
      const analysis = analyzeLumina(ast as never, {
        currentUri: this.toUri(this.preludePath),
      });
      this.preludeSymbols = analysis.symbols;
      this.preludeNames = new Set(analysis.symbols.list().map((sym) => sym.name));
    } catch {
      // ignore prelude load errors
    }
  }

  private toFsPath(uriOrPath: string): string {
    if (uriOrPath.startsWith('file://')) {
      return fileURLToPath(uriOrPath);
    }
    if (uriOrPath.startsWith('virtual://')) {
      return uriOrPath;
    }
    return uriOrPath;
  }

  private toUri(pathOrUri: string): string {
    if (pathOrUri.startsWith('file://')) return pathOrUri;
    if (pathOrUri.startsWith('virtual://')) return pathOrUri;
    return pathToFileURL(pathOrUri).toString();
  }

  private normalizeVirtualSpec(spec: string): string {
    return spec.startsWith('virtual://') ? spec.slice('virtual://'.length) : spec;
  }

  private virtualUriFor(spec: string): string {
    return `virtual://${this.normalizeVirtualSpec(spec)}`;
  }

  private resolveVirtualSpec(spec: string): string | null {
    const normalized = this.normalizeVirtualSpec(spec);
    if (this.virtualFiles.has(normalized)) return normalized;
    const withExt = this.ensureVirtualExtension(normalized);
    if (this.virtualFiles.has(withExt)) return withExt;
    return null;
  }

  private ensureVirtualExtension(resolved: string): string {
    if (path.extname(resolved)) return resolved;
    const candidates = ['.lum', '.lumina'].map((ext) => resolved + ext);
    for (const candidate of candidates) {
      if (this.virtualFiles.has(candidate)) return candidate;
    }
    return resolved + '.lum';
  }
}

function collectReferences(program: { type: string; body?: unknown[] }): Map<string, Location[]> {
  const refs = new Map<string, Location[]>();
  const add = (name: string, location?: Location) => {
    if (!location) return;
    const list = refs.get(name) ?? [];
    list.push(location);
    refs.set(name, list);
  };

  const walkExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object') return;
    const node = expr as { type?: string; name?: string; left?: unknown; right?: unknown; value?: unknown; location?: Location; callee?: unknown; args?: unknown[] };
    switch (node.type) {
      case 'Identifier':
        if (node.name) add(node.name, node.location);
        return;
      case 'Call': {
        const callee = node.callee as { name?: string; location?: Location } | undefined;
        if (callee?.name) add(callee.name, callee.location ?? node.location);
        if (Array.isArray(node.args)) node.args.forEach(walkExpr);
        return;
      }
      case 'Binary':
        walkExpr(node.left);
        walkExpr(node.right);
        return;
      case 'Number':
      case 'String':
      case 'Boolean':
        return;
      default:
        return;
    }
  };

  const walkStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object') return;
    const node = stmt as { type?: string; body?: unknown[]; expr?: unknown; value?: unknown };
    switch (node.type) {
      case 'FnDecl': {
        const bodyNode = (stmt as { body?: { body?: unknown[] } }).body;
        if (bodyNode?.body) bodyNode.body.forEach(walkStmt);
        return;
      }
      case 'If': {
        const ifNode = stmt as { condition?: unknown; thenBlock?: { body?: unknown[] }; elseBlock?: { body?: unknown[] } };
        if (ifNode.condition) walkExpr(ifNode.condition);
        if (ifNode.thenBlock?.body) ifNode.thenBlock.body.forEach(walkStmt);
        if (ifNode.elseBlock?.body) ifNode.elseBlock.body.forEach(walkStmt);
        return;
      }
      case 'While': {
        const whileNode = stmt as { condition?: unknown; body?: { body?: unknown[] } };
        if (whileNode.condition) walkExpr(whileNode.condition);
        if (whileNode.body?.body) whileNode.body.body.forEach(walkStmt);
        return;
      }
      case 'Assign': {
        const assignNode = stmt as { target?: { name?: string; location?: Location }; value?: unknown };
        if (assignNode.target?.name) add(assignNode.target.name, assignNode.target.location);
        if (assignNode.value) walkExpr(assignNode.value);
        return;
      }
      case 'Let':
        walkExpr(node.value);
        return;
      case 'Return':
        walkExpr(node.value);
        return;
      case 'ExprStmt':
        walkExpr(node.expr);
        return;
      case 'Block':
        if (node.body) node.body.forEach(walkStmt);
        return;
      default:
        return;
    }
  };

  if (program && Array.isArray(program.body)) {
    program.body.forEach(walkStmt);
  }

  return refs;
}

function collectImportNames(program: { type: string; body?: unknown[] }): Set<string> {
  const names = new Set<string>();
  if (!program || !Array.isArray(program.body)) return names;
  for (const stmt of program.body) {
    const node = stmt as { type?: string; spec?: unknown };
    if (node.type !== 'Import') continue;
    const spec = node.spec;
    if (Array.isArray(spec)) {
      for (const item of spec) {
        if (typeof item === 'string') names.add(item);
        else if (item && typeof item === 'object' && 'name' in (item as { name?: string })) {
          const name = (item as { name?: string }).name;
          if (name) names.add(name);
        }
      }
    } else if (typeof spec === 'string') {
      names.add(spec);
    } else if (spec && typeof spec === 'object' && 'name' in (spec as { name?: string })) {
      const name = (spec as { name?: string }).name;
      if (name) names.add(name);
    }
  }
  return names;
}

function collectSignatures(program: { type: string; body?: unknown[] }): Map<string, string> {
  const signatures = new Map<string, string>();
  if (!program || !Array.isArray(program.body)) return signatures;
  for (const stmt of program.body) {
    const node = stmt as {
      type?: string;
      name?: string;
      params?: Array<{ name: string; typeName: string }>;
      returnType?: string | null;
      visibility?: string;
      extern?: boolean;
      externModule?: string | null;
      body?: Array<{ name: string; typeName: string }>;
      typeParams?: Array<{ name: string; bound?: string[] }>;
      variants?: Array<{ name: string; params?: string[] }>;
    };
    if (node.type === 'FnDecl' && node.name) {
      const sig = JSON.stringify({
        params: node.params?.map((p) => ({ name: p.name, type: p.typeName })) ?? [],
        returnType: node.returnType ?? null,
        visibility: node.visibility ?? 'private',
        extern: node.extern ?? false,
        externModule: node.externModule ?? null,
        typeParams: node.typeParams ?? [],
      });
      signatures.set(`fn:${node.name}`, sig);
    }
    if (node.type === 'TypeDecl' && node.name) {
      const sig = JSON.stringify({
        fields: Array.isArray(node.body)
          ? node.body.map((f) => ({ name: f.name, type: f.typeName }))
          : [],
        visibility: node.visibility ?? 'private',
        extern: node.extern ?? false,
        externModule: node.externModule ?? null,
        typeParams: node.typeParams ?? [],
      });
      signatures.set(`type:${node.name}`, sig);
    }
    if (node.type === 'StructDecl' && node.name) {
      const sig = JSON.stringify({
        fields: Array.isArray(node.body)
          ? node.body.map((f) => ({ name: f.name, type: f.typeName }))
          : [],
        visibility: node.visibility ?? 'private',
        typeParams: node.typeParams ?? [],
      });
      signatures.set(`struct:${node.name}`, sig);
    }
    if (node.type === 'EnumDecl' && node.name) {
      const sig = JSON.stringify({
        variants: Array.isArray(node.variants)
          ? node.variants.map((v) => ({ name: v.name, params: v.params ?? [] }))
          : [],
        visibility: node.visibility ?? 'private',
        typeParams: node.typeParams ?? [],
      });
      signatures.set(`enum:${node.name}`, sig);
    }
  }
  return signatures;
}

function diffSignatureNames(a: Map<string, string>, b: Map<string, string>): string[] {
  const changed = new Set<string>();
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if (a.get(key) !== b.get(key)) {
      const idx = key.indexOf(':');
      const name = idx >= 0 ? key.slice(idx + 1) : key;
      changed.add(name);
    }
  }
  return Array.from(changed);
}

function collectFunctionBodyHashes(
  program: { type: string; body?: unknown[] },
  source: string
): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!program || !Array.isArray(program.body)) return hashes;
  for (const stmt of program.body) {
    const fn = stmt as { type?: string; name?: string; body?: { location?: Location } };
    if (fn.type !== 'FnDecl' || !fn.name) continue;
    const loc = fn.body?.location;
    let bodyText = '';
    if (loc?.start?.offset !== undefined && loc?.end?.offset !== undefined) {
      bodyText = source.slice(loc.start.offset, loc.end.offset);
    } else if (fn.body) {
      bodyText = JSON.stringify(fn.body);
    }
    hashes.set(fn.name, hashString(bodyText));
  }
  return hashes;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function lintMissingSemicolons(source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.endsWith(';') || line.endsWith('{') || line.endsWith('}') || line.endsWith(',')) continue;
    if (/^(let|return)\b/.test(line)) {
      const column = rawLine.length + 1;
      diagnostics.push({
        severity: 'warning',
        message: 'Missing semicolon',
        location: {
          start: { line: i + 1, column, offset: 0 },
          end: { line: i + 1, column, offset: 0 },
        },
        code: 'MISSING_SEMICOLON',
        source: 'lumina',
      });
    }
  }
  return diagnostics;
}

function locationContains(location: Location, pos: { line: number; column: number }): boolean {
  if (pos.line < location.start.line || pos.line > location.end.line) return false;
  if (pos.line === location.start.line && pos.column < location.start.column) return false;
  if (pos.line === location.end.line && pos.column > location.end.column) return false;
  return true;
}

function locationsEqual(a: Location, b: Location): boolean {
  return (
    a.start.line === b.start.line &&
    a.start.column === b.start.column &&
    a.end.line === b.end.line &&
    a.end.column === b.end.column
  );
}
