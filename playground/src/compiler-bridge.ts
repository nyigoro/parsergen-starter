import luminaGrammarRaw from '../../src/grammar/lumina.peg?raw';
import preludeRaw from '../../std/prelude.lm?raw';
import routerStdRaw from '../../std/router.lm?raw';
import luminaRuntimeUrl from '../../dist/lumina-runtime.js?url';
import { compileGrammar as compileLuminaGrammar } from '../../src/grammar/index';
import { BrowserProjectContext } from '../../src/project/browser-context';
import { lowerLumina } from '../../src/lumina/lower';
import { optimizeIR } from '../../src/lumina/optimize';
import { generateJS } from '../../src/lumina/codegen';
import { generateWasmTextModuleFromAst } from '../../src/lumina/codegen-wasm';
import { emitWasmBinary } from '../../src/lumina/wasm-emit-binary';
import { emitWAT } from '../../src/lumina/wasm-emit-wat';
import { extractImports } from '../../src/project/imports';
import type { RunnableModuleArtifact } from './runnable-module-graph';
import { buildRunnableModuleGraph } from './runnable-module-graph';

export type PlaygroundProjectFile = {
  uri: string;
  text: string;
};

export type CompileDiagnostic = {
  severity: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
  fileUri?: string;
};

export type PlaygroundCompileInput = {
  action: 'check' | 'run';
  target: 'js' | 'wasm' | 'both';
  entryUri: string;
  files: PlaygroundProjectFile[];
};

export type CompileImportResolution = {
  fromUri: string;
  specifier: string;
  resolvedUri: string;
  kind: 'relative' | 'std' | 'package' | 'virtual';
  sourceBacked: boolean;
};

export type CompileTimings = {
  diagnosticsMs: number;
  lowerMs: number;
  codegenMs: number;
  moduleGraphMs: number;
  wasmWatMs: number;
  wasmBinaryMs: number;
  totalMs: number;
};

export type WasmSectionMetric = {
  name: string;
  byteSize: number;
};

export type CompileWasmOutput = {
  wat: string;
  bytes: Uint8Array | null;
  byteSize: number;
  sections: WasmSectionMetric[];
  timings: {
    watMs: number;
    binaryMs: number;
    totalMs: number;
  };
};

export type CompileResult = {
  ok: boolean;
  action: PlaygroundCompileInput['action'];
  target: PlaygroundCompileInput['target'];
  js: string;
  runnableJs: string;
  runnableEntryUri: string | null;
  runnableModules: RunnableModuleArtifact[];
  wasm: CompileWasmOutput | null;
  hasMain: boolean;
  diagnostics: CompileDiagnostic[];
  entryUri: string;
  graphEdges: number;
  graphNodes: number;
  importResolutions: CompileImportResolution[];
  timings: CompileTimings;
};

const maxEmptyLines = 1;
const resolvedRuntimeUrl = new URL(luminaRuntimeUrl, import.meta.url).href;

type PlaygroundCompilerRuntime = {
  parser: ReturnType<typeof compileLuminaGrammar>;
};

const sourceExtensions = new Set(['.lm', '.lumina', '.lum']);
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const extname = (uri: string): string => {
  const lastSlash = uri.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? uri.slice(lastSlash + 1) : uri;
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot) : '';
};

const isSourceFile = (uri: string): boolean => sourceExtensions.has(extname(uri));

let compilerRuntime: PlaygroundCompilerRuntime | null = null;

const getCompilerRuntime = (): PlaygroundCompilerRuntime => {
  if (!compilerRuntime) {
    compilerRuntime = {
      parser: compileLuminaGrammar(luminaGrammarRaw, { cache: true }),
    };
  }

  return compilerRuntime;
};

export const warmLuminaCompiler = (): number => {
  const startedAt = now();
  getCompilerRuntime();
  return now() - startedAt;
};

