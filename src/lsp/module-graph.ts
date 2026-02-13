import { type Location } from '../utils/index.js';
import { type SymbolInfo } from '../lumina/semantic.js';
import { ProjectContext, type SourceDocument } from '../project/context.js';

export interface ModuleGraph {
  modules: Map<string, ModuleInfo>;
}

export interface ModuleInfo {
  uri: string;
  imports: ImportDeclaration[];
  exports: ExportedSymbol[];
  ast?: unknown;
}

export interface ImportDeclaration {
  source: string;
  resolvedUri: string;
  kind: 'named' | 'namespace' | 'default';
  bindings: ImportBindingInfo[];
}

export interface ImportBindingInfo {
  imported: string;
  local: string;
  namespace: boolean;
  location?: Location;
}

export interface ExportedSymbol {
  name: string;
  kind: 'function' | 'type' | 'value';
  type: string;
  location: Location;
  docComment?: string;
}

export interface SymbolDefinition {
  uri: string;
  location: Location;
  type: string;
  kind: 'function' | 'type' | 'value';
  docComment?: string;
}

function isPublicSymbol(sym: SymbolInfo): boolean {
  return sym.visibility !== 'private';
}

function formatSymbolType(sym: SymbolInfo): string {
  if (sym.kind === 'function') {
    const params = sym.paramTypes ?? [];
    const names = sym.paramNames ?? [];
    const parts = params.map((param, idx) => (names[idx] ? `${names[idx]}: ${param}` : param));
    const ret = sym.type ?? 'void';
    return `${sym.name}(${parts.join(', ')}) -> ${ret}`;
  }
  return sym.type ?? 'any';
}

function extractDocComment(doc: SourceDocument, location: Location): string | undefined {
  if (!doc.text) return undefined;
  const lines = doc.text.split(/\r?\n/);
  const startLine = Math.max(0, location.start.line - 1);
  let idx = startLine - 1;
  const collected: string[] = [];
  while (idx >= 0) {
    const raw = lines[idx] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) {
      if (collected.length === 0) {
        idx -= 1;
        continue;
      }
      break;
    }
    if (trimmed.startsWith('///')) {
      collected.unshift(trimmed.replace(/^\/\/\/\s?/, ''));
      idx -= 1;
      continue;
    }
    if (trimmed.startsWith('//')) {
      collected.unshift(trimmed.replace(/^\/\/\s?/, ''));
      idx -= 1;
      continue;
    }
    break;
  }
  if (collected.length === 0) return undefined;
  return collected.join('\n');
}

function buildExports(doc: SourceDocument): ExportedSymbol[] {
  const symbols = doc.symbols?.list() ?? [];
  const exports: ExportedSymbol[] = [];
  for (const sym of symbols) {
    if (!sym.location) continue;
    if (!isPublicSymbol(sym)) continue;
    const kind = sym.kind === 'function' ? 'function' : sym.kind === 'type' ? 'type' : 'value';
    exports.push({
      name: sym.name,
      kind,
      type: formatSymbolType(sym),
      location: sym.location,
      docComment: extractDocComment(doc, sym.location),
    });
  }
  return exports;
}

function buildImports(project: ProjectContext, doc: SourceDocument): ImportDeclaration[] {
  const bindings = project.getImportBindings(doc.uri);
  const bySource = new Map<string, ImportDeclaration>();
  for (const binding of bindings) {
    const decl =
      bySource.get(binding.source) ??
      ({
        source: binding.source,
        resolvedUri: project.resolveImportUri(doc.uri, binding.source),
        kind: binding.namespace ? 'namespace' : 'named',
        bindings: [],
      } as ImportDeclaration);
    decl.bindings.push({
      imported: binding.original,
      local: binding.local,
      namespace: binding.namespace,
    });
    if (binding.namespace) {
      decl.kind = 'namespace';
    }
    bySource.set(binding.source, decl);
  }
  return Array.from(bySource.values());
}

function collectDocuments(project: ProjectContext, entryUri?: string): SourceDocument[] {
  if (!entryUri) return project.listDocuments();
  const seen = new Set<string>();
  const queue: string[] = [entryUri];
  const docs: SourceDocument[] = [];

  while (queue.length > 0) {
    const uri = queue.pop();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    const doc = project.listDocuments().find((item) => item.uri === uri);
    if (!doc) continue;
    docs.push(doc);
    const deps = project.getDependencies(uri);
    for (const dep of deps) {
      if (seen.has(dep)) continue;
      if (dep.startsWith('file://') || dep.startsWith('virtual://')) {
        queue.push(dep);
      }
    }
  }

  return docs;
}

export function buildModuleGraph(project: ProjectContext, entryUri?: string): ModuleGraph {
  const modules = new Map<string, ModuleInfo>();
  const docs = collectDocuments(project, entryUri);
  for (const doc of docs) {
    modules.set(doc.uri, {
      uri: doc.uri,
      imports: buildImports(project, doc),
      exports: buildExports(doc),
      ast: doc.ast,
    });
  }
  return { modules };
}

function findBinding(
  module: ModuleInfo,
  predicate: (binding: ImportBindingInfo) => boolean
): { binding: ImportBindingInfo; resolvedUri: string } | null {
  for (const imp of module.imports) {
    for (const binding of imp.bindings) {
      if (predicate(binding)) {
        return { binding, resolvedUri: imp.resolvedUri };
      }
    }
  }
  return null;
}

export function resolveSymbol(
  graph: ModuleGraph,
  uri: string,
  identifier: string,
  member?: string
): SymbolDefinition | null {
  const module = graph.modules.get(uri);
  if (!module) return null;

  if (member) {
    const bindingInfo = findBinding(module, (binding) => binding.local === identifier && binding.namespace);
    if (!bindingInfo) return null;
    const target = graph.modules.get(bindingInfo.resolvedUri);
    if (!target) return null;
    const exported = target.exports.find((exp) => exp.name === member);
    if (!exported) return null;
    return {
      uri: target.uri,
      location: exported.location,
      type: exported.type,
      kind: exported.kind,
      docComment: exported.docComment,
    };
  }

  const importedBinding = findBinding(module, (binding) => binding.local === identifier && !binding.namespace);
  if (importedBinding) {
    const target = graph.modules.get(importedBinding.resolvedUri);
    if (!target) return null;
    const exported = target.exports.find((exp) => exp.name === importedBinding.binding.imported);
    if (!exported) return null;
    return {
      uri: target.uri,
      location: exported.location,
      type: exported.type,
      kind: exported.kind,
      docComment: exported.docComment,
    };
  }

  const local = module.exports.find((exp) => exp.name === identifier);
  if (local) {
    return {
      uri: module.uri,
      location: local.location,
      type: local.type,
      kind: local.kind,
      docComment: local.docComment,
    };
  }

  return null;
}
