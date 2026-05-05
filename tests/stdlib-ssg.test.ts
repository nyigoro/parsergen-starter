import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const ssgStdPath = path.resolve(__dirname, '../std/ssg.lm');
const ssgStdSource = fs.readFileSync(ssgStdPath, 'utf-8');

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
    expect(js).toContain('hydrationBoundaryOptions');
    expect(js).toContain('ssgPage');
    expect(js).toContain('ssgRenderApp');
    expect(js).toContain('ssgWriteApp');
  });
});