export const formatLuminaSource = (source: string): string => {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let emptyRun = 0;

  for (const line of lines) {
    const trimmedRight = line.replace(/[ \t]+$/g, '');
    if (trimmedRight.length === 0) {
      emptyRun += 1;
      if (emptyRun <= maxEmptyLines) out.push('');
      continue;
    }
    emptyRun = 0;
    out.push(trimmedRight);
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
};

const collectStyleLintIssues = (
  fileUri: string,
  source: string,
  maxLineLength = 120
): CompileDiagnostic[] => {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const issues: CompileDiagnostic[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;
    const trailing = line.match(/[ \t]+$/);
    if (trailing) {
      issues.push({
        severity: 'warning',
        message: 'Trailing whitespace',
        line: lineNo,
        column: trailing.index! + 1,
        code: 'LINT-TRAILING-WS',
        fileUri,
      });
    }

    const tabIndex = line.indexOf('\t');
    if (tabIndex >= 0) {
      issues.push({
        severity: 'warning',
        message: 'Tab indentation found; use spaces',
        line: lineNo,
        column: tabIndex + 1,
        code: 'LINT-TAB-INDENT',
        fileUri,
      });
    }

    if (line.length > maxLineLength) {
      issues.push({
        severity: 'warning',
        message: `Line exceeds ${maxLineLength} characters`,
        line: lineNo,
        column: maxLineLength + 1,
        code: 'LINT-LINE-LENGTH',
        fileUri,
      });
    }
  }

  return issues;
};

const toDiagnostics = (
  fileUri: string,
  source: string,
  projectDiagnostics: ReturnType<BrowserProjectContext['getDiagnostics']>
): CompileDiagnostic[] => {
  const compilerDiagnostics = projectDiagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    message: diagnostic.message,
    line: diagnostic.location?.start?.line,
    column: diagnostic.location?.start?.column,
    code: diagnostic.code,
    fileUri,
  }));

  const lintDiagnostics = collectStyleLintIssues(fileUri, source);

  return [...compilerDiagnostics, ...lintDiagnostics];
};

const hasMainFunction = (ast: unknown): boolean =>
  !!(
    ast &&
    typeof ast === 'object' &&
    Array.isArray((ast as { body?: unknown }).body) &&
    (ast as { body: Array<{ type?: string; name?: string }> }).body.some(
      (statement) => statement.type === 'FnDecl' && statement.name === 'main'
    )
  );

const buildProjectContext = (runtime: PlaygroundCompilerRuntime, files: PlaygroundProjectFile[]) => {
  const virtualFiles = new Map<string, string>([['@std/router', routerStdRaw]]);
  for (const file of files) {
    virtualFiles.set(file.uri, file.text);
  }
  const project = new BrowserProjectContext(runtime.parser, {
    preludeText: preludeRaw,
    virtualFiles,
  });
  for (const file of files) {
    if (!isSourceFile(file.uri)) continue;
    project.addOrUpdateDocument(file.uri, file.text, 1);
  }
  return project;
};

const classifyImportResolution = (specifier: string): CompileImportResolution['kind'] => {
  if (specifier.startsWith('.')) return 'relative';
  if (specifier === '@std' || specifier.startsWith('@std/')) return 'std';
  if (specifier.startsWith('virtual://')) return 'virtual';
  return 'package';
};

const collectImportResolutions = (
  runtime: PlaygroundCompilerRuntime,
  project: BrowserProjectContext,
  files: PlaygroundProjectFile[]
): CompileImportResolution[] =>
  files
    .filter((file) => isSourceFile(file.uri))
    .flatMap((file) =>
      extractImports(file.text, { parser: runtime.parser, grammarSource: file.uri }).map((specifier) => {
        const resolvedUri = project.resolveImportUri(file.uri, specifier);
        return {
          fromUri: file.uri,
          specifier,
          resolvedUri,
          kind: classifyImportResolution(specifier),
          sourceBacked: Boolean(project.getDocumentText(resolvedUri)),
        } satisfies CompileImportResolution;
      })
    );

const emptyTimings = (totalMs: number): CompileTimings => ({
  diagnosticsMs: 0,
  lowerMs: 0,
  codegenMs: 0,
  moduleGraphMs: 0,
  wasmWatMs: 0,
  wasmBinaryMs: 0,
  totalMs,
});

