import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const resourceStdPath = path.resolve(__dirname, '../std/resource.lm');
const resourceStdSource = fs.readFileSync(resourceStdPath, 'utf-8');

type ResourceRecord = {
  key: unknown;
  loader: () => Promise<unknown>;
  options: Record<string, unknown>;
  status: string;
  data: unknown;
  calls: number;
};

type ResourceApi = {
  requestPolicy: (requestId: string, ttlMs: number, props: Record<string, unknown>) => Record<string, unknown>;
  routeRequestPolicy: (
    routeId: string,
    requestId: string,
    ttlMs: number,
    props: Record<string, unknown>
  ) => Record<string, unknown>;
  requestRouteDataPolicy: (
    requestId: string,
    routeId: string,
    ttlMs: number,
    props: Record<string, unknown>
  ) => Record<string, unknown>;
  prefetchOptions: (ttlMs: number, props: Record<string, unknown>) => Record<string, unknown>;
  createPrefetchResource: <T>(key: unknown, ttlMs: number, loader: () => Promise<T>) => { raw: ResourceRecord };
  status: (resource: { raw: ResourceRecord }) => string;
  data: (resource: { raw: ResourceRecord }) => unknown;
  refresh: <T>(resource: { raw: ResourceRecord }) => Promise<T>;
  clearRequestScope: (requestId: string) => number;
};

const compileResourceStdlib = (): ResourceApi => {
  const ast = parseLuminaProgram(resourceStdSource);
  const js = (`const render = __runtimeRender;\n${generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code}`)
    .replace(/const render = \{[\s\S]*?\};\n/, 'const render = __runtimeRender;\n');
  const factory = new Function(
    '__runtimeRender',
    'module',
    `${js}\nreturn { requestPolicy, routeRequestPolicy, requestRouteDataPolicy, prefetchOptions, createPrefetchResource, status, data, refresh, clearRequestScope };`
  ) as (render: Record<string, unknown>, moduleHandle: { exports: Record<string, unknown> }) => ResourceApi;

  const runtimeRender = {
    props_empty: () => ({}),
    props_attr: (name: string, value: unknown) => ({ [name]: value }),
    props_merge: (...parts: Array<Record<string, unknown> | null | undefined>) =>
      Object.assign({}, ...parts.filter(Boolean)),
    createResource: (key: unknown, loader: () => Promise<unknown>, options: Record<string, unknown>) => {
      const record: ResourceRecord = { key, loader, options, status: options.enabled === false ? 'idle' : 'loading', data: null, calls: 0 };
      if (options.enabled !== false) {
        record.calls += 1;
        void loader().then((value) => {
          record.status = 'success';
          record.data = value;
        });
      }
      return record;
    },
    resourceStatus: (record: ResourceRecord) => record.status,
    resourceData: (record: ResourceRecord) => record.data,
    resourceRefresh: async (record: ResourceRecord) => {
      record.calls += 1;
      record.status = 'loading';
      record.data = await record.loader();
      record.status = 'success';
      return record.data;
    },
    resourceClearRequest: (requestId: string) => requestId.length,
  };

  return factory(runtimeRender, { exports: {} });
};

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
    expect(js).toContain('requestPolicy');
    expect(js).toContain('routeRequestPolicy');
    expect(js).toContain('requestRouteDataPolicy');
    expect(js).toContain('abortOnRefresh');
    expect(js).toContain('routeDataPolicy');
    expect(js).toContain('prefetchOptions');
    expect(js).toContain('createResource');
    expect(js).toContain('resourceStatus');
    expect(js).toContain('createPrefetchResource');
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
    expect(js).toContain('revalidateScope');
    expect(js).toContain('resourceClearCache');
    expect(js).toContain('resourceClearScope');
    expect(js).toContain('resourceClearRequest');
    expect(js).toContain('clearRequestScope');
    expect(js).toContain('resourceMutate');
  });

  test('request and prefetch policies execute with app lifecycle semantics', async () => {
    const api = compileResourceStdlib();

    expect(api.requestPolicy('req-1', 5000, { auth: true })).toMatchObject({
      auth: true,
      scope: 'req-1',
      requestId: 'req-1',
      ttlMs: 5000,
      staleWhileRevalidate: true,
      abortOnRefresh: true,
    });
    expect(api.routeRequestPolicy('route:projects', 'req-2', 7000, {})).toMatchObject({
      scope: 'route:projects',
      requestId: 'req-2',
      ttlMs: 7000,
      staleWhileRevalidate: true,
      abortOnRefresh: true,
      tags: 'route:projects',
      dependencies: 'route:projects',
    });
    expect(api.requestRouteDataPolicy('req-3', 'route:tasks', 9000, {})).toMatchObject({
      scope: 'route:tasks',
      requestId: 'req-3',
    });
    expect(api.clearRequestScope('req-3')).toBe(5);
    expect(api.prefetchOptions(3000, { tag: 'docs' })).toMatchObject({
      tag: 'docs',
      ttlMs: 3000,
      staleWhileRevalidate: true,
      enabled: false,
    });

    const resource = api.createPrefetchResource('prefetch:docs', 3000, async () => 'loaded');
    expect(resource.raw.calls).toBe(0);
    expect(api.status(resource)).toBe('idle');
    await expect(api.refresh<string>(resource)).resolves.toBe('loaded');
    expect(resource.raw.calls).toBe(1);
    expect(api.data(resource)).toBe('loaded');
  });
});
