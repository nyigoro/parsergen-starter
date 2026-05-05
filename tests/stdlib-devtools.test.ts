import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const devtoolsStdPath = path.resolve(__dirname, '../std/devtools.lm');
const devtoolsStdSource = fs.readFileSync(devtoolsStdPath, 'utf-8');

describe('@std/devtools', () => {
  test('typechecks and emits devtools helpers', () => {
    const ast = parseLuminaProgram(devtoolsStdSource);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('devtoolsSnapshot');
    expect(js).toContain('installDevtools');
    expect(js).toContain('devtoolsRecordEvent');
    expect(js).toContain('InspectorRecord');
    expect(js).toContain('InspectorPanel');
    expect(js).toContain('inspectorRecord');
    expect(js).toContain('inspectorPanel');
    expect(js).toContain('routeInspector');
    expect(js).toContain('resourceInspector');
    expect(js).toContain('hydrationInspector');
    expect(js).toContain('resources');
    expect(js).toContain('signals');
    expect(js).toContain('roots');
    expect(js).toContain('recordRoute');
    expect(js).toContain('recordResource');
    expect(js).toContain('recordHydration');
    expect(js).toContain('inspectHydrationMismatch');
    expect(js).toContain('inspect:');
    expect(js).toContain('recordRouteTransition');
    expect(js).toContain('recordResourceTiming');
    expect(js).toContain('recordSignalDependency');
    expect(js).toContain('recordHydrationRecovery');
    expect(js).toContain('profileStart');
    expect(js).toContain('profileEnd');
    expect(js).toContain('recordProfilerSpan');
    expect(js).toContain('recordRenderCost');
    expect(js).toContain('devtoolsTimeline');
    expect(js).toContain('devtoolsClearTimeline');
  });
});
