import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

type StdCase = {
  moduleName: string;
  filePath: string;
  expectedSymbol: string;
};

const stdCases: StdCase[] = [
  { moduleName: 'render', filePath: path.resolve(__dirname, '../std/render.lm'), expectedSymbol: 'renderApp' },
  { moduleName: 'router', filePath: path.resolve(__dirname, '../std/router.lm'), expectedSymbol: 'createRouter' },
  { moduleName: 'forms', filePath: path.resolve(__dirname, '../std/forms.lm'), expectedSymbol: 'bindValue' },
  { moduleName: 'store', filePath: path.resolve(__dirname, '../std/store.lm'), expectedSymbol: 'createStore' },
  { moduleName: 'resource', filePath: path.resolve(__dirname, '../std/resource.lm'), expectedSymbol: 'createResource' },
  { moduleName: 'tabs', filePath: path.resolve(__dirname, '../std/tabs.lm'), expectedSymbol: 'tabsRoot' },
  { moduleName: 'dialog', filePath: path.resolve(__dirname, '../std/dialog.lm'), expectedSymbol: 'dialogRoot' },
  { moduleName: 'popover', filePath: path.resolve(__dirname, '../std/popover.lm'), expectedSymbol: 'popoverRoot' },
  { moduleName: 'tooltip', filePath: path.resolve(__dirname, '../std/tooltip.lm'), expectedSymbol: 'tooltipRoot' },
  { moduleName: 'toast', filePath: path.resolve(__dirname, '../std/toast.lm'), expectedSymbol: 'toastRoot' },
  { moduleName: 'menu', filePath: path.resolve(__dirname, '../std/menu.lm'), expectedSymbol: 'menuRoot' },
  { moduleName: 'select', filePath: path.resolve(__dirname, '../std/select.lm'), expectedSymbol: 'selectRoot' },
  { moduleName: 'combobox', filePath: path.resolve(__dirname, '../std/combobox.lm'), expectedSymbol: 'comboboxRoot' },
  { moduleName: 'multiselect', filePath: path.resolve(__dirname, '../std/multiselect.lm'), expectedSymbol: 'multiselectRoot' },
  { moduleName: 'checkbox', filePath: path.resolve(__dirname, '../std/checkbox.lm'), expectedSymbol: 'checkbox' },
  { moduleName: 'radio', filePath: path.resolve(__dirname, '../std/radio.lm'), expectedSymbol: 'radioGroup' },
  { moduleName: 'testing', filePath: path.resolve(__dirname, '../std/testing.lm'), expectedSymbol: 'testingCreateDomHarness' },
  { moduleName: 'devtools', filePath: path.resolve(__dirname, '../std/devtools.lm'), expectedSymbol: 'devtoolsSnapshot' },
  { moduleName: 'ssg', filePath: path.resolve(__dirname, '../std/ssg.lm'), expectedSymbol: 'ssgPage' },
  { moduleName: 'ui', filePath: path.resolve(__dirname, '../std/ui.lm'), expectedSymbol: 'presenceCard' },
  { moduleName: 'web_components', filePath: path.resolve(__dirname, '../std/web_components.lm'), expectedSymbol: 'defineCustomElement' },
];

const moduleSources = new Map(stdCases.map((entry) => [entry.moduleName, fs.readFileSync(entry.filePath, 'utf-8')]));

describe('UI stdlib matrix', () => {
  test.each(stdCases)('parses @std/$moduleName as a Lumina program', ({ moduleName }) => {
    const source = moduleSources.get(moduleName);
    expect(source).toBeDefined();
    const ast = parseLuminaProgram(source ?? '');
    expect(ast.type).toBe('Program');
  });

  test.each(stdCases)('analyzes @std/$moduleName without semantic or HM errors', ({ moduleName }) => {
    const source = moduleSources.get(moduleName);
    const ast = parseLuminaProgram(source ?? '');
    const semantic = analyzeLumina(ast);
    const semanticErrors = semantic.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  test.each(stdCases)('emits expected JS symbol for @std/$moduleName', ({ moduleName, expectedSymbol }) => {
    const source = moduleSources.get(moduleName);
    const ast = parseLuminaProgram(source ?? '');
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain(expectedSymbol);
  });
});
