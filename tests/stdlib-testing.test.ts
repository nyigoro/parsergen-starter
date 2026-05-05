import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const testingStdPath = path.resolve(__dirname, '../std/testing.lm');
const testingStdSource = fs.readFileSync(testingStdPath, 'utf-8');

describe('@std/testing', () => {
  test('typechecks and emits testing helpers', () => {
    const ast = parseLuminaProgram(testingStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('testingCreateDomHarness');
    expect(js).toContain('testingMountApp');
    expect(js).toContain('testingHydrateApp');
    expect(js).toContain('testingGetById');
    expect(js).toContain('testingGetByText');
    expect(js).toContain('testingGetByRole');
    expect(js).toContain('testingQueryAllByRole');
    expect(js).toContain('testingTextContent');
    expect(js).toContain('testingInput');
    expect(js).toContain('testingSubmit');
    expect(js).toContain('testingFlush');
    expect(js).toContain('testingWaitFor');
    expect(js).toContain('flush');
    expect(js).toContain('act');
    expect(js).toContain('waitFor');
    expect(js).toContain('findByText');
    expect(js).toContain('findByRole');
    expect(js).toContain('clickAndFlush');
  });
});
