import type {
  LuminaArg,
  LuminaCall,
  LuminaExpr,
  LuminaFnDecl,
  LuminaImport,
  LuminaImportSpec,
  LuminaLambda,
  LuminaProgram,
} from './ast.js';

const DIRECT_RENDER_IMPORTS = new Map<string, string>([
  ['vnode', 'vnode'],
  ['element', 'vnode'],
  ['text', 'text'],
  ['fragment', 'fragment'],
  ['portal', 'portal'],
  ['liveText', 'liveText'],
  ['indexList', 'indexList'],
  ['forList', 'forList'],
  ['props_empty', 'props_empty'],
  ['props_class', 'props_class'],
  ['props_on_input', 'props_on_input'],
  ['props_on_change', 'props_on_change'],
  ['props_on_checked_change', 'props_on_checked_change'],
  ['props_on_submit', 'props_on_submit'],
  ['props_attr', 'props_attr'],
  ['props_when', 'props_when'],
  ['props_id', 'props_id'],
  ['props_style', 'props_style'],
  ['props_value', 'props_value'],
  ['props_placeholder', 'props_placeholder'],
  ['props_href', 'props_href'],
  ['props_disabled', 'props_disabled'],
  ['props_key', 'props_key'],
  ['props_checked', 'props_checked'],
  ['props_type', 'props_type'],
  ['props_name', 'props_name'],
  ['props_merge', 'props_merge'],
  ['show', 'show'],
  ['children', 'children'],
  ['slot', 'slot'],
  ['slot_or', 'slot_or'],
  ['suspense', 'suspense'],
  ['errorBoundary', 'errorBoundary'],
  ['transitionPresence', 'transitionPresence'],
]);

const DIRECT_REACTIVE_IMPORTS = new Map<string, string>([['get', 'get']]);

const RENDER_NAMESPACE_CALLS = new Map<string, string>([
  ['vnode', 'vnode'],
  ['element', 'vnode'],
  ['text', 'text'],
  ['fragment', 'fragment'],
  ['portal', 'portal'],
  ['live_text', 'liveText'],
  ['liveText', 'liveText'],
  ['index_list', 'indexList'],
  ['indexList', 'indexList'],
  ['for_list', 'forList'],
  ['forList', 'forList'],
  ['props_empty', 'props_empty'],
  ['props_class', 'props_class'],
  ['props_on_input', 'props_on_input'],
  ['props_on_change', 'props_on_change'],
  ['props_on_checked_change', 'props_on_checked_change'],
  ['props_on_submit', 'props_on_submit'],
  ['props_attr', 'props_attr'],
  ['props_when', 'props_when'],
  ['props_id', 'props_id'],
  ['props_style', 'props_style'],
  ['props_value', 'props_value'],
  ['props_placeholder', 'props_placeholder'],
  ['props_href', 'props_href'],
  ['props_disabled', 'props_disabled'],
  ['props_key', 'props_key'],
  ['props_checked', 'props_checked'],
  ['props_type', 'props_type'],
  ['props_name', 'props_name'],
  ['props_merge', 'props_merge'],
  ['component', 'component'],
  ['show', 'show'],
  ['children', 'children'],
  ['slot', 'slot'],
  ['slot_or', 'slot_or'],
  ['suspense', 'suspense'],
  ['errorBoundary', 'errorBoundary'],
  ['transitionPresence', 'transitionPresence'],
]);

const STATIC_RENDER_CALLS = new Set([
  'text',
  'vnode',
  'fragment',
  'portal',
  'props_empty',
  'props_class',
  'props_attr',
  'props_id',
  'props_style',
  'props_value',
  'props_placeholder',
  'props_href',
  'props_disabled',
  'props_key',
  'props_checked',
  'props_type',
  'props_name',
  'props_merge',
]);

const DOM_SPECIALIZABLE_RENDER_CALLS = new Set([
  'text',
  'vnode',
  'fragment',
  'portal',
  'liveText',
  'indexList',
  'forList',
]);

interface RenderImportContext {
  renderNamespaces: Set<string>;
  directRenderCalls: Map<string, string>;
  reactiveNamespaces: Set<string>;
  directReactiveCalls: Map<string, string>;
}

