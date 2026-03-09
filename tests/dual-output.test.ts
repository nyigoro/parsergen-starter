import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { runLumina } from '../src/bin/lumina-core.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { buildDualOutput, generateExportsMap } from '../src/lumina/dual-output.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const tempDirs: string[] = [];

function createWorkspace(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(process.cwd(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, source: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, 'utf-8');
}

async function runCompile(argv: string[]) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  let exitCode: number | null = null;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT:${exitCode}`);
  }) as typeof process.exit;

  try {
    await runLumina(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith('EXIT:')) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return { logs, errors, exitCode };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('dual JS output', () => {
  test('buildDualOutput returns both ESM and CJS outputs', () => {
    const source = 'fn main() -> i32 { 42 }\n';
    const ast = parser.parse(source) as Parameters<typeof generateJSFromAst>[0];

    const result = buildDualOutput(source, {
      buildTarget: (target) => generateJSFromAst(ast, { target, includeRuntime: false }).code,
    });

    expect(result.esm).toContain('export ');
    expect(result.cjs).toContain('module.exports');
    expect(result.packageJson).toContain('"exports"');
  });

  test('generateExportsMap produces valid dual-package metadata', () => {
    const parsed = JSON.parse(generateExportsMap('index.js', 'index.cjs', './esm/index.d.ts')) as {
      main: string;
      module: string;
      types: string;
      exports: Record<string, { import: string; require: string; types: string }>;
    };

    expect(parsed.main).toBe('./cjs/index.cjs');
    expect(parsed.module).toBe('./esm/index.js');
    expect(parsed.types).toBe('./esm/index.d.ts');
    expect(parsed.exports['.']).toEqual({
      import: './esm/index.js',
      require: './cjs/index.cjs',
      types: './esm/index.d.ts',
    });
  });

  test('compile --target dual writes esm, cjs, and exports map', async () => {
    const root = createWorkspace('lumina-dual-output-');
    const entry = path.join(root, 'main.lm');
    const outDir = path.join(root, 'dist');
    writeFile(entry, 'fn main() -> i32 { 42 }\n');

    const result = await runCompile(['compile', entry, '--target', 'dual', '--out', outDir]);

    expect(result.exitCode).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(path.join(outDir, 'esm', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'cjs', 'index.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'package.json'))).toBe(true);

    const packageJson = JSON.parse(fs.readFileSync(path.join(outDir, 'package.json'), 'utf-8')) as {
      main: string;
      module: string;
      exports: Record<string, { import: string; require: string; types: string }>;
    };
    expect(packageJson.main).toBe('./cjs/index.cjs');
    expect(packageJson.module).toBe('./esm/index.js');
    expect(packageJson.exports['.'].import).toBe('./esm/index.js');
    expect(packageJson.exports['.'].require).toBe('./cjs/index.cjs');
  });

  test('lumina-language-client package metadata exposes dual import and require entries', () => {
    const packageJsonPath = path.resolve(__dirname, '../packages/lumina-language-client/package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      main: string;
      module: string;
      types: string;
      exports: Record<string, { import: string; require: string; types: string }>;
    };

    expect(packageJson.main).toBe('./dist/cjs/index.js');
    expect(packageJson.module).toBe('./dist/esm/index.js');
    expect(packageJson.types).toBe('./dist/esm/index.d.ts');
    expect(packageJson.exports['.']).toEqual({
      import: './dist/esm/index.js',
      require: './dist/cjs/index.js',
      types: './dist/esm/index.d.ts',
    });
  });
});
