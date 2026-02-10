import path from 'node:path';
import { type CompiledGrammar } from '../grammar/index.js';
import { extractImports } from './imports.js';
import { parseWithPanicRecovery, type PanicRecoveryOptions } from './panic.js';
import { type Diagnostic } from '../parser/index.js';
import { createLuminaLexer, luminaSyncTokenTypes } from '../lumina/lexer.js';
import { analyzeLumina, type SymbolTable as LuminaSymbolTable } from '../lumina/semantic.js';

export interface SourceDocument {
  uri: string;
  text: string;
  version: number;
  imports: string[];
  diagnostics: Diagnostic[];
  symbols?: LuminaSymbolTable;
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

  constructor(parser?: CompiledGrammar<unknown>, recoveryOptions: PanicRecoveryOptions = {}) {
    this.parser = parser ?? null;
    this.recoveryOptions = {
      syncTokenTypes: luminaSyncTokenTypes,
      lexer: (input: string) => this.luminaLexer.reset(input),
      ...recoveryOptions,
    };
  }

  setParser(parser: CompiledGrammar<unknown>) {
    this.parser = parser;
  }

  addOrUpdateDocument(uri: string, text: string, version: number = 1) {
    const imports = extractImports(text);
    const existing = this.documents.get(uri);
    const doc: SourceDocument = {
      uri,
      text,
      version: existing ? existing.version + 1 : version,
      imports,
      diagnostics: [],
    };
    this.documents.set(uri, doc);
    this.graph.set(uri, imports.map((imp) => this.resolveImport(uri, imp)));
    this.parseDocument(uri);
  }

  removeDocument(uri: string) {
    this.documents.delete(uri);
  }

  parseDocument(uri: string) {
    const doc = this.documents.get(uri);
    if (!doc || !this.parser) return;
    const result = parseWithPanicRecovery(this.parser, doc.text, this.recoveryOptions);
    doc.diagnostics = result.diagnostics;
    if (result.result && typeof result.result === 'object' && 'success' in result.result && (result.result as { success: boolean }).success) {
      const payload = (result.result as { result: unknown }).result ?? result.result;
      if (payload && typeof payload === 'object' && 'type' in (payload as object)) {
        const analysis = analyzeLumina(payload as never);
        doc.symbols = analysis.symbols;
        doc.diagnostics.push(...analysis.diagnostics);
      }
    }
  }

  parseAll() {
    for (const uri of this.documents.keys()) {
      this.parseDocument(uri);
    }
  }

  getDiagnostics(uri?: string): Diagnostic[] {
    if (uri) return this.documents.get(uri)?.diagnostics ?? [];
    const all: Diagnostic[] = [];
    for (const doc of this.documents.values()) {
      all.push(...doc.diagnostics);
    }
    return all;
  }

  getDependencies(uri: string): string[] {
    return this.graph.get(uri);
  }

  getSymbols(uri: string): LuminaSymbolTable | undefined {
    return this.documents.get(uri)?.symbols;
  }

  getDependents(uri: string): string[] {
    return this.graph.getDependents(uri);
  }

  private resolveImport(fromUri: string, imp: string): string {
    if (imp.startsWith('.')) {
      const base = path.dirname(fromUri);
      return path.resolve(base, imp);
    }
    return imp;
  }
}