const getImportSourceText = (stmt: LuminaImport): string | null => {
  const source = stmt.source as { type?: string; value?: unknown };
  return source?.type === 'String' && typeof source.value === 'string' ? source.value : null;
};

const normalizeImportSpecs = (spec: LuminaImport['spec']): LuminaImportSpec[] => {
  if (typeof spec === 'string') {
    return [{ name: spec }];
  }
  if (Array.isArray(spec)) {
    return spec.map((entry) => (typeof entry === 'string' ? { name: entry } : entry));
  }
  return [spec];
};

const collectRenderImportContext = (program: LuminaProgram): RenderImportContext => {
  const renderNamespaces = new Set<string>();
  const directRenderCalls = new Map<string, string>();
  const reactiveNamespaces = new Set<string>();
  const directReactiveCalls = new Map<string, string>();

  for (const stmt of program.body) {
    if (stmt.type !== 'Import') continue;
    const source = getImportSourceText(stmt);
    if (!source) continue;
    const specs = normalizeImportSpecs(stmt.spec);

    if (source === '@std') {
      for (const spec of specs) {
        if (spec.namespace) continue;
        if (spec.name === 'render') {
          renderNamespaces.add(spec.alias ?? spec.name);
          continue;
        }
        if (spec.name === 'reactive') {
          reactiveNamespaces.add(spec.alias ?? spec.name);
        }
      }
      continue;
    }

    if (source === '@std/render') {
      for (const spec of specs) {
        if (spec.namespace) continue;
        const canonical = DIRECT_RENDER_IMPORTS.get(spec.name);
        if (!canonical) continue;
        directRenderCalls.set(spec.alias ?? spec.name, canonical);
      }
      continue;
    }

    if (source === '@std/reactive') {
      for (const spec of specs) {
        if (spec.namespace) continue;
        const canonical = DIRECT_REACTIVE_IMPORTS.get(spec.name);
        if (!canonical) continue;
        directReactiveCalls.set(spec.alias ?? spec.name, canonical);
      }
    }
  }

  return { renderNamespaces, directRenderCalls, reactiveNamespaces, directReactiveCalls };
};

const getNormalizedRenderCalleeNameFromContext = (
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  context: RenderImportContext
): string | null => {
  if (expr.receiver) return null;

  if (expr.enumName && context.renderNamespaces.has(expr.enumName)) {
    const calleeName =
      expr.callee.type === 'Identifier' ? expr.callee.name : (expr.callee.name ?? null);
    return calleeName ? (RENDER_NAMESPACE_CALLS.get(calleeName) ?? null) : null;
  }

  if (expr.callee.type !== 'Identifier') return null;
  return context.directRenderCalls.get(expr.callee.name) ?? null;
};

export const getNormalizedRenderCalleeName = (
  expr: Extract<LuminaExpr, { type: 'Call' }>
): string | null => expr.renderLowering?.callee ?? null;

const getNormalizedReactiveCalleeNameFromContext = (
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  context: RenderImportContext
): string | null => {
  if (expr.receiver) return null;
  const calleeName =
    expr.callee.type === 'Identifier' ? expr.callee.name : (expr.callee.name ?? null);
  if (!calleeName) return null;

  if (expr.enumName && context.renderNamespaces.has(expr.enumName)) {
    if (calleeName === 'get') return 'get';
  }

  if (expr.enumName && context.reactiveNamespaces.has(expr.enumName)) {
    if (calleeName === 'get') return 'get';
    return null;
  }

  return context.directReactiveCalls.get(calleeName) ?? null;
};

export const isReactiveGetCall = (expr: LuminaExpr): expr is LuminaCall =>
  expr.type === 'Call' && expr.reactiveLowering?.callee === 'get';

export const stripRenderLoweringMetadata = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripRenderLoweringMetadata(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (
      key === 'id' ||
      key === 'location' ||
      key === 'renderLowering' ||
      key === 'reactiveLowering'
    )
      continue;
    next[key] = stripRenderLoweringMetadata(entry);
  }
  return next;
};