const resultBase = (input: PlaygroundCompileInput) => ({
  action: input.action,
  target: input.target,
  entryUri: input.entryUri,
  js: '',
  runnableJs: '',
  runnableEntryUri: null,
  runnableModules: [],
  wasm: null,
  hasMain: false,
  graphEdges: 0,
  graphNodes: 0,
});

const diagnosticFromCompiler = (
  diagnostic: {
    severity?: string;
    message: string;
    code?: string;
    location?: { start?: { line?: number; column?: number } };
  },
  fileUri: string
): CompileDiagnostic => ({
  severity: diagnostic.severity ?? 'error',
  message: diagnostic.message,
  line: diagnostic.location?.start?.line,
  column: diagnostic.location?.start?.column,
  code: diagnostic.code,
  fileUri,
});

const sectionNames: Record<number, string> = {
  0: 'custom',
  1: 'types',
  2: 'imports',
  3: 'functions',
  4: 'tables',
  5: 'memory',
  6: 'globals',
  7: 'exports',
  8: 'start',
  9: 'elements',
  10: 'code',
  11: 'data',
  12: 'data-count',
};

const readU32 = (bytes: Uint8Array, offset: number): { value: number; offset: number } => {
  let result = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, offset: cursor };
};

const collectWasmSections = (bytes: Uint8Array): WasmSectionMetric[] => {
  const sections: WasmSectionMetric[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const id = bytes[offset++];
    const size = readU32(bytes, offset);
    offset = size.offset + size.value;
    sections.push({
      name: sectionNames[id] ?? `section-${id}`,
      byteSize: size.value,
    });
  }
  return sections;
};

