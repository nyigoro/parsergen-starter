import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const formsStdPath = path.resolve(__dirname, '../std/forms.lm');
const formsStdSource = fs.readFileSync(formsStdPath, 'utf-8');

describe('@std/forms', () => {
  test('typechecks and emits controlled form helpers', () => {
    const ast = parseLuminaProgram(formsStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('bindValue');
    expect(js).toContain('bindChecked');
    expect(js).toContain('textInput');
    expect(js).toContain('hiddenInput');
    expect(js).toContain('fileInput');
    expect(js).toContain('multipartProps');
    expect(js).toContain('nestedFieldName');
    expect(js).toContain('fieldArrayName');
    expect(js).toContain('checkbox');
    expect(js).toContain('radio');
    expect(js).toContain('submitProps');
    expect(js).toContain('props_on_checked_change');
    expect(js).toContain('props_on_submit');
    expect(js).toContain('createFieldState');
    expect(js).toContain('actionWithOptions');
    expect(js).toContain('submitAction');
    expect(js).toContain('submitActionOptimistic');
    expect(js).toContain('rollbackResource');
    expect(js).toContain('actionStatus');
    expect(js).toContain('actionSubmitProps');
  });
});