export const isStaticRenderHoistableExpr = (expr: LuminaExpr): boolean => {
  switch (expr.type) {
    case 'Number':
    case 'Boolean':
    case 'String':
      return true;
    case 'InterpolatedString':
      return expr.parts.every(
        (part) => typeof part === 'string' || isStaticRenderHoistableExpr(part)
      );
    case 'ArrayLiteral':
    case 'TupleLiteral':
      return expr.elements.every((element) => isStaticRenderHoistableExpr(element));
    case 'StructLiteral':
      return expr.fields.every((field) => isStaticRenderHoistableExpr(field.value));
    case 'Call': {
      const callName = getNormalizedRenderCalleeName(expr);
      if (!callName || !STATIC_RENDER_CALLS.has(callName)) {
        return false;
      }
      return expr.args.every((arg) => isStaticRenderHoistableExpr(arg.value));
    }
    default:
      return false;
  }
};

const annotateRenderCall = (
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  context: RenderImportContext
): void => {
  const callee = getNormalizedRenderCalleeNameFromContext(expr, context);
  if (!callee) {
    expr.renderLowering = null;
    return;
  }
  expr.renderLowering = {
    callee,
    staticHoistable: false,
    domSpecializable: DOM_SPECIALIZABLE_RENDER_CALLS.has(callee),
  };
};

const annotateReactiveCall = (
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  context: RenderImportContext
): void => {
  const callee = getNormalizedReactiveCalleeNameFromContext(expr, context);
  expr.reactiveLowering = callee ? { callee } : null;
};

const finalizeRenderCall = (expr: Extract<LuminaExpr, { type: 'Call' }>): void => {
  if (!expr.renderLowering) return;
  expr.renderLowering.staticHoistable = isStaticRenderHoistableExpr(expr);
};

const visitNode = (node: unknown, context: RenderImportContext): void => {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const entry of node) {
      visitNode(entry, context);
    }
    return;
  }
  if (typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (record.type === 'Call') {
    annotateRenderCall(record as unknown as Extract<LuminaExpr, { type: 'Call' }>, context);
    annotateReactiveCall(record as unknown as Extract<LuminaExpr, { type: 'Call' }>, context);
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'location' || key === 'renderLowering' || key === 'reactiveLowering') continue;
    visitNode(value, context);
  }

  if (record.type === 'Call') {
    finalizeRenderCall(record as unknown as Extract<LuminaExpr, { type: 'Call' }>);
  }
};

const cloneNode = <T>(value: T): T => stripRenderLoweringMetadata(value) as T;

const createIdentifier = (name: string): LuminaExpr => ({ type: 'Identifier', name });

const createCall = (
  callee: LuminaExpr & { name?: string },
  args: LuminaExpr[],
  options?: { enumName?: string | null; receiver?: LuminaExpr | null }
): LuminaCall => ({
  type: 'Call',
  callee,
  args: args.map((value) => ({ named: false, value })),
  typeArgs: [],
  enumName: options?.enumName ?? null,
  ...(options?.receiver ? { receiver: options.receiver } : {}),
});

const getBlockResultExpr = (lambda: LuminaLambda): LuminaExpr | null => {
  if (lambda.body.body.length !== 1) return null;
  const stmt = lambda.body.body[0] as { type?: string; expr?: LuminaExpr; value?: LuminaExpr };
  if (stmt.type === 'ExprStmt' && stmt.expr) return stmt.expr;
  if (stmt.type === 'Return' && stmt.value) return stmt.value;
  return null;
};

const extractPropsKeyExpr = (propsExpr: LuminaExpr): LuminaExpr | null => {
  if (propsExpr.type === 'StructLiteral') {
    const keyField = propsExpr.fields.find((field) => field.name === 'key');
    return keyField ? keyField.value : null;
  }

  if (propsExpr.type === 'Call') {
    const callee = getNormalizedRenderCalleeName(propsExpr);
    if (callee === 'props_key' && propsExpr.args.length === 1) {
      return propsExpr.args[0].value;
    }
    if (callee === 'props_merge') {
      for (const arg of propsExpr.args) {
        const found = extractPropsKeyExpr(arg.value);
        if (found) return found;
      }
    }
  }

  return null;
};