export const compileLuminaProject = (input: PlaygroundCompileInput): CompileResult => {
  const startedAt = now();
  try {
    const runtime = getCompilerRuntime();
    const project = buildProjectContext(runtime, input.files);
    const diagnosticsStartedAt = now();
    const diagnostics = input.files
      .filter((file) => isSourceFile(file.uri))
      .flatMap((file) => toDiagnostics(file.uri, file.text, project.getDiagnostics(file.uri)));
    const importResolutions = collectImportResolutions(runtime, project, input.files);
    const diagnosticsMs = now() - diagnosticsStartedAt;
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (hasErrors) {
      return {
        ...resultBase(input),
        ok: false,
        diagnostics,
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs: 0,
          codegenMs: 0,
          moduleGraphMs: 0,
          wasmWatMs: 0,
          wasmBinaryMs: 0,
          totalMs: now() - startedAt,
        },
      };
    }

    if (input.action === 'check') {
      return {
        ...resultBase(input),
        ok: true,
        hasMain: Boolean(project.getDocumentAst(input.entryUri)),
        diagnostics,
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs: 0,
          codegenMs: 0,
          moduleGraphMs: 0,
          wasmWatMs: 0,
          wasmBinaryMs: 0,
          totalMs: now() - startedAt,
        },
      };
    }

    const ast = project.getDocumentAst(input.entryUri);
    if (!ast) {
      return {
        ...resultBase(input),
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            message: `No AST produced for ${input.entryUri}`,
            fileUri: input.entryUri,
          },
        ],
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs: 0,
          codegenMs: 0,
          moduleGraphMs: 0,
          wasmWatMs: 0,
          wasmBinaryMs: 0,
          totalMs: now() - startedAt,
        },
      };
    }

    const shouldBuildJs = input.target === 'js' || input.target === 'both';
    const shouldBuildWasm = input.target === 'wasm' || input.target === 'both';
    let js = '';
    let runnableJs = '';
    let runnableEntryUri: string | null = null;
    let runnableModules: RunnableModuleArtifact[] = [];
    let graphEdges = 0;
    let graphNodes = 0;
    let lowerMs = 0;
    let codegenMs = 0;
    let moduleGraphMs = 0;
    let wasmWatMs = 0;
    let wasmBinaryMs = 0;
    let wasm: CompileWasmOutput | null = null;

    if (shouldBuildJs) {
      const lowerStartedAt = now();
      const lowered = lowerLumina(ast as never);
      const optimized = optimizeIR(lowered);
      lowerMs = now() - lowerStartedAt;
      const codegenStartedAt = now();
      js = optimized ? generateJS(optimized as never).code : '// No JavaScript output generated.';
      codegenMs = now() - codegenStartedAt;
      const moduleGraphStartedAt = now();
      const runnableGraph = buildRunnableModuleGraph({
        project,
        entryUri: input.entryUri,
        runtimeUrl: resolvedRuntimeUrl,
      });
      moduleGraphMs = now() - moduleGraphStartedAt;
      const entryModule = runnableGraph.modules.find((module) => module.uri === runnableGraph.entryUri);
      if (!entryModule) {
        return {
          ...resultBase(input),
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              message: `No runnable entry module produced for ${input.entryUri}`,
              fileUri: input.entryUri,
            },
          ],
          importResolutions,
          timings: {
            diagnosticsMs,
            lowerMs,
            codegenMs,
            moduleGraphMs,
            wasmWatMs: 0,
            wasmBinaryMs: 0,
            totalMs: now() - startedAt,
          },
        };
      }
      runnableJs = entryModule.code;
      runnableEntryUri = runnableGraph.entryUri;
      runnableModules = runnableGraph.modules;
      graphEdges = runnableGraph.modules.reduce((count, module) => count + module.sourceImports.length, 0);
      graphNodes = runnableGraph.modules.length;
    }

    if (shouldBuildWasm) {
      const wasmStartedAt = now();
      const wasmModule = generateWasmTextModuleFromAst(ast as never, {
        exportMain: true,
        targetProfile: 'wasm-web',
        emitDebugMetadata: true,
        sourceFile: input.entryUri,
      });
      wasmWatMs = now() - wasmStartedAt;
      const wasmDiagnostics = wasmModule.diagnostics.map((diagnostic) =>
        diagnosticFromCompiler(diagnostic, input.entryUri)
      );
      const wasmHasErrors = wasmDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
      const wat = emitWAT(wasmModule.module);
      let wasmBytes: Uint8Array | null = null;
      let sections: WasmSectionMetric[] = [];
      if (!wasmHasErrors) {
        const binaryStartedAt = now();
        try {
          wasmBytes = emitWasmBinary(wasmModule.module);
          sections = collectWasmSections(wasmBytes);
        } catch (error) {
          diagnostics.push({
            severity: 'error',
            message: `WASM binary emission failed: ${error instanceof Error ? error.message : String(error)}`,
            code: 'WASM-BINARY-001',
            fileUri: input.entryUri,
          });
        } finally {
          wasmBinaryMs = now() - binaryStartedAt;
        }
      }
      wasm = {
        wat,
        bytes: wasmBytes,
        byteSize: wasmBytes?.byteLength ?? 0,
        sections,
        timings: {
          watMs: wasmWatMs,
          binaryMs: wasmBinaryMs,
          totalMs: wasmWatMs + wasmBinaryMs,
        },
      };
      diagnostics.push(...wasmDiagnostics);
    }

    const ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    return {
      ...resultBase(input),
      ok,
      js,
      runnableJs,
      runnableEntryUri,
      runnableModules,
      wasm,
      hasMain: hasMainFunction(ast),
      diagnostics,
      graphEdges,
      graphNodes,
      importResolutions,
      timings: {
        diagnosticsMs,
        lowerMs,
        codegenMs,
        moduleGraphMs,
        wasmWatMs,
        wasmBinaryMs,
        totalMs: now() - startedAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...resultBase(input),
      ok: false,
      diagnostics: [{ severity: 'error', message }],
      importResolutions: [],
      timings: emptyTimings(now() - startedAt),
    };
  }
};

const bridgeTarget = globalThis as Record<string, unknown>;
bridgeTarget.compileLuminaProject = compileLuminaProject;
bridgeTarget.formatLuminaSource = formatLuminaSource;
