import { parseWithPanicRecovery, type PanicRecoveryOptions } from './panic.js';
import { extractImports } from './imports.js';
import { analyzeLumina, type SymbolTable as LuminaSymbolTable, type SymbolInfo } from '../lumina/semantic.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { type CompiledGrammar } from '../grammar/index.js';
import { type Location } from '../utils/index.js';
import { type Diagnostic } from '../parser/index.js';
import { type LuminaType } from '../lumina/ast.js';

export interface BrowserSourceDocument {
  uri: string;
  text: string;
  version: number;
  imports: string[];
  diagnostics: Diagnostic[];
  symbols?: LuminaSymbolTable;
  ast?: unknown;
  importedNames?: Set<string>;
  signatures?: Map<string, string>;
  functionHashes?: Map<string, string>;
  inferredReturns?: Map<string, LuminaType>;
}

export class BrowserProjectContext {
  private documents = new Map<string, BrowserSourceDocument>();
  private parser: CompiledGrammar<unknown> | null = null;
  private recoveryOptions: PanicRecoveryOptions;
  private luminaLexer = createLuminaLexer();
  private virtualFiles = new Map<string, string>();
  private preludeSymbols: LuminaSymbolTable | null = null;
  private preludeNames = new Set<string>();
  private preludeText: string | null = null;

  constructor(
    parser?: CompiledGrammar<unknown>,
    options: { preludeText?: string; recoveryOptions?: PanicRecoveryOptions } = {}
  ) {
    this.parser = parser ?? null;
    this.preludeText = options.preludeText ?? null;
    this.recoveryOptions = {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: ['import', 'type', 'struct', 'enum', 'fn', 'let', 'return', 'if', 'else', 'for', 'while', 'match', 'extern', 'pub'],
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
      ...(options.recoveryOptions ?? {}),
    };
    this.ensurePreludeLoaded();
  }

  setParser(parser: CompiledGrammar<unknown>) {
    this.parser = parser;
    this.ensurePreludeLoaded();
  }

  registerVirtualFile(spec: string, text: string, version: number = 1) {
    const normalized = this.normalizeVirtualSpec(spec);
    this.virtualFiles.set(normalized, text);
    const uri = this.virtualUriFor(normalized);
    this.addOrUpdateDocument(uri, text, version);
  }

  addOrUpdateDocument(uri: string, text: string, version: number = 1) {
    if (!this.parser) return;
    const normalized = this.toVirtualUri(uri);
    const imports = extractImports(text);
    const existing = this.documents.get(normalized);
    const doc: BrowserSourceDocument = {
      uri: normalized,
      text,
      version: existing ? existing.version + 1 : version,
      imports,
      diagnostics: [],
      signatures: existing?.signatures,
      functionHashes: existing?.functionHashes,
      inferredReturns: existing?.inferredReturns,
    };
    this.documents.set(normalized, doc);
    for (const dep of imports.map((imp) => this.resolveImport(normalized, imp))) {
      this.ensureDocumentLoaded(dep);
    }
    this.parseDocument(normalized);
  }

  getDiagnostics(uri: string): Diagnostic[] {
    return this.documents.get(this.toVirtualUri(uri))?.diagnostics ?? [];
  }

  getSymbols(uri: string): LuminaSymbolTable | undefined {
    return this.documents.get(this.toVirtualUri(uri))?.symbols;
  }

  getDocumentAst(uri: string): unknown | undefined {
    return this.documents.get(this.toVirtualUri(uri))?.ast;
  }

