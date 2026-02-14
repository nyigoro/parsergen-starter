import { parseWithPanicRecovery, type PanicRecoveryOptions } from './panic.js';
import { extractImports } from './imports.js';
import { analyzeLumina, type SymbolTable as LuminaSymbolTable, type SymbolInfo } from '../lumina/semantic.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { type CompiledGrammar } from '../grammar/index.js';
import { type Location } from '../utils/index.js';
import { type Diagnostic } from '../parser/index.js';
import { type LuminaType } from '../lumina/ast.js';
import { createStdModuleRegistry, type ModuleRegistry } from '../lumina/module-registry.js';
import { buildModuleNamespaceFromSymbols } from '../lumina/module-utils.js';
import { resolveModuleBindings, type ModuleExport, type ModuleNamespace } from '../lumina/module-registry.js';

export interface BrowserSourceDocument {
  uri: string;
  text: string;
  version: number;
  imports: string[];
  importDiagnostics?: Diagnostic[];
  packageDiagnostics?: Diagnostic[];
  importAliases?: Map<string, string>;
  importNameMap?: Map<string, ImportBinding>;
  diagnostics: Diagnostic[];
  symbols?: LuminaSymbolTable;
  ast?: unknown;
  importedNames?: Set<string>;
  moduleBindings?: Map<string, ModuleExport>;
  signatures?: Map<string, string>;
  functionHashes?: Map<string, string>;
  inferredReturns?: Map<string, LuminaType>;
  hmCallSignatures?: Map<number, { args: LuminaType[]; returnType: LuminaType }>;
}

type ImportBinding = {
  local: string;
  original: string;
  source: string;
  namespace: boolean;
};

type LuminaLockfile = {
  lockfileVersion: number;
  packages: Record<string, LockfilePackage>;
};

type LockfilePackage = {
  version: string;
  resolved: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
};

type BareResolveResult =
  | { resolved: string }
  | { error: { code: 'PKG-001' | 'PKG-002' | 'PKG-003' | 'PKG-004'; message: string } };

const defaultLocation: Location = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};

export class BrowserProjectContext {
  private documents = new Map<string, BrowserSourceDocument>();
  private parser: CompiledGrammar<unknown> | null = null;
  private recoveryOptions: PanicRecoveryOptions;
  private luminaLexer = createLuminaLexer();
  private virtualFiles = new Map<string, string>();
  private preludeSymbols: LuminaSymbolTable | null = null;
  private preludeNames = new Set<string>();
  private preludeText: string | null = null;
  private moduleRegistry: ModuleRegistry;
  private lockfileCache = new Map<string, LuminaLockfile>();
  private packageDiagnostics: Diagnostic[] = [];

