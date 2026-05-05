import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const uiStdPath = path.resolve(__dirname, '../std/ui.lm');
const uiStdSource = fs.readFileSync(uiStdPath, 'utf-8');

describe('@std/ui', () => {
  test('typechecks and emits styled wrappers', () => {
    const ast = parseLuminaProgram(uiStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('transitionPresence');
    expect(js).toContain('tabsList');
    expect(js).toContain('dialogContent');
    expect(js).toContain('props_attr("type", "button")');
    expect(js).toContain('buttonVariant');
    expect(js).toContain('themeRoot');
    expect(js).toContain('themeTokens');
    expect(js).toContain('appShell');
    expect(js).toContain('appShellSidebar');
    expect(js).toContain('appHeader');
    expect(js).toContain('appSidebar');
    expect(js).toContain('appMain');
    expect(js).toContain('inputVariant');
    expect(js).toContain('field');
    expect(js).toContain('fieldGroup');
    expect(js).toContain('label');
    expect(js).toContain('helpText');
    expect(js).toContain('errorText');
    expect(js).toContain('navList');
    expect(js).toContain('dataTable');
    expect(js).toContain('tableHeaderCell');
    expect(js).toContain('tableCell');
  });
});