const extractVNodeKeyExpr = (expr: LuminaExpr): LuminaExpr | null => {
  if (expr.type !== 'Call' || getNormalizedRenderCalleeName(expr) !== 'vnode') return null;
  const propsExpr = expr.args[1]?.value;
  return propsExpr ? extractPropsKeyExpr(propsExpr) : null;
};

const exprReferencesIdentifier = (expr: unknown, name: string): boolean => {
  if (!expr || typeof expr !== 'object') return false;
  if (Array.isArray(expr)) return expr.some((entry) => exprReferencesIdentifier(entry, name));

  const record = expr as Record<string, unknown>;
  if (record.type === 'Identifier' && record.name === name) return true;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'location' || key === 'renderLowering' || key === 'reactiveLowering') continue;
    if (exprReferencesIdentifier(value, name)) return true;
  }
  return false;
};

const getSignalMapCallInfo = (
  expr: LuminaExpr
): { sourceSignal: LuminaExpr; mapLambda: LuminaLambda } | null => {
  if (expr.type !== 'Call') return null;

  if (
    expr.receiver?.type === 'Call' &&
    isReactiveGetCall(expr.receiver) &&
    expr.callee.type === 'Identifier' &&
    expr.callee.name === 'map' &&
    expr.args.length === 1 &&
    expr.args[0]?.value.type === 'Lambda'
  ) {
    return {
      sourceSignal: cloneNode(expr.receiver.args[0]?.value),
      mapLambda: expr.args[0].value,
    };
  }

  const calleeName = expr.callee.type === 'Identifier' ? expr.callee.name : null;
  const sourceArg = expr.args[0]?.value;
  const mapperArg = expr.args[1]?.value;
  if (
    !expr.receiver &&
    calleeName === 'map_vec' &&
    expr.args.length === 2 &&
    sourceArg?.type === 'Call' &&
    isReactiveGetCall(sourceArg) &&
    mapperArg?.type === 'Lambda'
  ) {
    return {
      sourceSignal: cloneNode(sourceArg.args[0]?.value),
      mapLambda: mapperArg,
    };
  }

  return null;
};

const createUndefinedExpr = (): LuminaExpr => ({
  type: 'Identifier',
  name: 'undefined',
});

const collectLocalFunctions = (program: LuminaProgram): Map<string, LuminaFnDecl> => {
  const functions = new Map<string, LuminaFnDecl>();
  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl') {
      functions.set(stmt.name, stmt);
    }
  }
  return functions;
};

const normalizeNamedArgsForParams = (
  rawArgs: LuminaArg[],
  params: LuminaFnDecl['params']
): LuminaArg[] | null => {
  if (!rawArgs.some((arg) => arg.named)) return null;
  const resolved: Array<LuminaArg | null> = Array(params.length).fill(null);
  let positionalIndex = 0;
  for (const arg of rawArgs) {
    if (arg.named) continue;
    if (positionalIndex >= params.length) return null;
    resolved[positionalIndex] = { ...arg, named: false };
    positionalIndex += 1;
  }
  for (const arg of rawArgs) {
    if (!arg.named) continue;
    const index = params.findIndex((param) => param.name === arg.name);
    if (index < 0 || resolved[index]) return null;
    resolved[index] = { named: false, value: arg.value, location: arg.location };
  }
  return params.map((param, index) => {
    const existing = resolved[index];
    if (existing) return existing;
    if (param.defaultValue !== null && param.defaultValue !== undefined) {
      return { named: false, value: createUndefinedExpr(), location: param.location };
    }
    return { named: false, value: createUndefinedExpr(), location: param.location };
  });
};

const normalizeNamedCallArgs = (node: unknown, localFunctions: Map<string, LuminaFnDecl>): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) normalizeNamedCallArgs(entry, localFunctions);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.type === 'Call') {
    const call = record as unknown as LuminaCall;
    if (!call.receiver && !call.enumName && call.callee.type === 'Identifier') {
      const declaration = localFunctions.get(call.callee.name);
      if (declaration) {
        const normalized = normalizeNamedArgsForParams(call.args, declaration.params);
        if (normalized) {
          call.args = normalized;
        }
      }
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'location' || key === 'renderLowering' || key === 'reactiveLowering') continue;
    normalizeNamedCallArgs(value, localFunctions);
  }
};