  constructor(
    parser?: CompiledGrammar<unknown>,
    options: { preludeText?: string; recoveryOptions?: PanicRecoveryOptions } = {}
  ) {
    this.parser = parser ?? null;
    this.preludeText = options.preludeText ?? null;
    this.moduleRegistry = createStdModuleRegistry();
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
      importDiagnostics: existing?.importDiagnostics,
      packageDiagnostics: existing?.packageDiagnostics,
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
    doc.importAliases = undefined;
    doc.importNameMap = undefined;
    doc.moduleBindings = undefined;
    doc.hmCallSignatures = undefined;
    let payload: unknown = null;
    if (result.result && typeof result.result === 'object' && 'success' in result.result && (result.result as { success: boolean }).success) {
      payload = (result.result as { result: unknown }).result ?? result.result;
      if (payload && typeof payload === 'object' && 'type' in (payload as object)) {
        doc.ast = payload;
        const nextHashes = collectFunctionBodyHashes(payload as never, doc.text);
        const prevHashes = doc.functionHashes ?? new Map<string, string>();
        const skipBodies = new Set<string>();
        for (const [name, hash] of nextHashes.entries()) {
          if (prevHashes.get(name) === hash) skipBodies.add(name);
        }
        const cachedReturns = doc.inferredReturns ?? new Map<string, LuminaType>();
        const importInfo = collectImportBindings(payload as never);
        const importedNames = new Set<string>(importInfo.locals);
        for (const name of this.preludeNames) importedNames.add(name);
        doc.importedNames = importedNames;
        doc.importAliases = importInfo.aliases;
        doc.importNameMap = importInfo.map;
        const moduleBindings = this.buildModuleBindings(importInfo.bindings, payload as never);
        doc.moduleBindings = moduleBindings;

        const analysis = analyzeLumina(payload as never, {
          externSymbols: (name: string) => {
            const prelude = this.preludeSymbols?.get(name);
            if (prelude) return prelude as SymbolInfo;
            if (!importInfo.locals.has(name)) return undefined;
            return this.getExternalSymbol(name, uri);
          },
          externalSymbols: [
            ...(this.preludeSymbols ? this.preludeSymbols.list() : []),
            ...this.getExternalSymbols(importInfo.locals, uri),
          ],
          importedNames,
          skipFunctionBodies: skipBodies,
          cachedFunctionReturns: cachedReturns,
          moduleRegistry: this.moduleRegistry,
          moduleBindings,
        });
        doc.symbols = analysis.symbols;
        doc.hmCallSignatures = analysis.hmCallSignatures;
        doc.inferredReturns = new Map<string, LuminaType>();
        for (const sym of analysis.symbols.list()) {
          if (sym.kind === 'function' && sym.type) {
            doc.inferredReturns.set(sym.name, sym.type);
          }
        }
        doc.diagnostics.push(...analysis.diagnostics);
      }
    }
    const importDiagnostics = this.collectImportDiagnostics(payload as { type: string; body?: unknown[] }, uri);
    if (importDiagnostics.length > 0) {
      doc.importDiagnostics = importDiagnostics;
      doc.packageDiagnostics = importDiagnostics;
      doc.diagnostics.push(...importDiagnostics);
    } else {
      doc.importDiagnostics = [];
      doc.packageDiagnostics = [];
    }
    this.packageDiagnostics = [];
    for (const entry of this.documents.values()) {
      if (entry.packageDiagnostics && entry.packageDiagnostics.length > 0) {
        this.packageDiagnostics.push(...entry.packageDiagnostics);
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
    if (imp.startsWith('@std/')) {
      return imp;
    }
    const normalized = this.normalizeVirtualSpec(imp);
    if (this.virtualFiles.has(normalized)) return this.virtualUriFor(normalized);
    const withExt = this.ensureVirtualExtension(normalized);
    if (this.virtualFiles.has(withExt)) return this.virtualUriFor(withExt);
    const bareResolved = this.resolveBareSpecifier(fromUri, imp);
    if (bareResolved) return this.virtualUriFor(bareResolved);
    return this.virtualUriFor(normalized);
  }

  private buildModuleBindings(
    bindings: ImportBinding[],
    program: { type: string; body?: unknown[] }
  ): Map<string, ModuleExport> {
    const bindingsMap = resolveModuleBindings(program as never, this.moduleRegistry);
    const modulesBySource = new Map<string, ModuleNamespace>();
    const aliasModule = (mod: ModuleNamespace, alias: string): ModuleNamespace =>
      mod.name === alias ? mod : { ...mod, name: alias };
    for (const binding of bindings) {
      if (bindingsMap.has(binding.local)) continue;
      const registryModule = this.moduleRegistry.get(binding.source);
      if (registryModule) {
        if (binding.namespace) {
          bindingsMap.set(binding.local, aliasModule(registryModule as ModuleNamespace, binding.local));
        } else {
          const exp = registryModule.exports.get(binding.original);
          if (exp) {
            bindingsMap.set(
              binding.local,
              exp.kind === 'function' && exp.name !== binding.local ? { ...exp, name: binding.local } : exp
            );
          }
        }
        continue;
      }
      const resolved = this.resolveImport('', binding.source);
      let module = modulesBySource.get(resolved);
      if (!module) {
        this.ensureDocumentLoaded(resolved);
        const doc = this.documents.get(this.toVirtualUri(resolved));
        if (!doc?.symbols) continue;
        module = buildModuleNamespaceFromSymbols(binding.source, doc.symbols.list(), this.toVirtualUri(resolved));
        modulesBySource.set(resolved, module);
      }
      if (binding.namespace) {
        bindingsMap.set(binding.local, aliasModule(module, binding.local));
      } else {
        const exp = module.exports.get(binding.original);
        if (exp) {
          bindingsMap.set(
            binding.local,
            exp.kind === 'function' && exp.name !== binding.local ? { ...exp, name: binding.local } : exp
          );
        }
      }
    }
    return bindingsMap;
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

  private getExternalSymbol(name: string, currentUri: string): SymbolInfo | undefined {
    const normalized = this.toVirtualUri(currentUri);
    const resolved = this.resolveImportedSymbol(name, normalized);
    if (resolved) return resolved;
    for (const other of this.documents.values()) {
      if (other.uri === normalized) continue;
      const sym = other.symbols?.get(name);
      if (sym) return sym as SymbolInfo;
    }
    return undefined;
  }

  resolveImportedSymbol(name: string, uri: string): SymbolInfo | undefined {
    const normalized = this.toVirtualUri(uri);
    const doc = this.documents.get(normalized);
    const binding = doc?.importNameMap?.get(name);
    if (binding) {
      if (binding.namespace) return undefined;
      const resolved = this.resolveImport(normalized, binding.source);
      const target = this.documents.get(this.toVirtualUri(resolved));
      const sym = target?.symbols?.get(binding.original);
      if (!sym) return undefined;
      if (sym.visibility === 'private' && this.toVirtualUri(resolved) !== normalized) return undefined;
      return { ...sym, name } as SymbolInfo;
    }
    return undefined;
  }

  resolveImportedMember(base: string, member: string, uri: string): SymbolInfo | undefined {
    const normalized = this.toVirtualUri(uri);
    const doc = this.documents.get(normalized);
    const binding = doc?.importNameMap?.get(base);
    if (!binding || !binding.namespace) return undefined;

    const registryModule = this.moduleRegistry.get(binding.source);
    if (registryModule) {
      const exp = registryModule.exports.get(member);
      if (exp?.kind === 'function') {
        return {
          name: member,
          kind: 'function',
          type: exp.returnType,
          paramTypes: exp.paramTypes,
          paramNames: exp.paramNames,
          visibility: 'public',
          extern: true,
          uri: exp.moduleId,
        };
      }
      return undefined;
    }

    const resolved = this.resolveImport(normalized, binding.source);
    const target = this.documents.get(this.toVirtualUri(resolved));
    const sym = target?.symbols?.get(member);
    if (!sym) return undefined;
    if (sym.visibility === 'private' && this.toVirtualUri(resolved) !== normalized) return undefined;
    return { ...sym, name: member } as SymbolInfo;
  }

  private getExternalSymbols(names: Set<string>, currentUri: string): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    for (const name of names) {
      const sym = this.getExternalSymbol(name, currentUri);
      if (sym) results.push(sym as SymbolInfo);
    }
    return results;
  }

  private findLockfileSpec(fromUri: string): string | null {
    const spec = this.normalizeVirtualSpec(fromUri);
    let current = spec.includes('/') ? spec.slice(0, spec.lastIndexOf('/')) : '';
    while (true) {
      const candidate = current ? `${current}/lumina.lock.json` : 'lumina.lock.json';
      if (this.virtualFiles.has(candidate)) return candidate;
      if (!current) return null;
      current = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : '';
    }
  }

  private loadLockfile(spec: string): LuminaLockfile | null {
    const cached = this.lockfileCache.get(spec);
    if (cached) return cached;
    const raw = this.virtualFiles.get(spec);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as LuminaLockfile;
      this.lockfileCache.set(spec, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  private parsePackageSpecifier(specifier: string): { pkgName: string; subpath: string | null } {
    if (specifier.startsWith('@')) {
      const parts = specifier.split('/');
      if (parts.length < 2) return { pkgName: specifier, subpath: null };
      const pkgName = `${parts[0]}/${parts[1]}`;
      const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : null;
      return { pkgName, subpath };
    }
    const slash = specifier.indexOf('/');
    if (slash === -1) return { pkgName: specifier, subpath: null };
    return { pkgName: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
  }

  private resolveBareSpecifier(fromUri: string, specifier: string): string | null {
    const result = this.resolveBareSpecifierDetailed(fromUri, specifier);
    if ('resolved' in result) return result.resolved;
    return null;
  }

  private resolveBareSpecifierDetailed(fromUri: string, specifier: string): BareResolveResult {
    const lockSpec = this.findLockfileSpec(fromUri);
    if (!lockSpec) {
      return {
        error: { code: 'PKG-004', message: 'Cannot resolve package imports: lumina.lock.json not found' },
      };
    }
    const lockfile = this.loadLockfile(lockSpec);
    if (!lockfile) {
      return {
        error: { code: 'PKG-004', message: 'Cannot resolve package imports: lumina.lock.json not found' },
      };
    }
    const { pkgName, subpath } = this.parsePackageSpecifier(specifier);
    const pkg = lockfile.packages?.[pkgName];
    if (!pkg) {
      return { error: { code: 'PKG-001', message: `Package '${pkgName}' not found in lumina.lock.json` } };
    }
    const lumina = pkg.lumina;
    if (!lumina) {
      return {
        error: { code: 'PKG-002', message: `Package '${pkgName}' missing 'lumina' field in lumina.lock.json` },
      };
    }
    let entry: string | undefined;
    if (subpath) {
      if (typeof lumina === 'object') {
        entry = lumina[subpath];
        if (!entry) {
          return {
            error: { code: 'PKG-003', message: `Package '${pkgName}' does not export '${subpath}'` },
          };
        }
      } else {
        return {
          error: { code: 'PKG-003', message: `Package '${pkgName}' does not export '${subpath}'` },
        };
      }
    } else if (typeof lumina === 'string') {
      entry = lumina;
    } else if (typeof lumina === 'object') {
      entry = lumina['.'];
    }
    if (!entry) {
      return { error: { code: 'PKG-003', message: `Package '${pkgName}' does not export '.'` } };
    }
    const lockDir = lockSpec.includes('/') ? lockSpec.slice(0, lockSpec.lastIndexOf('/')) : '';
    let pkgRoot = pkg.resolved;
    if (!pkgRoot.startsWith('/')) {
      pkgRoot = lockDir ? `${lockDir}/${pkgRoot}` : pkgRoot;
    }
    const absolute = pkgRoot.endsWith('/') ? `${pkgRoot}${entry}` : `${pkgRoot}/${entry}`;
    return { resolved: this.ensureVirtualExtension(absolute) };
  }

  private collectImportDiagnostics(program: { type: string; body?: unknown[] }, uri: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    if (!program || !Array.isArray(program.body)) return diagnostics;
    for (const stmt of program.body) {
      const node = stmt as { type?: string; source?: { value?: string; location?: Location }; location?: Location };
      if (node.type !== 'Import') continue;
      const source = node.source?.value;
      if (!source) continue;
      if (source.startsWith('.') || source === '@std' || source.startsWith('@std/')) continue;
      const result = this.resolveBareSpecifierDetailed(uri, source);
      if ('resolved' in result) continue;
      const location = node.source?.location ?? node.location ?? defaultLocation;
      diagnostics.push({
        severity: 'error',
        code: result.error.code,
        message: result.error.message,
        location,
        source: 'lumina',
      });
    }
    return diagnostics;
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

function collectImportBindings(program: { type: string; body?: unknown[] }): {
  locals: Set<string>;
  aliases: Map<string, string>;
  bindings: ImportBinding[];
  map: Map<string, ImportBinding>;
} {
  const locals = new Set<string>();
  const aliases = new Map<string, string>();
  const bindings: ImportBinding[] = [];
  const map = new Map<string, ImportBinding>();
  if (!program || !Array.isArray(program.body)) return { locals, aliases, bindings, map };

  const register = (local: string, original: string, source: string, namespace: boolean) => {
    locals.add(local);
    if (namespace) aliases.set(local, source);
    const binding: ImportBinding = { local, original, source, namespace };
    bindings.push(binding);
    map.set(local, binding);
  };

  for (const stmt of program.body) {
    const node = stmt as { type?: string; spec?: unknown; source?: { value?: string } };
    if (node.type !== 'Import') continue;
    const source = node.source?.value;
    if (!source) continue;
    const spec = node.spec;
    if (Array.isArray(spec)) {
      for (const item of spec) {
        if (typeof item === 'string') {
          register(item, item, source, false);
          continue;
        }
        if (!item || typeof item !== 'object') continue;
        const specItem = item as { name?: string; alias?: string; namespace?: boolean };
        const name = specItem.name;
        if (!name) continue;
        const local = specItem.alias ?? name;
        register(local, name, source, Boolean(specItem.namespace));
      }
      continue;
    }
    if (typeof spec === 'string') {
      register(spec, spec, source, true);
      continue;
    }
    if (spec && typeof spec === 'object' && 'name' in (spec as { name?: string })) {
      const specItem = spec as { name?: string; alias?: string; namespace?: boolean };
      const name = specItem.name;
      if (!name) continue;
      const local = specItem.alias ?? name;
      register(local, name, source, Boolean(specItem.namespace));
    }
  }

  return { locals, aliases, bindings, map };
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
