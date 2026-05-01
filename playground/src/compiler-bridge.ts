import luminaGrammarRaw from '../../src/grammar/lumina.peg?raw';
import preludeRaw from '../../std/prelude.lm?raw';
import luminaRuntimeUrl from '../../dist/lumina-runtime.js?url';
import { compileGrammar as compileLuminaGrammar } from '../../src/grammar/index';
import { BrowserProjectContext } from '../../src/project/browser-context';
import { lowerLumina } from '../../src/lumina/lower';
import { optimizeIR } from '../../src/lumina/optimize';
import { generateJS } from '../../src/lumina/codegen';
import { generateJSFromAst } from '../../src/lumina/codegen-js';

export type CompileDiagnostic = {
  severity: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
};

export type CompileResult = {
  ok: boolean;
  js: string;
  runnableJs: string;
  hasMain: boolean;
  diagnostics: CompileDiagnostic[];
};

const parser = compileLuminaGrammar(luminaGrammarRaw);
const maxEmptyLines = 1;
const resolvedRuntimeUrl = new URL(luminaRuntimeUrl, import.meta.url).href;

const createProject = (): BrowserProjectContext =>
  new BrowserProjectContext(parser, { preludeText: preludeRaw });

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

const collectStyleLintIssues = (source: string, maxLineLength = 120): CompileDiagnostic[] => {
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
      });
    }

    if (line.length > maxLineLength) {
      issues.push({
        severity: 'warning',
        message: `Line exceeds ${maxLineLength} characters`,
        line: lineNo,
        column: maxLineLength + 1,
        code: 'LINT-LINE-LENGTH',
      });
    }
  }

  return issues;
};

const toDiagnostics = (source: string, projectDiagnostics: ReturnType<BrowserProjectContext['getDiagnostics']>): CompileDiagnostic[] => {
  const compilerDiagnostics = projectDiagnostics.map(diagnostic => ({
    severity: diagnostic.severity,
    message: diagnostic.message,
    line: diagnostic.location?.start?.line,
    column: diagnostic.location?.start?.column,
    code: diagnostic.code,
  }));

  const lintDiagnostics = collectStyleLintIssues(source);

  return [...compilerDiagnostics, ...lintDiagnostics];
};

const hasMainFunction = (ast: unknown): boolean =>
  !!(
    ast &&
    typeof ast === 'object' &&
    Array.isArray((ast as { body?: unknown }).body) &&
    (ast as { body: Array<{ type?: string; name?: string }> }).body.some(
      statement => statement.type === 'FnDecl' && statement.name === 'main'
    )
  );

export const compileLuminaSource = (source: string): CompileResult => {
  try {
    const project = createProject();
    project.addOrUpdateDocument('main.lm', source, 1);

    const diagnostics = toDiagnostics(source, project.getDiagnostics('main.lm'));
    const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === 'error');
    if (hasErrors) {
      return {
        ok: false,
        js: '',
        runnableJs: '',
        hasMain: false,
        diagnostics,
      };
    }

    const ast = project.getDocumentAst('main.lm');
    if (!ast) {
      return {
        ok: false,
        js: '',
        runnableJs: '',
        hasMain: false,
        diagnostics: [{ severity: 'error', message: 'No AST produced for main.lm' }],
      };
    }

    const lowered = lowerLumina(ast as never);
    const optimized = optimizeIR(lowered);
    const js = optimized ? generateJS(optimized as never).code : '// No JavaScript output generated.';
    const runnableJs = generateJSFromAst(ast as never, {
      target: 'esm',
      includeRuntime: true,
      sourceMap: false,
      sourceFile: 'main.lm',
      sourceContent: source,
    }).code.replace(/from\s+["']\.\/lumina-runtime\.js["']/g, `from ${JSON.stringify(resolvedRuntimeUrl)}`);

    return {
      ok: true,
      js,
      runnableJs,
      hasMain: hasMainFunction(ast),
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      js: '',
      runnableJs: '',
      hasMain: false,
      diagnostics: [{ severity: 'error', message }],
    };
  }
};

const bridgeTarget = globalThis as Record<string, unknown>;
bridgeTarget.compileLuminaSource = compileLuminaSource;
bridgeTarget.formatLuminaSource = formatLuminaSource;