const promoteMappedSignalChildren = (node: unknown): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) {
      promoteMappedSignalChildren(entry);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.type === 'Call') {
    const call = record as unknown as LuminaCall;
    const lowered = getNormalizedRenderCalleeName(call);
    if ((lowered === 'vnode' || lowered === 'fragment') && call.args.length > 0) {
      const childArgIndex = lowered === 'vnode' ? 2 : 0;
      const childArg = call.args[childArgIndex]?.value;
      if (childArg?.type === 'ArrayLiteral') {
        childArg.elements = childArg.elements.map((child) => {
          const mapInfo = getSignalMapCallInfo(child);
          if (!mapInfo) return child;

          const { mapLambda, sourceSignal } = mapInfo;
          if (
            mapLambda.type !== 'Lambda' ||
            mapLambda.params.length === 0 ||
            mapLambda.params.length > 2
          ) {
            return child;
          }

          const bodyExpr = getBlockResultExpr(mapLambda);
          if (!bodyExpr) return child;
          const keyExpr = extractVNodeKeyExpr(bodyExpr);
          const valueParam = mapLambda.params[0]?.name ?? 'item';
          const indexParam = mapLambda.params[1]?.name ?? 'index';
          const originalLambda = cloneNode(mapLambda);
          const itemSignalName = '__lumina_item';
          const indexSignalName = '__lumina_index';

          const renderWrapper = (): LuminaLambda => ({
            type: 'Lambda',
            async: false,
            params: [
              {
                name: itemSignalName,
                typeName: 'Signal<any>',
                ref: false,
                refMut: false,
                defaultValue: null,
              },
              {
                name: indexSignalName,
                typeName: keyExpr ? 'Signal<int>' : 'int',
                ref: false,
                refMut: false,
                defaultValue: null,
              },
            ],
            returnType: 'VNode',
            body: {
              type: 'Block',
              body: [
                {
                  type: 'ExprStmt',
                  expr: createCall(cloneNode(originalLambda) as LuminaExpr & { name?: string }, [
                    createCall(createIdentifier('get') as LuminaExpr & { name?: string }, [
                      createIdentifier(itemSignalName),
                    ]),
                    keyExpr
                      ? createCall(createIdentifier('get') as LuminaExpr & { name?: string }, [
                          createIdentifier(indexSignalName),
                        ])
                      : createIdentifier(indexSignalName),
                  ]),
                },
              ],
            },
            typeParams: [],
          });

          if (!keyExpr) {
            return createCall(
              createIdentifier('indexList') as LuminaExpr & { name?: string },
              [sourceSignal, renderWrapper()],
              { enumName: 'render' }
            );
          }

          if (keyExpr.type === 'Identifier' && keyExpr.name === indexParam) {
            return createCall(
              createIdentifier('indexList') as LuminaExpr & { name?: string },
              [sourceSignal, renderWrapper()],
              { enumName: 'render' }
            );
          }

          if (exprReferencesIdentifier(keyExpr, indexParam)) {
            return child;
          }

          const keyWrapper: LuminaLambda = {
            type: 'Lambda',
            async: false,
            params: [
              {
                name: valueParam,
                typeName: mapLambda.params[0]?.typeName ?? 'any',
                ref: false,
                refMut: false,
                defaultValue: null,
              },
              {
                name: indexParam,
                typeName: mapLambda.params[1]?.typeName ?? 'int',
                ref: false,
                refMut: false,
                defaultValue: null,
              },
            ],
            returnType: null,
            body: {
              type: 'Block',
              body: [
                {
                  type: 'ExprStmt',
                  expr: cloneNode(keyExpr),
                },
              ],
            },
            typeParams: [],
          };

          return createCall(
            createIdentifier('forList') as LuminaExpr & { name?: string },
            [sourceSignal, keyWrapper, renderWrapper()],
            { enumName: 'render' }
          );
        });
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === 'location' || key === 'renderLowering' || key === 'reactiveLowering') continue;
    promoteMappedSignalChildren(value);
  }
};

