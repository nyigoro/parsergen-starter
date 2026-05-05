import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const resourceStdPath = path.resolve(__dirname, '../std/resource.lm');
const resourceStdSource = fs.readFileSync(resourceStdPath, 'utf-8');

describe('@std/resource', () => {
  test('typechecks and emits resource helpers', () => {
    const ast = parseLuminaProgram(resourceStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('cachePolicy');
    expect(js).toContain('backgroundRefresh');
    expect(js).toContain('requestScope');
    expect(js).toContain('abortOnRefresh');
    expect(js).toContain('routeDataPolicy');
    expect(js).toContain('createResource');
    expect(js).toContain('resourceStatus');
    expect(js).toContain('resourceData');
    expect(js).toContain('resourceError');
    expect(js).toContain('resourceRead');
    expect(js).toContain('resourceRefresh');
    expect(js).toContain('resourceInvalidate');
    expect(js).toContain('resourceInvalidateKey');
    expect(js).toContain('resourceInvalidatePrefix');
    expect(js).toContain('resourceInvalidateTag');
    expect(js).toContain('resourceInvalidateDependency');
    expect(js).toContain('resourceInvalidateScope');
    expect(js).toContain('resourceClearCache');
    expect(js).toContain('resourceClearScope');
    expect(js).toContain('resourceMutate');
  });
});
