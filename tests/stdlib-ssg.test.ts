import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const ssgStdPath = path.resolve(__dirname, '../std/ssg.lm');
const ssgStdSource = fs.readFileSync(ssgStdPath, 'utf-8');

type SsgApi = {
  serializedStateOptions: (state: unknown, options: Record<string, unknown>) => Record<string, unknown>;
  loaderStateOptions: (state: unknown, options: Record<string, unknown>) => Record<string, unknown>;
  islandStateOptions: (state: unknown, options: Record<string, unknown>) => Record<string, unknown>;
};

const compileSsgStdlib = (): SsgApi => {
  const ast = parseLuminaProgram(ssgStdSource);
  const js = (`const render = __runtimeRender;\n${generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code}`)
    .replace(/const render = \{[\s\S]*?\};\n/, 'const render = __runtimeRender;\n');
  const factory = new Function(
    '__runtimeRender',
    'module',
    `${js}\nreturn { serializedStateOptions, loaderStateOptions, islandStateOptions };`
  ) as (render: Record<string, unknown>, moduleHandle: { exports: Record<string, unknown> }) => SsgApi;

  return factory(
    {
      props_attr: (name: string, value: unknown) => ({ [name]: value }),
      props_merge: (...parts: Array<Record<string, unknown> | null | undefined>) =>
        Object.assign({}, ...parts.filter(Boolean)),
    },
    { exports: {} }
  );
};

describe('@std/ssg', () => {
  test('typechecks and emits SSG helpers', () => {
    const ast = parseLuminaProgram(ssgStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('hydrationOptions');
    expect(js).toContain('serializedStateOptions');
    expect(js).toContain('loaderStateOptions');
    expect(js).toContain('hydrationBoundaryOptions');
    expect(js).toContain('requestOptions');
    expect(js).toContain('deferredDataOptions');
    expect(js).toContain('islandStateOptions');
    expect(js).toContain('islandProps');
    expect(js).toContain('deferredHydrationProps');
    expect(js).toContain('ssgPage');
    expect(js).toContain('ssgRenderApp');
    expect(js).toContain('ssgWriteApp');
    expect(js).toContain('renderChunks');
    expect(js).toContain('renderReadableStream');
  });

  test('state handoff option helpers execute', () => {
    const api = compileSsgStdlib();

    expect(api.serializedStateOptions({ boot: true }, { title: 'Docs' })).toEqual({
      title: 'Docs',
      serializedState: { boot: true },
    });
    expect(api.loaderStateOptions({ route: 'ready' }, {})).toEqual({
      loaderState: { route: 'ready' },
    });
    expect(api.islandStateOptions({ island: 'nav' }, {})).toEqual({
      islandState: { island: 'nav' },
    });
  });
});