export const lowerRenderProgram = (program: LuminaProgram): LuminaProgram => {
  normalizeNamedCallArgs(program, collectLocalFunctions(program));
  const context = collectRenderImportContext(program);
  visitNode(program, context);
  promoteMappedSignalChildren(program);
  visitNode(program, context);
  return program;
};

const escapeHtmlText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeHtmlAttr = (value: string): string => escapeHtmlText(value).replace(/"/g, '&quot;');

const camelToKebab = (value: string): string =>
  value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const normalizeAuthoringPropName = (name: string): string => {
  if (name === 'class') return 'className';
  if (name.startsWith('data_')) return `data-${name.slice(5).replace(/_/g, '-')}`;
  if (name.startsWith('aria_')) return `aria-${name.slice(5).replace(/_/g, '-')}`;
  if (name.startsWith('on_')) {
    const eventName = name
      .slice(3)
      .replace(/_([a-zA-Z0-9])/g, (_match, ch: string) => ch.toUpperCase());
    return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
  }
  return name.replace(/_([a-zA-Z0-9])/g, (_match, ch: string) => ch.toUpperCase());
};

const isLiteralStaticValue = (
  expr: LuminaExpr
): expr is Extract<LuminaExpr, { type: 'String' | 'Number' | 'Boolean' }> =>
  expr.type === 'String' || expr.type === 'Number' || expr.type === 'Boolean';

const staticExprToString = (expr: LuminaExpr): string | null => {
  if (expr.type === 'String') return expr.value;
  if (expr.type === 'Number') return String(expr.value);
  if (expr.type === 'Boolean') return expr.value ? 'true' : 'false';
  if (expr.type === 'InterpolatedString') {
    let out = '';
    for (const part of expr.parts) {
      if (typeof part === 'string') {
        out += part;
        continue;
      }
      if (!isLiteralStaticValue(part)) return null;
      out += staticExprToString(part) ?? '';
    }
    return out;
  }
  return null;
};

const mergeStaticProps = (
  target: Record<string, string | boolean>,
  source: Record<string, string | boolean>
): Record<string, string | boolean> => {
  for (const [key, value] of Object.entries(source)) {
    if (
      (key === 'class' || key === 'className') &&
      typeof target[key] === 'string' &&
      typeof value === 'string'
    ) {
      target[key] = `${String(target[key])} ${value}`.trim();
      continue;
    }
    if (key === 'style' && typeof target[key] === 'string' && typeof value === 'string') {
      const left = String(target[key]).trim();
      const right = value.trim();
      target[key] = [left, right].filter((entry) => entry.length > 0).join(';');
      continue;
    }
    target[key] = value;
  }
  return target;
};

const serializeStaticStyle = (expr: LuminaExpr): string | null => {
  const direct = staticExprToString(expr);
  if (direct !== null) return direct;
  if (expr.type !== 'StructLiteral') return null;
  const parts: string[] = [];
  for (const field of expr.fields) {
    const value = staticExprToString(field.value);
    if (value === null) return null;
    parts.push(`${camelToKebab(field.name)}:${value}`);
  }
  return parts.join(';');
};

const getStaticPropRecord = (expr: LuminaExpr): Record<string, string | boolean> | null => {
  if (expr.type === 'Call') {
    const callee = getNormalizedRenderCalleeName(expr);
    if (!callee) return null;
    const args = expr.args.map((arg) => arg.value);
    switch (callee) {
      case 'props_empty':
        return {};
      case 'props_class': {
        if (args.length !== 1) return null;
        const value = staticExprToString(args[0]);
        return value === null ? null : { class: value };
      }
      case 'props_id':
      case 'props_value':
      case 'props_placeholder':
      case 'props_href':
      case 'props_type':
      case 'props_name': {
        if (args.length !== 1) return null;
        const value = staticExprToString(args[0]);
        return value === null ? null : { [callee.replace('props_', '')]: value };
      }
      case 'props_disabled':
      case 'props_checked': {
        if (args.length !== 1) return null;
        if (args[0].type !== 'Boolean') return null;
        return { [callee.replace('props_', '')]: args[0].value };
      }
      case 'props_style': {
        if (args.length !== 1) return null;
        const value = serializeStaticStyle(args[0]);
        return value === null ? null : { style: value };
      }
      case 'props_key':
        return {};
      case 'props_attr': {
        if (args.length !== 2) return null;
        const propName = staticExprToString(args[0]);
        if (propName === null) return null;
        const normalizedName = normalizeAuthoringPropName(propName);
        if (normalizedName === 'style') {
          const value = serializeStaticStyle(args[1]);
          return value === null ? null : { style: value };
        }
        if (args[1].type === 'Boolean') {
          return { [normalizedName]: args[1].value };
        }
        const value = staticExprToString(args[1]);
        return value === null ? null : { [normalizedName]: value };
      }
      case 'props_when': {
        if (args.length !== 2 || args[0].type !== 'Boolean') return null;
        return args[0].value ? getStaticPropRecord(args[1]) : {};
      }
      case 'props_merge': {
        const merged: Record<string, string | boolean> = {};
        for (const arg of args) {
          const record = getStaticPropRecord(arg);
          if (!record) return null;
          mergeStaticProps(merged, record);
        }
        return merged;
      }
      default:
        return null;
    }
  }

  if (expr.type === 'StructLiteral') {
    const record: Record<string, string | boolean> = {};
    for (const field of expr.fields) {
      if (field.name === 'key' || /^on[A-Z]/.test(field.name)) continue;
      if (field.name === 'style') {
        const style = serializeStaticStyle(field.value);
        if (style === null) return null;
        record.style = style;
        continue;
      }
      if (field.value.type === 'Boolean') {
        record[field.name] = field.value.value;
        continue;
      }
      const value = staticExprToString(field.value);
      if (value === null) return null;
      record[field.name] = value;
    }
    return record;
  }

  if (expr.type === 'Boolean' && expr.value === true) {
    return {};
  }

  return null;
};

const serializeStaticAttrs = (record: Record<string, string | boolean>): string => {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(record)) {
    if (name === 'key' || /^on[A-Z]/.test(name)) continue;
    const htmlName = name === 'className' ? 'class' : camelToKebab(name);
    if (typeof value === 'boolean') {
      if (value) parts.push(` ${htmlName}`);
      continue;
    }
    parts.push(` ${htmlName}="${escapeHtmlAttr(String(value))}"`);
  }
  return parts.join('');
};

