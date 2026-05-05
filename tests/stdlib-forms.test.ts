import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const formsStdPath = path.resolve(__dirname, '../std/forms.lm');
const formsStdSource = fs.readFileSync(formsStdPath, 'utf-8');

type Signal<T> = { value: T };
type FormsApi = {
  createFieldState: () => { dirty: Signal<boolean>; touched: Signal<boolean>; error: Signal<string> };
  setFieldError: (field: { error: Signal<string> }, message: string) => void;
  uploadFieldProps: (name: string, accept: string, multiple: boolean, props: Record<string, unknown>) => Record<string, unknown>;
  schemaFieldProps: (schemaName: string, fieldName: string, props: Record<string, unknown>) => Record<string, unknown>;
  fieldInputProps: (
    fieldName: string,
    field: { dirty: Signal<boolean>; touched: Signal<boolean>; error: Signal<string> },
    props: Record<string, unknown>
  ) => Record<string, unknown>;
  fieldControlProps: (
    fieldName: string,
    field: { dirty: Signal<boolean>; touched: Signal<boolean>; error: Signal<string> },
    props: Record<string, unknown>
  ) => Record<string, unknown>;
  validationSummaryProps: (props: Record<string, unknown>) => Record<string, unknown>;
  validationSummaryFor: (formId: string, props: Record<string, unknown>) => Record<string, unknown>;
};

const compileFormsStdlib = (): FormsApi => {
  const ast = parseLuminaProgram(formsStdSource);
  const generated = generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code
    .replace(/const str = \{[\s\S]*?\};\n/, 'const str = __runtimeStr;\n');
  const js = `const reactive = __runtimeReactive;\nconst render = __runtimeRender;\n${generated}`;
  const factory = new Function(
    '__runtimeReactive',
    '__runtimeRender',
    '__runtimeStr',
    'module',
    `${js}\nreturn { createFieldState, setFieldError, uploadFieldProps, schemaFieldProps, fieldInputProps, fieldControlProps, validationSummaryProps, validationSummaryFor };`
  ) as (
    reactive: Record<string, unknown>,
    render: Record<string, unknown>,
    str: Record<string, unknown>,
    moduleHandle: { exports: Record<string, unknown> }
  ) => FormsApi;

  return factory(
    {
      createSignal: <T,>(value: T): Signal<T> => ({ value }),
      get: <T,>(signal: Signal<T>): T => signal.value,
      set: <T,>(signal: Signal<T>, value: T): boolean => {
        signal.value = value;
        return true;
      },
    },
    {
      props_attr: (name: string, value: unknown) => ({ [name]: value }),
      props_type: (kind: string) => ({ type: kind }),
      props_name: (name: string) => ({ name }),
      props_merge: (...parts: Array<Record<string, unknown> | null | undefined>) =>
        Object.assign({}, ...parts.filter(Boolean)),
    },
    {
      concat: (left: string, right: string) => left + right,
    },
    { exports: {} }
  );
};

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
    expect(js).toContain('fileInputNamed');
    expect(js).toContain('multipartProps');
    expect(js).toContain('formDataSubmitProps');
    expect(js).toContain('uploadFieldProps');
    expect(js).toContain('nestedFieldName');
    expect(js).toContain('fieldArrayName');
    expect(js).toContain('fieldArrayItemName');
    expect(js).toContain('schemaAdapter');
    expect(js).toContain('serverValidation');
    expect(js).toContain('applyServerValidation');
    expect(js).toContain('serverValidationProps');
    expect(js).toContain('schemaFieldProps');
    expect(js).toContain('fieldErrorId');
    expect(js).toContain('fieldHelpId');
    expect(js).toContain('fieldErrorProps');
    expect(js).toContain('fieldControlProps');
    expect(js).toContain('fieldInputProps');
    expect(js).toContain('fieldTouchedError');
    expect(js).toContain('validationSummaryProps');
    expect(js).toContain('validationSummaryFor');
    expect(js).toContain('checkbox');
    expect(js).toContain('radio');
    expect(js).toContain('submitProps');
    expect(js).toContain('props_on_checked_change');
    expect(js).toContain('props_on_submit');
    expect(js).toContain('createFieldState');
    expect(js).toContain('actionWithOptions');
    expect(js).toContain('submitAction');
    expect(js).toContain('submitActionOptimistic');
    expect(js).toContain('submitActionWithRollback');
    expect(js).toContain('submitActionWithCurrentRollback');
    expect(js).toContain('actionFormProps');
    expect(js).toContain('optimisticActionFormProps');
    expect(js).toContain('resourceSubmit');
    expect(js).toContain('resourceSubmitOptimistic');
    expect(js).toContain('rollbackResource');
    expect(js).toContain('actionStatus');
    expect(js).toContain('actionSubmitProps');
  });

  test('field accessibility props only attach error metadata when invalid', () => {
    const api = compileFormsStdlib();
    const field = api.createFieldState();

    expect(api.fieldControlProps('email', field, { id: 'email' })).toEqual({ id: 'email' });
    api.setFieldError(field, 'Invalid email');
    expect(api.fieldControlProps('email', field, { id: 'email' })).toMatchObject({
      id: 'email',
      'aria-invalid': true,
      'aria-describedby': 'email-error',
      'aria-errormessage': 'email-error',
    });
    expect(api.validationSummaryProps({ id: 'summary' })).toEqual({ id: 'summary', role: 'alert' });
    expect(api.validationSummaryFor('profile', { id: 'summary' })).toEqual({
      id: 'summary',
      role: 'alert',
      'data-lumina-form': 'profile',
    });
    expect(api.fieldInputProps('email', field, { id: 'email' })).toMatchObject({
      id: 'email',
      'data-lumina-server-field': 'email',
      'aria-invalid': true,
    });
    expect(api.schemaFieldProps('zod', 'email', {})).toMatchObject({
      'data-lumina-schema': 'zod',
      'data-lumina-server-field': 'email',
    });
    expect(api.uploadFieldProps('avatar', 'image/*', true, {})).toMatchObject({
      type: 'file',
      name: 'avatar',
      accept: 'image/*',
      multiple: true,
    });
  });
});