  private parseDocument(uri: string) {
    const doc = this.documents.get(this.toVirtualUri(uri));
    if (!doc || !this.parser) return;
    const result = parseWithPanicRecovery(this.parser, doc.text, this.recoveryOptions);
    doc.diagnostics = result.diagnostics;
    doc.ast = undefined;
    doc.importedNames = undefined;
    if (result.result && typeof result.result === 'object' && 'success' in result.result && (result.result as { success: boolean }).success) {
      const payload = (result.result as { result: unknown }).result ?? result.result;
      if (payload && typeof payload === 'object' && 'type' in (payload as object)) {
        doc.ast = payload;
        const nextHashes = collectFunctionBodyHashes(payload as never, doc.text);
        const prevHashes = doc.functionHashes ?? new Map<string, string>();
        const skipBodies = new Set<string>();
        for (const [name, hash] of nextHashes.entries()) {
          if (prevHashes.get(name) === hash) skipBodies.add(name);
        }
        const cachedReturns = doc.inferredReturns ?? new Map<string, LuminaType>();
        const rawImports = collectImportNames(payload as never);
        const importedNames = new Set<string>(rawImports);
        for (const name of this.preludeNames) importedNames.add(name);
        doc.importedNames = importedNames;

        const analysis = analyzeLumina(payload as never, {
          externSymbols: (name: string) => {
            const prelude = this.preludeSymbols?.get(name);
            if (prelude) return prelude as SymbolInfo;
            if (!rawImports.has(name)) return undefined;
            return this.getExternalSymbol(name);
          },
          externalSymbols: [
            ...(this.preludeSymbols ? this.preludeSymbols.list() : []),
            ...this.getExternalSymbols(rawImports, uri),
          ],
          importedNames,
          skipFunctionBodies: skipBodies,
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
      }
    }
  }

  private resolveImport(fromUri: string, imp: string): string {
    if (imp.startsWith('.')) {
      const base = this.normalizeVirtualSpec(fromUri);
      const baseDir = base.split('/').slice(0, -1);
      const parts = imp.split('/');
      for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') baseDir.pop();
        else baseDir.push(part);
      }
      const resolved = baseDir.join('/');
      return this.virtualUriFor(this.ensureVirtualExtension(resolved));
    }
    const normalized = this.normalizeVirtualSpec(imp);
    if (this.virtualFiles.has(normalized)) return this.virtualUriFor(normalized);
    const withExt = this.ensureVirtualExtension(normalized);
    if (this.virtualFiles.has(withExt)) return this.virtualUriFor(withExt);
    return this.virtualUriFor(normalized);
  }

  private ensureDocumentLoaded(uri: string) {
    const normalized = this.toVirtualUri(uri);
    if (this.documents.has(normalized)) return;
    const spec = this.normalizeVirtualSpec(normalized);
    const text = this.virtualFiles.get(spec);
    if (!text) return;
    this.addOrUpdateDocument(normalized, text, 1);
  }

  private ensurePreludeLoaded() {
    if (!this.parser || !this.preludeText) return;
    const preludeUri = this.virtualUriFor('std/prelude.lm');
    this.virtualFiles.set('std/prelude.lm', this.preludeText);
    this.addOrUpdateDocument(preludeUri, this.preludeText, 1);
    const doc = this.documents.get(preludeUri);
    if (doc?.symbols) {
      this.preludeSymbols = doc.symbols;
      this.preludeNames = new Set(doc.symbols.list().map((sym) => sym.name));
    }
  }

  private getExternalSymbol(name: string): SymbolInfo | undefined {
    for (const doc of this.documents.values()) {
      const sym = doc.symbols?.get(name);
      if (sym) return sym as SymbolInfo;
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

  private normalizeVirtualSpec(spec: string): string {
    return spec.startsWith('virtual://') ? spec.slice('virtual://'.length) : spec;
  }

  private virtualUriFor(spec: string): string {
    return `virtual://${this.normalizeVirtualSpec(spec)}`;
  }

  private toVirtualUri(uri: string): string {
    return uri.startsWith('virtual://') ? uri : `virtual://${uri}`;
  }

  private ensureVirtualExtension(resolved: string): string {
    if (resolved.endsWith('.lum') || resolved.endsWith('.lumina')) return resolved;
    if (this.virtualFiles.has(`${resolved}.lum`)) return `${resolved}.lum`;
    if (this.virtualFiles.has(`${resolved}.lumina`)) return `${resolved}.lumina`;
    return `${resolved}.lum`;
  }
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
