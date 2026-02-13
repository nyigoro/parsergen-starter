import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { compileLuminaTask } from '../src/bin/lumina-core.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const indexToLineCol = (text: string, index: number): { line: number; column: number } => {
  let line = 1;
  let column = 0;
  const max = Math.min(index, text.length);
  for (let i = 0; i < max; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
};

const generateWithSourceMap = (source: string) => {
  const ast = parser.parse(source) as never;
  return generateJSFromAst(ast, { sourceMap: true, sourceFile: 'input.lm', sourceContent: source });
};

const getOriginalFor = async (code: string, map: NonNullable<ReturnType<typeof generateWithSourceMap>['map']>, needle: string) => {
  const idx = code.indexOf(needle);
  if (idx < 0) {
    throw new Error(`Expected to find "${needle}" in generated code`);
  }
  const pos = indexToLineCol(code, idx);
  let result: { line: number | null; column: number | null } = { line: null, column: null };
  await SourceMapConsumer.with(map, null, (consumer) => {
    const original = consumer.originalPositionFor({ line: pos.line, column: pos.column });
    result = { line: original.line, column: original.column };
  });
  return result;
};

describe('Source Map Generation (AST codegen)', () => {
  it('generates source map for simple function', async () => {
    const source = [
      'fn add(a: int, b: int) { return a + b; }',
      'fn main() { return add(1, 2); }',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    expect(map).toBeDefined();
    const original = await getOriginalFor(code, map!, 'function add');
    expect(original.line).toBe(1);
  });

  it('generates source map for let bindings', async () => {
    const source = [
      'fn main() {',
      '  let x = 1;',
      '  return x;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const original = await getOriginalFor(code, map!, 'const x');
    expect(original.line).toBe(2);
    expect(original.column).toBeGreaterThanOrEqual(2);
  });

  it('generates source map for function calls', async () => {
    const source = [
      'fn add(a: int, b: int) { return a + b; }',
      'fn main() {',
      '  let x = add(1, 2);',
      '  return x;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const original = await getOriginalFor(code, map!, 'add(1, 2)');
    expect(original.line).toBe(3);
  });

  it('maps match expressions to generated switch', async () => {
    const source = [
      'enum Option<T> { Some(T), None }',
      'fn main() {',
      '  let x = Option.Some(1);',
      '  let y = match x {',
      '    Option.Some(v) => v,',
      '    Option.None => 0,',
      '  };',
      '  return y;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const original = await getOriginalFor(code, map!, '(() =>');
    expect(original.line).toBe(4);
  });

  it('maps member access correctly', async () => {
    const source = [
      'struct Foo { val: int }',
      'fn main() {',
      '  let foo = Foo { val: 1 };',
      '  let x = foo.val;',
      '  return x;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const original = await getOriginalFor(code, map!, 'foo.val');
    expect(original.line).toBe(4);
  });

  it('maps pipe operators to call chain', async () => {
    const source = [
      'fn add(a: int, b: int) { return a + b; }',
      'fn main() {',
      '  let y = 1 |> add(2);',
      '  return y;',
      '}',
    ].join('\n') + '\n';
    const { map } = generateWithSourceMap(source);
    const columns = new Set<number>();
    await SourceMapConsumer.with(map!, null, (consumer) => {
      consumer.eachMapping((m) => {
        if (m.source !== 'input.lm' || m.originalLine !== 3) return;
        columns.add(m.generatedColumn);
      });
    });
    expect(columns.size).toBeGreaterThanOrEqual(2);
  });

  it('maps move expressions', async () => {
    const source = [
      'fn main() {',
      '  let x = 1;',
      '  let y = move x;',
      '  return y;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const original = await getOriginalFor(code, map!, 'const y =');
    expect(original.line).toBe(3);
  });
});

describe('Source map format (CLI)', () => {
  const compileWithMode = async (mode: 'inline' | 'external' | 'none') => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-sourcemap-'));
    const sourcePath = path.join(tmpDir, 'main.lm');
    const outPath = path.join(tmpDir, 'main.js');
    const source = 'fn main() { return 0; }\n';
    fs.writeFileSync(sourcePath, source, 'utf-8');

    await compileLuminaTask({
      sourcePath,
      outPath,
      target: 'esm',
      grammarPath,
      useRecovery: false,
      diCfg: false,
      useAstJs: true,
      sourceMap: mode !== 'none',
      inlineSourceMap: mode === 'inline',
    });

    const out = fs.readFileSync(outPath, 'utf-8');
    const mapPath = outPath + '.map';
    const mapExists = fs.existsSync(mapPath);
    return { tmpDir, outPath, out, mapPath, mapExists };
  };

  it('generates inline source map when requested', async () => {
    const { tmpDir, out, mapExists } = await compileWithMode('inline');
    expect(out).toContain('sourceMappingURL=data:application/json;base64,');
    expect(mapExists).toBe(false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates external .js.map file when requested', async () => {
    const { tmpDir, outPath, out, mapExists } = await compileWithMode('external');
    expect(out).toContain(`//# sourceMappingURL=${path.basename(outPath)}.map`);
    expect(mapExists).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('omits source map when none specified', async () => {
    const { tmpDir, out, mapExists } = await compileWithMode('none');
    expect(out).not.toContain('sourceMappingURL=');
    expect(mapExists).toBe(false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('Source map accuracy (integration)', () => {
  it('maps generated positions back to original source', async () => {
    const source = [
      'fn main() {',
      '  let x = 1;',
      '  return x;',
      '}',
    ].join('\n') + '\n';
    const { code, map } = generateWithSourceMap(source);
    const idx = code.indexOf('return');
    const pos = indexToLineCol(code, idx);
    let original: { line: number | null; column: number | null } = { line: null, column: null };
    await SourceMapConsumer.with(map!, null, (consumer) => {
      original = consumer.originalPositionFor({ line: pos.line, column: pos.column });
    });
    expect(original.line).toBe(3);
  });
});
