import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type CompiledGrammar } from '../grammar/index.js';
import { extractImports } from './imports.js';
import { parseWithPanicRecovery, type PanicRecoveryOptions } from './panic.js';
import { type Diagnostic } from '../parser/index.js';
import { type Location } from '../utils/index.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { analyzeLumina, type SymbolTable as LuminaSymbolTable } from '../lumina/semantic.js';

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

  constructor(parser?: CompiledGrammar<unknown>, recoveryOptions: PanicRecoveryOptions = {}) {
    this.parser = parser ?? null;
    this.recoveryOptions = {
      syncTokenTypes: luminaSyncTokenTypes,
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
  }

  addOrUpdateDocument(uri: string, text: string, version: number = 1) {
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
    };
    this.documents.set(normalizedUri, doc);
    this.graph.set(normalizedUri, imports.map((imp) => this.resolveImport(fsPath, imp)));
    for (const dep of this.graph.get(normalizedUri)) {
      this.ensureDocumentLoaded(dep);
    }
    this.parseDocument(normalizedUri);
  }

  removeDocument(uri: string) {
    const normalized = this.toUri(this.toFsPath(uri));
    this.documents.delete(normalized);
    this.graph.set(normalized, []);
  }

  parseDocument(uri: string) {
    const normalized = this.toUri(this.toFsPath(uri));
    const doc = this.documents.get(normalized);
    if (!doc || !this.parser) return;
    const result = parseWithPanicRecovery(this.parser, doc.text, this.recoveryOptions);
    doc.diagnostics = result.diagnostics;
    doc.ast = undefined;
    doc.references = undefined;
    doc.importedNames = undefined;
    if (result.result && typeof result.result === 'object' && 'success' in result.result && (result.result as { success: boolean }).success) {
      const payload = (result.result as { result: unknown }).result ?? result.result;
      if (payload && typeof payload === 'object' && 'type' in (payload as object)) {
        doc.ast = payload;
        const analysis = analyzeLumina(payload as never);
        doc.symbols = analysis.symbols;
        doc.diagnostics.push(...analysis.diagnostics);
        doc.references = collectReferences(payload as never);
        doc.importedNames = collectImportNames(payload as never);
      }
    }
    doc.diagnostics.push(...lintMissingSemicolons(doc.text));
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

  getDependents(uri: string): string[] {
    const normalized = this.toUri(this.toFsPath(uri));
    return this.graph.getDependents(normalized);
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
    if (imp.startsWith('.')) {
      const base = path.dirname(fromFsPath);
      const resolved = path.resolve(base, imp);
      const withExt = this.ensureExtension(resolved);
      return this.toUri(withExt);
    }
    return imp;
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

  private toFsPath(uriOrPath: string): string {
    if (uriOrPath.startsWith('file://')) {
      return fileURLToPath(uriOrPath);
    }
    return uriOrPath;
  }

  private toUri(pathOrUri: string): string {
    if (pathOrUri.startsWith('file://')) return pathOrUri;
    return pathToFileURL(pathOrUri).toString();
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
    const node = expr as { type?: string; name?: string; left?: unknown; right?: unknown; value?: unknown; location?: Location };
    switch (node.type) {
      case 'Identifier':
        if (node.name) add(node.name, node.location);
        return;
      case 'Binary':
        walkExpr(node.left);
        walkExpr(node.right);
        return;
      case 'Number':
      case 'String':
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
