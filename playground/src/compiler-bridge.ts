import luminaGrammarRaw from '../../src/grammar/lumina.peg?raw';
import preludeRaw from '../../std/prelude.lm?raw';
import routerStdRaw from '../../std/router.lm?raw';
import luminaRuntimeUrl from '../../dist/lumina-runtime.js?url';
import { compileGrammar as compileLuminaGrammar } from '../../src/grammar/index';
import { BrowserProjectContext } from '../../src/project/browser-context';
import { lowerLumina } from '../../src/lumina/lower';
import { optimizeIR } from '../../src/lumina/optimize';
import { generateJS } from '../../src/lumina/codegen';
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
  totalMs: number;
};

export type CompileResult = {
  ok: boolean;
  js: string;
  runnableJs: string;
  runnableEntryUri: string | null;
  runnableModules: RunnableModuleArtifact[];
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
        ok: false,
        js: '',
        runnableJs: '',
        runnableEntryUri: null,
        runnableModules: [],
        hasMain: false,
        diagnostics,
        entryUri: input.entryUri,
        graphEdges: 0,
        graphNodes: 0,
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs: 0,
          codegenMs: 0,
          moduleGraphMs: 0,
          totalMs: now() - startedAt,
        },
      };
    }

    const ast = project.getDocumentAst(input.entryUri);
    if (!ast) {
      return {
        ok: false,
        js: '',
        runnableJs: '',
        runnableEntryUri: null,
        runnableModules: [],
        hasMain: false,
        diagnostics: [
          {
            severity: 'error',
            message: `No AST produced for ${input.entryUri}`,
            fileUri: input.entryUri,
          },
        ],
        entryUri: input.entryUri,
        graphEdges: 0,
        graphNodes: 0,
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs: 0,
          codegenMs: 0,
          moduleGraphMs: 0,
          totalMs: now() - startedAt,
        },
      };
    }

    const lowerStartedAt = now();
    const lowered = lowerLumina(ast as never);
    const optimized = optimizeIR(lowered);
    const lowerMs = now() - lowerStartedAt;
    const codegenStartedAt = now();
    const js = optimized ? generateJS(optimized as never).code : '// No JavaScript output generated.';
    const codegenMs = now() - codegenStartedAt;
    const moduleGraphStartedAt = now();
    const runnableGraph = buildRunnableModuleGraph({
      project,
      entryUri: input.entryUri,
      runtimeUrl: resolvedRuntimeUrl,
    });
    const moduleGraphMs = now() - moduleGraphStartedAt;
    const entryModule = runnableGraph.modules.find((module) => module.uri === runnableGraph.entryUri);
    if (!entryModule) {
      return {
        ok: false,
        js: '',
        runnableJs: '',
        runnableEntryUri: null,
        runnableModules: [],
        hasMain: false,
        diagnostics: [
          {
            severity: 'error',
            message: `No runnable entry module produced for ${input.entryUri}`,
            fileUri: input.entryUri,
          },
        ],
        entryUri: input.entryUri,
        graphEdges: 0,
        graphNodes: 0,
        importResolutions,
        timings: {
          diagnosticsMs,
          lowerMs,
          codegenMs,
          moduleGraphMs,
          totalMs: now() - startedAt,
        },
      };
    }

    return {
      ok: true,
      js,
      runnableJs: entryModule.code,
      runnableEntryUri: runnableGraph.entryUri,
      runnableModules: runnableGraph.modules,
      hasMain: hasMainFunction(ast),
      diagnostics,
      entryUri: input.entryUri,
      graphEdges: runnableGraph.modules.reduce(
        (count, module) => count + module.sourceImports.length,
        0
      ),
      graphNodes: runnableGraph.modules.length,
      importResolutions,
      timings: {
        diagnosticsMs,
        lowerMs,
        codegenMs,
        moduleGraphMs,
        totalMs: now() - startedAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      js: '',
      runnableJs: '',
      runnableEntryUri: null,
      runnableModules: [],
      hasMain: false,
      diagnostics: [{ severity: 'error', message }],
      entryUri: input.entryUri,
      graphEdges: 0,
      graphNodes: 0,
      importResolutions: [],
      timings: {
        diagnosticsMs: 0,
        lowerMs: 0,
        codegenMs: 0,
        moduleGraphMs: 0,
        totalMs: now() - startedAt,
      },
    };
  }
};

const bridgeTarget = globalThis as Record<string, unknown>;
bridgeTarget.compileLuminaProject = compileLuminaProject;
bridgeTarget.formatLuminaSource = formatLuminaSource;