const getTextHtml = (expr: LuminaExpr): string | null => {
  if (
    expr.type !== 'Call' ||
    getNormalizedRenderCalleeName(expr) !== 'text' ||
    expr.args.length !== 1
  ) {
    return null;
  }
  const textValue = staticExprToString(expr.args[0].value);
  return textValue === null ? null : escapeHtmlText(textValue);
};

export const getStaticDomTemplateHtml = (expr: LuminaExpr): string | null => {
  if (!isStaticRenderHoistableExpr(expr)) {
    return null;
  }

  if (expr.type === 'Call') {
    const callee = getNormalizedRenderCalleeName(expr);
    if (callee === 'text') {
      return getTextHtml(expr);
    }
    if (callee === 'fragment') {
      if (expr.args.length === 0) return '';
      const childArg = expr.args[0]?.value;
      if (!childArg || childArg.type !== 'ArrayLiteral') return null;
      const parts: string[] = [];
      for (const child of childArg.elements) {
        const html = getStaticDomTemplateHtml(child);
        if (html === null) return null;
        parts.push(html);
      }
      return parts.join('');
    }
    if (callee !== 'vnode') {
      return null;
    }

    const tagExpr = expr.args[0]?.value;
    const propsExpr = expr.args[1]?.value;
    const childrenExpr = expr.args[2]?.value;
    if (!tagExpr || tagExpr.type !== 'String') return null;

    const props = propsExpr ? getStaticPropRecord(propsExpr) : {};
    if (props === null) return null;

    let childrenHtml = '';
    if (childrenExpr) {
      if (childrenExpr.type !== 'ArrayLiteral') return null;
      const parts: string[] = [];
      for (const child of childrenExpr.elements) {
        const html = getStaticDomTemplateHtml(child);
        if (html === null) return null;
        parts.push(html);
      }
      childrenHtml = parts.join('');
    }

    const tag = tagExpr.value;
    return `<${tag}${serializeStaticAttrs(props)}>${childrenHtml}</${tag}>`;
  }

  return null;
};
