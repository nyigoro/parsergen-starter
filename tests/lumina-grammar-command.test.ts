import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLumina } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-grammar-'));
  tempDirs.push(dir);
  return dir;
}

function writeMathGrammar(dir: string): string {
  const grammarPath = path.join(dir, 'math.peg');
  fs.writeFileSync(
    grammarPath,
    `
start = left:number _ "+" _ right:number { return { type: "Add", left, right }; }
number = digits:$[0-9]+ { return Number(digits); }
_ = [ \\t\\n\\r]*
`,
    'utf-8'
  );
  return grammarPath;
}

describe('lumina grammar command', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let previousCwd: string;
  let previousExitCode: string | number | undefined;

  beforeEach(() => {
    previousCwd = process.cwd();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.chdir(previousCwd);
    process.exitCode = previousExitCode;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates grammars without parsergen branding', async () => {
    const dir = createTempDir();
    const grammarPath = writeMathGrammar(dir);

    await runLumina(['grammar', grammarPath, '--validate']);

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Grammar is valid');
    expect(output).not.toMatch(/parsergen|pargen/i);
  });

  it('runs from a project directory without resolving the Lumina compiler grammar first', async () => {
    const grammarDir = createTempDir();
    const projectDir = createTempDir();
    const grammarPath = writeMathGrammar(grammarDir);
    process.chdir(projectDir);

    await runLumina(['grammar', grammarPath, '--validate']);

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Grammar is valid');
    expect(process.exitCode).toBeUndefined();
  });

  it('tests a grammar and prints AST output when requested', async () => {
    const dir = createTempDir();
    const grammarPath = writeMathGrammar(dir);

    await runLumina(['grammar', grammarPath, '--test', '1 + 2', '--ast']);

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Parse successful');
    expect(output).toContain('"type": "Add"');
  });

  it('reports parse failures without throwing a raw stack trace', async () => {
    const dir = createTempDir();
    const grammarPath = writeMathGrammar(dir);

    await expect(runLumina(['grammar', grammarPath, '--test', '1 +'])).resolves.toBeUndefined();

    const output = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toMatch(/Expected/);
    expect(output).not.toContain('[object Object]');
    expect(output).not.toContain('Grammar test parse failed');
    expect(output).not.toMatch(/\n\s+at\s+\S/);
    expect(process.exitCode).toBe(1);
  });

  it('reports validation failures without throwing a raw stack trace', async () => {
    const dir = createTempDir();
    const grammarPath = path.join(dir, 'broken.peg');
    fs.writeFileSync(grammarPath, 'start = ', 'utf-8');

    await expect(runLumina(['grammar', grammarPath, '--validate'])).resolves.toBeUndefined();

    const output = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Grammar validation failed');
    expect(output).not.toMatch(/\n\s+at\s+\S/);
    expect(process.exitCode).toBe(1);
  });

  it('prints Lumina-branded grammar help', async () => {
    await runLumina(['grammar', '--help']);

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('lumina grammar <grammar.peg>');
    expect(output).not.toMatch(/parsergen|pargen/i);
  });
});
