import {
  createContextToken,
  FrameManager,
  type ComponentFunction,
  type ContextToken,
} from './frame-manager.js';
import { type TestingDomHarness } from './testing-dom.js';
import {
  createCustomElementsRuntime,
  type CustomElementController,
  type CustomElementMountOptions,
} from './runtime/custom-elements.js';
import {
  createDevtoolsController,
  snapshotComponentFrame,
  type DevtoolsResourceSnapshot,
  type DevtoolsSnapshot,
} from './runtime/devtools.js';
import {
  findDomElementById,
  getFocusTargetFromEvent,
  readChildNodes,
  trapDialogTabNavigation,
} from './runtime/dom-accessibility.js';
import { createFrameRuntime } from './runtime/frame-runtime.js';
import {
  analyzeSequenceTransition,
  getTransitionAffectedRange,
  reorderChildren,
  type KeyedListTransition,
} from './runtime/dom-reconciler.js';
import {
  coerceRenderer as coerceRendererBase,
  isDisposableLike,
  isUnmountableLike,
  ReactiveRenderRoot as ReactiveRenderRootBase,
  RenderRoot as RenderRootBase,
} from './runtime/render-core.js';
import {
  batch as batchReactive,
  configureReactiveCore,
  Effect,
  Memo,
  Signal,
  untrack as untrackReactive,
  type ReactiveCleanup,
} from './runtime/reactive-core.js';
import {
  composeHandlers,
  mergeProps,
  propsAttr,
  propsChecked,
  propsClass,
  propsDisabled,
  propsEmpty,
  propsHref,
  propsId,
  propsKey,
  propsName,
  propsOnChange,
  propsOnCheckedChange,
  propsOnClick,
  propsOnClickDec,
  propsOnClickDelta,
  propsOnClickInc,
  propsOnInput,
  propsOnSubmit,
  propsPlaceholder,
  propsStyle,
  propsType,
  propsValue,
  propsWhen,
} from './runtime/props-core.js';
import {
  asResourceHandle,
  configureResourceCore,
  ensureResourceCurrent,
  listResourceRecords,
  ResourceHandle,
  resolveResourceRecord,
  startResourceLoad,
} from './runtime/resource-core.js';
import {
  createRenderTargetsRuntime,
  type CanvasRendererOptions,
} from './runtime/render-targets.js';
import {
  applyVNodeKey,
  coerceListKey,
  coerceRenderableToVNode,
  forListHostProps,
  indexListHostProps,
  isVNode,
  materializeForListChildren,
  materializeIndexListChildren,
  normalizeVNodeChildren,
  parseVNode,
  readIndexListValues,
  resolveChildrenInput,
  serializeVNode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
  type ComponentRenderable,
  type VNode,
  type VNodeInput,
} from './runtime/vnode-core.js';
import {
  basenamePathBasic,
  dirnamePathBasic,
  extnamePathBasic,
  getNodeBuiltinModule,
  getNodePath,
  getNodeProcess,
  getNodeReadFileSync,
  getNodeSpawnSync,
  isAbsolutePathBasic,
  isNodeRuntime,
  joinPathBasic,
  normalizePathBasic,
  resolvePathBasic,
} from './runtime/node-platform.js';
import { createSsrRuntime, escapeHtml } from './runtime/ssr-renderer.js';
import { createSsgApi } from './runtime/ssg.js';
import { createTestingFacade } from './runtime/testing-facade.js';

export { Effect, Memo, Signal };
export { ResourceHandle };
export type { ReactiveCleanup };
export {
  isVNode,
  parseVNode,
  serializeVNode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
};
export type { ComponentRenderable, VNode, VNodeInput };

export type LuminaEnumLike =
  | { $tag: string; $payload?: unknown }
  | { tag: string; values?: unknown[] };

declare const WorkerGlobalScope: (new () => unknown) | undefined;

const isEnumLike = (value: unknown): value is LuminaEnumLike => {
  if (!value || typeof value !== 'object') return false;
  const v = value as { $tag?: string; tag?: string };
  return typeof v.$tag === 'string' || typeof v.tag === 'string';
};

const getEnumTag = (value: LuminaEnumLike): string =>
  (value as { $tag?: string }).$tag ?? (value as { tag?: string }).tag ?? 'Unknown';

const getEnumPayload = (value: LuminaEnumLike): unknown => {
  if ((value as { $payload?: unknown }).$payload !== undefined) {
    return (value as { $payload?: unknown }).$payload;
  }
  const values = (value as { values?: unknown[] }).values;
  if (!values) return undefined;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
};

const blockedHttpHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

const isPrivateIpv4Host = (host: string): boolean => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
};

const validateHttpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol '${parsed.protocol}'. Only http and https are allowed.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (blockedHttpHosts.has(host)) {
    throw new Error(`Blocked host '${host}' for security reasons.`);
  }
  if (isPrivateIpv4Host(host)) {
    throw new Error(`Blocked private IP address: ${host}`);
  }
  return parsed.toString();
};

type RuntimeTraitName = 'Hash' | 'Eq' | 'Ord';

const runtimeTraitImpls = {
  Hash: new Map<string, (self: unknown) => unknown>(),
  Eq: new Map<string, (self: unknown, other: unknown) => boolean>(),
  Ord: new Map<string, (self: unknown, other: unknown) => unknown>(),
} as const;

const normalizeTraitTypeName = (typeName: string): string => {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf('<');
  return idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
};

const getRuntimeTypeTag = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as { __lumina_type?: unknown }).__lumina_type;
  return typeof candidate === 'string' ? candidate : null;
};

export const __lumina_register_trait_impl = (
  traitName: RuntimeTraitName,
  forType: string,
  impl: ((...args: unknown[]) => unknown) | unknown
): void => {
  const targetType = normalizeTraitTypeName(forType);
  if (!targetType) return;
  if (traitName === 'Hash' && typeof impl === 'function') {
    runtimeTraitImpls.Hash.set(targetType, impl as (self: unknown) => unknown);
    return;
  }
  if (traitName === 'Eq' && typeof impl === 'function') {
    runtimeTraitImpls.Eq.set(targetType, impl as (self: unknown, other: unknown) => boolean);
    return;
  }
  if (traitName === 'Ord' && typeof impl === 'function') {
    runtimeTraitImpls.Ord.set(targetType, impl as (self: unknown, other: unknown) => unknown);
  }
};

const supportsColor = (): boolean => {
  if (typeof window !== 'undefined') return false;
  if (!isNodeRuntime()) return false;
  const stdout = getNodeProcess()?.stdout;
  return Boolean(stdout && stdout.isTTY);
};

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const colorize = (text: string, color: string | null, enabled: boolean): string => {
  if (!enabled || !color) return text;
  return `${color}${text}${colors.reset}`;
};

export type FormatOptions = {
  indent?: number;
  maxDepth?: number;
  color?: boolean;
};

const defaultFormatOptions: Required<FormatOptions> = {
  indent: 2,
  maxDepth: 6,
  color: supportsColor(),
};

export function formatValue(value: unknown, options: FormatOptions = {}): string {
  const config = { ...defaultFormatOptions, ...options };
  const seen = new WeakSet<object>();

  const formatEnum = (tag: string, payload: unknown, depth: number): string => {
    if (payload === undefined) return colorize(tag, colors.cyan, config.color);
    if (Array.isArray(payload)) {
      const inner = payload.map((item) => format(item, depth + 1));
      return formatEnumPayload(tag, inner, depth);
    }
    return formatEnumPayload(tag, [format(payload, depth + 1)], depth);
  };

  const formatEnumPayload = (tag: string, parts: string[], depth: number): string => {
    const name = colorize(tag, colors.cyan, config.color);
    const multiline = parts.some((part) => part.includes('\n')) || parts.join(', ').length > 60;
    if (!multiline) {
      return `${name}(${parts.join(', ')})`;
    }
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `${name}(\n${indent}${parts.join(`,\n${indent}`)}\n${closing})`;
  };

  const formatArray = (items: unknown[], depth: number): string => {
    if (items.length === 0) return '[]';
    if (depth >= config.maxDepth) return '[...]';
    const rendered = items.map((item) => format(item, depth + 1));
    const multiline = rendered.some((item) => item.includes('\n')) || rendered.join(', ').length > 60;
    if (!multiline) return `[${rendered.join(', ')}]`;
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `[\n${indent}${rendered.join(`,\n${indent}`)}\n${closing}]`;
  };

  const formatObject = (obj: Record<string, unknown>, depth: number): string => {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    if (depth >= config.maxDepth) return '{...}';
    const rendered = entries.map(([key, val]) => `${key}: ${format(val, depth + 1)}`);
    const multiline = rendered.some((item) => item.includes('\n')) || rendered.join(', ').length > 60;
    if (!multiline) return `{ ${rendered.join(', ')} }`;
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `{\n${indent}${rendered.join(`,\n${indent}`)}\n${closing}}`;
  };

  const format = (val: unknown, depth: number): string => {
    if (val === null || val === undefined) return colorize(String(val), colors.gray, config.color);
    if (typeof val === 'string') return colorize(val, colors.green, config.color);
    if (typeof val === 'number' || typeof val === 'bigint') return colorize(String(val), colors.yellow, config.color);
    if (typeof val === 'boolean') return colorize(String(val), colors.magenta, config.color);
    if (typeof val === 'function') return `[Function${val.name ? ` ${val.name}` : ''}]`;
    if (Array.isArray(val)) return formatArray(val, depth);
    if (typeof val === 'object') {
      if (isEnumLike(val)) {
        const tag = getEnumTag(val);
        const payload = getEnumPayload(val);
        return formatEnum(tag, payload, depth);
      }
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
      return formatObject(val as Record<string, unknown>, depth);
    }
    try {
      return String(val);
    } catch {
      return '[unprintable]';
    }
  };

  return format(value, 0);
}

export const __lumina_stringify = (value: unknown): string => formatValue(value, { color: false });

export const __lumina_range = (
  start: unknown,
  end: unknown,
  inclusive: boolean,
  hasStart: boolean,
  hasEnd: boolean
): { start: number | null; end: number | null; inclusive: boolean } => {
  const startValue = hasStart ? Number(start) : null;
  const endValue = hasEnd ? Number(end) : null;
  return { start: startValue, end: endValue, inclusive: !!inclusive };
};

export const __lumina_slice = (
  str: string,
  start: number | undefined,
  end: number | undefined,
  inclusive: boolean
): string => {
  const actualStart = start ?? 0;
  const actualEnd = end ?? str.length;
  const finalEnd = inclusive ? actualEnd + 1 : actualEnd;

  if (actualStart < 0 || actualStart > str.length) {
    throw new Error(`String slice start index ${actualStart} out of bounds`);
  }
  if (finalEnd < 0 || finalEnd > str.length) {
    throw new Error(`String slice end index ${finalEnd} out of bounds`);
  }

  return str.substring(actualStart, finalEnd);
};

const isRangeValue = (
  value: unknown
): value is { start: number | null; end: number | null; inclusive: boolean } =>
  !!value && typeof value === 'object' && 'start' in value && 'end' in value && 'inclusive' in value;

const clampIndex = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const __lumina_fixed_array = <T>(
  size: number,
  initializer?: (index: number) => T
): T[] => {
  const normalized = Math.max(0, Math.trunc(size));
  const arr = new Array<T>(normalized);
  if (initializer) {
    for (let i = 0; i < normalized; i += 1) {
      arr[i] = initializer(i);
    }
  }
  return arr;
};

export const __lumina_array_bounds_check = (
  array: unknown[],
  index: number,
  expectedSize?: number
): void => {
  if (expectedSize !== undefined && array.length !== expectedSize) {
    throw new Error(`Array size mismatch: expected ${expectedSize}, got ${array.length}`);
  }
  if (index < 0 || index >= array.length) {
    throw new Error(`Array index out of bounds: ${index} (array length: ${array.length})`);
  }
};

export const __lumina_array_literal = <T>(elements: T[], expectedSize?: number): T[] => {
  if (expectedSize !== undefined && elements.length !== expectedSize) {
    throw new Error(`Array literal has wrong size: expected ${expectedSize}, got ${elements.length}`);
  }
  return elements;
};

export const __lumina_index = (target: unknown, index: unknown, expectedSize?: number): unknown => {
  if (typeof target === 'string' && isRangeValue(index)) {
    const length = target.length;
    const start = index.start == null ? 0 : clampIndex(Math.trunc(index.start), 0, length);
    const endBase = index.end == null ? length : clampIndex(Math.trunc(index.end), 0, length);
    return __lumina_slice(target, start, endBase, index.inclusive);
  }

  if (target && typeof (target as { get?: (idx: number) => unknown }).get === 'function') {
    const result = (target as { get: (idx: number) => unknown }).get(Math.trunc(Number(index)));
    const tag = result && typeof result === 'object' && isEnumLike(result) ? getEnumTag(result) : '';
    if (tag === 'Some') return getEnumPayload(result as LuminaEnumLike);
    const err = new LuminaPanic('Index out of bounds', result);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, __lumina_index);
    }
    throw err;
  }

  if (Array.isArray(target)) {
    const normalizedIndex = Math.trunc(Number(index));
    __lumina_array_bounds_check(target, normalizedIndex, expectedSize);
    return target[normalizedIndex];
  }

  if (target && typeof target === 'object') {
    return (target as Record<string, unknown>)[String(index)];
  }

  return undefined;
};

export const __lumina_struct = <T extends Record<string, unknown>>(typeName: string, fields: T): T => {
  try {
    Object.defineProperty(fields, '__lumina_type', {
      value: normalizeTraitTypeName(typeName),
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } catch {
    (fields as Record<string, unknown>).__lumina_type = normalizeTraitTypeName(typeName);
  }
  return fields;
};

const normalizeRuntimeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
  if (Array.isArray(value)) return value.map((item) => normalizeRuntimeValue(item));
  if (typeof value === 'object') {
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return { $enum: tag, value: normalizeRuntimeValue(payload) };
    }
    const typeTag = getRuntimeTypeTag(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    if (typeTag) out.__lumina_type = typeTag;
    for (const key of keys) {
      out[key] = normalizeRuntimeValue(obj[key]);
    }
    return out;
  }
  return String(value);
};

const stableRuntimeHash = (value: unknown): string => JSON.stringify(normalizeRuntimeValue(value));

const deepRuntimeEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepRuntimeEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aTag = getRuntimeTypeTag(a);
  const bTag = getRuntimeTypeTag(b);
  if (aTag !== bTag) return false;
  if (isEnumLike(a) || isEnumLike(b)) {
    if (!isEnumLike(a) || !isEnumLike(b)) return false;
    if (getEnumTag(a) !== getEnumTag(b)) return false;
    return deepRuntimeEqual(getEnumPayload(a), getEnumPayload(b));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  aKeys.sort();
  bKeys.sort();
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const key of aKeys) {
    if (!deepRuntimeEqual(aObj[key], bObj[key])) return false;
  }
  return true;
};

const runtimeHashValue = (value: unknown): string => {
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    const hashImpl = runtimeTraitImpls.Hash.get(typeTag);
    if (hashImpl) {
      try {
        return `${typeTag}:${String(hashImpl(value))}`;
      } catch {
        return `${typeTag}:${stableRuntimeHash(value)}`;
      }
    }
  }
  return stableRuntimeHash(value);
};

const runtimeEquals = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const eqImpl = runtimeTraitImpls.Eq.get(leftTag);
    if (eqImpl) {
      try {
        return !!eqImpl(left, right);
      } catch {
        return false;
      }
    }
  }
  return deepRuntimeEqual(left, right);
};

const FAST_CLONE_UNSUPPORTED = Symbol('lumina.fast-clone-unsupported');

const isPlainCloneableObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const cloneFast = (
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap()
): unknown | typeof FAST_CLONE_UNSUPPORTED => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached) return cached;
    const out: unknown[] = new Array(value.length);
    seen.set(value, out);
    for (let index = 0; index < value.length; index += 1) {
      const cloned = cloneFast(value[index], seen);
      if (cloned === FAST_CLONE_UNSUPPORTED) {
        return FAST_CLONE_UNSUPPORTED;
      }
      out[index] = cloned;
    }
    return out;
  }

  if (
    value instanceof Date
    || value instanceof RegExp
    || value instanceof Map
    || value instanceof Set
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
  ) {
    return FAST_CLONE_UNSUPPORTED;
  }

  if (!isPlainCloneableObject(value)) {
    return FAST_CLONE_UNSUPPORTED;
  }

  const cached = seen.get(value);
  if (cached) return cached;
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const cloned = cloneFast(entry, seen);
    if (cloned === FAST_CLONE_UNSUPPORTED) {
      return FAST_CLONE_UNSUPPORTED;
    }
    out[key] = cloned;
  }
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    try {
      Object.defineProperty(out, '__lumina_type', {
        value: typeTag,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    } catch {
      out.__lumina_type = typeTag;
    }
  }
  return out;
};

const cloneFallback = (value: unknown): unknown => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast;
  }
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneFallback(entry));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneFallback(entry);
  }
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    try {
      Object.defineProperty(out, '__lumina_type', {
        value: typeTag,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    } catch {
      out.__lumina_type = typeTag;
    }
  }
  return out;
};

export const __lumina_clone = <T>(value: T): T => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast as T;
  }
  const cloneFn = (globalThis as { structuredClone?: <U>(entry: U) => U }).structuredClone;
  if (typeof cloneFn === 'function') {
    try {
      return cloneFn(value);
    } catch {
      // fallback below
    }
  }
  return cloneFallback(value) as T;
};

export const __lumina_debug = (value: unknown): string => formatValue(value, { color: false });
export const __lumina_eq = (left: unknown, right: unknown): boolean => runtimeEquals(left, right);

const orderingToNumber = (value: unknown): number => {
  if (typeof value === 'number') return value < 0 ? -1 : value > 0 ? 1 : 0;
  if (typeof value === 'bigint') return value < 0n ? -1 : value > 0n ? 1 : 0;
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    if (text === 'less') return -1;
    if (text === 'equal') return 0;
    if (text === 'greater') return 1;
  }
  if (isEnumLike(value)) {
    const tag = getEnumTag(value).toLowerCase();
    if (tag === 'less') return -1;
    if (tag === 'equal') return 0;
    if (tag === 'greater') return 1;
  }
  return 0;
};

const toJsonValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return payload === undefined ? { $tag: tag } : { $tag: tag, $payload: toJsonValue(payload, seen) };
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      toJsonValue(val, seen),
    ]);
    return Object.fromEntries(entries);
  }
  return String(value);
};

export function toJsonString(value: unknown, pretty: boolean = true): string {
  const normalized = toJsonValue(value, new WeakSet());
  return JSON.stringify(normalized, null, pretty ? 2 : undefined);
}

const renderArgs = (args: unknown[]): string => args.map((arg) => formatValue(arg)).join(' ');

const writeStdout = (text: string, newline: boolean) => {
  if (isNodeRuntime()) {
    const stdout = getNodeProcess()?.stdout;
    if (stdout?.write) {
      stdout.write(text + (newline ? '\n' : ''));
      return;
    }
  }
  // eslint-disable-next-line no-console -- runtime output
  console.log(text);
};

const writeStderr = (text: string, newline: boolean) => {
  if (isNodeRuntime()) {
    const stderr = getNodeProcess()?.stderr;
    if (stderr?.write) {
      stderr.write(text + (newline ? '\n' : ''));
      return;
    }
  }
  // eslint-disable-next-line no-console -- runtime output
  console.error(text);
};

let stdinCache: string[] | null = null;
let stdinIndex = 0;

const readStdinLines = (): string[] => {
  if (stdinCache) return stdinCache;
  const globalAny = globalThis as { __luminaStdin?: string | string[] };
  if (globalAny.__luminaStdin !== undefined) {
    const raw = globalAny.__luminaStdin;
    stdinCache = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/);
    return stdinCache;
  }
  if (isNodeRuntime()) {
    const stdin = getNodeProcess()?.stdin;
    const isTty = (stdin as { isTTY?: boolean } | undefined)?.isTTY;
    if (isTty !== true) {
      try {
        const readSync = getNodeReadFileSync();
        const raw = readSync ? readSync(0, 'utf8') : '';
        if (raw.length > 0) {
          stdinCache = raw.split(/\r?\n/);
          return stdinCache;
        }
      } catch {
        // ignore stdin read errors
      }
    }
    if (stdin?.setEncoding) stdin.setEncoding('utf8');
    const chunk = stdin?.read?.();
    if (typeof chunk === 'string') {
      stdinCache = chunk.split(/\r?\n/);
      return stdinCache;
    }
    if (chunk && typeof (chunk as { toString?: (enc: string) => string }).toString === 'function') {
      stdinCache = (chunk as { toString: (enc: string) => string }).toString('utf8').split(/\r?\n/);
      return stdinCache;
    }
  }
  stdinCache = [];
  return stdinCache;
};

const unwrapOption = (value: unknown): { isSome: boolean; value?: unknown } => {
  if (isEnumLike(value)) {
    const tag = getEnumTag(value);
    if (tag === 'Some') return { isSome: true, value: getEnumPayload(value) };
    if (tag === 'None') return { isSome: false };
  }
  return { isSome: true, value };
};

export const io = {
  print: (...args: unknown[]) => {
    writeStdout(renderArgs(args), false);
  },
  println: (...args: unknown[]) => {
    writeStdout(renderArgs(args), true);
  },
  eprint: (...args: unknown[]) => {
    writeStderr(renderArgs(args), false);
  },
  eprintln: (...args: unknown[]) => {
    writeStderr(renderArgs(args), true);
  },
  readLine: () => {
    const globalAny = globalThis as { __luminaReadLine?: () => string | null | undefined };
    if (typeof globalAny.__luminaReadLine === 'function') {
      const value = globalAny.__luminaReadLine();
      return value == null ? Option.None : Option.Some(value);
    }
    if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
      const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
      return value == null ? Option.None : Option.Some(value);
    }
    const lines = readStdinLines();
    if (stdinIndex >= lines.length) return Option.None;
    const value = lines[stdinIndex++];
    return Option.Some(value);
  },
  readLineAsync: async () => {
    const globalAny = globalThis as { __luminaStdin?: string | string[] };
    if (globalAny.__luminaStdin !== undefined) {
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return Option.None;
      const value = lines[stdinIndex++];
      return Option.Some(value);
    }
    if (isNodeRuntime()) {
      const nodeProcess = getNodeProcess();
      const stdin = nodeProcess?.stdin;
      if (stdin && stdin.isTTY !== true) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return Option.None;
        const value = lines[stdinIndex++];
        return Option.Some(value);
      }
      if (stdin?.isTTY) {
        const readline = await import('node:readline');
        const rl = nodeProcess?.stdout
          ? readline.createInterface({
              input: stdin,
              output: nodeProcess.stdout,
            })
          : readline.createInterface({
              input: stdin,
            });
        return await new Promise((resolve) => {
          rl.question('', (answer) => {
            rl.close();
            resolve(Option.Some(answer));
          });
        });
      }
    }
    if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
      const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
      return value == null ? Option.None : Option.Some(value);
    }
    return Option.None;
  },
  printJson: (value: unknown, pretty: boolean = true) => {
    // eslint-disable-next-line no-console -- runtime output
    console.log(toJsonString(value, pretty));
  },
};

export const str = {
  length: (value: string) => value.length,
  concat: (a: string, b: string) => a + b,
  substring: (value: string, start: number, end: number) => {
    const safeStart = Math.max(0, Math.trunc(start));
    const safeEnd = Math.max(safeStart, Math.trunc(end));
    return value.substring(safeStart, safeEnd);
  },
  slice: (
    value: string,
    range: { start: number | null; end: number | null; inclusive: boolean }
  ) => {
    const start = range?.start ?? undefined;
    const end = range?.end ?? undefined;
    return __lumina_slice(value, start ?? undefined, end ?? undefined, !!range?.inclusive);
  },
  split: (value: string, sep: string) => value.split(sep),
  trim: (value: string) => value.trim(),
  contains: (haystack: string, needle: string) => haystack.includes(needle),
  eq: (a: string, b: string) => a === b,
  char_at: (value: string, index: number) => {
    if (Number.isNaN(index) || index < 0 || index >= value.length) return Option.None;
    return Option.Some(value.charAt(index));
  },
  is_whitespace: (value: string) => value === ' ' || value === '\n' || value === '\t' || value === '\r',
  is_digit: (value: string) => {
    if (!value || value.length === 0) return false;
    const code = value.charCodeAt(0);
    return code >= 48 && code <= 57;
  },
  to_int: (value: string) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? Result.Err(`Invalid int: ${value}`) : Result.Ok(parsed);
  },
  to_float: (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? Result.Err(`Invalid float: ${value}`) : Result.Ok(parsed);
  },
  from_int: (value: number) => String(Math.trunc(value)),
  from_float: (value: number) => String(value),
};

export const math = {
  abs: (value: number) => Math.abs(value),
  min: (a: number, b: number) => Math.min(a, b),
  max: (a: number, b: number) => Math.max(a, b),
  absf: (value: number) => Math.abs(value),
  minf: (a: number, b: number) => Math.min(a, b),
  maxf: (a: number, b: number) => Math.max(a, b),
  sqrt: (value: number) => Math.sqrt(value),
  pow: (base: number, exp: number) => Math.pow(base, exp),
  powf: (base: number, exp: number) => Math.pow(base, exp),
  floor: (value: number) => Math.floor(value),
  ceil: (value: number) => Math.ceil(value),
  round: (value: number) => Math.round(value),
  pi: Math.PI,
  e: Math.E,
};

interface OpfsFileLike {
  size: number;
  lastModified: number;
  text: () => Promise<string>;
}

interface OpfsWritableLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface OpfsFileHandleLike {
  getFile: () => Promise<OpfsFileLike>;
  createWritable: () => Promise<OpfsWritableLike>;
}

interface OpfsDirectoryLike {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsDirectoryLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsFileHandleLike>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  entries?: () => AsyncIterable<[string, unknown]>;
  keys?: () => AsyncIterable<string>;
}

const hasOpfsSupport = (): boolean => {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: unknown } } }).navigator;
  return typeof nav?.storage?.getDirectory === 'function';
};

const getOpfsRoot = async (): Promise<OpfsDirectoryLike> => {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<OpfsDirectoryLike> } } }).navigator;
  const getter = nav?.storage?.getDirectory;
  if (typeof getter !== 'function') {
    throw new Error('OPFS is not available in this environment');
  }
  return await getter.call(nav!.storage);
};

const opfsError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

const isOpfsNotFoundError = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  ((error as { name?: string }).name === 'NotFoundError' || (error as { code?: string }).code === 'ENOENT');

const splitOpfsPath = (path: string): string[] =>
  String(path)
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.');

const walkOpfsDirectory = async (segments: string[], create: boolean): Promise<OpfsDirectoryLike> => {
  let current = await getOpfsRoot();
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error('OPFS path traversal is not supported');
    }
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
};

const resolveOpfsParent = async (
  path: string,
  createParent: boolean
): Promise<{ directory: OpfsDirectoryLike; name: string }> => {
  const segments = splitOpfsPath(path);
  if (segments.length === 0) {
    throw new Error('Path must not be empty');
  }
  const name = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const directory = await walkOpfsDirectory(parentSegments, createParent);
  return { directory, name };
};

const isLikelyRemotePath = (path: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('//');

const opfsReadFile = async (path: string): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const { directory, name } = await resolveOpfsParent(path, false);
    const handle = await directory.getFileHandle(name, { create: false });
    const file = await handle.getFile();
    const content = await file.text();
    return Result.Ok(content);
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

const opfsWriteFile = async (path: string, content: string): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const { directory, name } = await resolveOpfsParent(path, true);
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(String(content));
    await writable.close();
    return Result.Ok(undefined);
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

const opfsReadDir = async (path: string): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const segments = splitOpfsPath(path);
    const directory = await walkOpfsDirectory(segments, false);
    const entries: string[] = [];
    if (typeof directory.entries === 'function') {
      for await (const [name] of directory.entries()) {
        entries.push(name);
      }
      return Result.Ok(entries);
    }
    if (typeof directory.keys === 'function') {
      for await (const name of directory.keys()) {
        entries.push(name);
      }
      return Result.Ok(entries);
    }
    return Result.Err('OPFS directory iteration is not available');
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

const opfsMetadata = async (path: string): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const segments = splitOpfsPath(path);
    if (segments.length === 0) {
      return Result.Ok({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
    }
    const { directory, name } = await resolveOpfsParent(path, false);
    try {
      const fileHandle = await directory.getFileHandle(name, { create: false });
      const file = await fileHandle.getFile();
      return Result.Ok({
        isFile: true,
        isDirectory: false,
        size: Math.trunc(file.size),
        modifiedMs: Math.trunc(file.lastModified),
      });
    } catch (fileError) {
      if (!isOpfsNotFoundError(fileError)) {
        return Result.Err(opfsError(fileError));
      }
    }
    const dirHandle = await directory.getDirectoryHandle(name, { create: false });
    if (dirHandle) {
      return Result.Ok({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
    }
    return Result.Err(`Entry not found: ${path}`);
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

const opfsExists = async (path: string): Promise<boolean> => {
  try {
    const meta = await opfsMetadata(path);
    return getEnumTag(meta as LuminaEnumLike) === 'Ok';
  } catch {
    return false;
  }
};

const opfsMkdir = async (path: string, recursive = true): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const segments = splitOpfsPath(path);
    if (segments.length === 0) return Result.Ok(undefined);
    if (recursive) {
      await walkOpfsDirectory(segments, true);
      return Result.Ok(undefined);
    }
    const parentSegments = segments.slice(0, -1);
    const parent = await walkOpfsDirectory(parentSegments, false);
    await parent.getDirectoryHandle(segments[segments.length - 1], { create: true });
    return Result.Ok(undefined);
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

const opfsRemoveFile = async (path: string): Promise<{ $tag: string; $payload?: unknown }> => {
  try {
    const { directory, name } = await resolveOpfsParent(path, false);
    await directory.removeEntry(name, { recursive: false });
    return Result.Ok(undefined);
  } catch (error) {
    return Result.Err(opfsError(error));
  }
};

export const opfs = {
  is_available: (): boolean => hasOpfsSupport(),
  readFile: async (path: string): Promise<{ $tag: string; $payload?: unknown }> => opfsReadFile(path),
  writeFile: async (path: string, content: string): Promise<{ $tag: string; $payload?: unknown }> =>
    opfsWriteFile(path, content),
  readDir: async (path: string): Promise<{ $tag: string; $payload?: unknown }> => opfsReadDir(path),
  metadata: async (path: string): Promise<{ $tag: string; $payload?: unknown }> => opfsMetadata(path),
  exists: async (path: string): Promise<boolean> => opfsExists(path),
  mkdir: async (path: string, recursive = true): Promise<{ $tag: string; $payload?: unknown }> =>
    opfsMkdir(path, recursive),
  removeFile: async (path: string): Promise<{ $tag: string; $payload?: unknown }> => opfsRemoveFile(path),
};

export const fs = {
  readFile: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        const content = await fsPromises.readFile(path, 'utf8');
        return Result.Ok(content);
      }
      if (opfs.is_available() && !isLikelyRemotePath(path)) {
        return await opfs.readFile(path);
      }
      if (typeof fetch !== 'undefined') {
        const response = await fetch(path);
        if (!response.ok) {
          return Result.Err(`HTTP ${response.status}: ${response.statusText}`);
        }
        const content = await response.text();
        return Result.Ok(content);
      }
      return Result.Err('No file system available');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  writeFile: async (path: string, content: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        await fsPromises.writeFile(path, content, 'utf8');
        return Result.Ok(undefined);
      }
      if (opfs.is_available()) {
        return await opfs.writeFile(path, content);
      }
      return Result.Err('writeFile not supported in browser');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  readDir: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        const entries = await fsPromises.readdir(path);
        return Result.Ok(entries);
      }
      if (opfs.is_available()) {
        return await opfs.readDir(path);
      }
      if (!isNodeRuntime()) {
        return Result.Err('readDir is not supported in browser');
      }
      return Result.Err('No file system available');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  metadata: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        const stats = await fsPromises.stat(path);
        return Result.Ok({
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: Math.trunc(stats.size),
          modifiedMs: Math.trunc(stats.mtimeMs),
        });
      }
      if (opfs.is_available()) {
        return await opfs.metadata(path);
      }
      return Result.Err('metadata is not supported in browser');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  exists: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        await fsPromises.access(path);
        return true;
      }
      if (opfs.is_available()) return await opfs.exists(path);
      return false;
    } catch {
      return false;
    }
  },
  mkdir: async (path: string, recursive: boolean = true) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        await fsPromises.mkdir(path, { recursive: !!recursive });
        return Result.Ok(undefined);
      }
      if (opfs.is_available()) {
        return await opfs.mkdir(path, recursive);
      }
      return Result.Err('mkdir is not supported in browser');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  removeFile: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        await fsPromises.unlink(path);
        return Result.Ok(undefined);
      }
      if (opfs.is_available()) {
        return await opfs.removeFile(path);
      }
      return Result.Err('removeFile is not supported in browser');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
};

export const path = {
  join: (left: string, right: string): string => {
    const nodePath = getNodePath();
    return nodePath ? nodePath.join(String(left), String(right)) : joinPathBasic(String(left), String(right));
  },
  is_absolute: (value: string): boolean => {
    const nodePath = getNodePath();
    return nodePath ? nodePath.isAbsolute(String(value)) : isAbsolutePathBasic(String(value));
  },
  extension: (value: string) => {
    const nodePath = getNodePath();
    const ext = nodePath ? nodePath.extname(String(value)) : extnamePathBasic(String(value));
    if (!ext) return Option.None;
    return Option.Some(ext.startsWith('.') ? ext.slice(1) : ext);
  },
  dirname: (value: string): string => {
    const nodePath = getNodePath();
    return nodePath ? nodePath.dirname(String(value)) : dirnamePathBasic(String(value));
  },
  basename: (value: string): string => {
    const nodePath = getNodePath();
    return nodePath ? nodePath.basename(String(value)) : basenamePathBasic(String(value));
  },
  normalize: (value: string): string => {
    const nodePath = getNodePath();
    return nodePath ? nodePath.normalize(String(value)) : normalizePathBasic(String(value));
  },
};

type UrlRecord = {
  href: string;
  origin: string;
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
};

type UrlConfig = {
  protocol?: unknown;
  host?: unknown;
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

const isUrlRecord = (value: unknown): value is UrlRecord =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as { href?: unknown }).href === 'string' &&
  typeof (value as { origin?: unknown }).origin === 'string';

const normalizeProtocol = (value: unknown): string => {
  const base = String(value ?? '').trim();
  if (!base) return '';
  return base.endsWith(':') ? base : `${base}:`;
};

const toUrlRecord = (raw: URL): UrlRecord => ({
  href: raw.href,
  origin: raw.origin,
  protocol: raw.protocol,
  host: raw.host,
  pathname: raw.pathname,
  search: raw.search,
  hash: raw.hash,
});

const emptyUrlRecord = (): UrlRecord => ({
  href: '',
  origin: '',
  protocol: '',
  host: '',
  pathname: '',
  search: '',
  hash: '',
});

const coerceToUrl = (value: unknown): URL | null => {
  if (typeof URL !== 'function') return null;
  if (typeof value === 'string') {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
  if (isUrlRecord(value)) {
    try {
      return new URL(value.href);
    } catch {
      return null;
    }
  }
  return null;
};

export const url = {
  is_available: (): boolean => typeof URL === 'function',
  parse: (raw: string) => {
    if (typeof URL !== 'function') return Result.Err('URL API is not available in this runtime');
    try {
      return Result.Ok(toUrlRecord(new URL(String(raw))));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  build: (config: UrlConfig) => {
    if (typeof URL !== 'function') return Result.Err('URL API is not available in this runtime');
    const protocol = normalizeProtocol(config?.protocol);
    const host = String(config?.host ?? '').trim();
    if (!protocol || !host) return Result.Err('URL build requires protocol and host');
    try {
      const built = new URL(`${protocol}//${host}`);
      const pathname = config?.pathname;
      const search = config?.search;
      const hash = config?.hash;
      if (pathname != null && pathname !== '') {
        const text = String(pathname);
        built.pathname = text.startsWith('/') ? text : `/${text}`;
      }
      if (search != null && search !== '') {
        const text = String(search);
        built.search = text.startsWith('?') ? text : `?${text}`;
      }
      if (hash != null && hash !== '') {
        const text = String(hash);
        built.hash = text.startsWith('#') ? text : `#${text}`;
      }
      return Result.Ok(built.href);
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  get_origin: (value: unknown): string => coerceToUrl(value)?.origin ?? '',
  get_pathname: (value: unknown): string => coerceToUrl(value)?.pathname ?? '',
  get_search: (value: unknown): string => coerceToUrl(value)?.search ?? '',
  get_hash: (value: unknown): string => coerceToUrl(value)?.hash ?? '',
  set_pathname: (value: unknown, pathname: string): UrlRecord => {
    const next = coerceToUrl(value);
    if (!next) return emptyUrlRecord();
    const text = String(pathname ?? '');
    next.pathname = text.startsWith('/') ? text : `/${text}`;
    return toUrlRecord(next);
  },
  set_search: (value: unknown, search: string): UrlRecord => {
    const next = coerceToUrl(value);
    if (!next) return emptyUrlRecord();
    const text = String(search ?? '');
    next.search = !text ? '' : text.startsWith('?') ? text : `?${text}`;
    return toUrlRecord(next);
  },
  append_param: (value: unknown, key: string, paramValue: string): UrlRecord => {
    const next = coerceToUrl(value);
    if (!next) return emptyUrlRecord();
    next.searchParams.append(String(key), String(paramValue));
    return toUrlRecord(next);
  },
};

const webStorageLocalFallback = new Map<string, string>();
const webStorageSessionFallback = new Map<string, string>();

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  length: number;
};

const asStorageLike = (value: unknown): StorageLike | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StorageLike>;
  if (
    typeof candidate.getItem !== 'function' ||
    typeof candidate.setItem !== 'function' ||
    typeof candidate.removeItem !== 'function' ||
    typeof candidate.clear !== 'function'
  ) {
    return null;
  }
  return candidate as StorageLike;
};

const browserLocalStorage = (): StorageLike | null =>
  asStorageLike((globalThis as { localStorage?: unknown }).localStorage);
const browserSessionStorage = (): StorageLike | null =>
  asStorageLike((globalThis as { sessionStorage?: unknown }).sessionStorage);

const webStorageGet = (scope: 'local' | 'session', key: string) => {
  const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
  if (storage) {
    try {
      const value = storage.getItem(String(key));
      return value == null ? Option.None : Option.Some(value);
    } catch {
      return Option.None;
    }
  }
  const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
  return fallback.has(String(key)) ? Option.Some(fallback.get(String(key)) ?? '') : Option.None;
};

const webStorageSet = (scope: 'local' | 'session', key: string, value: string) => {
  const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
  if (storage) {
    try {
      storage.setItem(String(key), String(value));
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  }
  const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
  fallback.set(String(key), String(value));
  return Result.Ok(undefined);
};

const webStorageRemove = (scope: 'local' | 'session', key: string): void => {
  const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
  if (storage) {
    try {
      storage.removeItem(String(key));
      return;
    } catch {
      // fall through to fallback removal
    }
  }
  const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
  fallback.delete(String(key));
};

const webStorageClear = (scope: 'local' | 'session'): void => {
  const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
  if (storage) {
    try {
      storage.clear();
      return;
    } catch {
      // fall through to fallback clear
    }
  }
  const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
  fallback.clear();
};

const webStorageLength = (scope: 'local' | 'session'): number => {
  const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
  if (storage) {
    try {
      return Math.trunc(storage.length);
    } catch {
      return 0;
    }
  }
  const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
  return fallback.size;
};

export const web_storage = {
  is_available: (): boolean => browserLocalStorage() !== null && browserSessionStorage() !== null,
  local_get: (key: string) => webStorageGet('local', key),
  local_set: (key: string, value: string) => webStorageSet('local', key, value),
  local_remove: (key: string): void => webStorageRemove('local', key),
  local_clear: (): void => webStorageClear('local'),
  local_length: (): number => webStorageLength('local'),
  session_get: (key: string) => webStorageGet('session', key),
  session_set: (key: string, value: string) => webStorageSet('session', key, value),
  session_remove: (key: string): void => webStorageRemove('session', key),
  session_clear: (): void => webStorageClear('session'),
  session_length: (): number => webStorageLength('session'),
};

type DomElementRecord = object;
type DomEventRecord = { element: EventTarget; event: string; listener: EventListener };

let domNextHandle = 1;
let domNextEventHandle = 1;
const domElements = new Map<number, DomElementRecord>();
const domElementHandles = new WeakMap<object, number>();
const domEvents = new Map<number, DomEventRecord>();

const getDocumentHandle = (): Document | null => {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof doc.querySelector !== 'function') return null;
  return doc;
};

const toDomHandle = (element: DomElementRecord | null | undefined): number => {
  if (!element || typeof element !== 'object') return 0;
  const existing = domElementHandles.get(element);
  if (existing) return existing;
  const next = domNextHandle++;
  domElementHandles.set(element, next);
  domElements.set(next, element);
  return next;
};

const fromDomHandle = (handle: number): DomElementRecord | null =>
  domElements.get(Math.trunc(handle)) ?? null;

const createDomStubElement = (): {
  textContent: string;
  innerHTML: string;
  style: Record<string, unknown>;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  appendChild: (child: unknown) => void;
  removeChild: (child: unknown) => void;
} => {
  const attrs = new Map<string, string>();
  const children: unknown[] = [];
  return {
    textContent: '',
    innerHTML: '',
    style: {},
    getAttribute: (name: string) => attrs.get(String(name)) ?? null,
    setAttribute: (name: string, value: string) => {
      attrs.set(String(name), String(value));
    },
    removeAttribute: (name: string) => {
      attrs.delete(String(name));
    },
    appendChild: (child: unknown) => {
      children.push(child);
    },
    removeChild: (child: unknown) => {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
    },
  };
};

type RouterLocationLike = {
  pathname?: string;
  hash?: string;
  search?: string;
};

type RouterHistoryLike = {
  pushState?: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void;
  state?: unknown;
};

type RouterWindowLike = {
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
  dispatchEvent?: (event: Event) => boolean;
  location?: RouterLocationLike;
  history?: RouterHistoryLike;
};

type RouterDocumentLike = {
  baseURI?: string;
};

type RouterPopStateHandler = (path: string) => unknown;

const routerPopStateHandlers = new Map<RouterPopStateHandler, EventListener>();

const getRouterWindowHandle = (): RouterWindowLike | null => {
  const windowHandle = (globalThis as { window?: RouterWindowLike }).window;
  if (windowHandle && typeof windowHandle === 'object') return windowHandle;
  const globalHandle = globalThis as RouterWindowLike;
  if (
    typeof globalHandle.addEventListener === 'function' ||
    typeof globalHandle.dispatchEvent === 'function' ||
    typeof globalHandle.location === 'object'
  ) {
    return globalHandle;
  }
  return null;
};

const getRouterLocationHandle = (): RouterLocationLike | null => {
  const windowHandle = getRouterWindowHandle();
  if (windowHandle?.location) return windowHandle.location;
  const locationHandle = (globalThis as { location?: RouterLocationLike }).location;
  return locationHandle && typeof locationHandle === 'object' ? locationHandle : null;
};

const getRouterHistoryHandle = (): RouterHistoryLike | null => {
  const windowHandle = getRouterWindowHandle();
  if (windowHandle?.history) return windowHandle.history;
  const historyHandle = (globalThis as { history?: RouterHistoryLike }).history;
  return historyHandle && typeof historyHandle === 'object' ? historyHandle : null;
};

const readRouterPathname = (): string => String(getRouterLocationHandle()?.pathname ?? '/');
const readRouterHash = (): string => String(getRouterLocationHandle()?.hash ?? '');
const readRouterSearch = (): string => String(getRouterLocationHandle()?.search ?? '');

const trimRouterTrailingSlash = (value: string): string => {
  if (value.length <= 1) return value || '/';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeRouterPath = (value: string): string => {
  const text = String(value || '/');
  const withLeadingSlash = text.startsWith('/') ? text : `/${text}`;
  return trimRouterTrailingSlash(withLeadingSlash);
};

const splitRouterSegments = (value: string): string[] =>
  normalizeRouterPath(value)
    .split('/')
    .filter((segment) => segment.length > 0);

const createRouterParamMap = (entries: Array<[string, string]>): HashMap<string, string> => {
  const out = HashMap.new<string, string>();
  for (const [key, value] of entries) {
    if (key.length > 0) out.insert(key, value);
  }
  return out;
};

const matchRouterPattern = (pattern: string, path: string): boolean => {
  if (pattern === '*') return true;
  const patternSegments = splitRouterSegments(pattern);
  const pathSegments = splitRouterSegments(path);
  if (patternSegments.length !== pathSegments.length) return false;
  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i] ?? '';
    const actual = pathSegments[i] ?? '';
    if (expected.startsWith(':')) continue;
    if (expected !== actual) return false;
  }
  return true;
};

const extractRouterParams = (pattern: string, path: string): HashMap<string, string> => {
  if (pattern === '*') return HashMap.new<string, string>();
  const patternSegments = splitRouterSegments(pattern);
  const pathSegments = splitRouterSegments(path);
  if (patternSegments.length !== pathSegments.length) return HashMap.new<string, string>();
  const entries: Array<[string, string]> = [];
  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i] ?? '';
    if (!expected.startsWith(':')) continue;
    entries.push([expected.slice(1), pathSegments[i] ?? '']);
  }
  return createRouterParamMap(entries);
};

const parseRouterSearchParams = (search: string): HashMap<string, string> => {
  const text = String(search ?? '');
  const body = text.startsWith('?') ? text.slice(1) : text;
  if (body.length === 0) return HashMap.new<string, string>();
  const entries: Array<[string, string]> = [];
  for (const pair of body.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    if (!rawKey) continue;
    entries.push([rawKey, rawValue]);
  }
  return createRouterParamMap(entries);
};

const updateRouterLocationValue = (nextPath: string): void => {
  const locationHandle = getRouterLocationHandle();
  if (!locationHandle) return;
  try {
    const normalized = String(nextPath);
    locationHandle.pathname = normalized;
    locationHandle.hash = '';
    locationHandle.search = '';
  } catch {
    // Ignore host stubs with read-only location fields.
  }
};

const createRouterPopStateEvent = (): Event => {
  try {
    const PopStateEventCtor = (globalThis as { PopStateEvent?: typeof PopStateEvent }).PopStateEvent;
    if (typeof PopStateEventCtor === 'function') {
      return new PopStateEventCtor('popstate', { state: getRouterHistoryHandle()?.state });
    }
  } catch {
    // Fall through to generic Event.
  }
  try {
    const EventCtor = (globalThis as { Event?: typeof Event }).Event;
    if (typeof EventCtor === 'function') {
      return new EventCtor('popstate');
    }
  } catch {
    // Fall through to plain object shim.
  }
  return { type: 'popstate' } as Event;
};

const dispatchRouterPopState = (): void => {
  const windowHandle = getRouterWindowHandle();
  if (windowHandle && typeof windowHandle.dispatchEvent === 'function') {
    try {
      windowHandle.dispatchEvent(createRouterPopStateEvent());
      return;
    } catch {
      // Fall back to direct handler invocation below.
    }
  }
  const path = readRouterPathname();
  for (const handler of routerPopStateHandlers.keys()) {
    try {
      handler(path);
    } catch {
      // Keep browser bridge listeners resilient.
    }
  }
};

const readRouterBasePath = (): string => {
  const documentHandle = (globalThis as { document?: RouterDocumentLike }).document;
  const baseURI = typeof documentHandle?.baseURI === "string" ? documentHandle.baseURI : "";
  if (!baseURI) return '/';
  try {
    if (typeof URL === 'function') {
      const parsed = new URL(baseURI, 'http://lumina.local');
      return parsed.pathname || '/';
    }
  } catch {
    // Fall through to returning the raw base URI string.
  }
  return baseURI;
};

export const dom = {
  is_available: (): boolean => getDocumentHandle() !== null,
  call_global_1: (name: string, arg: unknown): unknown => {
    const key = String(name);
    const fn = (globalThis as Record<string, unknown>)[key];
    if (typeof fn !== 'function') {
      return {
        ok: false,
        js: '',
        output: `// Missing global function: ${key}`,
        diagnostics: [{ severity: 'error', message: `Missing global function: ${key}` }],
      };
    }
    try {
      return (fn as (value: unknown) => unknown)(arg);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      return {
        ok: false,
        js: '',
        output: `// ${message}`,
        diagnostics: [{ severity: 'error', message }],
      };
    }
  },
  call_global_1_string: (name: string, arg: unknown): string => {
    const value = dom.call_global_1(name, arg);
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.output === 'string') return record.output;
      if (typeof record.message === 'string') return record.message;
    }
    return value == null ? '' : String(value);
  },
  query: (selector: string) => {
    const doc = getDocumentHandle();
    if (!doc) return Option.None;
    const element = doc.querySelector(String(selector));
    return element ? Option.Some(toDomHandle(element)) : Option.None;
  },
  query_all: (selector: string): number[] => {
    const doc = getDocumentHandle();
    if (!doc) return [];
    return Array.from(doc.querySelectorAll(String(selector))).map((entry) => toDomHandle(entry));
  },
  create: (tag: string): number => {
    const doc = getDocumentHandle();
    if (!doc) return toDomHandle(createDomStubElement());
    return toDomHandle(doc.createElement(String(tag)));
  },
  get_attr: (elementHandle: number, name: string) => {
    const element = fromDomHandle(elementHandle) as { getAttribute?: (name: string) => string | null } | null;
    if (!element || typeof element.getAttribute !== 'function') return Option.None;
    const value = element.getAttribute(String(name));
    return value == null ? Option.None : Option.Some(value);
  },
  set_attr: (elementHandle: number, name: string, value: string): void => {
    const element = fromDomHandle(elementHandle) as { setAttribute?: (name: string, value: string) => void } | null;
    if (!element || typeof element.setAttribute !== 'function') return;
    element.setAttribute(String(name), String(value));
  },
  remove_attr: (elementHandle: number, name: string): void => {
    const element = fromDomHandle(elementHandle) as { removeAttribute?: (name: string) => void } | null;
    if (!element || typeof element.removeAttribute !== 'function') return;
    element.removeAttribute(String(name));
  },
  get_text: (elementHandle: number): string => {
    const element = fromDomHandle(elementHandle) as { textContent?: string | null } | null;
    return element?.textContent ?? '';
  },
  set_text: (elementHandle: number, text: string): void => {
    const element = fromDomHandle(elementHandle) as { textContent?: string | null } | null;
    if (!element) return;
    element.textContent = String(text);
  },
  get_html: (elementHandle: number): string => {
    const element = fromDomHandle(elementHandle) as { innerHTML?: string } | null;
    return element?.innerHTML ?? '';
  },
  set_html: (elementHandle: number, html: string): void => {
    const element = fromDomHandle(elementHandle) as { innerHTML?: string } | null;
    if (!element) return;
    element.innerHTML = String(html);
  },
  append_child: (parentHandle: number, childHandle: number): void => {
    const parent = fromDomHandle(parentHandle) as { appendChild?: (child: unknown) => void } | null;
    const child = fromDomHandle(childHandle);
    if (!parent || !child || typeof parent.appendChild !== 'function') return;
    parent.appendChild(child);
  },
  remove_child: (parentHandle: number, childHandle: number): void => {
    const parent = fromDomHandle(parentHandle) as { removeChild?: (child: unknown) => void } | null;
    const child = fromDomHandle(childHandle);
    if (!parent || !child || typeof parent.removeChild !== 'function') return;
    try {
      parent.removeChild(child);
    } catch {
      // ignore remove errors
    }
  },
  add_event: (elementHandle: number, event: string, handler: unknown): number => {
    const element = fromDomHandle(elementHandle) as EventTarget | null;
    if (!element || typeof handler !== 'function') return 0;
    const listener: EventListener = () => {
      try {
        (handler as () => void)();
      } catch {
        // ignore user handler failures in runtime bridge
      }
    };
    if (typeof element.addEventListener === 'function') {
      element.addEventListener(String(event), listener);
    }
    const handle = domNextEventHandle++;
    domEvents.set(handle, { element, event: String(event), listener });
    return handle;
  },
  remove_event: (eventHandle: number): void => {
    const entry = domEvents.get(Math.trunc(eventHandle));
    if (!entry) return;
    if (typeof entry.element.removeEventListener === 'function') {
      entry.element.removeEventListener(entry.event, entry.listener);
    }
    domEvents.delete(Math.trunc(eventHandle));
  },
  get_style: (elementHandle: number, prop: string): string => {
    const element = fromDomHandle(elementHandle) as { style?: Record<string, unknown> } | null;
    if (!element) return '';
    const key = String(prop);
    const styleObj = element.style as Record<string, unknown> | undefined;
    if (!styleObj) return '';
    const value = styleObj[key];
    return typeof value === 'string' ? value : '';
  },
  set_style: (elementHandle: number, prop: string, value: string): void => {
    const element = fromDomHandle(elementHandle) as { style?: Record<string, unknown> } | null;
    if (!element || !element.style) return;
    element.style[String(prop)] = String(value);
  },
};

export const router = {
  getCurrentPath: (): string => readRouterPathname(),
  getCurrentHash: (): string => readRouterHash(),
  getCurrentSearch: (): string => readRouterSearch(),
  matchRoute: (pattern: string, path: string): boolean => matchRouterPattern(pattern, path),
  extractParams: (pattern: string, path: string): HashMap<string, string> =>
    extractRouterParams(pattern, path),
  parseSearchParams: (search: string): HashMap<string, string> => parseRouterSearchParams(search),
  push: (path: string): void => {
    const normalized = String(path);
    const historyHandle = getRouterHistoryHandle();
    if (historyHandle && typeof historyHandle.pushState === 'function') {
      try {
        historyHandle.pushState(historyHandle.state ?? null, '', normalized);
      } catch {
        updateRouterLocationValue(normalized);
      }
    } else {
      updateRouterLocationValue(normalized);
    }
    dispatchRouterPopState();
  },
  replace: (path: string): void => {
    const normalized = String(path);
    const historyHandle = getRouterHistoryHandle();
    if (historyHandle && typeof historyHandle.replaceState === 'function') {
      try {
        historyHandle.replaceState(historyHandle.state ?? null, '', normalized);
      } catch {
        updateRouterLocationValue(normalized);
      }
    } else {
      updateRouterLocationValue(normalized);
    }
    dispatchRouterPopState();
  },
  onPopState: (handler: RouterPopStateHandler | null | undefined): void => {
    if (typeof handler !== 'function') return;
    router.offPopState(handler);
    const listener: EventListener = () => {
      try {
        handler(readRouterPathname());
      } catch {
        // Ignore user callback failures in browser bridge.
      }
    };
    routerPopStateHandlers.set(handler, listener);
    const windowHandle = getRouterWindowHandle();
    if (windowHandle && typeof windowHandle.addEventListener === 'function') {
      windowHandle.addEventListener('popstate', listener);
    }
  },
  offPopState: (handler: RouterPopStateHandler | null | undefined): void => {
    if (typeof handler !== 'function') return;
    const listener = routerPopStateHandlers.get(handler);
    if (!listener) return;
    const windowHandle = getRouterWindowHandle();
    if (windowHandle && typeof windowHandle.removeEventListener === 'function') {
      windowHandle.removeEventListener('popstate', listener);
    }
    routerPopStateHandlers.delete(handler);
  },
  getBasePath: (): string => readRouterBasePath(),
};

export const env = {
  var: (name: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    const value = nodeProcess.env?.[String(name)];
    if (value === undefined) {
      return Result.Err(`Environment variable '${name}' is not set`);
    }
    return Result.Ok(String(value));
  },
  set_var: (name: string, value: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    nodeProcess.env[String(name)] = String(value);
    return Result.Ok(undefined);
  },
  remove_var: (name: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    delete nodeProcess.env[String(name)];
    return Result.Ok(undefined);
  },
  args: (): string[] => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return [];
    return nodeProcess.argv.slice(2);
  },
  cwd: () => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Current working directory is not available in this runtime');
    }
    return Result.Ok(nodeProcess.cwd());
  },
};

export const process = {
  spawn: (command: string, args: unknown = []) => {
    if (!isNodeRuntime()) {
      return Result.Err('Process spawning is not available in this runtime');
    }
    const commandText = String(command).trim();
    if (!commandText) {
      return Result.Err('Process command must be a non-empty string');
    }
    const argv = toIterableValues(args).map((part) => String(part));
    try {
      const spawn = getNodeSpawnSync();
      if (!spawn) {
        return Result.Err('Process spawning is not available in this runtime');
      }
      const output = spawn(commandText, argv, {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      });
      if (output.error) {
        return Result.Err(output.error.message || String(output.error));
      }
      return Result.Ok({
        status: typeof output.status === 'number' ? Math.trunc(output.status) : -1,
        success: output.status === 0,
        stdout: typeof output.stdout === 'string' ? output.stdout : String(output.stdout ?? ''),
        stderr: typeof output.stderr === 'string' ? output.stderr : String(output.stderr ?? ''),
      });
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  exit: (code: number = 0) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return;
    nodeProcess.exit(Math.trunc(code));
  },
  cwd: (): string => {
    const nodeProcess = getNodeProcess();
    return nodeProcess ? nodeProcess.cwd() : '';
  },
  pid: (): number => {
    const nodeProcess = getNodeProcess();
    return nodeProcess ? Math.trunc(nodeProcess.pid) : -1;
  },
};

export const json = {
  to_string: (value: unknown) => {
    try {
      return Result.Ok(JSON.stringify(value));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  to_pretty_string: (value: unknown) => {
    try {
      return Result.Ok(toJsonString(value, true));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  from_string: (source: string) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  parse: (source: string) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
};

export const http = {
  fetch: async (request: unknown) => {
    if (typeof fetch !== 'function') {
      return Result.Err('Fetch API is not available');
    }
    if (!request || typeof request !== 'object') {
      return Result.Err('Invalid request');
    }
    const req = request as {
      url?: unknown;
      method?: unknown;
      headers?: unknown;
      body?: unknown;
    };
    const rawUrl = typeof req.url === 'string' ? req.url : '';
    if (!rawUrl) {
      return Result.Err('Invalid request url');
    }
    let url: string;
    try {
      url = validateHttpUrl(rawUrl);
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
    const method = typeof req.method === 'string' && req.method.length > 0 ? req.method : 'GET';
    const headerInput = unwrapOption(req.headers).value;
    const headers: Record<string, string> = {};
    if (Array.isArray(headerInput)) {
      for (const entry of headerInput) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [name, value] = entry;
          if (typeof name === 'string') {
            headers[name] = typeof value === 'string' ? value : String(value ?? '');
          }
          continue;
        }
        if (entry && typeof entry === 'object') {
          const name = (entry as { name?: unknown }).name;
          const value = (entry as { value?: unknown }).value;
          if (typeof name === 'string') {
            headers[name] = typeof value === 'string' ? value : String(value ?? '');
          }
        }
      }
    }
    const bodyValue = unwrapOption(req.body).value;
    const body = typeof bodyValue === 'string' ? bodyValue : bodyValue == null ? undefined : String(bodyValue);
    try {
      const response = await fetch(url, { method, headers, body });
      const text = await response.text();
      const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }));
      return Result.Ok({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
      });
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  get: async (url: string) =>
    await http.fetch({
      url,
      method: 'GET',
      headers: Option.None,
      body: Option.None,
    }),
  post: async (url: string, body?: unknown) =>
    await http.fetch({
      url,
      method: 'POST',
      headers: Option.None,
      body: body === undefined ? Option.None : Option.Some(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  put: async (url: string, body?: unknown) =>
    await http.fetch({
      url,
      method: 'PUT',
      headers: Option.None,
      body: body === undefined ? Option.None : Option.Some(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  del: async (url: string) =>
    await http.fetch({
      url,
      method: 'DELETE',
      headers: Option.None,
      body: Option.None,
    }),
};

const getMonotonicNow = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
};

export const time = {
  nowMs: () => Math.trunc(Date.now()),
  nowIso: () => new Date().toISOString(),
  instantNow: () => Math.trunc(getMonotonicNow()),
  elapsedMs: (since: number) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)),
  sleep: async (ms: number) =>
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, Math.trunc(ms)));
    }),
};

const toIterableValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const iteratorFn = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iteratorFn === 'function') {
      return Array.from(value as Iterable<unknown>);
    }
  }
  return [];
};

const compileRegex = (pattern: string, flags: string = ''): RegExp | null => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
};

export const regex = {
  isValid: (pattern: string, flags: string = ''): boolean => compileRegex(pattern, flags) !== null,
  test: (pattern: string, text: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(re.test(text));
  },
  find: (pattern: string, text: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Option.None;
    const match = text.match(re);
    if (!match) return Option.None;
    return Option.Some(match[0]);
  },
  findAll: (pattern: string, text: string, flags: string = '') => {
    const normalizedFlags = flags.includes('g') ? flags : `${flags}g`;
    const re = compileRegex(pattern, normalizedFlags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${normalizedFlags}`);
    const matches = Array.from(text.matchAll(re)).map((m) => m[0]);
    return Result.Ok(matches);
  },
  replace: (pattern: string, text: string, replacement: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(text.replace(re, replacement));
  },
};

const toHex = (bytes: Uint8Array): string => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const getWebCrypto = async (): Promise<Crypto | null> => {
  if (globalThis.crypto && typeof globalThis.crypto.subtle !== 'undefined') {
    return globalThis.crypto;
  }
  if (!isNodeRuntime()) return null;
  try {
    const nodeCrypto = await import('node:crypto');
    return (nodeCrypto as { webcrypto?: Crypto }).webcrypto ?? null;
  } catch {
    return null;
  }
};

const utf8Encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const utf8Decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const deriveAesKey = async (web: Crypto, key: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> => {
  const digest = await web.subtle.digest('SHA-256', utf8Encode(key) as unknown as BufferSource);
  return await web.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [usage]);
};

export const crypto = {
  isAvailable: async () => (await getWebCrypto()) !== null,
  sha256: async (value: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const digest = await web.subtle.digest('SHA-256', utf8Encode(value) as unknown as BufferSource);
      return Result.Ok(toHex(new Uint8Array(digest)));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  hmacSha256: async (key: string, value: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const cryptoKey = await web.subtle.importKey(
        'raw',
        utf8Encode(key) as unknown as BufferSource,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await web.subtle.sign('HMAC', cryptoKey, utf8Encode(value) as unknown as BufferSource);
      return Result.Ok(toHex(new Uint8Array(signature)));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  randomBytes: async (length: number) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const n = Math.max(0, Math.trunc(length));
      const bytes = new Uint8Array(n);
      web.getRandomValues(bytes);
      return Result.Ok(Array.from(bytes).map((b) => b | 0));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  randomInt: async (min: number, max: number) => {
    const lower = Math.trunc(Math.min(min, max));
    const upper = Math.trunc(Math.max(min, max));
    const span = upper - lower + 1;
    if (span <= 0) return Result.Err('Invalid range');
    const random = await crypto.randomBytes(4);
    if (!isEnumLike(random) || getEnumTag(random) !== 'Ok') return random;
    const bytes = getEnumPayload(random);
    if (!Array.isArray(bytes) || bytes.length < 4) return Result.Err('Failed to generate randomness');
    const packed = new Uint8Array([
      bytes[0] as number,
      bytes[1] as number,
      bytes[2] as number,
      bytes[3] as number,
    ]);
    const value = new DataView(packed.buffer).getUint32(0, false);
    return Result.Ok(lower + (value % span));
  },
  aesGcmEncrypt: async (key: string, plaintext: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const aesKey = await deriveAesKey(web, key, 'encrypt');
      const iv = new Uint8Array(12);
      web.getRandomValues(iv);
      const encrypted = await web.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        utf8Encode(plaintext) as unknown as BufferSource
      );
      const cipherBytes = new Uint8Array(encrypted);
      const packed = new Uint8Array(iv.length + cipherBytes.length);
      packed.set(iv, 0);
      packed.set(cipherBytes, iv.length);
      return Result.Ok(toBase64(packed));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  aesGcmDecrypt: async (key: string, payloadBase64: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const packed = fromBase64(payloadBase64);
      if (packed.length < 13) return Result.Err('Invalid AES payload');
      const iv = packed.slice(0, 12);
      const cipher = packed.slice(12);
      const aesKey = await deriveAesKey(web, key, 'decrypt');
      const plain = await web.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
      return Result.Ok(utf8Decode(new Uint8Array(plain)));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
};

export const list = {
  map: <A, B>(f: (value: A) => B, xs: A[]): B[] => xs.map(f),
  filter: <A>(pred: (value: A) => boolean, xs: A[]): A[] => xs.filter(pred),
  fold: <A, B>(f: (acc: B, value: A) => B, init: B, xs: A[]): B => xs.reduce((acc, val) => f(acc, val), init),
  reverse: <A>(xs: A[]): A[] => xs.slice().reverse(),
  length: <A>(xs: A[]): number => xs.length,
  append: <A>(xs: A[], ys: A[]): A[] => xs.concat(ys),
  take: <A>(n: number, xs: A[]): A[] => xs.slice(0, Math.max(0, n)),
  drop: <A>(n: number, xs: A[]): A[] => xs.slice(Math.max(0, n)),
  find: <A>(pred: (value: A) => boolean, xs: A[]) => {
    const found = xs.find(pred);
    return found === undefined ? Option.None : Option.Some(found);
  },
  any: <A>(pred: (value: A) => boolean, xs: A[]): boolean => xs.some(pred),
  all: <A>(pred: (value: A) => boolean, xs: A[]): boolean => xs.every(pred),
};

export class Vec<T> {
  private data: T[];

  constructor() {
    this.data = [];
  }

  static new<T>(): Vec<T> {
    return new Vec<T>();
  }

  static from<T>(items: T[]): Vec<T> {
    const next = new Vec<T>();
    next.data = Array.isArray(items) ? [...items] : [];
    return next;
  }

  push(value: T): void {
    this.data.push(value);
  }

  get(index: number) {
    if (!Number.isFinite(index)) return Option.None;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < this.data.length ? Option.Some(this.data[idx]) : Option.None;
  }

  len(): number {
    return this.data.length;
  }

  pop() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop() as T;
    return Option.Some(value);
  }

  clear(): void {
    this.data = [];
  }

  map<U>(mapper: (value: T) => U): Vec<U> {
    const out = Vec.new<U>();
    for (const item of this.data) {
      out.push(mapper(item));
    }
    return out;
  }

  filter(predicate: (value: T) => boolean): Vec<T> {
    const out = Vec.new<T>();
    for (const item of this.data) {
      if (predicate(item)) out.push(item);
    }
    return out;
  }

  fold<U>(init: U, folder: (acc: U, value: T) => U): U {
    let acc = init;
    for (const item of this.data) {
      acc = folder(acc, item);
    }
    return acc;
  }

  for_each(action: (value: T) => void): void {
    for (const item of this.data) {
      action(item);
    }
  }

  any(predicate: (value: T) => boolean): boolean {
    return this.data.some(predicate);
  }

  all(predicate: (value: T) => boolean): boolean {
    return this.data.every(predicate);
  }

  find(predicate: (value: T) => boolean) {
    const found = this.data.find(predicate);
    return found === undefined ? Option.None : Option.Some(found);
  }

  position(predicate: (value: T) => boolean) {
    const idx = this.data.findIndex(predicate);
    return idx >= 0 ? Option.Some(idx) : Option.None;
  }

  take(n: number): Vec<T> {
    const out = Vec.new<T>();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = 0; i < Math.min(count, this.data.length); i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }

  skip(n: number): Vec<T> {
    const out = Vec.new<T>();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = Math.min(count, this.data.length); i < this.data.length; i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }

  zip<U>(other: Vec<U>): Vec<[T, U]> {
    const out = Vec.new<[T, U]>();
    const size = Math.min(this.data.length, other.data.length);
    for (let i = 0; i < size; i += 1) {
      out.push([this.data[i], other.data[i]]);
    }
    return out;
  }

  enumerate(): Vec<[number, T]> {
    const out = Vec.new<[number, T]>();
    for (let i = 0; i < this.data.length; i += 1) {
      out.push([i, this.data[i]]);
    }
    return out;
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
}

export const timeout = async (ms: number): Promise<void> => {
  await time.sleep(ms);
};

export const join_all = async <T>(values: unknown): Promise<Vec<T>> => {
  const resolved = await Promise.all(toIterableValues(values).map((item) => Promise.resolve(item)));
  return Vec.from(resolved as T[]);
};

export const vec = {
  new: <T>() => Vec.new<T>(),
  from: <T>(items: T[]) => Vec.from(items),
  push: <T>(v: Vec<T>, value: T) => v.push(value),
  get: <T>(v: Vec<T>, index: number) => v.get(index),
  len: <T>(v: Vec<T>) => v.len(),
  pop: <T>(v: Vec<T>) => v.pop(),
  clear: <T>(v: Vec<T>) => v.clear(),
  map: <T, U>(v: Vec<T>, f: (value: T) => U) => v.map(f),
  filter: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.filter(pred),
  fold: <T, U>(v: Vec<T>, init: U, f: (acc: U, value: T) => U) => v.fold(init, f),
  for_each: <T>(v: Vec<T>, f: (value: T) => void) => v.for_each(f),
  any: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.any(pred),
  all: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.all(pred),
  find: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.find(pred),
  position: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.position(pred),
  take: <T>(v: Vec<T>, n: number) => v.take(n),
  skip: <T>(v: Vec<T>, n: number) => v.skip(n),
  zip: <T, U>(v: Vec<T>, other: Vec<U>) => v.zip(other),
  enumerate: <T>(v: Vec<T>) => v.enumerate(),
  fused_filter_map_fold: <T, U, A>(
    v: Vec<T>,
    pred: (value: T) => boolean,
    mapper: (value: T) => U,
    init: A,
    folder: (acc: A, value: U) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_map_fold: <T, U, A>(
    v: Vec<T>,
    mapper: (value: T) => U,
    init: A,
    folder: (acc: A, value: U) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_filter_fold: <T, A>(
    v: Vec<T>,
    pred: (value: T) => boolean,
    init: A,
    folder: (acc: A, value: T) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, item);
    }
    return acc;
  },
  fused_pipeline: <T, A>(
    v: Vec<T>,
    stages: Array<{ kind: 'map' | 'filter'; f: (value: unknown) => unknown }>,
    init: A,
    folder: (acc: A, value: unknown) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      let current: unknown = item;
      let keep = true;
      for (const stage of stages) {
        if (stage.kind === 'map') {
          current = stage.f(current);
          continue;
        }
        if (stage.kind === 'filter') {
          if (!stage.f(current)) {
            keep = false;
            break;
          }
          continue;
        }
      }
      if (!keep) continue;
      acc = folder(acc, current);
    }
    return acc;
  },
};

const compareOrder = (left: unknown, right: unknown): number => {
  if (left === right) return 0;
  const leftComparable = left as string | number | bigint | boolean;
  const rightComparable = right as string | number | bigint | boolean;
  return leftComparable < rightComparable ? -1 : 1;
};

const normalizeCount = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

type QueryRecord<T> = { items: Vec<T> };

export const iter = {
  map_vec: <A, B>(values: Vec<A>, mapper: (value: A) => B): Vec<B> => vec.map(values, mapper),
  filter_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): Vec<A> => vec.filter(values, pred),
  filter_option: <A>(value: unknown, pred: (input: A) => boolean): unknown => {
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag !== 'Some') return Option.None;
    const payload = getEnumPayload(value as LuminaEnumLike) as A;
    return pred(payload) ? Option.Some(payload) : Option.None;
  },
  zip_vec: <A, B>(left: Vec<A>, right: Vec<B>): Vec<[A, B]> => vec.zip(left, right),
  enumerate_vec: <A>(values: Vec<A>): Vec<[number, A]> => vec.enumerate(values),
  flatten_vec: <A>(values: Vec<Vec<A>>): Vec<A> => {
    const out = Vec.new<A>();
    for (const inner of values) {
      if (!(inner instanceof Vec)) continue;
      for (const value of inner) out.push(value);
    }
    return out;
  },
  flat_map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => Vec<B>): Vec<B> => {
    const out = Vec.new<B>();
    for (const value of values) {
      const mapped = mapper(value);
      if (!(mapped instanceof Vec)) continue;
      for (const inner of mapped) out.push(inner);
    }
    return out;
  },
  chunk_vec: <A>(values: Vec<A>, size: number): Vec<Vec<A>> => {
    const out = Vec.new<Vec<A>>();
    const chunkSize = normalizeCount(size);
    if (chunkSize <= 0) return out;
    let current = Vec.new<A>();
    let count = 0;
    for (const value of values) {
      current.push(value);
      count += 1;
      if (count >= chunkSize) {
        out.push(current);
        current = Vec.new<A>();
        count = 0;
      }
    }
    if (current.len() > 0) out.push(current);
    return out;
  },
  window_vec: <A>(values: Vec<A>, size: number): Vec<Vec<A>> => {
    const out = Vec.new<Vec<A>>();
    const windowSize = normalizeCount(size);
    if (windowSize <= 0 || windowSize > values.len()) return out;
    const source = Array.from(values);
    for (let start = 0; start <= values.len() - windowSize; start += 1) {
      const window = Vec.new<A>();
      for (let offset = 0; offset < windowSize; offset += 1) {
        window.push(source[start + offset] as A);
      }
      out.push(window);
    }
    return out;
  },
  partition_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): [Vec<A>, Vec<A>] => {
    const pass = Vec.new<A>();
    const fail = Vec.new<A>();
    for (const value of values) {
      if (pred(value)) pass.push(value);
      else fail.push(value);
    }
    return [pass, fail];
  },
  take_vec: <A>(values: Vec<A>, n: number): Vec<A> => vec.take(values, n),
  skip_vec: <A>(values: Vec<A>, n: number): Vec<A> => vec.skip(values, n),
  any_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): boolean => vec.any(values, pred),
  all_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): boolean => vec.all(values, pred),
  find_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): unknown => vec.find(values, pred),
  count_vec: <A>(values: Vec<A>): number => vec.len(values),
  sum_vec: (values: Vec<number>): number => vec.fold(values, 0, (acc, value) => acc + value),
  sum_vec_f64: (values: Vec<number>): number => vec.fold(values, 0, (acc, value) => acc + value),
  unique_vec: <A>(values: Vec<A>): Vec<A> => {
    const out = Vec.new<A>();
    for (const value of values) {
      let seen = false;
      for (const existing of out) {
        if (runtimeEquals(existing, value)) {
          seen = true;
          break;
        }
      }
      if (!seen) out.push(value);
    }
    return out;
  },
  reverse_vec: <A>(values: Vec<A>): Vec<A> => Vec.from(Array.from(values).reverse()),
  sort_vec: <A>(values: Vec<A>, cmp: (left: A, right: A) => number): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => cmp(left, right))),
  sort_by_vec: <A, K>(values: Vec<A>, key: (value: A) => K): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => compareOrder(key(left), key(right)))),
  sort_by_desc_vec: <A, K>(values: Vec<A>, key: (value: A) => K): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => compareOrder(key(right), key(left)))),
  group_by_vec: <A, K>(values: Vec<A>, key: (value: A) => K): HashMap<K, Vec<A>> => {
    const out = HashMap.new<K, Vec<A>>();
    for (const value of values) {
      const groupKey = key(value);
      const existing = out.get(groupKey);
      if (existing === Option.None) {
        const bucket = Vec.new<A>();
        bucket.push(value);
        out.insert(groupKey, bucket);
        continue;
      }
      const bucket = getEnumPayload(existing) as Vec<A>;
      bucket.push(value);
    }
    return out;
  },
  intersperse_vec: <A>(values: Vec<A>, sep: A): Vec<A> => {
    const out = Vec.new<A>();
    let first = true;
    for (const value of values) {
      if (!first) out.push(sep);
      out.push(value);
      first = false;
    }
    return out;
  },
  join_vec: <A, B, K>(
    left: Vec<A>,
    right: Vec<B>,
    left_key: (value: A) => K,
    right_key: (value: B) => K
  ): Vec<[A, B]> => {
    const out = Vec.new<[A, B]>();
    for (const leftValue of left) {
      const leftKey = left_key(leftValue);
      for (const rightValue of right) {
        if (runtimeEquals(leftKey, right_key(rightValue))) {
          out.push([leftValue, rightValue]);
        }
      }
    }
    return out;
  },
};

export const map_vec = iter.map_vec;
export const filter_vec = iter.filter_vec;
export const filter_option = iter.filter_option;
export const zip_vec = iter.zip_vec;
export const enumerate_vec = iter.enumerate_vec;
export const flatten_vec = iter.flatten_vec;
export const flat_map_vec = iter.flat_map_vec;
export const chunk_vec = iter.chunk_vec;
export const window_vec = iter.window_vec;
export const partition_vec = iter.partition_vec;
export const take_vec = iter.take_vec;
export const skip_vec = iter.skip_vec;
export const any_vec = iter.any_vec;
export const all_vec = iter.all_vec;
export const find_vec = iter.find_vec;
export const count_vec = iter.count_vec;
export const sum_vec = iter.sum_vec;
export const sum_vec_f64 = iter.sum_vec_f64;
export const unique_vec = iter.unique_vec;
export const reverse_vec = iter.reverse_vec;
export const sort_vec = iter.sort_vec;
export const sort_by_vec = iter.sort_by_vec;
export const sort_by_desc_vec = iter.sort_by_desc_vec;
export const group_by_vec = iter.group_by_vec;
export const intersperse_vec = iter.intersperse_vec;
export const join_vec = iter.join_vec;

export const query = <T>(items: Vec<T>): QueryRecord<T> => ({ items });
export const where_q = <T>(q: QueryRecord<T>, pred: (value: T) => boolean): QueryRecord<T> => ({
  items: iter.filter_vec(q.items, pred),
});
export const select_q = <T, U>(q: QueryRecord<T>, mapper: (value: T) => U): QueryRecord<U> => ({
  items: iter.map_vec(q.items, mapper),
});
export const order_by_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): QueryRecord<T> => ({
  items: iter.sort_by_vec(q.items, key),
});
export const order_by_desc_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): QueryRecord<T> => ({
  items: iter.sort_by_desc_vec(q.items, key),
});
export const limit_q = <T>(q: QueryRecord<T>, n: number): QueryRecord<T> => ({ items: iter.take_vec(q.items, n) });
export const offset_q = <T>(q: QueryRecord<T>, n: number): QueryRecord<T> => ({ items: iter.skip_vec(q.items, n) });
export const group_by_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): HashMap<K, Vec<T>> =>
  iter.group_by_vec(q.items, key);
export const count_q = <T>(q: QueryRecord<T>): number => iter.count_vec(q.items);
export const first_q = <T>(q: QueryRecord<T>): unknown => vec.get(q.items, 0);
export const to_vec_q = <T>(q: QueryRecord<T>): Vec<T> => q.items;
export const join_q = <T, U, K>(
  left: QueryRecord<T>,
  right: QueryRecord<U>,
  left_key: (value: T) => K,
  right_key: (value: U) => K
): QueryRecord<[T, U]> => ({
  items: iter.join_vec(left.items, right.items, left_key, right_key),
});

export class HashMap<K, V> {
  private buckets: Map<string, Array<{ key: K; value: V }>>;
  private sizeValue: number;

  constructor() {
    this.buckets = new Map();
    this.sizeValue = 0;
  }

  static new<K, V>(): HashMap<K, V> {
    return new HashMap<K, V>();
  }

  private getBucket(key: K): Array<{ key: K; value: V }> {
    const hash = runtimeHashValue(key);
    const existing = this.buckets.get(hash);
    if (existing) return existing;
    const next: Array<{ key: K; value: V }> = [];
    this.buckets.set(hash, next);
    return next;
  }

  private lookupBucket(key: K): Array<{ key: K; value: V }> | null {
    const hash = runtimeHashValue(key);
    return this.buckets.get(hash) ?? null;
  }

  insert(key: K, value: V) {
    const bucket = this.getBucket(key);
    for (let i = 0; i < bucket.length; i += 1) {
      const current = bucket[i];
      if (runtimeEquals(current.key, key)) {
        const old = current.value;
        current.value = value;
        return Option.Some(old);
      }
    }
    bucket.push({ key, value });
    this.sizeValue += 1;
    return Option.None;
  }

  get(key: K) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return Option.None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) {
        return Option.Some(entry.value);
      }
    }
    return Option.None;
  }

  remove(key: K) {
    const hash = runtimeHashValue(key);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option.None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option.Some(removed.value);
      }
    }
    return Option.None;
  }

  contains_key(key: K): boolean {
    const bucket = this.lookupBucket(key);
    if (!bucket) return false;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) return true;
    }
    return false;
  }

  len(): number {
    return this.sizeValue;
  }

  clear(): void {
    this.buckets.clear();
    this.sizeValue = 0;
  }

  keys(): Vec<K> {
    const v = Vec.new<K>();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.key);
      }
    }
    return v;
  }

  values(): Vec<V> {
    const v = Vec.new<V>();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.value);
      }
    }
    return v;
  }
}

export const hashmap = {
  new: <K, V>() => HashMap.new<K, V>(),
  insert: <K, V>(m: HashMap<K, V>, k: K, v: V) => m.insert(k, v),
  get: <K, V>(m: HashMap<K, V>, k: K) => m.get(k),
  remove: <K, V>(m: HashMap<K, V>, k: K) => m.remove(k),
  contains_key: <K, V>(m: HashMap<K, V>, k: K) => m.contains_key(k),
  len: <K, V>(m: HashMap<K, V>) => m.len(),
  clear: <K, V>(m: HashMap<K, V>) => m.clear(),
  keys: <K, V>(m: HashMap<K, V>) => m.keys(),
  values: <K, V>(m: HashMap<K, V>) => m.values(),
};

export class HashSet<T> {
  private map: HashMap<T, undefined>;

  constructor() {
    this.map = HashMap.new<T, undefined>();
  }

  static new<T>(): HashSet<T> {
    return new HashSet<T>();
  }

  insert(value: T): boolean {
    const result = this.map.insert(value, undefined);
    return result === Option.None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    const result = this.map.remove(value);
    return result !== Option.None;
  }

  len(): number {
    return this.map.len();
  }

  clear(): void {
    this.map.clear();
  }

  values(): Vec<T> {
    return this.map.keys();
  }
}

export const hashset = {
  new: <T>() => HashSet.new<T>(),
  insert: <T>(s: HashSet<T>, v: T) => s.insert(v),
  contains: <T>(s: HashSet<T>, v: T) => s.contains(v),
  remove: <T>(s: HashSet<T>, v: T) => s.remove(v),
  len: <T>(s: HashSet<T>) => s.len(),
  clear: <T>(s: HashSet<T>) => s.clear(),
  values: <T>(s: HashSet<T>) => s.values(),
};

export class Deque<T> {
  private data: T[];

  constructor() {
    this.data = [];
  }

  static new<T>(): Deque<T> {
    return new Deque<T>();
  }

  push_front(value: T): void {
    this.data.unshift(value);
  }

  push_back(value: T): void {
    this.data.push(value);
  }

  pop_front() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.shift() as T;
    return Option.Some(value);
  }

  pop_back() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop() as T;
    return Option.Some(value);
  }

  len(): number {
    return this.data.length;
  }

  clear(): void {
    this.data = [];
  }
}

export const deque = {
  new: <T>() => Deque.new<T>(),
  push_front: <T>(d: Deque<T>, value: T) => d.push_front(value),
  push_back: <T>(d: Deque<T>, value: T) => d.push_back(value),
  pop_front: <T>(d: Deque<T>) => d.pop_front(),
  pop_back: <T>(d: Deque<T>) => d.pop_back(),
  len: <T>(d: Deque<T>) => d.len(),
  clear: <T>(d: Deque<T>) => d.clear(),
};

const compareBTreeKeys = (left: unknown, right: unknown): number => {
  if (left === right) return 0;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const ordImpl = runtimeTraitImpls.Ord.get(leftTag);
    if (ordImpl) {
      try {
        return orderingToNumber(ordImpl(left, right));
      } catch {
        // fall through to default compare
      }
    }
  }
  if (left == null && right != null) return -1;
  if (left != null && right == null) return 1;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType === rightType && (leftType === 'number' || leftType === 'bigint' || leftType === 'string' || leftType === 'boolean')) {
    const leftComparable = left as string | number | bigint | boolean;
    const rightComparable = right as string | number | bigint | boolean;
    return leftComparable < rightComparable ? -1 : 1;
  }
  const leftText = formatValue(left, { color: false });
  const rightText = formatValue(right, { color: false });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
};

type BTreeEntry<K, V> = { key: K; value: V };

export class BTreeMap<K, V> {
  private entries: Array<BTreeEntry<K, V>>;

  constructor() {
    this.entries = [];
  }

  static new<K, V>(): BTreeMap<K, V> {
    return new BTreeMap<K, V>();
  }

  private lowerBound(key: K): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareBTreeKeys(this.entries[mid].key, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  insert(key: K, value: V) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const previous = this.entries[idx].value;
      this.entries[idx].value = value;
      return Option.Some(previous);
    }
    this.entries.splice(idx, 0, { key, value });
    return Option.None;
  }

  get(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      return Option.Some(this.entries[idx].value);
    }
    return Option.None;
  }

  remove(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const [removed] = this.entries.splice(idx, 1);
      return Option.Some(removed.value);
    }
    return Option.None;
  }

  contains_key(key: K): boolean {
    const idx = this.lowerBound(key);
    return idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0;
  }

  len(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  keys(): Vec<K> {
    const out = Vec.new<K>();
    for (const entry of this.entries) out.push(entry.key);
    return out;
  }

  values(): Vec<V> {
    const out = Vec.new<V>();
    for (const entry of this.entries) out.push(entry.value);
    return out;
  }

  entries_vec(): Vec<[K, V]> {
    const out = Vec.new<[K, V]>();
    for (const entry of this.entries) out.push([entry.key, entry.value]);
    return out;
  }
}

export const btreemap = {
  new: <K, V>() => BTreeMap.new<K, V>(),
  insert: <K, V>(m: BTreeMap<K, V>, k: K, v: V) => m.insert(k, v),
  get: <K, V>(m: BTreeMap<K, V>, k: K) => m.get(k),
  remove: <K, V>(m: BTreeMap<K, V>, k: K) => m.remove(k),
  contains_key: <K, V>(m: BTreeMap<K, V>, k: K) => m.contains_key(k),
  len: <K, V>(m: BTreeMap<K, V>) => m.len(),
  clear: <K, V>(m: BTreeMap<K, V>) => m.clear(),
  keys: <K, V>(m: BTreeMap<K, V>) => m.keys(),
  values: <K, V>(m: BTreeMap<K, V>) => m.values(),
  entries: <K, V>(m: BTreeMap<K, V>) => m.entries_vec(),
};

export class BTreeSet<T> {
  private map: BTreeMap<T, undefined>;

  constructor() {
    this.map = BTreeMap.new<T, undefined>();
  }

  static new<T>(): BTreeSet<T> {
    return new BTreeSet<T>();
  }

  insert(value: T): boolean {
    const old = this.map.insert(value, undefined);
    return old === Option.None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    return this.map.remove(value) !== Option.None;
  }

  len(): number {
    return this.map.len();
  }

  clear(): void {
    this.map.clear();
  }

  values(): Vec<T> {
    return this.map.keys();
  }
}

export const btreeset = {
  new: <T>() => BTreeSet.new<T>(),
  insert: <T>(s: BTreeSet<T>, v: T) => s.insert(v),
  contains: <T>(s: BTreeSet<T>, v: T) => s.contains(v),
  remove: <T>(s: BTreeSet<T>, v: T) => s.remove(v),
  len: <T>(s: BTreeSet<T>) => s.len(),
  clear: <T>(s: BTreeSet<T>) => s.clear(),
  values: <T>(s: BTreeSet<T>) => s.values(),
};

export class PriorityQueue<T> {
  private heap: T[];

  constructor() {
    this.heap = [];
  }

  static new<T>(): PriorityQueue<T> {
    return new PriorityQueue<T>();
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (compareBTreeKeys(this.heap[parent], this.heap[idx]) <= 0) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }

  private bubbleDown(index: number): void {
    let idx = index;
    const size = this.heap.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < size && compareBTreeKeys(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && compareBTreeKeys(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      this.swap(idx, smallest);
      idx = smallest;
    }
  }

  push(value: T): void {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return Option.None;
    const head = this.heap[0];
    const last = this.heap.pop() as T;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return Option.Some(head);
  }

  peek() {
    if (this.heap.length === 0) return Option.None;
    return Option.Some(this.heap[0]);
  }

  len(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
  }
}

export const priority_queue = {
  new: <T>() => PriorityQueue.new<T>(),
  push: <T>(q: PriorityQueue<T>, value: T) => q.push(value),
  pop: <T>(q: PriorityQueue<T>) => q.pop(),
  peek: <T>(q: PriorityQueue<T>) => q.peek(),
  len: <T>(q: PriorityQueue<T>) => q.len(),
  clear: <T>(q: PriorityQueue<T>) => q.clear(),
};

export class LuminaPanic extends Error {
  value?: unknown;
  constructor(message: string, value?: unknown) {
    super(message);
    this.name = 'LuminaPanic';
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LuminaPanic);
    }
  }
}

export const Option = {
  Some: (value: unknown) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
  map: (fn: (value: unknown) => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt as LuminaEnumLike)));
    return Option.None;
  },
  and_then: (fn: (value: unknown) => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return fn(getEnumPayload(opt as LuminaEnumLike));
    return Option.None;
  },
  or_else: (fallback: () => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return opt;
    return fallback();
  },
  unwrap_or: (fallback: unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return getEnumPayload(opt as LuminaEnumLike);
    return fallback;
  },
  is_some: (opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    return tag === 'Some';
  },
  is_none: (opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    return tag !== 'Some';
  },
  unwrap: (opt: unknown, message?: string) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return getEnumPayload(opt as LuminaEnumLike);
    const rendered = formatValue(opt);
    const msg = message ?? `Tried to unwrap None: ${rendered}`;
    const err = new LuminaPanic(msg, opt);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, Option.unwrap);
    }
    throw err;
  },
};

export const Result = {
  Ok: (value: unknown) => ({ $tag: 'Ok', $payload: value }),
  Err: (error: unknown) => ({ $tag: 'Err', $payload: error }),
  map: (fn: (value: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res as LuminaEnumLike)));
    return res;
  },
  and_then: (fn: (value: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return fn(getEnumPayload(res as LuminaEnumLike));
    return res;
  },
  or_else: (fn: (error: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return res;
    return fn(getEnumPayload(res as LuminaEnumLike));
  },
  unwrap_or: (fallback: unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return getEnumPayload(res as LuminaEnumLike);
    return fallback;
  },
  is_ok: (res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    return tag === 'Ok';
  },
  is_err: (res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    return tag !== 'Ok';
  },
};

type ChannelMessage =
  | { __lumina_channel_value: unknown }
  | { __lumina_channel_close: true }
  | { __lumina_channel_ack: number };

const isChannelValue = (value: unknown): value is { __lumina_channel_value: unknown } =>
  !!value && typeof value === 'object' && '__lumina_channel_value' in value;

const isChannelClose = (value: unknown): value is { __lumina_channel_close: true } =>
  !!value && typeof value === 'object' && (value as { __lumina_channel_close?: unknown }).__lumina_channel_close === true;

const isChannelAck = (value: unknown): value is { __lumina_channel_ack: number } =>
  !!value && typeof value === 'object' && typeof (value as { __lumina_channel_ack?: unknown }).__lumina_channel_ack === 'number';

const resolveMessageChannel = (): typeof MessageChannel | null => {
  if (typeof MessageChannel === 'function') return MessageChannel;
  return null;
};

interface SenderSharedState {
  port: MessagePort;
  credits: number | null;
  refs: number;
  closed: boolean;
  receiverClosed: boolean;
  pending: Array<{ value: unknown; resolve: (ok: boolean) => void }>;
  flushing: boolean;
}

const createSenderSharedState = (port: MessagePort, capacity: number | null): SenderSharedState => {
  const state: SenderSharedState = {
    port,
    credits: capacity,
    refs: 1,
    closed: false,
    receiverClosed: false,
    pending: [],
    flushing: false,
  };
  return state;
};

const senderPostNow = (state: SenderSharedState, value: unknown): boolean => {
  if (state.closed || state.receiverClosed) return false;
  if (state.credits !== null && state.credits <= 0) return false;
  if (state.credits !== null) {
    state.credits -= 1;
  }
  const payload: ChannelMessage = { __lumina_channel_value: value };
  try {
    state.port.postMessage(payload);
    return true;
  } catch {
    state.closed = true;
    return false;
  }
};

const drainPendingSends = (state: SenderSharedState): void => {
  if (state.flushing) return;
  state.flushing = true;
  try {
    while (state.pending.length > 0) {
      if (state.closed || state.receiverClosed) {
        while (state.pending.length > 0) {
          const item = state.pending.shift();
          if (item) item.resolve(false);
        }
        return;
      }
      if (state.credits !== null && state.credits <= 0) {
        return;
      }
      const next = state.pending.shift();
      if (!next) return;
      next.resolve(senderPostNow(state, next.value));
    }
  } finally {
    state.flushing = false;
  }
};

export class Sender<T> {
  private closedLocal = false;

  constructor(private readonly shared: SenderSharedState) {}

  static create<T>(port: MessagePort, capacity: number | null): Sender<T> {
    const shared = createSenderSharedState(port, capacity);
    const sender = new Sender<T>(shared);
    shared.port.start?.();
    shared.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        shared.receiverClosed = true;
        shared.closed = true;
        drainPendingSends(shared);
        return;
      }
      if (isChannelAck(data) && shared.credits !== null) {
        shared.credits += data.__lumina_channel_ack;
        drainPendingSends(shared);
      }
    };
    return sender;
  }

  clone(): Sender<T> {
    const clone = new Sender<T>(this.shared);
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      clone.closedLocal = true;
      return clone;
    }
    this.shared.refs += 1;
    return clone;
  }

  private sendFailureReason(): string {
    if (this.shared.receiverClosed) return 'receiver closed';
    if (this.closedLocal || this.shared.closed) return 'sender closed';
    if (this.shared.credits !== null && this.shared.credits <= 0) return 'channel full';
    return 'send failed';
  }

  send(value: T): Promise<boolean> {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    if (senderPostNow(this.shared, value)) {
      return Promise.resolve(true);
    }
    if (this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.shared.pending.push({ value, resolve });
      drainPendingSends(this.shared);
    });
  }

  try_send(value: T): boolean {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) return false;
    return senderPostNow(this.shared, value);
  }

  send_result(value: T): { $tag: string; $payload?: unknown } {
    if (this.try_send(value)) return Result.Ok(undefined);
    return Result.Err(this.sendFailureReason());
  }

  async send_async_result(value: T): Promise<{ $tag: string; $payload?: unknown }> {
    const ok = await this.send(value);
    if (ok) return Result.Ok(undefined);
    return Result.Err(this.sendFailureReason());
  }

  is_closed(): boolean {
    return this.closedLocal || this.shared.closed || this.shared.receiverClosed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closedLocal) return;
    this.closedLocal = true;
    if (this.shared.refs > 0) this.shared.refs -= 1;
    if (this.shared.refs > 0) return;

    const shouldSendClose = !this.shared.closed;
    this.shared.closed = true;
    while (this.shared.pending.length > 0) {
      const item = this.shared.pending.shift();
      if (item) item.resolve(false);
    }
    if (shouldSendClose) {
      const payload: ChannelMessage = { __lumina_channel_close: true };
      try {
        this.shared.port.postMessage(payload);
      } catch {
        // ignore close failures
      }
    }
    try {
      this.shared.port.close();
    } catch {
      // ignore close failures
    }
  }
}

export class Receiver<T> {
  private queue: T[] = [];
  private waiters: Array<(value: { $tag: string; $payload?: T }) => void> = [];
  private closed = false;
  private errorMessage: string | null = null;
  private readonly capacity: number | null;
  private readonly ackOnConsume: boolean;

  constructor(
    private readonly port: MessagePort,
    capacity: number | null
  ) {
    this.capacity = capacity;
    this.ackOnConsume = this.capacity !== null && this.capacity > 0;
    this.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        this.closed = true;
        this.flushWaiters(Option.None as { $tag: string; $payload?: T });
        return;
      }
      if (isChannelAck(data)) {
        return;
      }
      const value = (isChannelValue(data) ? data.__lumina_channel_value : data) as T;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(Option.Some(value) as { $tag: string; $payload?: T });
        this.sendAckIfNeeded();
      } else {
        this.queue.push(value);
      }
    };
    this.port.onmessageerror = () => {
      this.closed = true;
      this.errorMessage = 'channel message error';
      this.flushWaiters(Option.None as { $tag: string; $payload?: T });
    };
    this.port.start?.();
  }

  private flushWaiters(value: { $tag: string; $payload?: T }): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }

  private sendAckIfNeeded(): void {
    if (!this.ackOnConsume) return;
    const payload: ChannelMessage = { __lumina_channel_ack: 1 };
    this.port.postMessage(payload);
  }

  recv(): Promise<{ $tag: string; $payload?: T }> {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Promise.resolve(Option.Some(value as T) as { $tag: string; $payload?: T });
    }
    if (this.closed) {
      return Promise.resolve(Option.None);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (this.capacity === 0) {
        const payload: ChannelMessage = { __lumina_channel_ack: 1 };
        this.port.postMessage(payload);
      }
    });
  }

  try_recv(): { $tag: string; $payload?: T } {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Option.Some(value as T) as { $tag: string; $payload?: T };
    }
    return Option.None;
  }

  async recv_result(): Promise<{ $tag: string; $payload?: unknown }> {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    const value = await this.recv();
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag === 'None' && this.errorMessage) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(value);
  }

  try_recv_result(): { $tag: string; $payload?: unknown } {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(this.try_recv());
  }

  is_closed(): boolean {
    return this.closed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const payload: ChannelMessage = { __lumina_channel_close: true };
    try {
      this.port.postMessage(payload);
    } catch {
      // ignore close failures
    }
    this.port.close();
    this.flushWaiters(Option.None);
  }
}

export const channel = {
  is_available: (): boolean => resolveMessageChannel() !== null,
  new: <T>(): { sender: Sender<T>; receiver: Receiver<T> } => {
    return channel.bounded<T>(-1);
  },
  bounded: <T>(capacity: number): { sender: Sender<T>; receiver: Receiver<T> } => {
    const ChannelCtor = resolveMessageChannel();
    if (!ChannelCtor) {
      throw new Error('MessageChannel is not available in this environment');
    }
    const normalized = Number.isFinite(capacity) ? Math.trunc(capacity) : -1;
    const cap = normalized < 0 ? null : normalized;
    const { port1, port2 } = new ChannelCtor();
    return { sender: Sender.create<T>(port1, cap), receiver: new Receiver<T>(port2, cap) };
  },
  send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
  try_send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
  send_async: <T>(sender: Sender<T>, value: T): Promise<boolean> => sender.send(value),
  send_result: <T>(sender: Sender<T>, value: T): { $tag: string; $payload?: unknown } => sender.send_result(value),
  send_async_result: <T>(sender: Sender<T>, value: T): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_async_result(value),
  clone_sender: <T>(sender: Sender<T>): Sender<T> => sender.clone(),
  recv: <T>(receiver: Receiver<T>): Promise<unknown> => receiver.recv(),
  try_recv: <T>(receiver: Receiver<T>): unknown => receiver.try_recv(),
  recv_result: <T>(receiver: Receiver<T>): Promise<{ $tag: string; $payload?: unknown }> => receiver.recv_result(),
  try_recv_result: <T>(receiver: Receiver<T>): { $tag: string; $payload?: unknown } => receiver.try_recv_result(),
  is_sender_closed: <T>(sender: Sender<T>): boolean => sender.is_closed(),
  is_receiver_closed: <T>(receiver: Receiver<T>): boolean => receiver.is_closed(),
  close_sender: <T>(sender: Sender<T>): void => sender.close(),
  close_receiver: <T>(receiver: Receiver<T>): void => receiver.close(),
  drop_sender: <T>(sender: Sender<T>): void => sender.drop(),
  drop_receiver: <T>(receiver: Receiver<T>): void => receiver.drop(),
  close: <T>(ch: { sender: Sender<T>; receiver: Receiver<T> }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
};

export const async_channel = channel;

type OptionLike = { $tag: string; $payload?: unknown };

interface NodeWorkerLike {
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
  on(event: 'message', listener: (value: unknown) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

interface WebWorkerLike {
  postMessage(value: unknown): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
}

type ThreadWorker = { kind: 'node'; worker: NodeWorkerLike } | { kind: 'web'; worker: WebWorkerLike };

const isUrlLike = (specifier: string): boolean => /^[a-z]+:/i.test(specifier);

const resolveNodeWorkerSpecifier = (specifier: string): string => {
  if (isUrlLike(specifier)) return specifier;
  const nodePath = getNodePath();
  return nodePath ? nodePath.resolve(specifier) : resolvePathBasic(specifier);
};

const createThreadWorker = async (specifier: string): Promise<ThreadWorker> => {
  if (isNodeRuntime()) {
    try {
      const nodeWorkers = await import('node:worker_threads');
      const WorkerCtor = (nodeWorkers as { Worker?: new (file: string, options?: { type?: string }) => NodeWorkerLike })
        .Worker;
      if (typeof WorkerCtor === 'function') {
        const worker = new WorkerCtor(resolveNodeWorkerSpecifier(specifier), { type: 'module' });
        return { kind: 'node', worker };
      }
    } catch {
      // fall through to web worker path
    }
  }

  if (typeof Worker === 'function') {
    const worker = new Worker(specifier, { type: 'module' }) as unknown as WebWorkerLike;
    return { kind: 'web', worker };
  }

  throw new Error('Worker API is not available in this environment');
};

export class Thread {
  private queue: unknown[] = [];
  private waiters: Array<(value: OptionLike) => void> = [];
  private closed = false;
  private exitCode: number | null = null;
  private joinWaiters: Array<(code: number) => void> = [];

  constructor(private readonly entry: ThreadWorker) {
    if (entry.kind === 'node') {
      entry.worker.on('message', (value) => this.onMessage(value));
      entry.worker.on('error', () => this.finish(-1));
      entry.worker.on('exit', (code) => this.finish(code | 0));
    } else {
      entry.worker.addEventListener('message', (event) => this.onMessage(event.data));
      entry.worker.addEventListener('error', () => this.finish(-1));
    }
  }

  private onMessage(value: unknown): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(Option.Some(value) as OptionLike);
      return;
    }
    this.queue.push(value);
  }

  private finish(code: number): void {
    if (this.exitCode !== null) return;
    this.exitCode = code | 0;
    this.closed = true;
    this.flushWaiters(Option.None as OptionLike);
    while (this.joinWaiters.length > 0) {
      const waiter = this.joinWaiters.shift();
      if (waiter) waiter(this.exitCode);
    }
  }

  private flushWaiters(value: OptionLike): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }

  post(value: unknown): boolean {
    if (this.closed) return false;
    try {
      this.entry.worker.postMessage(value);
      return true;
    } catch {
      return false;
    }
  }

  recv(): Promise<OptionLike> {
    if (this.queue.length > 0) {
      return Promise.resolve(Option.Some(this.queue.shift()) as OptionLike);
    }
    if (this.closed) {
      return Promise.resolve(Option.None as OptionLike);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  try_recv(): OptionLike {
    if (this.queue.length > 0) {
      return Option.Some(this.queue.shift()) as OptionLike;
    }
    return Option.None as OptionLike;
  }

  async terminate(): Promise<void> {
    if (this.exitCode !== null) return;
    if (this.entry.kind === 'node') {
      const code = await this.entry.worker.terminate();
      this.finish(code | 0);
      return;
    }
    this.entry.worker.terminate();
    this.finish(0);
  }

  join(): Promise<number> {
    if (this.exitCode !== null) return Promise.resolve(this.exitCode);
    return new Promise((resolve) => {
      this.joinWaiters.push(resolve);
    });
  }
}

export class ThreadHandle<T = unknown> {
  private readonly result: Promise<unknown>;

  constructor(task: () => T | Promise<T>) {
    this.result = Promise.resolve()
      .then(() => task())
      .then(
        (value) => Result.Ok(value),
        (error) => Result.Err(error instanceof Error ? error.message : String(error))
      );
  }

  join(): Promise<unknown> {
    return this.result;
  }
}

export const thread = {
  is_available: (): boolean => isNodeRuntime() || typeof Worker === 'function',
  spawn: (task: unknown): unknown => {
    if (typeof task === 'function') {
      return new ThreadHandle(() => (task as () => unknown)());
    }
    return thread.spawn_worker(task);
  },
  spawn_worker: async (specifier: unknown): Promise<unknown> => {
    if (typeof specifier !== 'string' || specifier.length === 0) {
      return Result.Err('Thread specifier must be a non-empty string');
    }
    try {
      const worker = await createThreadWorker(specifier);
      return Result.Ok(new Thread(worker));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  post: (handle: Thread, value: unknown): boolean => handle.post(value),
  recv: (handle: Thread): Promise<unknown> => handle.recv(),
  try_recv: (handle: Thread): unknown => handle.try_recv(),
  terminate: async (handle: Thread): Promise<void> => {
    await handle.terminate();
  },
  join: (handle: unknown): unknown => {
    if (handle instanceof ThreadHandle) return handle.join();
    if (handle instanceof Thread) return handle.join();
    throw new Error('Invalid thread handle');
  },
  join_worker: (handle: Thread): Promise<number> => handle.join(),
};

type WebWorkerRecord = {
  id: number;
  entry: ThreadWorker;
  inlineUrl: string | null;
};

let webWorkerNextHandle = 1;
const webWorkerHandles = new Map<number, WebWorkerRecord>();

const toWorkerMessageString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getWebWorkerRecord = (handle: number): WebWorkerRecord | null =>
  webWorkerHandles.get(Math.trunc(handle)) ?? null;

const registerWebWorker = (entry: ThreadWorker, inlineUrl: string | null = null): number => {
  const id = webWorkerNextHandle++;
  webWorkerHandles.set(id, { id, entry, inlineUrl });
  return id;
};

const createInlineWorker = async (source: string): Promise<{ worker: ThreadWorker; inlineUrl: string | null }> => {
  if (isNodeRuntime()) {
    try {
      const nodeWorkers = await import('node:worker_threads');
      const WorkerCtor = (nodeWorkers as {
        Worker?: new (script: string, options?: { eval?: boolean }) => NodeWorkerLike;
      }).Worker;
      if (typeof WorkerCtor === 'function') {
        return {
          worker: { kind: 'node', worker: new WorkerCtor(String(source), { eval: true }) },
          inlineUrl: null,
        };
      }
    } catch {
      // fall through to browser worker path
    }
  }
  if (typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([String(source)], { type: 'application/javascript' });
    const inlineUrl = URL.createObjectURL(blob);
    const worker = new Worker(inlineUrl, { type: 'module' }) as unknown as WebWorkerLike;
    return { worker: { kind: 'web', worker }, inlineUrl };
  }
  throw new Error('Worker API is not available in this environment');
};

const cleanupWebWorkerRecord = (record: WebWorkerRecord | null): void => {
  if (!record) return;
  webWorkerHandles.delete(record.id);
  if (record.inlineUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(record.inlineUrl);
    } catch {
      // ignore revoke failures
    }
  }
};

const isWorkerContextBrowser = (): boolean =>
  typeof WorkerGlobalScope !== 'undefined' &&
  typeof self !== 'undefined' &&
  self instanceof WorkerGlobalScope;

const isWorkerContextNode = (): boolean => {
  if (!isNodeRuntime()) return false;
  const workerThreads = getNodeBuiltinModule('node:worker_threads') as { isMainThread?: unknown } | null;
  return workerThreads != null && typeof workerThreads.isMainThread === 'boolean' ? !workerThreads.isMainThread : false;
};

export const web_worker = {
  is_available: (): boolean => isNodeRuntime() || typeof Worker === 'function',
  spawn: async (specifier: string): Promise<{ $tag: string; $payload?: unknown }> => {
    const input = String(specifier ?? '').trim();
    if (!input) return Result.Err('Worker specifier must be a non-empty string');
    try {
      const worker = await createThreadWorker(input);
      return Result.Ok(registerWebWorker(worker));
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  spawn_inline: async (source: string): Promise<{ $tag: string; $payload?: unknown }> => {
    const input = String(source ?? '');
    if (!input.trim()) return Result.Err('Inline worker source must be a non-empty string');
    try {
      const worker = await createInlineWorker(input);
      return Result.Ok(registerWebWorker(worker.worker, worker.inlineUrl));
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  post: (handle: number, msg: string): { $tag: string; $payload?: unknown } => {
    const record = getWebWorkerRecord(handle);
    if (!record) return Result.Err(`Unknown worker handle ${handle}`);
    try {
      record.entry.worker.postMessage(String(msg));
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  on_message: (handle: number, handler: unknown): void => {
    const record = getWebWorkerRecord(handle);
    if (!record || typeof handler !== 'function') return;
    if (record.entry.kind === 'node') {
      record.entry.worker.on('message', (value) => {
        (handler as (msg: string) => void)(toWorkerMessageString(value));
      });
      return;
    }
    record.entry.worker.addEventListener('message', (event) => {
      (handler as (msg: string) => void)(toWorkerMessageString(event.data));
    });
  },
  on_error: (handle: number, handler: unknown): void => {
    const record = getWebWorkerRecord(handle);
    if (!record || typeof handler !== 'function') return;
    if (record.entry.kind === 'node') {
      record.entry.worker.on('error', (error) => {
        (handler as (msg: string) => void)(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    record.entry.worker.addEventListener('error', (event) => {
      const error = event.error;
      const message = error instanceof Error ? error.message : event.message || String(error ?? '');
      (handler as (msg: string) => void)(message);
    });
  },
  terminate: (handle: number): void => {
    const record = getWebWorkerRecord(handle);
    if (!record) return;
    try {
      if (record.entry.kind === 'node') {
        void record.entry.worker.terminate();
      } else {
        record.entry.worker.terminate();
      }
    } finally {
      cleanupWebWorkerRecord(record);
    }
  },
  is_worker_context: (): boolean => isWorkerContextBrowser() || isWorkerContextNode(),
  self_post: (msg: string): void => {
    if (isWorkerContextBrowser() && typeof postMessage === 'function') {
      postMessage(String(msg));
      return;
    }
    if (isWorkerContextNode()) {
      const workerThreads = getNodeBuiltinModule('node:worker_threads') as {
        parentPort?: { postMessage?: (value: unknown) => void };
      } | null;
      if (typeof workerThreads?.parentPort?.postMessage === 'function') {
        workerThreads.parentPort.postMessage(String(msg));
      }
    }
  },
  self_on_message: (handler: unknown): void => {
    if (typeof handler !== 'function') return;
    if (isWorkerContextBrowser() && typeof addEventListener === 'function') {
      addEventListener('message', (event) => {
        (handler as (msg: string) => void)(toWorkerMessageString((event as MessageEvent<unknown>).data));
      });
      return;
    }
    if (isWorkerContextNode()) {
      const workerThreads = getNodeBuiltinModule('node:worker_threads') as {
        parentPort?: { on?: (event: string, listener: (value: unknown) => void) => void };
      } | null;
      if (typeof workerThreads?.parentPort?.on === 'function') {
        workerThreads.parentPort.on('message', (value) => {
          (handler as (msg: string) => void)(toWorkerMessageString(value));
        });
      }
    }
  },
};

type RuntimeStreamBuffer = {
  kind: 'buffer';
  data: Uint8Array;
  offset: number;
  chunkSize: number;
};

type RuntimeStreamReader = {
  kind: 'reader';
  reader: {
    read: () => Promise<{ done?: boolean; value?: unknown }>;
    cancel?: () => Promise<void> | void;
  };
  done: boolean;
};

type RuntimeStreamPipe = {
  kind: 'pipe';
  sourceHandle: number;
  transform: (chunk: number[]) => unknown;
};

type RuntimeStreamRecord = {
  id: number;
  state: RuntimeStreamBuffer | RuntimeStreamReader | RuntimeStreamPipe;
};

type StreamChunkRead =
  | { ok: true; chunk: number[] | null }
  | { ok: false; error: string };

let runtimeStreamNextHandle = 1;
const runtimeStreams = new Map<number, RuntimeStreamRecord>();
const STREAM_DEFAULT_CHUNK_SIZE = 16 * 1024;

const toByteNumber = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(num)));
};

const toByteArray = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map((entry) => toByteNumber(entry)));
  if (value && typeof value === 'object') {
    const iterator = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iterator === 'function') {
      return Uint8Array.from(Array.from(value as Iterable<unknown>).map((entry) => toByteNumber(entry)));
    }
  }
  return new Uint8Array(0);
};

const registerRuntimeStream = (state: RuntimeStreamRecord['state']): number => {
  const id = runtimeStreamNextHandle++;
  runtimeStreams.set(id, { id, state });
  return id;
};

const cleanupRuntimeStreamHandle = (handle: number, seen: Set<number> = new Set()): void => {
  const normalized = Math.trunc(handle);
  if (seen.has(normalized)) return;
  seen.add(normalized);
  const record = runtimeStreams.get(normalized);
  if (!record) return;
  if (record.state.kind === 'reader' && typeof record.state.reader.cancel === 'function') {
    try {
      void record.state.reader.cancel();
    } catch {
      // ignore cancellation failures
    }
  }
  runtimeStreams.delete(normalized);
  if (record.state.kind === 'pipe') {
    cleanupRuntimeStreamHandle(record.state.sourceHandle, seen);
  }
};

const readChunkFromRuntimeStream = async (handle: number, seen: Set<number> = new Set()): Promise<StreamChunkRead> => {
  const normalized = Math.trunc(handle);
  if (seen.has(normalized)) {
    return { ok: false, error: 'Detected cyclic stream pipeline' };
  }
  const record = runtimeStreams.get(normalized);
  if (!record) return { ok: false, error: `Unknown stream handle ${handle}` };
  if (record.state.kind === 'buffer') {
    const state = record.state;
    if (state.offset >= state.data.length) return { ok: true, chunk: null };
    const nextEnd = Math.min(state.data.length, state.offset + state.chunkSize);
    const chunk = Array.from(state.data.subarray(state.offset, nextEnd));
    state.offset = nextEnd;
    return { ok: true, chunk };
  }
  if (record.state.kind === 'reader') {
    const state = record.state;
    if (state.done) return { ok: true, chunk: null };
    try {
      const next = await state.reader.read();
      if (next.done) {
        state.done = true;
        return { ok: true, chunk: null };
      }
      return { ok: true, chunk: Array.from(toByteArray(next.value)) };
    } catch (error) {
      return { ok: false, error: opfsError(error) };
    }
  }
  const pipeState = record.state;
  const nestedSeen = new Set(seen);
  nestedSeen.add(normalized);
  const source = await readChunkFromRuntimeStream(pipeState.sourceHandle, nestedSeen);
  if (!source.ok) return source;
  if (source.chunk == null) return source;
  try {
    return { ok: true, chunk: Array.from(toByteArray(pipeState.transform(source.chunk))) };
  } catch (error) {
    return { ok: false, error: opfsError(error) };
  }
};

const decodeTextFromBytes = (bytes: number[]): string => {
  const data = Uint8Array.from(bytes);
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(data);
  }
  return String.fromCharCode(...Array.from(data));
};

export const web_streams = {
  is_available: (): boolean => typeof ReadableStream === 'function' || typeof fetch === 'function' || isNodeRuntime(),
  from_fetch: async (url: string): Promise<{ $tag: string; $payload?: unknown }> => {
    if (typeof fetch !== 'function') return Result.Err('Fetch API is not available in this environment');
    try {
      const response = await fetch(String(url));
      const body = (response as { body?: { getReader?: () => unknown } }).body;
      if (body && typeof body.getReader === 'function') {
        const reader = body.getReader() as RuntimeStreamReader['reader'];
        return Result.Ok(registerRuntimeStream({ kind: 'reader', reader, done: false }));
      }
      if (typeof response.arrayBuffer === 'function') {
        const bytes = new Uint8Array(await response.arrayBuffer());
        return Result.Ok(registerRuntimeStream({ kind: 'buffer', data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE }));
      }
      return Result.Err('Response body stream is not available');
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  from_string: (source: string): number => {
    const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(String(source)) : Uint8Array.from(String(source).split('').map((ch) => ch.charCodeAt(0) & 0xff));
    return registerRuntimeStream({ kind: 'buffer', data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE });
  },
  from_bytes: (data: unknown): number =>
    registerRuntimeStream({
      kind: 'buffer',
      data: toByteArray(data),
      offset: 0,
      chunkSize: STREAM_DEFAULT_CHUNK_SIZE,
    }),
  read_chunk: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
    const next = await readChunkFromRuntimeStream(streamHandle);
    if (!next.ok) return Result.Err(next.error);
    if (next.chunk == null) return Result.Ok(Option.None);
    return Result.Ok(Option.Some(next.chunk));
  },
  read_all: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
    const all: number[] = [];
    for (;;) {
      const next = await readChunkFromRuntimeStream(streamHandle);
      if (!next.ok) {
        cleanupRuntimeStreamHandle(streamHandle);
        return Result.Err(next.error);
      }
      if (next.chunk == null) {
        cleanupRuntimeStreamHandle(streamHandle);
        return Result.Ok(all);
      }
      all.push(...next.chunk);
    }
  },
  read_text: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
    const all = await web_streams.read_all(streamHandle);
    if (getEnumTag(all as LuminaEnumLike) === 'Err') return all;
    const payload = getEnumPayload(all as LuminaEnumLike);
    const bytes = Array.isArray(payload) ? payload.map((entry) => toByteNumber(entry)) : [];
    return Result.Ok(decodeTextFromBytes(bytes));
  },
  pipe: (streamHandle: number, transform: unknown): number => {
    const record = runtimeStreams.get(Math.trunc(streamHandle));
    if (!record || typeof transform !== 'function') return 0;
    return registerRuntimeStream({
      kind: 'pipe',
      sourceHandle: Math.trunc(streamHandle),
      transform: transform as (chunk: number[]) => unknown,
    });
  },
  cancel: (streamHandle: number): void => {
    cleanupRuntimeStreamHandle(streamHandle);
  },
};

export class Mutex {
  private locked = false;
  private waiters: Array<(acquired: boolean) => void> = [];

  async acquire(): Promise<boolean> {
    if (!this.locked) {
      this.locked = true;
      return true;
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  try_acquire(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release(): boolean {
    if (!this.locked) return false;
    const next = this.waiters.shift();
    if (next) {
      // Direct hand-off keeps the lock held by the next waiter.
      next(true);
      return true;
    }
    this.locked = false;
    return true;
  }

  is_locked(): boolean {
    return this.locked;
  }
}

export class Semaphore {
  private permits: number;
  private waiters: Array<(acquired: boolean) => void> = [];

  constructor(initialPermits: number) {
    this.permits = Math.max(0, Math.trunc(initialPermits));
  }

  async acquire(): Promise<boolean> {
    if (this.permits > 0) {
      this.permits -= 1;
      return true;
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  try_acquire(): boolean {
    if (this.permits <= 0) return false;
    this.permits -= 1;
    return true;
  }

  release(count = 1): void {
    const n = Math.max(1, Math.trunc(count));
    for (let i = 0; i < n; i += 1) {
      const next = this.waiters.shift();
      if (next) {
        next(true);
      } else {
        this.permits += 1;
      }
    }
  }

  available(): number {
    return this.permits;
  }
}

export class AtomicI32 {
  private storage: Int32Array | null = null;
  private fallback = 0;

  constructor(initial: number) {
    const value = Math.trunc(initial) | 0;
    const hasSharedMemory = typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined';
    if (hasSharedMemory) {
      this.storage = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      Atomics.store(this.storage, 0, value);
      return;
    }
    this.fallback = value;
  }

  static is_available(): boolean {
    return typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined';
  }

  load(): number {
    if (!this.storage) return this.fallback;
    return Atomics.load(this.storage, 0);
  }

  store(value: number): number {
    const next = Math.trunc(value) | 0;
    if (!this.storage) {
      this.fallback = next;
      return next;
    }
    Atomics.store(this.storage, 0, next);
    return next;
  }

  add(delta: number): number {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = (this.fallback + d) | 0;
      return prev;
    }
    return Atomics.add(this.storage, 0, d);
  }

  sub(delta: number): number {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = (this.fallback - d) | 0;
      return prev;
    }
    return Atomics.sub(this.storage, 0, d);
  }

  compare_exchange(expected: number, replacement: number): number {
    const exp = Math.trunc(expected) | 0;
    const rep = Math.trunc(replacement) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      if (prev === exp) this.fallback = rep;
      return prev;
    }
    return Atomics.compareExchange(this.storage, 0, exp, rep);
  }
}

export const sync = {
  mutex_new: (): Mutex => new Mutex(),
  mutex_acquire: async (mutex: Mutex): Promise<boolean> => mutex.acquire(),
  mutex_try_acquire: (mutex: Mutex): boolean => mutex.try_acquire(),
  mutex_release: (mutex: Mutex): boolean => mutex.release(),
  mutex_is_locked: (mutex: Mutex): boolean => mutex.is_locked(),
  semaphore_new: (permits: number): Semaphore => new Semaphore(permits),
  semaphore_acquire: async (semaphore: Semaphore): Promise<boolean> => semaphore.acquire(),
  semaphore_try_acquire: (semaphore: Semaphore): boolean => semaphore.try_acquire(),
  semaphore_release: (semaphore: Semaphore, count = 1): void => semaphore.release(count),
  semaphore_available: (semaphore: Semaphore): number => semaphore.available(),
  atomic_i32_new: (initial: number): AtomicI32 => new AtomicI32(initial),
  atomic_i32_is_available: (): boolean => AtomicI32.is_available(),
  atomic_i32_load: (value: AtomicI32): number => value.load(),
  atomic_i32_store: (value: AtomicI32, next: number): number => value.store(next),
  atomic_i32_add: (value: AtomicI32, delta: number): number => value.add(delta),
  atomic_i32_sub: (value: AtomicI32, delta: number): number => value.sub(delta),
  atomic_i32_compare_exchange: (value: AtomicI32, expected: number, replacement: number): number =>
    value.compare_exchange(expected, replacement),
};

type SABChannelKind = 'i32' | 'u32' | 'f32' | 'f64';

interface SABChannelState {
  mode: 'sab' | 'fallback';
  kind: SABChannelKind;
  capacity: number;
  control?: Int32Array;
  dataI32?: Int32Array;
  dataU32?: Uint32Array;
  dataF32?: Float32Array;
  dataF64?: Float64Array;
  fallbackSender?: Sender<number>;
  fallbackReceiver?: Receiver<number>;
}

const SAB_HEAD = 0;
const SAB_TAIL = 1;
const SAB_COUNT = 2;
const SAB_SENDER_CLOSED = 3;
const SAB_RECEIVER_CLOSED = 4;
const SAB_CLOSE_FLAG = 5;
const SAB_CONTROL_WORDS = 6;
const SAB_DATA_OFFSET_BYTES = Int32Array.BYTES_PER_ELEMENT * SAB_CONTROL_WORDS;

const sabElementSize = (kind: SABChannelKind): number => (kind === 'f64' ? 8 : 4);

const normalizeSabValue = (kind: SABChannelKind, value: number): number => {
  const n = Number(value);
  switch (kind) {
    case 'u32':
      return Math.trunc(n) >>> 0;
    case 'f32':
      return Math.fround(n);
    case 'f64':
      return Number(n);
    case 'i32':
    default:
      return Math.trunc(n) | 0;
  }
};

const createSABChannelState = (capacity: number, kind: SABChannelKind): SABChannelState => {
  const cap = Math.max(1, Math.trunc(capacity));
  if (AtomicI32.is_available()) {
    const totalBytes = SAB_DATA_OFFSET_BYTES + cap * sabElementSize(kind);
    const buffer = new SharedArrayBuffer(totalBytes);
    const control = new Int32Array(buffer, 0, SAB_CONTROL_WORDS);
    Atomics.store(control, SAB_HEAD, 0);
    Atomics.store(control, SAB_TAIL, 0);
    Atomics.store(control, SAB_COUNT, 0);
    Atomics.store(control, SAB_SENDER_CLOSED, 0);
    Atomics.store(control, SAB_RECEIVER_CLOSED, 0);
    Atomics.store(control, SAB_CLOSE_FLAG, 0);
    const state: SABChannelState = {
      mode: 'sab',
      kind,
      capacity: cap,
      control,
    };
    if (kind === 'i32') {
      state.dataI32 = new Int32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
    } else if (kind === 'u32') {
      state.dataU32 = new Uint32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
    } else if (kind === 'f32') {
      state.dataF32 = new Float32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
    } else {
      state.dataF64 = new Float64Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
    }
    return state;
  }

  if (channel.is_available()) {
    const fallback = channel.bounded<number>(cap);
    return {
      mode: 'fallback',
      kind,
      capacity: cap,
      fallbackSender: fallback.sender,
      fallbackReceiver: fallback.receiver,
    };
  }

  throw new Error('SharedArrayBuffer + Atomics or MessageChannel fallback is not available in this environment');
};

const writeSabStateValue = (state: SABChannelState, index: number, value: number): void => {
  const normalized = normalizeSabValue(state.kind, value);
  switch (state.kind) {
    case 'u32':
      state.dataU32![index] = normalized >>> 0;
      return;
    case 'f32':
      state.dataF32![index] = Math.fround(normalized);
      return;
    case 'f64':
      state.dataF64![index] = Number(normalized);
      return;
    case 'i32':
    default:
      state.dataI32![index] = Math.trunc(normalized) | 0;
      return;
  }
};

const readSabStateValue = (state: SABChannelState, index: number): number => {
  switch (state.kind) {
    case 'u32':
      return (state.dataU32![index] >>> 0);
    case 'f32':
      return Math.fround(state.dataF32![index]);
    case 'f64':
      return Number(state.dataF64![index]);
    case 'i32':
    default:
      return Math.trunc(state.dataI32![index]) | 0;
  }
};

const sabYield = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

class SABSenderBase {
  constructor(private readonly state: SABChannelState) {}

  try_send(value: number): boolean {
    const normalized = normalizeSabValue(this.state.kind, value);
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackSender) return false;
      return channel.try_send(this.state.fallbackSender, normalized);
    }
    const control = this.state.control!;
    if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0) return false;
    if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return false;
    const count = Atomics.load(control, SAB_COUNT);
    if (count >= this.state.capacity) return false;
    const tail = Atomics.load(control, SAB_TAIL);
    writeSabStateValue(this.state, tail, normalized);
    Atomics.store(control, SAB_TAIL, (tail + 1) % this.state.capacity);
    Atomics.store(control, SAB_COUNT, count + 1);
    Atomics.notify(control, SAB_COUNT, 1);
    return true;
  }

  async send(value: number): Promise<boolean> {
    for (;;) {
      if (this.try_send(value)) return true;
      if (this.is_closed()) return false;
      await sabYield();
    }
  }

  async send_timeout(value: number, timeoutMs: number): Promise<{ $tag: string; $payload?: unknown }> {
    const deadline = Date.now() + Math.max(0, Math.trunc(timeoutMs));
    for (;;) {
      if (this.try_send(value)) return Result.Ok(undefined);
      if (this.is_closed()) return Result.Err('closed');
      if (Date.now() >= deadline) return Result.Err('timeout');
      await sabYield();
    }
  }

  is_closed(): boolean {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackSender) return true;
      return channel.is_sender_closed(this.state.fallbackSender);
    }
    const control = this.state.control!;
    return Atomics.load(control, SAB_SENDER_CLOSED) !== 0 || Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0;
  }

  close(): void {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackSender) return;
      channel.close_sender(this.state.fallbackSender);
      return;
    }
    const control = this.state.control!;
    Atomics.store(control, SAB_SENDER_CLOSED, 1);
    Atomics.store(control, SAB_CLOSE_FLAG, 1);
    Atomics.notify(control, SAB_COUNT);
  }

  drop(): void {
    this.close();
  }
}

class SABReceiverBase {
  constructor(private readonly state: SABChannelState) {}

  try_recv(): OptionLike {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackReceiver) return Option.None as OptionLike;
      const value = channel.try_recv(this.state.fallbackReceiver) as OptionLike;
      if (getEnumTag(value as LuminaEnumLike) !== 'Some') return Option.None as OptionLike;
      return Option.Some(normalizeSabValue(this.state.kind, Number(getEnumPayload(value as LuminaEnumLike)))) as OptionLike;
    }
    const control = this.state.control!;
    const count = Atomics.load(control, SAB_COUNT);
    if (count <= 0) return Option.None as OptionLike;
    const head = Atomics.load(control, SAB_HEAD);
    const value = readSabStateValue(this.state, head);
    Atomics.store(control, SAB_HEAD, (head + 1) % this.state.capacity);
    Atomics.store(control, SAB_COUNT, count - 1);
    Atomics.notify(control, SAB_COUNT, 1);
    return Option.Some(value) as OptionLike;
  }

  async recv(): Promise<OptionLike> {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackReceiver) return Option.None as OptionLike;
      for (;;) {
        const value = await channel.recv(this.state.fallbackReceiver) as OptionLike;
        if (getEnumTag(value as LuminaEnumLike) === 'Some') {
          return Option.Some(normalizeSabValue(this.state.kind, Number(getEnumPayload(value as LuminaEnumLike)))) as OptionLike;
        }
        if (this.is_closed()) return Option.None as OptionLike;
        await sabYield();
      }
    }
    for (;;) {
      const value = this.try_recv();
      if (getEnumTag(value as LuminaEnumLike) === 'Some') return value;
      if (this.is_closed()) return Option.None as OptionLike;
      await sabYield();
    }
  }

  is_closed(): boolean {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackReceiver) return true;
      return channel.is_receiver_closed(this.state.fallbackReceiver);
    }
    const control = this.state.control!;
    if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return true;
    if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0 && Atomics.load(control, SAB_COUNT) <= 0) return true;
    return false;
  }

  close(): void {
    if (this.state.mode === 'fallback') {
      if (!this.state.fallbackReceiver) return;
      channel.close_receiver(this.state.fallbackReceiver);
      return;
    }
    const control = this.state.control!;
    Atomics.store(control, SAB_RECEIVER_CLOSED, 1);
    Atomics.store(control, SAB_CLOSE_FLAG, 1);
    Atomics.notify(control, SAB_COUNT);
  }

  drop(): void {
    this.close();
  }
}

export class SABSenderI32 extends SABSenderBase {}
export class SABReceiverI32 extends SABReceiverBase {}
export class SABSenderU32 extends SABSenderBase {}
export class SABReceiverU32 extends SABReceiverBase {}
export class SABSenderF32 extends SABSenderBase {}
export class SABReceiverF32 extends SABReceiverBase {}
export class SABSenderF64 extends SABSenderBase {}
export class SABReceiverF64 extends SABReceiverBase {}

export const sab_channel = {
  is_available: (): boolean => AtomicI32.is_available() || channel.is_available(),
  bounded_i32: (capacity: number): { sender: SABSenderI32; receiver: SABReceiverI32 } => {
    const state = createSABChannelState(capacity, 'i32');
    return { sender: new SABSenderI32(state), receiver: new SABReceiverI32(state) };
  },
  bounded_u32: (capacity: number): { sender: SABSenderU32; receiver: SABReceiverU32 } => {
    const state = createSABChannelState(capacity, 'u32');
    return { sender: new SABSenderU32(state), receiver: new SABReceiverU32(state) };
  },
  bounded_f32: (capacity: number): { sender: SABSenderF32; receiver: SABReceiverF32 } => {
    const state = createSABChannelState(capacity, 'f32');
    return { sender: new SABSenderF32(state), receiver: new SABReceiverF32(state) };
  },
  bounded_f64: (capacity: number): { sender: SABSenderF64; receiver: SABReceiverF64 } => {
    const state = createSABChannelState(capacity, 'f64');
    return { sender: new SABSenderF64(state), receiver: new SABReceiverF64(state) };
  },
  send_i32: (sender: SABSenderI32, value: number): boolean => sender.try_send(value),
  try_send_i32: (sender: SABSenderI32, value: number): boolean => sender.try_send(value),
  send_async_i32: (sender: SABSenderI32, value: number): Promise<boolean> => sender.send(value),
  send_timeout_i32: (sender: SABSenderI32, value: number, timeoutMs: number): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_timeout(value, timeoutMs),
  recv_i32: (receiver: SABReceiverI32): Promise<OptionLike> => receiver.recv(),
  try_recv_i32: (receiver: SABReceiverI32): OptionLike => receiver.try_recv(),
  close_sender_i32: (sender: SABSenderI32): void => sender.close(),
  close_receiver_i32: (receiver: SABReceiverI32): void => receiver.close(),
  is_sender_closed_i32: (sender: SABSenderI32): boolean => sender.is_closed(),
  is_receiver_closed_i32: (receiver: SABReceiverI32): boolean => receiver.is_closed(),
  close_i32: (ch: { sender: SABSenderI32; receiver: SABReceiverI32 }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
  send_u32: (sender: SABSenderU32, value: number): boolean => sender.try_send(value),
  try_send_u32: (sender: SABSenderU32, value: number): boolean => sender.try_send(value),
  send_async_u32: (sender: SABSenderU32, value: number): Promise<boolean> => sender.send(value),
  send_timeout_u32: (sender: SABSenderU32, value: number, timeoutMs: number): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_timeout(value, timeoutMs),
  recv_u32: (receiver: SABReceiverU32): Promise<OptionLike> => receiver.recv(),
  try_recv_u32: (receiver: SABReceiverU32): OptionLike => receiver.try_recv(),
  close_sender_u32: (sender: SABSenderU32): void => sender.close(),
  close_receiver_u32: (receiver: SABReceiverU32): void => receiver.close(),
  is_sender_closed_u32: (sender: SABSenderU32): boolean => sender.is_closed(),
  is_receiver_closed_u32: (receiver: SABReceiverU32): boolean => receiver.is_closed(),
  close_u32: (ch: { sender: SABSenderU32; receiver: SABReceiverU32 }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
  send_f32: (sender: SABSenderF32, value: number): boolean => sender.try_send(value),
  try_send_f32: (sender: SABSenderF32, value: number): boolean => sender.try_send(value),
  send_async_f32: (sender: SABSenderF32, value: number): Promise<boolean> => sender.send(value),
  send_timeout_f32: (sender: SABSenderF32, value: number, timeoutMs: number): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_timeout(value, timeoutMs),
  recv_f32: (receiver: SABReceiverF32): Promise<OptionLike> => receiver.recv(),
  try_recv_f32: (receiver: SABReceiverF32): OptionLike => receiver.try_recv(),
  close_sender_f32: (sender: SABSenderF32): void => sender.close(),
  close_receiver_f32: (receiver: SABReceiverF32): void => receiver.close(),
  is_sender_closed_f32: (sender: SABSenderF32): boolean => sender.is_closed(),
  is_receiver_closed_f32: (receiver: SABReceiverF32): boolean => receiver.is_closed(),
  close_f32: (ch: { sender: SABSenderF32; receiver: SABReceiverF32 }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
  send_f64: (sender: SABSenderF64, value: number): boolean => sender.try_send(value),
  try_send_f64: (sender: SABSenderF64, value: number): boolean => sender.try_send(value),
  send_async_f64: (sender: SABSenderF64, value: number): Promise<boolean> => sender.send(value),
  send_timeout_f64: (sender: SABSenderF64, value: number, timeoutMs: number): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_timeout(value, timeoutMs),
  recv_f64: (receiver: SABReceiverF64): Promise<OptionLike> => receiver.recv(),
  try_recv_f64: (receiver: SABReceiverF64): OptionLike => receiver.try_recv(),
  close_sender_f64: (sender: SABSenderF64): void => sender.close(),
  close_receiver_f64: (receiver: SABReceiverF64): void => receiver.close(),
  is_sender_closed_f64: (sender: SABSenderF64): boolean => sender.is_closed(),
  is_receiver_closed_f64: (receiver: SABReceiverF64): boolean => receiver.is_closed(),
  close_f64: (ch: { sender: SABSenderF64; receiver: SABReceiverF64 }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
};

type WebGpuAdapterLike = {
  requestDevice: () => Promise<unknown>;
};

type WebGpuLike = {
  requestAdapter: () => Promise<WebGpuAdapterLike | null>;
  getPreferredCanvasFormat?: () => string;
};

const getWebGpu = (): WebGpuLike | null => {
  const nav = (globalThis as { navigator?: { gpu?: WebGpuLike } }).navigator;
  const gpu = nav?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return null;
  return gpu;
};

const WEBGPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const WEBGPU_MAP_MODE = {
  READ: 0x0001,
  WRITE: 0x0002,
} as const;

type GpuElementType = 'i32' | 'u32' | 'f32' | 'f64' | 'u8';

type WebGpuBufferLike = {
  mapAsync?: (mode: number) => Promise<void>;
  getMappedRange?: () => ArrayBuffer;
  unmap?: () => void;
  destroy?: () => void;
};

type WebGpuPipelineLike = {
  getBindGroupLayout?: (index: number) => unknown;
};

type WebGpuCanvasContextLike = {
  configure?: (descriptor: { device: unknown; format: string; alphaMode?: string }) => void;
  getCurrentTexture?: () => { createView: () => unknown };
};

type WebGpuDeviceLike = {
  createShaderModule: (descriptor: { code: string }) => unknown;
  createBuffer: (descriptor: { size: number; usage: number }) => WebGpuBufferLike;
  createComputePipeline?: (descriptor: {
    layout: 'auto' | unknown;
    compute: { module: unknown; entryPoint: string };
  }) => WebGpuPipelineLike;
  createComputePipelineAsync?: (descriptor: {
    layout: 'auto' | unknown;
    compute: { module: unknown; entryPoint: string };
  }) => Promise<WebGpuPipelineLike>;
  createRenderPipeline?: (descriptor: {
    layout: 'auto' | unknown;
    vertex: { module: unknown; entryPoint: string; buffers?: unknown[] };
    fragment?: { module: unknown; entryPoint: string; targets: Array<{ format: string }> };
    primitive?: { topology?: string };
    depthStencil?: unknown;
  }) => WebGpuPipelineLike;
  createRenderPipelineAsync?: (descriptor: {
    layout: 'auto' | unknown;
    vertex: { module: unknown; entryPoint: string; buffers?: unknown[] };
    fragment?: { module: unknown; entryPoint: string; targets: Array<{ format: string }> };
    primitive?: { topology?: string };
    depthStencil?: unknown;
  }) => Promise<WebGpuPipelineLike>;
  createBindGroup?: (descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: unknown } }>;
  }) => unknown;
  createCommandEncoder: () => {
    beginComputePass?: () => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, bindGroup: unknown) => void;
      dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
      end: () => void;
    };
    beginRenderPass?: (descriptor: {
      colorAttachments: Array<{
        view: unknown;
        clearValue: { r: number; g: number; b: number; a: number };
        loadOp: 'clear' | 'load';
        storeOp: 'store';
      }>;
      depthStencilAttachment?: unknown;
    }) => {
      setPipeline?: (pipeline: unknown) => void;
      setVertexBuffer?: (slot: number, buffer: unknown) => void;
      setIndexBuffer?: (buffer: unknown, format: 'uint16' | 'uint32') => void;
      draw?: (vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number) => void;
      drawIndexed?: (
        indexCount: number,
        instanceCount?: number,
        firstIndex?: number,
        baseVertex?: number,
        firstInstance?: number
      ) => void;
      end: () => void;
    };
    copyBufferToBuffer: (
      source: unknown,
      sourceOffset: number,
      target: unknown,
      targetOffset: number,
      size: number
    ) => void;
    finish: () => unknown;
  };
  queue: {
    writeBuffer: (
      buffer: unknown,
      bufferOffset: number,
      data: ArrayBufferLike | ArrayBufferView,
      dataOffset?: number,
      size?: number
    ) => void;
    submit: (commands: unknown[]) => void;
    onSubmittedWorkDone?: () => Promise<void>;
  };
};

type WebGpuBufferKind = 'buffer' | 'uniform' | 'vertex' | 'index';

type WebGpuBufferRecord = {
  id: number;
  kind: WebGpuBufferKind;
  device: WebGpuDeviceLike;
  buffer: WebGpuBufferLike;
  usage: number;
  size: number;
  elementType: GpuElementType;
  elementCount: number;
};

type WebGpuPipelineRecord = {
  id: number;
  device: WebGpuDeviceLike;
  pipeline: WebGpuPipelineLike;
  config: {
    vertex_buffers?: number[];
    index_buffer?: number | null;
    uniforms?: number[];
    format?: string;
    topology?: string;
  };
};

type WebGpuCanvasRecord = {
  id: number;
  canvas: unknown;
  context: WebGpuCanvasContextLike;
  format: string;
  configuredDevice: WebGpuDeviceLike | null;
  hasSubmittedFrame: boolean;
};

let webgpuNextHandle = 1;
const webgpuBuffers = new Map<number, WebGpuBufferRecord>();
const webgpuPipelines = new Map<number, WebGpuPipelineRecord>();
const webgpuCanvases = new Map<number, WebGpuCanvasRecord>();

const newWebGpuHandle = (): number => {
  const handle = webgpuNextHandle;
  webgpuNextHandle += 1;
  return handle;
};

const normalizeElementType = (typeHint: unknown): GpuElementType => {
  const value = String(typeHint ?? 'i32').toLowerCase();
  switch (value) {
    case 'u32':
      return 'u32';
    case 'f32':
      return 'f32';
    case 'f64':
      return 'f64';
    case 'u8':
      return 'u8';
    case 'i32':
    default:
      return 'i32';
  }
};

const elementSize = (elementType: GpuElementType): number => {
  switch (elementType) {
    case 'u8':
      return 1;
    case 'f64':
      return 8;
    case 'i32':
    case 'u32':
    case 'f32':
    default:
      return 4;
  }
};

const inferElementType = (data: ArrayBufferView): GpuElementType => {
  if (data instanceof Uint8Array) return 'u8';
  if (data instanceof Uint32Array) return 'u32';
  if (data instanceof Float32Array) return 'f32';
  if (data instanceof Float64Array) return 'f64';
  return 'i32';
};

const numberArrayToView = (values: number[], elementType: GpuElementType): ArrayBufferView => {
  switch (elementType) {
    case 'u8':
      return Uint8Array.from(values.map((value) => Math.trunc(value) & 0xff));
    case 'u32':
      return Uint32Array.from(values.map((value) => Math.trunc(value) >>> 0));
    case 'f32':
      return Float32Array.from(values);
    case 'f64':
      return Float64Array.from(values);
    case 'i32':
    default:
      return Int32Array.from(values.map((value) => Math.trunc(value) | 0));
  }
};

const toTypedArray = (
  data: unknown,
  typeHint: unknown,
): { view: ArrayBufferView; elementType: GpuElementType; elementCount: number } => {
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const view = data as ArrayBufferView;
    const elementType = inferElementType(view);
    const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
    return { view, elementType, elementCount };
  }
  const elementType = normalizeElementType(typeHint);
  const source = Array.isArray(data) ? data.map((value) => Number(value)) : [];
  const view = numberArrayToView(source, elementType);
  const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
  return { view, elementType, elementCount };
};

const readTypedArray = (buffer: ArrayBuffer, elementType: GpuElementType, elementCount: number): number[] => {
  const maxCount = Math.max(0, elementCount);
  switch (elementType) {
    case 'u8':
      return Array.from(new Uint8Array(buffer).subarray(0, maxCount));
    case 'u32':
      return Array.from(new Uint32Array(buffer).subarray(0, maxCount));
    case 'f32':
      return Array.from(new Float32Array(buffer).subarray(0, maxCount));
    case 'f64':
      return Array.from(new Float64Array(buffer).subarray(0, maxCount));
    case 'i32':
    default:
      return Array.from(new Int32Array(buffer).subarray(0, maxCount));
  }
};

const resolveWebGpuDevice = (device: unknown): WebGpuDeviceLike | null => {
  if (device && typeof (device as { createBuffer?: unknown }).createBuffer === 'function') {
    return device as WebGpuDeviceLike;
  }
  return null;
};

const alignTo4 = (value: number): number => {
  const v = Math.max(4, Math.trunc(value));
  const mod = v % 4;
  return mod === 0 ? v : v + (4 - mod);
};

const hasWgslStageEntryPoint = (source: string, stage: 'compute' | 'vertex' | 'fragment', entryPoint: string): boolean => {
  const escaped = entryPoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`@${stage}[\\s\\S]*\\bfn\\s+${escaped}\\s*\\(`, 'm');
  return pattern.test(source);
};

export const webgpu = {
  GPU_BUFFER_USAGE_STORAGE: WEBGPU_BUFFER_USAGE.STORAGE,
  GPU_BUFFER_USAGE_UNIFORM: WEBGPU_BUFFER_USAGE.UNIFORM,
  GPU_BUFFER_USAGE_VERTEX: WEBGPU_BUFFER_USAGE.VERTEX,
  GPU_BUFFER_USAGE_INDEX: WEBGPU_BUFFER_USAGE.INDEX,
  GPU_BUFFER_USAGE_COPY_SRC: WEBGPU_BUFFER_USAGE.COPY_SRC,
  GPU_BUFFER_USAGE_COPY_DST: WEBGPU_BUFFER_USAGE.COPY_DST,
  is_available: (): boolean => getWebGpu() !== null,
  request_adapter: async (): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const gpu = getWebGpu();
      if (!gpu) return Result.Err('WebGPU is not available in this environment');
      const adapter = await gpu.requestAdapter();
      if (!adapter) return Result.Err('No WebGPU adapter available');
      return Result.Ok(adapter);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  request_device: async (adapter: unknown): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const source = (adapter as WebGpuAdapterLike | null) ?? null;
      const resolved =
        source && typeof source.requestDevice === 'function'
          ? source
          : ((await webgpu.request_adapter()) as LuminaEnumLike);
      if (isEnumLike(resolved) && getEnumTag(resolved) === 'Err') return resolved as { $tag: string; $payload?: unknown };
      const adapterLike = (isEnumLike(resolved) ? getEnumPayload(resolved as LuminaEnumLike) : resolved) as WebGpuAdapterLike;
      if (!adapterLike || typeof adapterLike.requestDevice !== 'function') {
        return Result.Err('Invalid WebGPU adapter');
      }
      const device = await adapterLike.requestDevice();
      return Result.Ok(device);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  buffer_create: (
    device: unknown,
    size: number,
    usage: number
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const byteSize = alignTo4(Math.max(0, Math.trunc(size)));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE,
      });
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'buffer',
        device: resolvedDevice,
        buffer,
        usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE,
        size: byteSize,
        elementType: 'i32',
        elementCount: 0,
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  buffer_write: (
    device: unknown,
    bufferHandle: number,
    data: unknown,
    offset: number = 0,
    typeHint: unknown = 'i32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return Result.Err(`Unknown WebGPU buffer handle ${bufferHandle}`);
      if (resolvedDevice && entry.device !== resolvedDevice) {
        return Result.Err('WebGPU buffer handle does not belong to provided device');
      }
      const typed = toTypedArray(data, typeHint);
      const byteOffset = Math.max(0, Math.trunc(offset));
      entry.device.queue.writeBuffer(entry.buffer, byteOffset, typed.view, 0, typed.view.byteLength);
      entry.elementType = typed.elementType;
      entry.elementCount = typed.elementCount;
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  buffer_read: async (
    device: unknown,
    bufferHandle: number,
    size: number,
    typeHint: unknown = 'i32'
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return Result.Err(`Unknown WebGPU buffer handle ${bufferHandle}`);
      if (resolvedDevice && entry.device !== resolvedDevice) {
        return Result.Err('WebGPU buffer handle does not belong to provided device');
      }
      const readDevice = entry.device;
      const bytes = alignTo4(Math.max(0, Math.trunc(size)));
      const readBuffer = readDevice.createBuffer({
        size: bytes,
        usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ,
      });
      const encoder = readDevice.createCommandEncoder();
      encoder.copyBufferToBuffer(entry.buffer, 0, readBuffer, 0, bytes);
      readDevice.queue.submit([encoder.finish()]);
      if (typeof readDevice.queue.onSubmittedWorkDone === 'function') {
        await readDevice.queue.onSubmittedWorkDone();
      }
      if (typeof readBuffer.mapAsync !== 'function' || typeof readBuffer.getMappedRange !== 'function') {
        return Result.Err('WebGPU readback buffer does not support mapAsync');
      }
      await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
      const mapped = readBuffer.getMappedRange();
      const elementType = normalizeElementType(typeHint ?? entry.elementType);
      const count = Math.max(0, Math.floor(bytes / elementSize(elementType)));
      const result = readTypedArray(mapped, elementType, count);
      readBuffer.unmap?.();
      readBuffer.destroy?.();
      return Result.Ok(result);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  buffer_destroy: (bufferHandle: number): void => {
    const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
    if (!entry) return;
    entry.buffer.destroy?.();
    webgpuBuffers.delete(Math.trunc(bufferHandle));
  },
  uniform_create: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'uniform',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  uniform_update: (
    device: unknown,
    uniformHandle: number,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    const entry = webgpuBuffers.get(Math.trunc(uniformHandle));
    if (!entry || entry.kind !== 'uniform') return Result.Err(`Unknown WebGPU uniform handle ${uniformHandle}`);
    return webgpu.buffer_write(device, uniformHandle, data, 0, typeHint);
  },
  uniform_destroy: (uniformHandle: number): void => {
    webgpu.buffer_destroy(uniformHandle);
  },
  vertex_buffer: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'vertex',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  index_buffer: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'u32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'index',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  vertex_buffer_destroy: (handle: number): void => {
    webgpu.buffer_destroy(handle);
  },
  index_buffer_destroy: (handle: number): void => {
    webgpu.buffer_destroy(handle);
  },
  canvas: (selector: string): { $tag: string; $payload?: unknown } => {
    try {
      const documentRef = (globalThis as { document?: { querySelector?: (query: string) => unknown } }).document;
      if (!documentRef || typeof documentRef.querySelector !== 'function') {
        return Result.Err('DOM is not available in this environment');
      }
      const canvas = documentRef.querySelector(String(selector));
      if (!canvas || typeof (canvas as { getContext?: unknown }).getContext !== 'function') {
        return Result.Err(`Canvas not found for selector '${selector}'`);
      }
      const context = (canvas as { getContext: (name: string) => WebGpuCanvasContextLike | null }).getContext('webgpu');
      if (!context) {
        return Result.Err('Canvas does not support WebGPU context');
      }
      const format = getWebGpu()?.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
      const id = newWebGpuHandle();
      webgpuCanvases.set(id, {
        id,
        canvas,
        context,
        format,
        configuredDevice: null,
        hasSubmittedFrame: false,
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  canvas_destroy: (canvasHandle: number): void => {
    webgpuCanvases.delete(Math.trunc(canvasHandle));
  },
  present: (
    device: unknown,
    canvasHandle: number,
    _pipelineHandle?: number | null
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const canvasEntry = webgpuCanvases.get(Math.trunc(canvasHandle));
      if (!canvasEntry) return Result.Err(`Unknown WebGPU canvas handle ${canvasHandle}`);
      if (!canvasEntry.hasSubmittedFrame) {
        return Result.Err('No submitted render frame available for present');
      }
      if (typeof canvasEntry.context.configure === 'function' && canvasEntry.configuredDevice !== resolvedDevice) {
        canvasEntry.context.configure({
          device: resolvedDevice,
          format: canvasEntry.format,
          alphaMode: 'opaque',
        });
        canvasEntry.configuredDevice = resolvedDevice;
      }
      canvasEntry.hasSubmittedFrame = false;
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  render_pipeline: async (
    device: unknown,
    config: {
      vertex_shader?: string;
      fragment_shader?: string;
      vertex_buffers?: number[];
      index_buffer?: number | null;
      uniforms?: number[];
      vertex_layout?: Array<{ attribute: number; format: string; offset: number; stride: number }>;
      format?: string;
      topology?: string;
    }
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const vertexShader = String(config?.vertex_shader ?? '');
      const fragmentShader = String(config?.fragment_shader ?? '');
      if (!vertexShader || !fragmentShader) return Result.Err('Render pipeline requires vertex and fragment shaders');
      if (!hasWgslStageEntryPoint(vertexShader, 'vertex', 'main')) {
        return Result.Err('Invalid WGSL vertex shader: expected @vertex fn main(...)');
      }
      if (!hasWgslStageEntryPoint(fragmentShader, 'fragment', 'main')) {
        return Result.Err('Invalid WGSL fragment shader: expected @fragment fn main(...)');
      }
      const vertexModule = resolvedDevice.createShaderModule({ code: vertexShader });
      const fragmentModule = resolvedDevice.createShaderModule({ code: fragmentShader });
      const vertexLayouts = Array.isArray(config?.vertex_layout) ? config.vertex_layout : [];
      const buffers = vertexLayouts.length
        ? vertexLayouts.map((layout) => ({
            arrayStride: Math.max(0, Math.trunc(layout.stride)),
            attributes: [
              {
                shaderLocation: Math.max(0, Math.trunc(layout.attribute)),
                offset: Math.max(0, Math.trunc(layout.offset)),
                format: String(layout.format ?? 'float32x4'),
              },
            ],
          }))
        : [];
      const descriptor = {
        layout: 'auto' as const,
        vertex: { module: vertexModule, entryPoint: 'main', buffers },
        fragment: {
          module: fragmentModule,
          entryPoint: 'main',
          targets: [{ format: String(config?.format ?? 'bgra8unorm') }],
        },
        primitive: {
          topology: String(config?.topology ?? 'triangle-list'),
        },
      };
      const pipeline = resolvedDevice.createRenderPipelineAsync
        ? await resolvedDevice.createRenderPipelineAsync(descriptor)
        : resolvedDevice.createRenderPipeline?.(descriptor);
      if (!pipeline) return Result.Err('WebGPU device does not support render pipelines');
      const id = newWebGpuHandle();
      webgpuPipelines.set(id, {
        id,
        device: resolvedDevice,
        pipeline,
        config: {
          vertex_buffers: Array.isArray(config?.vertex_buffers) ? config.vertex_buffers.map((v) => Math.trunc(v)) : [],
          index_buffer: config?.index_buffer == null ? null : Math.trunc(config.index_buffer),
          uniforms: Array.isArray(config?.uniforms) ? config.uniforms.map((v) => Math.trunc(v)) : [],
          format: config?.format ? String(config.format) : undefined,
          topology: config?.topology ? String(config.topology) : undefined,
        },
      });
      return Result.Ok(id);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  render_pipeline_destroy: (pipelineHandle: number): void => {
    webgpuPipelines.delete(Math.trunc(pipelineHandle));
  },
  render_frame: (
    device: unknown,
    pipelineHandle: number,
    config: { canvas: number; clear_color?: [number, number, number, number]; draw_count?: number; indexed?: boolean }
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return Result.Err('Invalid WebGPU device');
      const pipelineEntry = webgpuPipelines.get(Math.trunc(pipelineHandle));
      if (!pipelineEntry) return Result.Err(`Unknown WebGPU pipeline handle ${pipelineHandle}`);
      const canvasEntry = webgpuCanvases.get(Math.trunc(config?.canvas));
      if (!canvasEntry) return Result.Err(`Unknown WebGPU canvas handle ${config?.canvas}`);
      if (typeof canvasEntry.context.configure === 'function' && canvasEntry.configuredDevice !== resolvedDevice) {
        canvasEntry.context.configure({
          device: resolvedDevice,
          format: canvasEntry.format,
          alphaMode: 'opaque',
        });
        canvasEntry.configuredDevice = resolvedDevice;
      }
      const currentTexture = canvasEntry.context.getCurrentTexture?.();
      if (!currentTexture || typeof currentTexture.createView !== 'function') {
        return Result.Err('Canvas context does not provide current texture');
      }
      const encoder = resolvedDevice.createCommandEncoder();
      const pass = encoder.beginRenderPass?.({
        colorAttachments: [
          {
            view: currentTexture.createView(),
            clearValue: {
              r: Number(config?.clear_color?.[0] ?? 0),
              g: Number(config?.clear_color?.[1] ?? 0),
              b: Number(config?.clear_color?.[2] ?? 0),
              a: Number(config?.clear_color?.[3] ?? 1),
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      if (!pass) return Result.Err('WebGPU command encoder does not support render passes');
      pass.setPipeline?.(pipelineEntry.pipeline);
      for (const [slot, bufferHandle] of (pipelineEntry.config.vertex_buffers ?? []).entries()) {
        const bufferEntry = webgpuBuffers.get(Math.trunc(bufferHandle));
        if (!bufferEntry) return Result.Err(`Unknown WebGPU vertex buffer handle ${bufferHandle}`);
        pass.setVertexBuffer?.(slot, bufferEntry.buffer);
      }
      for (const uniformHandle of pipelineEntry.config.uniforms ?? []) {
        const uniformEntry = webgpuBuffers.get(Math.trunc(uniformHandle));
        if (!uniformEntry || uniformEntry.kind !== 'uniform') {
          return Result.Err(`Unknown WebGPU uniform handle ${uniformHandle}`);
        }
      }
      const indexHandle = pipelineEntry.config.index_buffer;
      const shouldIndexed = !!config?.indexed || (indexHandle !== null && indexHandle !== undefined);
      const drawCount = Math.max(0, Math.trunc(config?.draw_count ?? 0));
      if (shouldIndexed && indexHandle !== null && indexHandle !== undefined) {
        const indexEntry = webgpuBuffers.get(Math.trunc(indexHandle));
        if (!indexEntry) return Result.Err(`Unknown WebGPU index buffer handle ${indexHandle}`);
        pass.setIndexBuffer?.(indexEntry.buffer, 'uint32');
        pass.drawIndexed?.(drawCount || indexEntry.elementCount || 0, 1, 0, 0, 0);
      } else {
        pass.draw?.(drawCount, 1, 0, 0);
      }
      pass.end();
      resolvedDevice.queue.submit([encoder.finish()]);
      canvasEntry.hasSubmittedFrame = true;
      return webgpu.present(resolvedDevice, canvasEntry.id, pipelineHandle);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  compute: async (
    wgsl: string,
    entryPoint: string,
    input: unknown,
    outputLength?: number,
    workgroupSize: number = 64,
    typeHint: unknown = 'i32'
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const deviceResult = await webgpu.request_device(null);
      if (isEnumLike(deviceResult) && getEnumTag(deviceResult) === 'Err') return deviceResult;
      const device = getEnumPayload(deviceResult as LuminaEnumLike) as WebGpuDeviceLike;

      const typedInput = toTypedArray(input, typeHint);
      const outLen = Math.max(0, Math.trunc(outputLength ?? typedInput.elementCount));
      const inputType = normalizeElementType(typeHint ?? typedInput.elementType);
      const inBytes = alignTo4(Math.max(typedInput.view.byteLength, 4));
      const outBytes = alignTo4(outLen * elementSize(inputType));
      const safeWorkgroupSize = Math.max(1, Math.trunc(workgroupSize));
      const dispatchCount = Math.max(1, Math.ceil(outLen / safeWorkgroupSize));

      const shaderSource = String(wgsl);
      if (!hasWgslStageEntryPoint(shaderSource, 'compute', String(entryPoint))) {
        return Result.Err(`Invalid WGSL compute shader: expected @compute fn ${String(entryPoint)}(...)`);
      }
      const shaderModule = device.createShaderModule({ code: shaderSource });
      const inputBuffer = device.createBuffer({
        size: inBytes,
        usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      const outputBuffer = device.createBuffer({
        size: outBytes,
        usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_SRC,
      });
      const readBuffer = device.createBuffer({
        size: outBytes,
        usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ,
      });

      device.queue.writeBuffer(inputBuffer, 0, typedInput.view, 0, typedInput.view.byteLength);
      const pipeline = device.createComputePipelineAsync
        ? await device.createComputePipelineAsync({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: String(entryPoint) },
          })
        : device.createComputePipeline!({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: String(entryPoint) },
          });

      const bindGroup = device.createBindGroup!({
        layout: (pipeline as { getBindGroupLayout: (index: number) => unknown }).getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass!();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(dispatchCount, 1, 1);
      pass.end();
      encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outBytes);
      device.queue.submit([encoder.finish()]);
      if (typeof device.queue.onSubmittedWorkDone === 'function') {
        await device.queue.onSubmittedWorkDone();
      }
      if (typeof readBuffer.mapAsync !== 'function' || typeof readBuffer.getMappedRange !== 'function') {
        return Result.Err('WebGPU readback buffer does not support mapAsync');
      }
      await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
      const mapped = readBuffer.getMappedRange();
      const result = readTypedArray(mapped, inputType, outLen);
      readBuffer.unmap?.();
      inputBuffer.destroy?.();
      outputBuffer.destroy?.();
      readBuffer.destroy?.();
      return Result.Ok(result);
    } catch (error) {
      return Result.Err(opfsError(error));
    }
  },
  compute_i32: async (
    wgsl: string,
    entryPoint: string,
    input: number[],
    outputLength?: number,
    workgroupSize: number = 64
  ): Promise<{ $tag: string; $payload?: unknown }> =>
    webgpu.compute(wgsl, entryPoint, input, outputLength, workgroupSize, 'i32'),
  __debug_counts: (): { buffers: number; pipelines: number; canvases: number } => ({
    buffers: webgpuBuffers.size,
    pipelines: webgpuPipelines.size,
    canvases: webgpuCanvases.size,
  }),
};

const runMicrotask = (fn: () => void): void => {
  const queue = (globalThis as { queueMicrotask?: (cb: () => void) => void }).queueMicrotask;
  if (typeof queue === 'function') {
    queue(fn);
    return;
  }
  Promise.resolve().then(fn);
};

const devtools = createDevtoolsController<ReactiveRenderRoot, VNode | null>({
  scheduleMicrotask: runMicrotask,
  snapshotRoot: (root, id) => ({
    id,
    current: root.root.currentNode(),
    frames: [
      ...Array.from(root.frameManager.rootFrame.keyedChildren.values()).map(snapshotComponentFrame),
      ...root.frameManager.rootFrame.unkeyedChildren.map(snapshotComponentFrame),
    ],
  }),
  snapshotResources: () =>
    listResourceRecords().map((record): DevtoolsResourceSnapshot => ({
      key: record.key,
      status: record.status.peek(),
      hasData: record.hasData.peek(),
      error: record.error.peek(),
    })),
});

const registerDevtoolsSignal = (kind: 'signal' | 'memo', signal: Signal<unknown> | Memo<unknown>): number =>
  devtools.registerSignal(kind, signal);

const unregisterDevtoolsSignal = (id: number): void => {
  devtools.unregisterSignal(id);
};

const scheduleDevtoolsNotify = (): void => {
  devtools.scheduleNotify();
};

configureReactiveCore({
  cloneValue: __lumina_clone,
  equalsValue: runtimeEquals,
  scheduleMicrotask: runMicrotask,
  registerSignal: registerDevtoolsSignal,
  unregisterSignal: unregisterDevtoolsSignal,
  notifyDevtools: scheduleDevtoolsNotify,
});

configureResourceCore({
  serializeKey: (key) => {
    try {
      return toJsonString(key, false);
    } catch {
      return String(key);
    }
  },
  notifyDevtools: scheduleDevtoolsNotify,
});
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value
  && (typeof value === 'object' || typeof value === 'function')
  && typeof (value as { then?: unknown }).then === 'function';

export interface Renderer {
  mount: (node: VNode, container: unknown) => void;
  patch?: (prev: VNode | null, next: VNode, container: unknown) => void;
  hydrate?: (node: VNode, container: unknown) => void;
  unmount?: (container: unknown) => void;
}

interface DomEventTargetLike {
  addEventListener?: (event: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (event: unknown) => void) => void;
}

interface DomNodeLike extends DomEventTargetLike {
  textContent: string | null;
  childNodes: ArrayLike<DomNodeLike> & Iterable<DomNodeLike>;
  parentNode: DomNodeLike | null;
  appendChild: (node: DomNodeLike) => DomNodeLike;
  insertBefore?: (node: DomNodeLike, referenceNode: DomNodeLike | null) => DomNodeLike;
  removeChild: (node: DomNodeLike) => DomNodeLike;
  replaceChild?: (newChild: DomNodeLike, oldChild: DomNodeLike) => DomNodeLike;
  __luminaIndexListEffect?: Effect | null;
  __luminaIndexListSource?: Signal<unknown> | null;
  __luminaIndexListRender?: ((item: Signal<unknown>, index: number) => VNodeInput) | null;
  __luminaForListEffect?: Effect | null;
  __luminaForListSource?: Signal<unknown> | null;
  __luminaForListKey?: ((item: unknown, index: number) => string | number) | null;
  __luminaForListRender?: ((item: Signal<unknown>, index: Signal<number>) => VNodeInput) | null;
}

interface DomElementLike extends DomNodeLike {
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  getAttribute?: (name: string) => string | null;
  className?: string;
  style?: Record<string, unknown> & { setProperty?: (name: string, value: string) => void };
  tagName?: string;
  focus?: () => void;
  blur?: () => void;
  getBoundingClientRect?: () => {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
}

interface DomDocumentLike {
  createElement: (tag: string) => DomElementLike;
  createTextNode: (value: string) => DomNodeLike;
  body?: DomElementLike;
  querySelector?: (selector: string) => DomElementLike | null;
  getElementById?: (id: string) => DomElementLike | null;
}

interface DomTemplateLike extends DomElementLike {
  innerHTML?: string;
  content?: {
    childNodes?: DomNodeLike[];
    cloneNode?: (deep?: boolean) => DomNodeLike;
  };
}

interface DomRendererOptions {
  document?: DomDocumentLike;
}

type DomEventMap = Record<string, (event: unknown) => void>;
type DomEventStore = Map<DomNodeLike, DomEventMap>;
type DomLiveTextStore = WeakMap<DomNodeLike, Effect>;
const domTemplateCache = new WeakMap<DomDocumentLike, Map<string, DomTemplateLike>>();

const getDomDocument = (options?: DomRendererOptions): DomDocumentLike => {
  if (options?.document) return options.document;
  const doc = (globalThis as unknown as { document?: DomDocumentLike }).document;
  if (!doc) {
    throw new Error('DOM renderer requires a document-like object');
  }
  return doc;
};

const asDomChildren = (node: VNode): VNode[] => node.children ?? [];

const isEventProp = (name: string): boolean => /^on[A-Z]/.test(name);

const cloneStaticTemplateElement = (
  documentLike: DomDocumentLike,
  html: string
): DomElementLike | null => {
  let cache = domTemplateCache.get(documentLike);
  if (!cache) {
    cache = new Map<string, DomTemplateLike>();
    domTemplateCache.set(documentLike, cache);
  }

  let template = cache.get(html);
  if (!template) {
    const candidate = documentLike.createElement('template') as DomTemplateLike;
    if (!candidate || typeof candidate !== 'object') return null;
    if (!('innerHTML' in candidate) || !candidate.content || typeof candidate.content.cloneNode !== 'function') {
      return null;
    }
    candidate.innerHTML = html;
    template = candidate;
    cache.set(html, template);
  }

  const clonedContent = template.content?.cloneNode?.(true) as
    | (DomNodeLike & { childNodes?: ArrayLike<DomNodeLike> | Iterable<DomNodeLike> })
    | undefined;
  const rawChildNodes = clonedContent?.childNodes;
  const childNodes =
    rawChildNodes == null
      ? []
      : Array.isArray(rawChildNodes)
        ? rawChildNodes
        : Array.from(rawChildNodes as Iterable<DomNodeLike> | ArrayLike<DomNodeLike>);
  if (childNodes.length !== 1) {
    return null;
  }
  const root = childNodes[0];
  return root && typeof root === 'object' ? (root as DomElementLike) : null;
};

const normalizeEventName = (name: string): string => name.slice(2).toLowerCase();

const setDomStyle = (
  element: DomElementLike,
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): void => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  const style = element.style;
  if (!style) return;

  for (const [key, value] of Object.entries(nxt)) {
    if (prev[key] === value) continue;
    if (style.setProperty) {
      style.setProperty(key, value == null ? '' : String(value));
    } else {
      style[key] = value;
    }
  }

  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (style.setProperty) {
      style.setProperty(key, '');
    } else {
      delete style[key];
    }
  }
};

const setDomProperty = (
  element: DomElementLike,
  name: string,
  value: unknown,
  eventStore: DomEventStore
): void => {
  if (name === 'key') return;

  if (name === 'autoFocus') {
    return;
  }

  if (isEventProp(name)) {
    const event = normalizeEventName(name);
    const map = eventStore.get(element) ?? {};
    const prev = map[event];
    if (prev && element.removeEventListener) {
      element.removeEventListener(event, prev);
    }
    if (typeof value === 'function') {
      const next = value as (event: unknown) => void;
      if (element.addEventListener) {
        element.addEventListener(event, next);
      }
      map[event] = next;
      eventStore.set(element, map);
    } else {
      delete map[event];
      if (Object.keys(map).length === 0) {
        eventStore.delete(element);
      } else {
        eventStore.set(element, map);
      }
    }
    return;
  }

  if (name === 'style' && typeof value === 'object' && value !== null) {
    setDomStyle(element, undefined, value as Record<string, unknown>);
    return;
  }

  if (value === false || value === null || value === undefined) {
    if (element.removeAttribute) element.removeAttribute(name);
    (element as unknown as Record<string, unknown>)[name] = value as never;
    return;
  }

  if (name in element) {
    (element as unknown as Record<string, unknown>)[name] = value;
  } else if (element.setAttribute) {
    element.setAttribute(name, String(value));
  } else {
    (element as unknown as Record<string, unknown>)[name] = value;
  }
};

const updateDomProperties = (
  element: DomElementLike,
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
  eventStore: DomEventStore
): void => {
  const prev = previous ?? {};
  const nxt = next ?? {};

  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (key === 'style') {
      setDomStyle(element, prev.style as Record<string, unknown>, undefined);
      continue;
    }
    setDomProperty(element, key, undefined, eventStore);
  }

  for (const [key, value] of Object.entries(nxt)) {
    if (key === 'style') {
      setDomStyle(
        element,
        prev.style as Record<string, unknown> | undefined,
        value as Record<string, unknown> | undefined
      );
      continue;
    }
    if (prev[key] === value) continue;
    setDomProperty(element, key, value, eventStore);
  }

  if (nxt.autoFocus && prev.autoFocus !== nxt.autoFocus) {
    element.focus?.();
  }
};

const setChildren = (container: DomNodeLike, children: DomNodeLike[]): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
  }
};

interface DomPortalState {
  target: DomElementLike | null;
  host: DomElementLike | null;
}

type DomPortalStore = WeakMap<DomNodeLike, DomPortalState>;

const resolvePortalTarget = (node: VNode, documentLike: DomDocumentLike): DomElementLike | null => {
  const target = node.target;
  if (target == null || target === '' || target === 'body') {
    return documentLike.body ?? null;
  }
  if (typeof documentLike.querySelector === 'function') {
    return documentLike.querySelector(String(target));
  }
  return null;
};

const disposeDomNode = (
  node: DomNodeLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const liveTextEffect = liveTextStore.get(node);
  if (liveTextEffect) {
    liveTextEffect.dispose();
    liveTextStore.delete(node);
  }
  if (node.__luminaIndexListEffect) {
    node.__luminaIndexListEffect.dispose();
    node.__luminaIndexListEffect = null;
    node.__luminaIndexListSource = null;
    node.__luminaIndexListRender = null;
  }
  if (node.__luminaForListEffect) {
    node.__luminaForListEffect.dispose();
    node.__luminaForListEffect = null;
    node.__luminaForListSource = null;
    node.__luminaForListKey = null;
    node.__luminaForListRender = null;
  }
  const portal = portalStore.get(node);
  if (portal?.host) {
    disposeDomNode(portal.host, eventStore, portalStore, liveTextStore);
    const portalParent = portal.host.parentNode;
    if (portalParent) {
      try {
        portalParent.removeChild(portal.host);
      } catch {
        // Ignore stale/detached portal hosts.
      }
    }
  }
  portalStore.delete(node);

  for (const child of readChildNodes(node)) {
    disposeDomNode(child, eventStore, portalStore, liveTextStore);
  }

  eventStore.delete(node);
};

const replaceChildren = (
  container: DomNodeLike,
  children: DomNodeLike[],
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    disposeDomNode(child, eventStore, portalStore, liveTextStore);
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
  }
};

const vnodeKindTag = (node: VNode): string => `${node.kind}:${node.tag ?? ''}`;

const hasVNodeKey = (node: VNode): node is VNode & { key: string | number } =>
  typeof node.key === 'string' || typeof node.key === 'number';

const hasKeyedChildren = (children: VNode[]): boolean => children.some((child) => hasVNodeKey(child));

const duplicateKeyError = (key: string | number): Error =>
  new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`);

const analyzeKeyedChildTransition = (prevChildren: VNode[], nextChildren: VNode[]): KeyedListTransition | null => {
  if (
    prevChildren.length !== nextChildren.length
    || !prevChildren.every((child) => hasVNodeKey(child))
    || !nextChildren.every((child) => hasVNodeKey(child))
  ) {
    return null;
  }

  const assertUniqueKeys = (children: VNode[]): void => {
    const seenKeys = new Set<string | number>();
    for (const child of children) {
      if (hasVNodeKey(child)) {
        if (seenKeys.has(child.key)) {
          throw duplicateKeyError(child.key);
        }
        seenKeys.add(child.key);
      }
    }
  };
  assertUniqueKeys(prevChildren);
  assertUniqueKeys(nextChildren);

  return analyzeSequenceTransition(prevChildren, nextChildren, (left, right) =>
    hasVNodeKey(left) && hasVNodeKey(right) ? left.key === right.key : false
  );
};

interface ForListState {
  entries: ForListEntry[];
  entriesByKey: Map<string | number, ForListEntry>;
  order: Array<string | number>;
}

const createForListState = (entries: ForListEntry[]): ForListState => ({
  entries,
  entriesByKey: new Map(entries.map((entry) => [entry.key, entry] as const)),
  order: entries.map((entry) => entry.key),
});

const buildKeyedOrder = (
  items: unknown[],
  keyOf: (item: unknown, index: number) => string | number
): Array<string | number> => {
  const order: Array<string | number> = [];
  const seen = new Set<string | number>();
  for (let index = 0; index < items.length; index += 1) {
    const key = coerceListKey(keyOf(items[index], index), index);
    if (seen.has(key)) {
      throw duplicateKeyError(key);
    }
    seen.add(key);
    order.push(key);
  }
  return order;
};

const hasShallowEqualProps = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (left[key] !== right[key]) return false;
  }

  return true;
};

const canSkipDomPatch = (prevNode: VNode, nextNode: VNode): boolean => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;

  if (prevNode.kind === 'text' && nextNode.kind === 'text') {
    return prevNode.text === nextNode.text;
  }

  if (prevNode.kind === 'live_text' && nextNode.kind === 'live_text') {
    return prevNode.signal === nextNode.signal;
  }

  if (prevNode.kind === 'index_list' && nextNode.kind === 'index_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }

  if (prevNode.kind === 'for_list' && nextNode.kind === 'for_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal
      && prevNode.listKey === nextNode.listKey
      && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }

  if (prevNode.kind === 'portal' || nextNode.kind === 'portal') {
    return false;
  }

  if (prevNode.tag !== nextNode.tag || prevNode.key !== nextNode.key) {
    return false;
  }

  if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
    return false;
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }

  if (prevChildren.length === 0) {
    return true;
  }

  if (prevChildren.length === 1) {
    return canSkipDomPatch(prevChildren[0], nextChildren[0]);
  }

  return false;
};

const patchPortalMount = (
  anchor: DomElementLike,
  prevNode: VNode | null,
  nextNode: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const previous = portalStore.get(anchor) ?? { target: null, host: null };
  const nextTarget = resolvePortalTarget(nextNode, documentLike);
  const prevChildren = prevNode?.kind === 'portal' ? (prevNode.children ?? []) : [];
  const nextChildren = nextNode.children ?? [];

  if (!nextTarget) {
    if (previous.host) {
      replaceChildren(previous.host, [], eventStore, portalStore, liveTextStore);
      const parent = previous.host.parentNode;
      if (parent) parent.removeChild(previous.host);
    }
    portalStore.set(anchor, { target: null, host: null });
    return;
  }

  let host = previous.host;
  const targetChanged = previous.target !== nextTarget || !host || host.parentNode !== nextTarget;
  if (targetChanged) {
    if (host) {
      replaceChildren(host, [], eventStore, portalStore, liveTextStore);
      const parent = host.parentNode;
      if (parent) parent.removeChild(host);
    }
    host = documentLike.createElement('lumina-portal-host');
    nextTarget.appendChild(host);
  }
  if (!host) {
    host = documentLike.createElement('lumina-portal-host');
    nextTarget.appendChild(host);
  }

  if (targetChanged || !prevNode || prevNode.kind !== 'portal') {
    const mountedChildren = nextChildren.map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore));
    replaceChildren(host, mountedChildren, eventStore, portalStore, liveTextStore);
  } else if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(host, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore);
  } else {
    patchDomChildrenPositionally(host, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore);
  }

  portalStore.set(anchor, { target: nextTarget, host });
};

const bindIndexListHost = (
  host: DomElementLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== 'function') {
    host.__luminaIndexListEffect?.dispose();
    host.__luminaIndexListEffect = null;
    host.__luminaIndexListSource = null;
    host.__luminaIndexListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }

  if (
    host.__luminaIndexListEffect
    && host.__luminaIndexListSource === source
    && host.__luminaIndexListRender === renderItem
  ) {
    return;
  }

  host.__luminaIndexListEffect?.dispose();

  let currentItems = readIndexListValues(source, false);
  let itemSignals = currentItems.map((value) => new Signal(value));
  const renderChildren = (): DomNodeLike[] =>
    itemSignals.map((itemSignal, index) =>
      createDomNode(
        coerceRenderableToVNode(renderItem(itemSignal, index)),
        documentLike,
        eventStore,
        portalStore,
        liveTextStore
      )
    );

  replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);

  const runBatched = (fn: () => void): void => {
    batchReactive(fn);
  };

  host.__luminaIndexListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    if (nextItems.length !== itemSignals.length) {
      currentItems = nextItems;
      itemSignals = nextItems.map((value) => new Signal(value));
      replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);
      return;
    }

    runBatched(() => {
      for (let index = 0; index < nextItems.length; index += 1) {
        if (currentItems[index] === nextItems[index] || runtimeEquals(currentItems[index], nextItems[index])) {
          continue;
        }
        itemSignals[index].set(nextItems[index]);
      }
      currentItems = nextItems;
    });
  });
  host.__luminaIndexListSource = source;
  host.__luminaIndexListRender = renderItem;
};

interface ForListEntry {
  key: string | number;
  currentValue: unknown;
  currentIndex: number;
  itemSignal: Signal<unknown>;
  indexSignal: Signal<number>;
  domNode: DomNodeLike;
}

const bindForListHost = (
  host: DomElementLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== 'function' || typeof renderItem !== 'function') {
    host.__luminaForListEffect?.dispose();
    host.__luminaForListEffect = null;
    host.__luminaForListSource = null;
    host.__luminaForListKey = null;
    host.__luminaForListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }

  if (
    host.__luminaForListEffect
    && host.__luminaForListSource === source
    && host.__luminaForListKey === keyOf
    && host.__luminaForListRender === renderItem
  ) {
    return;
  }

  host.__luminaForListEffect?.dispose();

  const runBatched = (fn: () => void): void => {
    batchReactive(fn);
  };

  const createEntry = (value: unknown, index: number): ForListEntry => {
    const key = coerceListKey(keyOf(value, index), index);
    const itemSignal = new Signal(value);
    const indexSignal = new Signal(index);
    const domNode = createDomNode(
      applyVNodeKey(coerceRenderableToVNode(renderItem(itemSignal, indexSignal)), key),
      documentLike,
      eventStore,
      portalStore,
      liveTextStore
    );
    return { key, currentValue: value, currentIndex: index, itemSignal, indexSignal, domNode };
  };

  const initialEntries = readIndexListValues(source, false).map((value, index) => createEntry(value, index));
  let state = createForListState(initialEntries);
  replaceChildren(host, state.entries.map((entry) => entry.domNode), eventStore, portalStore, liveTextStore);

  const syncEntryValue = (entry: ForListEntry, value: unknown): void => {
    if (entry.currentValue !== value && !runtimeEquals(entry.currentValue, value)) {
      entry.itemSignal.set(value);
      entry.currentValue = value;
    }
  };

  const syncEntryIndex = (entry: ForListEntry, index: number): void => {
    if (entry.currentIndex !== index) {
      entry.indexSignal.set(index);
      entry.currentIndex = index;
    }
  };

  const syncValuesForOrder = (items: unknown[], order: Array<string | number>): void => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = state.entriesByKey.get(order[index]);
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  };

  const syncIndicesForRange = (
    nextEntries: ForListEntry[],
    transition: KeyedListTransition
  ): void => {
    const range = getTransitionAffectedRange(transition, nextEntries.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryIndex(entry, index);
    }
  };

  const buildNextEntries = (
    items: unknown[],
    order: Array<string | number>
  ): { nextEntries: ForListEntry[]; structureChanged: boolean } => {
    const retained = new Set<string | number>();
    const nextEntries: ForListEntry[] = [];
    let structureChanged = items.length !== state.entries.length;

    for (let index = 0; index < items.length; index += 1) {
      const key = order[index];
      const value = items[index];
      let entry = state.entriesByKey.get(key);
      if (!entry) {
        entry = createEntry(value, index);
        state.entriesByKey.set(key, entry);
        structureChanged = true;
      } else {
        syncEntryValue(entry, value);
      }
      retained.add(key);
      nextEntries.push(entry);
    }

    for (const key of Array.from(state.entriesByKey.keys())) {
      if (retained.has(key)) continue;
      state.entriesByKey.delete(key);
      structureChanged = true;
    }

    return { nextEntries, structureChanged };
  };

  host.__luminaForListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    if (nextItems.length === state.order.length) {
      let sameOrder = true;
      for (let index = 0; index < nextItems.length; index += 1) {
        const key = coerceListKey(keyOf(nextItems[index], index), index);
        if (state.order[index] !== key) {
          sameOrder = false;
          break;
        }
      }

      if (sameOrder) {
        runBatched(() => {
          for (let index = 0; index < nextItems.length; index += 1) {
            const entry = state.entries[index];
            if (!entry) continue;
            syncEntryValue(entry, nextItems[index]);
          }
        });
        return;
      }
    }

    const nextOrder = buildKeyedOrder(nextItems, keyOf);
    const transition = analyzeSequenceTransition(state.order, nextOrder, (left, right) => left === right);

    if (transition.kind === 'same_order') {
      runBatched(() => {
        syncValuesForOrder(nextItems, nextOrder);
      });
      return;
    }

    if (transition.kind === 'adjacent_swap' || transition.kind === 'single_move') {
      const nextEntries = nextOrder.map((key) => {
        const entry = state.entriesByKey.get(key);
        if (!entry) {
          throw new Error(`Missing keyed list entry '${String(key)}' during transition`);
        }
        return entry;
      });

      runBatched(() => {
        syncValuesForOrder(nextItems, nextOrder);
        syncIndicesForRange(nextEntries, transition);
      });

      state.entries = nextEntries;
      state.order = nextOrder;
      reorderChildren(
        host,
        nextEntries.map((entry) => entry.domNode),
        (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
        {
          transition,
          structureChanged: false,
        }
      );
      return;
    }

    let nextEntries: ForListEntry[] = [];
    let structureChanged = false;
    runBatched(() => {
      const built = buildNextEntries(nextItems, nextOrder);
      nextEntries = built.nextEntries;
      structureChanged = built.structureChanged;
      syncIndicesForRange(nextEntries, transition);
    });

    state.entries = nextEntries;
    state.order = nextOrder;
    reorderChildren(
      host,
      nextEntries.map((entry) => entry.domNode),
      (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
      {
        transition,
        structureChanged,
      }
    );
  });

  host.__luminaForListSource = source;
  host.__luminaForListKey = keyOf;
  host.__luminaForListRender = renderItem;
};

const createDomNode = (
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): DomNodeLike => {
  if (node.kind === 'text') {
    return documentLike.createTextNode(node.text ?? '');
  }
  if (node.kind === 'live_text') {
    const textNode = documentLike.createTextNode(node.signal ? String(node.signal.get()) : '');
    if (node.signal) {
      const effect = new Effect(() => {
        textNode.textContent = String(node.signal?.get() ?? '');
      });
      liveTextStore.set(textNode, effect);
    }
    return textNode;
  }
  if (node.kind === 'index_list') {
    const host = documentLike.createElement('lumina-index-list');
    updateDomProperties(host, {}, indexListHostProps, eventStore);
    bindIndexListHost(host, node, documentLike, eventStore, portalStore, liveTextStore);
    return host;
  }
  if (node.kind === 'for_list') {
    const host = documentLike.createElement('lumina-for-list');
    updateDomProperties(host, {}, forListHostProps, eventStore);
    bindForListHost(host, node, documentLike, eventStore, portalStore, liveTextStore);
    return host;
  }
  if (node.kind === 'fragment') {
    const wrapper = documentLike.createElement('lumina-fragment');
    const children = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore));
    setChildren(wrapper, children);
    return wrapper;
  }
  if (node.kind === 'portal') {
    const anchor = documentLike.createElement('lumina-portal-anchor');
    updateDomProperties(anchor, {}, { hidden: true, 'data-lumina-portal-anchor': 'true' }, eventStore);
    patchPortalMount(anchor, null, node, documentLike, eventStore, portalStore, liveTextStore);
    return anchor;
  }

  if (node.kind === 'element' && typeof node.domTemplateHtml === 'string') {
    const templated = cloneStaticTemplateElement(documentLike, node.domTemplateHtml);
    if (templated) {
      updateDomProperties(templated, {}, node.props, eventStore);
      return templated;
    }
  }

  const element = documentLike.createElement(node.tag ?? 'div');
  updateDomProperties(element, {}, node.props, eventStore);
  const children = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore));
  setChildren(element, children);
  return element;
};

const patchDomChildrenPositionally = (
  element: DomElementLike,
  prevChildren: VNode[],
  nextChildren: VNode[],
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const shared = Math.min(prevChildren.length, nextChildren.length);

  for (let i = 0; i < shared; i += 1) {
    const currentChild = element.childNodes[i];
    if (!currentChild) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore));
      continue;
    }
    if (canSkipDomPatch(prevChildren[i], nextChildren[i])) {
      continue;
    }
    patchDomNode(currentChild, prevChildren[i], nextChildren[i], documentLike, eventStore, portalStore, liveTextStore);
  }

  if (nextChildren.length > prevChildren.length) {
    for (let i = prevChildren.length; i < nextChildren.length; i += 1) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore));
    }
  } else if (prevChildren.length > nextChildren.length) {
    for (let i = prevChildren.length - 1; i >= nextChildren.length; i -= 1) {
      const child = element.childNodes[i];
      if (child) {
        disposeDomNode(child, eventStore, portalStore, liveTextStore);
        element.removeChild(child);
      }
    }
  }
};

const patchDomChildrenWithKeys = (
  element: DomElementLike,
  prevChildren: VNode[],
  nextChildren: VNode[],
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const keyedTransition = analyzeKeyedChildTransition(prevChildren, nextChildren);
  if (keyedTransition?.kind === 'same_order') {
    for (let i = 0; i < nextChildren.length; i += 1) {
      const domChild = element.childNodes[i];
      if (!domChild) {
        element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore));
        continue;
      }
      if (canSkipDomPatch(prevChildren[i], nextChildren[i])) {
        continue;
      }
      patchDomNode(domChild, prevChildren[i], nextChildren[i], documentLike, eventStore, portalStore, liveTextStore);
    }
    return;
  }

  if (keyedTransition?.kind === 'adjacent_swap') {
    const currentDomChildren = readChildNodes(element);
    const leftDom = currentDomChildren[keyedTransition.left];
    const rightDom = currentDomChildren[keyedTransition.right];
    if (leftDom && rightDom && typeof element.insertBefore === 'function') {
      element.insertBefore(rightDom, leftDom);
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (index === keyedTransition.left) {
          if (!canSkipDomPatch(prevChildren[keyedTransition.right], nextChildren[index])) {
            patchDomNode(rightDom, prevChildren[keyedTransition.right], nextChildren[index], documentLike, eventStore, portalStore, liveTextStore);
          }
          continue;
        }
        if (index === keyedTransition.right) {
          if (!canSkipDomPatch(prevChildren[keyedTransition.left], nextChildren[index])) {
            patchDomNode(leftDom, prevChildren[keyedTransition.left], nextChildren[index], documentLike, eventStore, portalStore, liveTextStore);
          }
          continue;
        }
        const domChild = currentDomChildren[index];
        if (!domChild || canSkipDomPatch(prevChildren[index], nextChildren[index])) {
          continue;
        }
        patchDomNode(domChild, prevChildren[index], nextChildren[index], documentLike, eventStore, portalStore, liveTextStore);
      }
      return;
    }
  }

  const currentDomChildren = readChildNodes(element);
  const prevKeyed = new Map<string | number, { vnode: VNode; domNode: DomNodeLike }>();
  const prevUnkeyed: Array<{ vnode: VNode; domNode: DomNodeLike }> = [];

  for (let i = 0; i < prevChildren.length; i += 1) {
    const prevChild = prevChildren[i];
    const domChild = currentDomChildren[i];
    if (!domChild) continue;

    if (hasVNodeKey(prevChild)) {
      if (prevKeyed.has(prevChild.key)) {
        throw duplicateKeyError(prevChild.key);
      }
      prevKeyed.set(prevChild.key, { vnode: prevChild, domNode: domChild });
      continue;
    }

    prevUnkeyed.push({ vnode: prevChild, domNode: domChild });
  }

  const seenNextKeys = new Set<string | number>();
  const nextDomChildren: DomNodeLike[] = [];
  let unkeyedIndex = 0;

  for (const nextChild of nextChildren) {
    if (hasVNodeKey(nextChild)) {
      if (seenNextKeys.has(nextChild.key)) {
        throw duplicateKeyError(nextChild.key);
      }
      seenNextKeys.add(nextChild.key);

      const prevEntry = prevKeyed.get(nextChild.key);
      if (!prevEntry) {
        nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore));
        continue;
      }

      prevKeyed.delete(nextChild.key);
      nextDomChildren.push(
        canSkipDomPatch(prevEntry.vnode, nextChild)
          ? prevEntry.domNode
          : patchDomNode(
              prevEntry.domNode,
              prevEntry.vnode,
              nextChild,
              documentLike,
              eventStore,
              portalStore,
              liveTextStore
            )
      );
      continue;
    }

    const prevEntry = prevUnkeyed[unkeyedIndex];
    unkeyedIndex += 1;
    if (!prevEntry) {
      nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore));
      continue;
    }

    nextDomChildren.push(
      canSkipDomPatch(prevEntry.vnode, nextChild)
        ? prevEntry.domNode
        : patchDomNode(
            prevEntry.domNode,
            prevEntry.vnode,
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore
          )
    );
  }

  for (const stale of prevKeyed.values()) {
    disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
  }
  for (let i = unkeyedIndex; i < prevUnkeyed.length; i += 1) {
    disposeDomNode(prevUnkeyed[i].domNode, eventStore, portalStore, liveTextStore);
  }

  const structureChanged =
    prevKeyed.size > 0
    || unkeyedIndex < prevUnkeyed.length
    || currentDomChildren.length !== nextDomChildren.length;
  reorderChildren(
    element,
    nextDomChildren,
    (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
    {
      transition: keyedTransition,
      structureChanged,
    }
  );
};

const patchDomNode = (
  domNode: DomNodeLike,
  prevNode: VNode,
  nextNode: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): DomNodeLike => {
  if (vnodeKindTag(prevNode) !== vnodeKindTag(nextNode)) {
    const replacement = createDomNode(nextNode, documentLike, eventStore, portalStore, liveTextStore);
    const parent = domNode.parentNode;
    if (parent && parent.replaceChild) {
      parent.replaceChild(replacement, domNode);
      disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
      return replacement;
    }
    disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
    return replacement;
  }

  if (nextNode.kind === 'text') {
    const nextText = nextNode.text ?? '';
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }

  if (nextNode.kind === 'live_text') {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (nextNode.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(nextNode.signal?.get() ?? '');
      });
      liveTextStore.set(domNode, effect);
    } else {
      domNode.textContent = '';
    }
    return domNode;
  }

  if (nextNode.kind === 'index_list') {
    updateDomProperties(domNode as DomElementLike, prevNode.props, indexListHostProps, eventStore);
    bindIndexListHost(domNode as DomElementLike, nextNode, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  if (nextNode.kind === 'for_list') {
    updateDomProperties(domNode as DomElementLike, prevNode.props, forListHostProps, eventStore);
    bindForListHost(domNode as DomElementLike, nextNode, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  if (nextNode.kind === 'portal') {
    patchPortalMount(domNode as DomElementLike, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  const element = domNode as DomElementLike;
  if (nextNode.kind === 'element') {
    updateDomProperties(element, prevNode.props, nextNode.props, eventStore);
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore);
  } else {
    patchDomChildrenPositionally(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore);
  }

  return element;
};

const hydrateDomNode = (
  domNode: DomNodeLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): DomNodeLike => {
  if (node.kind === 'text') {
    const nextText = node.text ?? '';
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }

  if (node.kind === 'live_text') {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (node.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(node.signal?.get() ?? '');
      });
      liveTextStore.set(domNode, effect);
      domNode.textContent = String(node.signal.get());
    } else {
      domNode.textContent = '';
    }
    return domNode;
  }

  if (node.kind === 'index_list') {
    updateDomProperties(domNode as DomElementLike, undefined, indexListHostProps, eventStore);
    bindIndexListHost(domNode as DomElementLike, node, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  if (node.kind === 'for_list') {
    updateDomProperties(domNode as DomElementLike, undefined, forListHostProps, eventStore);
    bindForListHost(domNode as DomElementLike, node, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  if (node.kind === 'portal') {
    patchPortalMount(domNode as DomElementLike, vnodePortal(node.target, []), node, documentLike, eventStore, portalStore, liveTextStore);
    return domNode;
  }

  const element = domNode as DomElementLike;
  if (node.kind === 'element') {
    updateDomProperties(element, undefined, node.props, eventStore);
  }

  const existingChildren = readChildNodes(element);
  const nextChildren = asDomChildren(node);
  const nextDomChildren: DomNodeLike[] = [];

  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];
    const currentChild = existingChildren[index];
    nextDomChildren.push(
      currentChild
        ? hydrateDomNode(currentChild, nextChild, documentLike, eventStore, portalStore, liveTextStore)
        : createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore)
    );
  }

  for (let index = nextChildren.length; index < existingChildren.length; index += 1) {
    disposeDomNode(existingChildren[index], eventStore, portalStore, liveTextStore);
  }

    reorderChildren(
      element,
      nextDomChildren,
      (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore)
    );
  return element;
};

export const createDomRenderer = (options?: DomRendererOptions): Renderer => {
  const documentLike = getDomDocument(options);
  const eventStore: DomEventStore = new Map();
  const portalStore: DomPortalStore = new WeakMap();
  const liveTextStore: DomLiveTextStore = new WeakMap();
  let currentDom: DomNodeLike | null = null;
  let currentVNode: VNode | null = null;

  return {
    mount(node: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore);
      replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
      currentDom = domNode;
      currentVNode = node;
    },
    patch(prev: VNode | null, next: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      if (!currentDom || !currentVNode || !prev) {
        const domNode = createDomNode(next, documentLike, eventStore, portalStore, liveTextStore);
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = next;
        return;
      }
      const nextDom = patchDomNode(currentDom, prev, next, documentLike, eventStore, portalStore, liveTextStore);
      if (nextDom !== currentDom) {
    reorderChildren(
      domContainer,
      [nextDom],
      (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore)
    );
      }
      currentDom = nextDom;
      currentVNode = next;
    },
    hydrate(node: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      const existing = readChildNodes(domContainer)[0] ?? null;
      if (!existing) {
        const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore);
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = node;
        return;
      }
      const hydratedDom = hydrateDomNode(existing, node, documentLike, eventStore, portalStore, liveTextStore);
      if (hydratedDom !== existing) {
    reorderChildren(
      domContainer,
      [hydratedDom],
      (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore)
    );
      }
      currentDom = hydratedDom;
      currentVNode = node;
    },
    unmount(container: unknown): void {
      const domContainer = container as DomNodeLike;
      replaceChildren(domContainer, [], eventStore, portalStore, liveTextStore);
      currentDom = null;
      currentVNode = null;
      eventStore.clear();
    },
  };
};

const ssrRuntime = createSsrRuntime<VNode>({
  normalizeNodeForHtml: (node) => {
    if (node.kind === 'index_list') {
      return vnodeElement('lumina-index-list', indexListHostProps, materializeIndexListChildren(node, false));
    }
    if (node.kind === 'for_list') {
      return vnodeElement('lumina-for-list', forListHostProps, materializeForListChildren(node, false));
    }
    return node;
  },
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
});

export const createSsrRenderer = (): Renderer => ssrRuntime.createRenderer();

export const renderToString = (node: VNode): string => ssrRuntime.renderToString(node);

const renderAppVNode = <P>(
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): VNode => {
  const frameManager = new FrameManager();
  return runWithFrameManager(frameManager, () => render.component(componentFn, props));
};

const mountReactiveApp = <P>(
  renderer: unknown,
  container: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.mount_reactive(renderer, container, () => render.component(componentFn, props));

const hydrateReactiveApp = <P>(
  renderer: unknown,
  container: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.hydrate_reactive(renderer, container, () => render.component(componentFn, props));

const mountTestingApp = <P>(
  harness: TestingDomHarness,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P,
  hydrate: boolean = false
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } => {
  const renderer = harness.renderer ?? createDomRenderer({ document: harness.document as unknown as DomDocumentLike });
  harness.renderer = renderer;
  const root = hydrate
    ? hydrateReactiveApp(renderer, harness.container, componentFn, props)
    : mountReactiveApp(renderer, harness.container, componentFn, props);
  harness.root = root;
  return root;
};

const testingFacade = createTestingFacade<
  ComponentFunction<unknown, ComponentRenderable>,
  ReactiveRenderRoot | { $tag: string; $payload?: unknown }
>({
  createRenderer: (documentLike) => createDomRenderer({ document: documentLike as DomDocumentLike }),
  mountApp: (harness, componentFn, props, hydrate) =>
    mountTestingApp(
      harness,
      componentFn as ComponentFunction<unknown, ComponentRenderable>,
      props,
      hydrate
    ),
});

const ssgApi = createSsgApi<VNode, ComponentFunction<unknown, ComponentRenderable>>({
  isVNode,
  renderToString,
  coerceRenderableToVNode: (value) => coerceRenderableToVNode(value as VNodeInput),
  escapeHtml,
  resolvePath: resolvePathBasic,
  dirnamePath: dirnamePathBasic,
  getNodeBuiltinModule,
  renderApp: (componentFn, props) =>
    renderAppVNode(componentFn as ComponentFunction<unknown, ComponentRenderable>, props),
});

const renderTargetsRuntime = createRenderTargetsRuntime<VNode>({
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
  materializeIndexListChildren: (node, tracked) => materializeIndexListChildren(node, tracked),
  materializeForListChildren: (node, tracked) => materializeForListChildren(node, tracked),
});

const frameRuntime = createFrameRuntime<VNode, Signal<unknown>>({
  coerceRenderable: (input) => coerceRenderableToVNode(input as VNodeInput),
  createState: <T>(initial: T): Signal<T> => new Signal<T>(initial),
});

const customElementsRuntime = createCustomElementsRuntime<
  unknown,
  VNode,
  ReactiveRenderRoot | { $tag: string; $payload?: unknown },
  Signal<unknown>,
  Renderer,
  DomDocumentLike
>({
  createRenderer: (documentLike) => createDomRenderer({ document: documentLike }),
  createSignal: (initial: unknown): Signal<unknown> => new Signal(initial),
  getSignal: (signal: Signal<unknown>): unknown => signal.get(),
  setSignal: (signal: Signal<unknown>, value: unknown): void => {
    signal.set(value);
  },
  createView: (componentFn: ComponentFunction<unknown, VNode>, propsSignal: Signal<unknown>) =>
    () => render.component(componentFn as ComponentFunction<unknown, ComponentRenderable>, render.get(propsSignal)),
  mountReactive: (renderer, container, view) => render.mount_reactive(renderer, container, view),
  isDisposableLike,
  disposeReactive: (root) => render.dispose_reactive(root),
  getGlobalDocument: () => (globalThis as unknown as { document?: DomDocumentLike }).document,
});

const mountCustomElementInternal = <P>(
  host: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  options?: CustomElementMountOptions<P>
): CustomElementController<P, ReactiveRenderRoot | { $tag: string; $payload?: unknown }, Signal<P>> =>
  customElementsRuntime.mountCustomElementHost(
    host,
    componentFn as unknown as ComponentFunction<unknown, VNode>,
    options as CustomElementMountOptions<unknown> | undefined
  ) as unknown as CustomElementController<P, ReactiveRenderRoot | { $tag: string; $payload?: unknown }, Signal<P>>;

const defineCustomElementInternal = <P>(
  tagName: string,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  options?: CustomElementMountOptions<P>
): new () => unknown =>
  customElementsRuntime.defineCustomElementClass(
    tagName,
    componentFn as unknown as ComponentFunction<unknown, VNode>,
    options as CustomElementMountOptions<unknown> | undefined
  );

const runWithFrameManager = frameRuntime.runWithFrameManager;
const requireActiveFrameManager = frameRuntime.requireActiveFrameManager;

export const createCanvasRenderer = (options?: CanvasRendererOptions): Renderer =>
  renderTargetsRuntime.createCanvasRenderer(options);

export const renderToTerminal = (node: VNode): string => renderTargetsRuntime.renderToTerminal(node);

export const createTerminalRenderer = (): Renderer => renderTargetsRuntime.createTerminalRenderer();

export class RenderRoot extends RenderRootBase<VNode> {}

export class ReactiveRenderRoot extends ReactiveRenderRootBase<VNode, FrameManager['rootFrame'], FrameManager> {
  constructor(
    readonly root: RenderRoot,
    readonly effect: Effect,
    readonly frameManager: FrameManager
  ) {
    super(root, effect, frameManager, {
      onInit: (root) => registerDevtoolsRoot(root as ReactiveRenderRoot),
      onDispose: (root) => unregisterDevtoolsRoot(root as ReactiveRenderRoot),
    });
  }
}

const registerDevtoolsRoot = (root: ReactiveRenderRoot): void => {
  devtools.registerRoot(root);
};

const unregisterDevtoolsRoot = (root: ReactiveRenderRoot): void => {
  devtools.unregisterRoot(root);
};

const snapshotDevtools = (): DevtoolsSnapshot<VNode | null> => devtools.snapshot();

const installLuminaDevtools = (key: string = '__LUMINA_DEVTOOLS__'): Record<string, unknown> =>
  devtools.install(key);

const toRenderErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Canvas renderer requires')) {
    return 'Canvas renderer not available in this environment';
  }
  if (message.includes('Terminal renderer')) {
    return 'Terminal renderer not available in this environment';
  }
  if (message.toLowerCase().includes('not supported')) {
    return 'Canvas renderer not available in this environment';
  }
  return message;
};

const coerceRenderer = (candidate: unknown): Renderer => coerceRendererBase<VNode>(candidate);

const clearTimerHandle = (handle: ReturnType<typeof setTimeout> | null | undefined): void => {
  if (handle !== null && handle !== undefined) {
    clearTimeout(handle);
  }
};

const renderTransitionPresence = (
  open: Signal<boolean>,
  props: Record<string, unknown> | null | undefined,
  durationMs: number,
  children: () => ComponentRenderable
): VNode => {
  const mounted = render.state(open.peek());
  const phase = render.state(open.peek() ? 'entered' : 'hidden');
  const refs = render.remember(() => ({
    lastOpen: open.peek(),
    settleTimer: null as ReturnType<typeof setTimeout> | null,
    unmountTimer: null as ReturnType<typeof setTimeout> | null,
  }));

  const openNow = open.get();
  let mountedNow = mounted.get();
  let phaseNow = phase.get();
  if (openNow !== refs.lastOpen) {
    refs.lastOpen = openNow;
    clearTimerHandle(refs.settleTimer);
    clearTimerHandle(refs.unmountTimer);
    refs.settleTimer = null;
    refs.unmountTimer = null;

    if (openNow) {
      if (!mountedNow) {
        mounted.set(true);
        mountedNow = true;
      }
      phase.set('enter-from');
      phaseNow = 'enter-from';
      runMicrotask(() => {
        if (open.peek()) phase.set('enter-to');
      });
      refs.settleTimer = setTimeout(() => {
        if (open.peek()) phase.set('entered');
        refs.settleTimer = null;
      }, durationMs);
    } else if (mountedNow) {
      phase.set('exit-from');
      phaseNow = 'exit-from';
      runMicrotask(() => {
        if (!open.peek()) phase.set('exit-to');
      });
      refs.unmountTimer = setTimeout(() => {
        if (!open.peek()) {
          mounted.set(false);
          phase.set('hidden');
        }
        refs.unmountTimer = null;
      }, durationMs);
    }
  }

  if (!openNow && !mountedNow) {
    return vnodeFragment([]);
  }

  const currentPhase = openNow && phaseNow === 'hidden' ? 'entered' : phaseNow;
  const currentProps = mergeProps(props, {
    'data-transition-state': currentPhase,
    'data-transition-open': openNow ? 'true' : 'false',
    'data-transition-duration': String(durationMs),
  });

  return vnodeElement('div', currentProps, resolveChildrenInput(children));
};

interface TabsContextValue {
  value: Signal<string>;
  baseId: string;
  order: string[];
}

interface DialogContextValue {
  open: Signal<boolean>;
  baseId: string;
  hasTitle: boolean;
  hasDescription: boolean;
}

interface PopoverContextValue {
  open: Signal<boolean>;
  baseId: string;
}

interface TooltipContextValue {
  open: Signal<boolean>;
  baseId: string;
}

interface ToastContextValue {
  open: Signal<boolean>;
  baseId: string;
  hasTitle: boolean;
  hasDescription: boolean;
}

interface MenuContextValue {
  open: Signal<boolean>;
  baseId: string;
  order: string[];
}

interface CheckboxContextValue {
  checked: Signal<boolean>;
  baseId: string;
}

interface RadioGroupContextValue {
  value: Signal<string>;
  baseId: string;
  order: string[];
}

interface RadioItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

interface SelectContextValue {
  open: Signal<boolean>;
  value: Signal<string>;
  baseId: string;
  order: string[];
}

interface SelectItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

interface ComboboxContextValue {
  open: Signal<boolean>;
  value: Signal<string>;
  query: Signal<string>;
  baseId: string;
  order: string[];
}

interface ComboboxItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

interface MultiselectContextValue {
  open: Signal<boolean>;
  values: Signal<string[]>;
  baseId: string;
  order: string[];
}

interface MultiselectItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

const tabsContext = createContextToken<TabsContextValue>();
const tabsRootIds = new WeakMap<object, string>();
let nextTabsRootId = 1;

const checkboxContext = createContextToken<CheckboxContextValue>();
const checkboxRootIds = new WeakMap<object, string>();
let nextCheckboxRootId = 1;

const radioGroupContext = createContextToken<RadioGroupContextValue>();
const radioItemContext = createContextToken<RadioItemContextValue>();
const radioRootIds = new WeakMap<object, string>();
let nextRadioRootId = 1;

const selectContext = createContextToken<SelectContextValue>();
const selectItemContext = createContextToken<SelectItemContextValue>();
const selectRootIds = new WeakMap<object, string>();
const selectAnchorTargets = new WeakMap<object, DomElementLike>();
const selectRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextSelectRootId = 1;

const comboboxContext = createContextToken<ComboboxContextValue>();
const comboboxItemContext = createContextToken<ComboboxItemContextValue>();
const comboboxRootIds = new WeakMap<object, string>();
const comboboxAnchorTargets = new WeakMap<object, DomElementLike>();
const comboboxRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextComboboxRootId = 1;

const multiselectContext = createContextToken<MultiselectContextValue>();
const multiselectItemContext = createContextToken<MultiselectItemContextValue>();
const multiselectRootIds = new WeakMap<object, string>();
const multiselectAnchorTargets = new WeakMap<object, DomElementLike>();
const multiselectRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextMultiselectRootId = 1;

const getTabsBaseId = (signal: Signal<string>): string => {
  const existing = tabsRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-tabs-${nextTabsRootId++}`;
  tabsRootIds.set(signal as object, next);
  return next;
};

const getCheckboxBaseId = (signal: Signal<boolean>): string => {
  const existing = checkboxRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-checkbox-${nextCheckboxRootId++}`;
  checkboxRootIds.set(signal as object, next);
  return next;
};

const getRadioBaseId = (signal: Signal<string>): string => {
  const existing = radioRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-radio-${nextRadioRootId++}`;
  radioRootIds.set(signal as object, next);
  return next;
};

const normalizeTabsPart = (value: string): string => {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'tab';
};

const getTabsIds = (ctx: TabsContextValue, value: string): { triggerId: string; panelId: string } => {
  const part = normalizeTabsPart(value);
  return {
    triggerId: `${ctx.baseId}-trigger-${part}`,
    panelId: `${ctx.baseId}-panel-${part}`,
  };
};

const registerTabsValue = (ctx: TabsContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const getTabsNavigationTarget = (ctx: TabsContextValue, current: string, key: string): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }

  return null;
};

const dialogContext = createContextToken<DialogContextValue>();
const dialogRootIds = new WeakMap<object, string>();
const dialogRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextDialogRootId = 1;

const popoverContext = createContextToken<PopoverContextValue>();
const popoverRootIds = new WeakMap<object, string>();
const popoverAnchorTargets = new WeakMap<object, DomElementLike>();
const popoverRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextPopoverRootId = 1;

const tooltipContext = createContextToken<TooltipContextValue>();
const tooltipRootIds = new WeakMap<object, string>();
const tooltipAnchorTargets = new WeakMap<object, DomElementLike>();
let nextTooltipRootId = 1;

const toastContext = createContextToken<ToastContextValue>();
const toastRootIds = new WeakMap<object, string>();
const toastTimers = new WeakMap<object, unknown>();
let nextToastRootId = 1;

const menuContext = createContextToken<MenuContextValue>();
const menuRootIds = new WeakMap<object, string>();
const menuAnchorTargets = new WeakMap<object, DomElementLike>();
const menuRestoreTargets = new WeakMap<object, { focus?: () => void }>();
let nextMenuRootId = 1;

const getDialogBaseId = (signal: Signal<boolean>): string => {
  const existing = dialogRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-dialog-${nextDialogRootId++}`;
  dialogRootIds.set(signal as object, next);
  return next;
};

const getPopoverBaseId = (signal: Signal<boolean>): string => {
  const existing = popoverRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-popover-${nextPopoverRootId++}`;
  popoverRootIds.set(signal as object, next);
  return next;
};

const getTooltipBaseId = (signal: Signal<boolean>): string => {
  const existing = tooltipRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-tooltip-${nextTooltipRootId++}`;
  tooltipRootIds.set(signal as object, next);
  return next;
};

const getToastBaseId = (signal: Signal<boolean>): string => {
  const existing = toastRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-toast-${nextToastRootId++}`;
  toastRootIds.set(signal as object, next);
  return next;
};

const getMenuBaseId = (signal: Signal<boolean>): string => {
  const existing = menuRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-menu-${nextMenuRootId++}`;
  menuRootIds.set(signal as object, next);
  return next;
};

const getSelectBaseId = (signal: Signal<boolean>): string => {
  const existing = selectRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-select-${nextSelectRootId++}`;
  selectRootIds.set(signal as object, next);
  return next;
};

const getComboboxBaseId = (signal: Signal<boolean>): string => {
  const existing = comboboxRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-combobox-${nextComboboxRootId++}`;
  comboboxRootIds.set(signal as object, next);
  return next;
};

const getMultiselectBaseId = (signal: Signal<boolean>): string => {
  const existing = multiselectRootIds.get(signal as object);
  if (existing) return existing;
  const next = `lumina-multiselect-${nextMultiselectRootId++}`;
  multiselectRootIds.set(signal as object, next);
  return next;
};

const getDialogIds = (
  ctx: DialogContextValue
): { triggerId: string; contentId: string; titleId: string; descriptionId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
  titleId: `${ctx.baseId}-title`,
  descriptionId: `${ctx.baseId}-description`,
});

const getPopoverIds = (
  ctx: PopoverContextValue
): { triggerId: string; contentId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
});

const getTooltipIds = (
  ctx: TooltipContextValue
): { triggerId: string; contentId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
});

const getToastIds = (
  ctx: ToastContextValue
): { contentId: string; titleId: string; descriptionId: string } => ({
  contentId: `${ctx.baseId}-content`,
  titleId: `${ctx.baseId}-title`,
  descriptionId: `${ctx.baseId}-description`,
});

const getMenuIds = (
  ctx: MenuContextValue
): { triggerId: string; contentId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
});

const getSelectIds = (
  ctx: SelectContextValue
): { triggerId: string; contentId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
});

const getComboboxIds = (
  ctx: ComboboxContextValue
): { inputId: string; contentId: string } => ({
  inputId: `${ctx.baseId}-input`,
  contentId: `${ctx.baseId}-content`,
});

const getMultiselectIds = (
  ctx: MultiselectContextValue
): { triggerId: string; contentId: string } => ({
  triggerId: `${ctx.baseId}-trigger`,
  contentId: `${ctx.baseId}-content`,
});

const getCheckboxIds = (ctx: CheckboxContextValue): { rootId: string; indicatorId: string } => ({
  rootId: `${ctx.baseId}-root`,
  indicatorId: `${ctx.baseId}-indicator`,
});

const getMenuItemId = (ctx: MenuContextValue, value: string): string =>
  `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

const getRadioItemId = (ctx: RadioGroupContextValue, value: string): string =>
  `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

const getSelectItemId = (ctx: SelectContextValue, value: string): string =>
  `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

const getComboboxItemId = (ctx: ComboboxContextValue, value: string): string =>
  `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

const getMultiselectItemId = (ctx: MultiselectContextValue, value: string): string =>
  `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

const getRadioIndicatorId = (itemId: string): string => `${itemId}-indicator`;
const getSelectIndicatorId = (itemId: string): string => `${itemId}-indicator`;
const getComboboxIndicatorId = (itemId: string): string => `${itemId}-indicator`;
const getMultiselectIndicatorId = (itemId: string): string => `${itemId}-indicator`;

const restoreDialogFocus = (ctx: DialogContextValue): void => {
  const key = ctx.open as object;
  const target = dialogRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  dialogRestoreTargets.delete(key);
  target.focus?.();
};

const restorePopoverFocus = (ctx: PopoverContextValue): void => {
  const key = ctx.open as object;
  const target = popoverRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  popoverRestoreTargets.delete(key);
  target.focus?.();
};

const clearToastTimer = (signal: Signal<boolean>): void => {
  const key = signal as object;
  const handle = toastTimers.get(key);
  if (handle === undefined) return;
  if (typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(handle as Parameters<typeof globalThis.clearTimeout>[0]);
  }
  toastTimers.delete(key);
};

const scheduleToastTimer = (ctx: ToastContextValue, duration: number): void => {
  if (!Number.isFinite(duration) || duration <= 0) {
    clearToastTimer(ctx.open);
    return;
  }
  if (typeof globalThis.setTimeout !== 'function') return;
  const key = ctx.open as object;
  const existing = toastTimers.get(key);
  if (existing !== undefined) return;
  const handle = globalThis.setTimeout(() => {
    toastTimers.delete(key);
    ctx.open.set(false);
  }, duration);
  toastTimers.set(key, handle);
};

const restoreMenuFocus = (ctx: MenuContextValue): void => {
  const key = ctx.open as object;
  const target = menuRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  menuRestoreTargets.delete(key);
  target.focus?.();
};

const restoreSelectFocus = (ctx: SelectContextValue): void => {
  const key = ctx.open as object;
  const target = selectRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  selectRestoreTargets.delete(key);
  target.focus?.();
};

const restoreComboboxFocus = (ctx: ComboboxContextValue): void => {
  const key = ctx.open as object;
  const target = comboboxRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  comboboxRestoreTargets.delete(key);
  target.focus?.();
};

const restoreMultiselectFocus = (ctx: MultiselectContextValue): void => {
  const key = ctx.open as object;
  const target = multiselectRestoreTargets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  multiselectRestoreTargets.delete(key);
  target.focus?.();
};

const registerMenuValue = (ctx: MenuContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const registerRadioValue = (ctx: RadioGroupContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const registerSelectValue = (ctx: SelectContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const registerComboboxValue = (ctx: ComboboxContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const registerMultiselectValue = (ctx: MultiselectContextValue, value: string): void => {
  if (!ctx.order.includes(value)) {
    ctx.order.push(value);
  }
};

const getMenuNavigationTarget = (ctx: MenuContextValue, current: string, key: string): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowDown') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowUp') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }
  return null;
};

const getRadioNavigationTarget = (ctx: RadioGroupContextValue, current: string, key: string): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }

  return null;
};

const getSelectNavigationTarget = (ctx: SelectContextValue, current: string, key: string): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }
  return null;
};

const getComboboxNavigationTarget = (ctx: ComboboxContextValue, current: string, key: string): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }
  return null;
};

const getMultiselectNavigationTarget = (
  ctx: MultiselectContextValue,
  current: string,
  key: string
): string | null => {
  if (ctx.order.length === 0) return null;
  const currentIndex = Math.max(0, ctx.order.indexOf(current));

  if (key === 'Home') {
    return ctx.order[0] ?? null;
  }
  if (key === 'End') {
    return ctx.order[ctx.order.length - 1] ?? null;
  }
  if (key === 'ArrowDown' || key === 'ArrowRight') {
    return ctx.order[(currentIndex + 1) % ctx.order.length] ?? null;
  }
  if (key === 'ArrowUp' || key === 'ArrowLeft') {
    return ctx.order[(currentIndex - 1 + ctx.order.length) % ctx.order.length] ?? null;
  }
  return null;
};

const focusMenuItem = (
  documentLike: { getElementById?: (id: string) => DomElementLike | null } | null | undefined,
  ctx: MenuContextValue,
  value: string
): boolean => {
  if (!documentLike || typeof documentLike.getElementById !== 'function') return false;
  const target = documentLike.getElementById(getMenuItemId(ctx, value));
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const focusRadioItem = (
  documentLike: { getElementById?: (id: string) => DomElementLike | null } | null | undefined,
  ctx: RadioGroupContextValue,
  value: string,
  fallbackRoot?: DomNodeLike | null
): boolean => {
  const targetId = getRadioItemId(ctx, value);
  const target = (documentLike && typeof documentLike.getElementById === 'function'
    ? documentLike.getElementById(targetId)
    : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const focusSelectItem = (
  documentLike: { getElementById?: (id: string) => DomElementLike | null } | null | undefined,
  ctx: SelectContextValue,
  value: string,
  fallbackRoot?: DomNodeLike | null
): boolean => {
  const targetId = getSelectItemId(ctx, value);
  const target = (documentLike && typeof documentLike.getElementById === 'function'
    ? documentLike.getElementById(targetId)
    : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const focusComboboxItem = (
  documentLike: { getElementById?: (id: string) => DomElementLike | null } | null | undefined,
  ctx: ComboboxContextValue,
  value: string,
  fallbackRoot?: DomNodeLike | null
): boolean => {
  const targetId = getComboboxItemId(ctx, value);
  const target = (documentLike && typeof documentLike.getElementById === 'function'
    ? documentLike.getElementById(targetId)
    : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const focusMultiselectItem = (
  documentLike: { getElementById?: (id: string) => DomElementLike | null } | null | undefined,
  ctx: MultiselectContextValue,
  value: string,
  fallbackRoot?: DomNodeLike | null
): boolean => {
  const targetId = getMultiselectItemId(ctx, value);
  const target = (documentLike && typeof documentLike.getElementById === 'function'
    ? documentLike.getElementById(targetId)
    : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const closeMenu = (ctx: MenuContextValue): void => {
  ctx.open.set(false);
  restoreMenuFocus(ctx);
};

const closeSelect = (ctx: SelectContextValue): void => {
  ctx.open.set(false);
  restoreSelectFocus(ctx);
};

const closeCombobox = (ctx: ComboboxContextValue): void => {
  ctx.open.set(false);
  restoreComboboxFocus(ctx);
};

const closeMultiselect = (ctx: MultiselectContextValue): void => {
  ctx.open.set(false);
  restoreMultiselectFocus(ctx);
};

const readStringSelection = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const toggleMultiselectValue = (ctx: MultiselectContextValue, value: string): string[] => {
  const current = readStringSelection(ctx.values.get());
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  ctx.values.set(next);
  return next;
};

const readNumericRectValue = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const getPopoverAnchorRect = (
  ctx: PopoverContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = popoverAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const getMenuAnchorRect = (
  ctx: MenuContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = menuAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const getTooltipAnchorRect = (
  ctx: TooltipContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = tooltipAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const getSelectAnchorRect = (
  ctx: SelectContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = selectAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const getComboboxAnchorRect = (
  ctx: ComboboxContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = comboboxAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const getMultiselectAnchorRect = (
  ctx: MultiselectContextValue
): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null => {
  const anchor = multiselectAnchorTargets.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
type PopoverAlign = 'start' | 'center' | 'end';

const pickPopoverSide = (props: Record<string, unknown> | null | undefined): PopoverSide => {
  const value = props?.side;
  return value === 'top' || value === 'bottom' || value === 'left' || value === 'right' ? value : 'bottom';
};

const pickPopoverAlign = (props: Record<string, unknown> | null | undefined): PopoverAlign => {
  const value = props?.align;
  return value === 'start' || value === 'center' || value === 'end' ? value : 'center';
};

const pickPopoverOffset = (props: Record<string, unknown> | null | undefined): number => {
  const value = props?.offset;
  return typeof value === 'number' && Number.isFinite(value) ? value : 8;
};

const omitPopoverLayoutProps = (
  props: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined => {
  if (!props) return undefined;
  const next = { ...props };
  delete next.side;
  delete next.align;
  delete next.offset;
  return next;
};

const pickToastDuration = (props: Record<string, unknown> | null | undefined): number => {
  const value = props?.duration;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const omitToastControlProps = (
  props: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined => {
  if (!props) return undefined;
  const next = { ...props };
  delete next.duration;
  return next;
};

const getPopoverContentStyle = (
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null,
  props: Record<string, unknown> | null | undefined
): Record<string, unknown> => {
  const side = pickPopoverSide(props);
  const align = pickPopoverAlign(props);
  const offset = pickPopoverOffset(props);
  const style: Record<string, unknown> = {
    position: 'fixed',
    zIndex: '1001',
  };

  if (!rect) {
    return {
      ...style,
      top: '16px',
      left: '16px',
    };
  }

  if (side === 'top' || side === 'bottom') {
    style.top = `${Math.round(side === 'bottom' ? rect.bottom + offset : rect.top - offset)}px`;
    if (align === 'start') {
      style.left = `${Math.round(rect.left)}px`;
    } else if (align === 'end') {
      style.left = `${Math.round(rect.right)}px`;
      style.transform = side === 'top' ? 'translate(-100%, -100%)' : 'translateX(-100%)';
    } else {
      style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      style.transform = side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
    }
    if (align === 'start' && side === 'top') {
      style.transform = 'translateY(-100%)';
    }
    return style;
  }

  style.left = `${Math.round(side === 'right' ? rect.right + offset : rect.left - offset)}px`;
  if (align === 'start') {
    style.top = `${Math.round(rect.top)}px`;
  } else if (align === 'end') {
    style.top = `${Math.round(rect.bottom)}px`;
    style.transform = side === 'left' ? 'translate(-100%, -100%)' : 'translateY(-100%)';
  } else {
    style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    style.transform = side === 'left' ? 'translate(-100%, -50%)' : 'translateY(-50%)';
  }
  if (align === 'start' && side === 'left') {
    style.transform = 'translateX(-100%)';
  }
  return style;
};

export const render = {
  signal: <T>(initial: T): Signal<T> => new Signal<T>(initial),
  get: <T>(signal: Signal<T>): T => signal.get(),
  peek: <T>(signal: Signal<T>): T => signal.peek(),
  set: <T>(signal: Signal<T>, value: T): boolean => signal.set(value),
  update_signal: <T>(signal: Signal<T>, updater: (value: T) => T): T => signal.update(updater),
  memo: <T>(compute: () => T): Memo<T> => new Memo<T>(compute),
  memo_get: <T>(memo: Memo<T>): T => memo.get(),
  memo_peek: <T>(memo: Memo<T>): T => memo.peek(),
  memo_dispose: <T>(memo: Memo<T>): void => memo.dispose(),
  effect: (fn: (onCleanup: (cleanup: ReactiveCleanup) => void) => void | ReactiveCleanup): Effect => new Effect(fn),
  dispose_effect: (effect: unknown): void => {
    if (!isDisposableLike(effect)) return;
    try {
      effect.dispose();
    } catch {
      // Keep stale/invalid handles idempotent.
    }
  },
  batch: <T>(fn: () => T): T => batchReactive(fn),
  untrack: <T>(fn: () => T): T => untrackReactive(fn),
  component: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, key?: unknown): VNode =>
    applyVNodeKey(frameRuntime.component(componentFn, props, key), key),
  component_keyed: <P>(
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P,
    key: unknown
  ): VNode => render.component(componentFn, props, key),
  render_app: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
    renderAppVNode(componentFn, props),
  render_to_string_app: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): string =>
    renderToString(renderAppVNode(componentFn, props)),
  create_context: frameRuntime.createContext,
  create_required_context: frameRuntime.createRequiredContext,
  with_context: <T>(context: ContextToken<T>, value: T, renderChildren: () => ComponentRenderable): VNode =>
    frameRuntime.withContext(context, value, renderChildren),
  use_context: <T>(context: ContextToken<T>): T => frameRuntime.useContext(context),
  state: <T>(initial: T): Signal<T> => frameRuntime.state(initial) as Signal<T>,
  remember: <T>(compute: () => T): T => frameRuntime.remember(compute),
  transition_presence: (
    open: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    durationMs: number,
    renderChildren: () => ComponentRenderable
  ): VNode => renderTransitionPresence(open, props, durationMs, renderChildren),
  resource_create: <T>(
    key: unknown,
    loader: (() => Promise<T>) | (() => T),
    options?: unknown
  ): ResourceHandle<T> => new ResourceHandle<T>(resolveResourceRecord(key, loader, options)),
  resource_status: (resource: unknown): string => {
    const handle = asResourceHandle(resource, 'render.resource_status');
    ensureResourceCurrent(handle.record);
    return handle.record.status.get();
  },
  resource_data: (resource: unknown): unknown => {
    const handle = asResourceHandle(resource, 'render.resource_data');
    ensureResourceCurrent(handle.record);
    return handle.record.hasData.get() ? handle.record.data.get() : null;
  },
  resource_error: (resource: unknown): unknown => {
    const handle = asResourceHandle(resource, 'render.resource_error');
    ensureResourceCurrent(handle.record);
    return handle.record.error.get();
  },
  resource_read: <T>(resource: unknown): T => {
    const handle = asResourceHandle<T>(resource, 'render.resource_read');
    ensureResourceCurrent(handle.record);
    const status = handle.record.status.get();
    if (handle.record.hasData.get()) {
      return handle.record.data.get() as T;
    }
    if (status === 'loading' && handle.record.promise) {
      throw handle.record.promise;
    }
    const error = handle.record.error.get();
    if (error !== null) {
      throw error;
    }
    throw new Error(`Resource '${handle.record.key}' has no data`);
  },
  resource_refresh: <T>(resource: unknown): Promise<T> => {
    const handle = asResourceHandle<T>(resource, 'render.resource_refresh');
    handle.record.expiresAt = 0;
    return startResourceLoad(handle.record, true);
  },
  resource_invalidate: (resource: unknown): void => {
    const handle = asResourceHandle(resource, 'render.resource_invalidate');
    handle.record.expiresAt = 0;
    handle.record.status.set('idle');
    ensureResourceCurrent(handle.record);
    scheduleDevtoolsNotify();
  },
  resource_mutate: <T>(resource: unknown, value: T): T => {
    const handle = asResourceHandle<T>(resource, 'render.resource_mutate');
    handle.record.data.set(value as unknown);
    handle.record.hasData.set(true);
    handle.record.error.set(null);
    handle.record.status.set('success');
    handle.record.expiresAt = handle.record.ttlMs > 0 ? Date.now() + handle.record.ttlMs : Number.POSITIVE_INFINITY;
    scheduleDevtoolsNotify();
    return handle.record.data.get() as T;
  },
  suspense: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode => {
    try {
      return coerceRenderableToVNode(renderChildren());
    } catch (error) {
      if (!isThenable(error)) {
        throw error;
      }
      const resolvedFallback = typeof fallback === 'function'
        ? (fallback as () => ComponentRenderable)()
        : (fallback as VNodeInput);
      return coerceRenderableToVNode(resolvedFallback);
    }
  },
  error_boundary: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode => {
    try {
      return coerceRenderableToVNode(renderChildren());
    } catch (error) {
      if (isThenable(error)) {
        throw error;
      }
      const resolvedFallback = typeof fallback === 'function'
        ? (fallback as (value: unknown) => ComponentRenderable)(error)
        : (fallback as VNodeInput);
      return coerceRenderableToVNode(resolvedFallback);
    }
  },
  show: (condition: unknown, renderChildren: () => ComponentRenderable, fallback: unknown): VNode => {
    const resolved = condition instanceof Signal ? condition.get() : condition;
    return resolved
      ? coerceRenderableToVNode(renderChildren())
      : coerceRenderableToVNode(typeof fallback === 'function' ? fallback() : fallback);
  },
  createResource: <T>(
    key: unknown,
    loader: (() => Promise<T>) | (() => T),
    options?: unknown
  ): ResourceHandle<T> => render.resource_create(key, loader, options),
  renderApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
    render.render_app(componentFn, props),
  renderToStringApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): string =>
    render.render_to_string_app(componentFn, props),
  transitionPresence: (
    open: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    durationMs: number,
    renderChildren: () => ComponentRenderable
  ): VNode => render.transition_presence(open, props, durationMs, renderChildren),
  resourceStatus: (resource: unknown): string => render.resource_status(resource),
  resourceData: (resource: unknown): unknown => render.resource_data(resource),
  resourceError: (resource: unknown): unknown => render.resource_error(resource),
  resourceRead: <T>(resource: unknown): T => render.resource_read<T>(resource),
  resourceRefresh: <T>(resource: unknown): Promise<T> => render.resource_refresh<T>(resource),
  resourceInvalidate: (resource: unknown): void => render.resource_invalidate(resource),
  resourceMutate: <T>(resource: unknown, value: T): T => render.resource_mutate(resource, value),
  errorBoundary: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode =>
    render.error_boundary(fallback, renderChildren),
  mountApp: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    render.mount_app(renderer, container, componentFn, props),
  hydrateApp: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    render.hydrate_app(renderer, container, componentFn, props),
  testingCreateDomHarness: (): TestingDomHarness => render.testing_create_dom_harness(),
  testingMountApp: <P>(
    harness: TestingDomHarness,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } => render.testing_mount_app(harness, componentFn, props),
  testingHydrateApp: <P>(
    harness: TestingDomHarness,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } => render.testing_hydrate_app(harness, componentFn, props),
  testingContainer: (harness: unknown): unknown => render.testing_container(harness),
  testingBody: (harness: unknown): unknown => render.testing_body(harness),
  testingGetById: (harness: unknown, id: string): unknown => render.testing_get_by_id(harness, id),
  testingGetByText: (scope: unknown, value: string): unknown => render.testing_get_by_text(scope, value),
  testingGetByRole: (scope: unknown, role: string): unknown => {
    const matches = render.testing_query_all_by_role(scope, role) as unknown[];
    return matches[0] ?? null;
  },
  testingQueryAllByRole: (scope: unknown, role: string): unknown => render.testing_query_all_by_role(scope, role),
  testingTextContent: (node: unknown): string => render.testing_text_content(node),
  testingClick: (node: unknown): void => render.testing_click(node),
  testingInput: (node: unknown, value: string): void => render.testing_input(node, value),
  testingChangeChecked: (node: unknown, checked: boolean): void => render.testing_change_checked(node, checked),
  testingKeydown: (node: unknown, key: string, shiftKey?: boolean): void =>
    render.testing_keydown(node, key, shiftKey),
  testingSubmit: (node: unknown): void => render.testing_submit(node),
  devtoolsSnapshot: (): DevtoolsSnapshot<VNode | null> => render.devtools_snapshot(),
  installDevtools: (key?: string): Record<string, unknown> => render.install_devtools(key),
  ssgPage: (body: unknown, options?: unknown): string => render.ssg_page(body, options),
  ssgRenderApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, options?: unknown): string =>
    render.ssg_render_app(componentFn, props, options),
  ssgWritePage: (filePath: string, body: unknown, options?: unknown): string =>
    render.ssg_write_page(filePath, body, options),
  ssgWriteApp: <P>(
    filePath: string,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P,
    options?: unknown
  ): string => render.ssg_write_app(filePath, componentFn, props, options),
  devtools_snapshot: (): DevtoolsSnapshot<VNode | null> => snapshotDevtools(),
  install_devtools: (key?: string): Record<string, unknown> => installLuminaDevtools(key),
  ssg_page: (body: unknown, options?: unknown): string => ssgApi.renderPage(body, options),
  ssg_render_app: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, options?: unknown): string =>
    ssgApi.renderAppPage(componentFn as ComponentFunction<unknown, ComponentRenderable>, props, options),
  ssg_write_page: (filePath: string, body: unknown, options?: unknown): string => ssgApi.writePage(filePath, body, options),
  ssg_write_app: <P>(
    filePath: string,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P,
    options?: unknown
  ): string => ssgApi.writeAppPage(filePath, componentFn as ComponentFunction<unknown, ComponentRenderable>, props, options),
  mountCustomElement: <P>(
    host: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    options?: CustomElementMountOptions<P>
  ): CustomElementController<P> => render.mount_custom_element(host, componentFn, options),
  defineCustomElement: <P>(
    tagName: string,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    options?: CustomElementMountOptions<P>
  ): new () => unknown => render.define_custom_element(tagName, componentFn, options),
  children: (input: unknown): VNode[] => normalizeVNodeChildren(resolveChildrenInput(input)),
  slot: <P>(
    slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
    props: P,
    fallback: VNodeInput = []
  ): VNode => {
    if (typeof slotValue === 'function') {
      return coerceRenderableToVNode((slotValue as (value: P) => ComponentRenderable)(props));
    }
    if (slotValue === null || slotValue === undefined) {
      return coerceRenderableToVNode(fallback);
    }
    return coerceRenderableToVNode(slotValue);
  },
  slot_or: <P>(
    slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
    props: P,
    fallback: VNodeInput
  ): VNode => render.slot(slotValue, props, fallback),
  compose_handlers: <Args extends unknown[]>(
    left: ((...args: Args) => unknown) | null | undefined,
    right: ((...args: Args) => unknown) | null | undefined
  ): ((...args: Args) => unknown) | undefined => composeHandlers(left, right),
  portal: (target: string | null | undefined, children: VNodeInput = []): VNode => vnodePortal(target, children),
  portal_body: (children: VNodeInput = []): VNode => vnodePortal(null, children),
  tabs_root: (value: Signal<string>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.tabs_root');
    return coerceRenderableToVNode(
      frameManager.withContext(tabsContext, { value, baseId: getTabsBaseId(value), order: [] }, renderChildren)
    );
  },
  tabs_list: (
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode =>
    vnodeElement(
      'div',
      mergeProps({ role: 'tablist', 'data-lumina-tabs-list': 'true' }, props),
      resolveChildrenInput(renderChildren)
    ),
  tabs_trigger: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.tabs_trigger');
    const ctx = frameManager.useContext(tabsContext);
    registerTabsValue(ctx, value);
    const selected = ctx.value.get() === value;
    const { triggerId, panelId } = getTabsIds(ctx, value);
    return vnodeElement(
      'button',
      mergeProps(
        {
          role: 'tab',
          type: 'button',
          id: triggerId,
          'aria-controls': panelId,
          'aria-selected': selected ? 'true' : 'false',
          tabIndex: selected ? 0 : -1,
          'data-state': selected ? 'active' : 'inactive',
          onClick: () => ctx.value.set(value),
          onKeyDown: (event?: KeyboardEvent) => {
            const nextValue = getTabsNavigationTarget(ctx, value, String(event?.key ?? ''));
            if (!nextValue) return undefined;
            event?.preventDefault?.();
            ctx.value.set(nextValue);
            return false;
          },
        },
        props
      ),
      children
    );
  },
  tabs_panel: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.tabs_panel');
    const ctx = frameManager.useContext(tabsContext);
    const selected = ctx.value.get() === value;
    const { triggerId, panelId } = getTabsIds(ctx, value);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'tabpanel',
          id: panelId,
          'aria-labelledby': triggerId,
          hidden: !selected,
          tabIndex: selected ? 0 : -1,
          'data-state': selected ? 'active' : 'inactive',
        },
        props
      ),
      children
    );
  },
  dialog_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_root');
    return coerceRenderableToVNode(
      frameManager.withContext(
        dialogContext,
        { open, baseId: getDialogBaseId(open), hasTitle: false, hasDescription: false },
        renderChildren
      )
    );
  },
  dialog_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
  dialog_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_trigger');
    const ctx = frameManager.useContext(dialogContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getDialogIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              dialogRestoreTargets.set(ctx.open as object, target);
            }
            ctx.open.set(true);
          },
        },
        props
      ),
      children
    );
  },
  dialog_overlay: (props: Record<string, unknown> | null | undefined): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_overlay');
    const ctx = frameManager.useContext(dialogContext);
    const open = ctx.open.get();
    return vnodeElement(
      'div',
      mergeProps(
        {
          'data-lumina-dialog-overlay': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          onClick: () => {
            ctx.open.set(false);
            restoreDialogFocus(ctx);
          },
        },
        props
      ),
      []
    );
  },
  dialog_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_content');
    const ctx = frameManager.useContext(dialogContext);
    const open = ctx.open.get();
    const { contentId, titleId, descriptionId } = getDialogIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'dialog',
          id: contentId,
          'aria-modal': 'true',
          'aria-labelledby': ctx.hasTitle ? titleId : undefined,
          'aria-describedby': ctx.hasDescription ? descriptionId : undefined,
          autoFocus: open,
          hidden: !open,
          tabIndex: -1,
          'data-state': open ? 'open' : 'closed',
          onKeyDown: (event?: KeyboardEvent) => {
            if (trapDialogTabNavigation(event)) {
              return false;
            }
            if (String(event?.key ?? '') !== 'Escape') return undefined;
            event?.preventDefault?.();
            ctx.open.set(false);
            restoreDialogFocus(ctx);
            return false;
          },
        },
        props
      ),
      children
    );
  },
  dialog_title: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_title');
    const ctx = frameManager.useContext(dialogContext);
    ctx.hasTitle = true;
    const { titleId } = getDialogIds(ctx);
    return vnodeElement(
      'h2',
      mergeProps(
        {
          id: titleId,
          'data-lumina-dialog-title': 'true',
        },
        props
      ),
      children
    );
  },
  dialog_description: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_description');
    const ctx = frameManager.useContext(dialogContext);
    ctx.hasDescription = true;
    const { descriptionId } = getDialogIds(ctx);
    return vnodeElement(
      'p',
      mergeProps(
        {
          id: descriptionId,
          'data-lumina-dialog-description': 'true',
        },
        props
      ),
      children
    );
  },
  dialog_close: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.dialog_close');
    const ctx = frameManager.useContext(dialogContext);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          'data-lumina-dialog-close': 'true',
          onClick: () => {
            ctx.open.set(false);
            restoreDialogFocus(ctx);
          },
        },
        props
      ),
      children
    );
  },
  popover_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.popover_root');
    return coerceRenderableToVNode(
      frameManager.withContext(popoverContext, { open, baseId: getPopoverBaseId(open) }, renderChildren)
    );
  },
  popover_portal: (children: VNodeInput = []): VNode => {
    const frameManager = requireActiveFrameManager('render.popover_portal');
    const ctx = frameManager.useContext(popoverContext);
    const open = ctx.open.get();
    const dismissLayer = vnodeElement(
      'div',
      {
        'data-lumina-popover-dismiss': 'true',
        'data-state': open ? 'open' : 'closed',
        hidden: !open,
        style: {
          position: 'fixed',
          inset: '0',
          background: 'transparent',
          zIndex: '1000',
        },
        onClick: () => {
          ctx.open.set(false);
          restorePopoverFocus(ctx);
        },
      },
      []
    );
    return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
  },
  popover_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.popover_trigger');
    const ctx = frameManager.useContext(popoverContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getPopoverIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              popoverRestoreTargets.set(ctx.open as object, target);
              popoverAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            const nextOpen = !ctx.open.get();
            ctx.open.set(nextOpen);
            if (!nextOpen) {
              restorePopoverFocus(ctx);
            }
          },
        },
        props
      ),
      children
    );
  },
  popover_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.popover_content');
    const ctx = frameManager.useContext(popoverContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getPopoverIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'dialog',
          id: contentId,
          'aria-modal': 'false',
          'aria-labelledby': triggerId,
          autoFocus: open,
          hidden: !open,
          tabIndex: -1,
          'data-lumina-popover-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getPopoverAnchorRect(ctx), props),
          onKeyDown: (event?: KeyboardEvent) => {
            if (String(event?.key ?? '') !== 'Escape') return undefined;
            event?.preventDefault?.();
            ctx.open.set(false);
            restorePopoverFocus(ctx);
            return false;
          },
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  tooltip_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.tooltip_root');
    return coerceRenderableToVNode(
      frameManager.withContext(tooltipContext, { open, baseId: getTooltipBaseId(open) }, renderChildren)
    );
  },
  tooltip_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
  tooltip_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.tooltip_trigger');
    const ctx = frameManager.useContext(tooltipContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getTooltipIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          'aria-describedby': open ? contentId : undefined,
          'data-state': open ? 'open' : 'closed',
          onMouseEnter: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              tooltipAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            ctx.open.set(true);
          },
          onMouseLeave: () => {
            ctx.open.set(false);
          },
          onFocus: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              tooltipAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            ctx.open.set(true);
          },
          onBlur: () => {
            ctx.open.set(false);
          },
        },
        props
      ),
      children
    );
  },
  tooltip_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.tooltip_content');
    const ctx = frameManager.useContext(tooltipContext);
    const open = ctx.open.get();
    const { contentId } = getTooltipIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'tooltip',
          id: contentId,
          hidden: !open,
          'data-lumina-tooltip-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getTooltipAnchorRect(ctx), props),
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  toast_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.toast_root');
    return coerceRenderableToVNode(
      frameManager.withContext(
        toastContext,
        { open, baseId: getToastBaseId(open), hasTitle: false, hasDescription: false },
        renderChildren
      )
    );
  },
  toast_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
  toast_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.toast_content');
    const ctx = frameManager.useContext(toastContext);
    const open = ctx.open.get();
    const { contentId, titleId, descriptionId } = getToastIds(ctx);
    const duration = pickToastDuration(props);
    if (open) {
      scheduleToastTimer(ctx, duration);
    } else {
      clearToastTimer(ctx.open);
    }
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'status',
          id: contentId,
          'aria-live': 'polite',
          'aria-atomic': 'true',
          'aria-labelledby': ctx.hasTitle ? titleId : undefined,
          'aria-describedby': ctx.hasDescription ? descriptionId : undefined,
          hidden: !open,
          tabIndex: 0,
          'data-lumina-toast-content': 'true',
          'data-state': open ? 'open' : 'closed',
          style: {
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: '1002',
          },
          onKeyDown: (event?: KeyboardEvent) => {
            if (String(event?.key ?? '') !== 'Escape') return undefined;
            event?.preventDefault?.();
            clearToastTimer(ctx.open);
            ctx.open.set(false);
            return false;
          },
        },
        omitToastControlProps(props)
      ),
      children
    );
  },
  toast_title: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.toast_title');
    const ctx = frameManager.useContext(toastContext);
    ctx.hasTitle = true;
    const { titleId } = getToastIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          id: titleId,
          'data-lumina-toast-title': 'true',
        },
        props
      ),
      children
    );
  },
  toast_description: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.toast_description');
    const ctx = frameManager.useContext(toastContext);
    ctx.hasDescription = true;
    const { descriptionId } = getToastIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          id: descriptionId,
          'data-lumina-toast-description': 'true',
        },
        props
      ),
      children
    );
  },
  toast_close: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.toast_close');
    const ctx = frameManager.useContext(toastContext);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          'data-lumina-toast-close': 'true',
          onClick: () => {
            clearToastTimer(ctx.open);
            ctx.open.set(false);
          },
        },
        props
      ),
      children
    );
  },
  toastRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
    render.toast_root(open, renderChildren),
  toastPortal: (children: VNodeInput = []): VNode => render.toast_portal(children),
  toastContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.toast_content(props, children),
  toastTitle: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.toast_title(props, children),
  toastDescription: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.toast_description(props, children),
  toastClose: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.toast_close(props, children),
  menu_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
    const frameManager = requireActiveFrameManager('render.menu_root');
    return coerceRenderableToVNode(
      frameManager.withContext(menuContext, { open, baseId: getMenuBaseId(open), order: [] }, renderChildren)
    );
  },
  menu_portal: (children: VNodeInput = []): VNode => {
    const frameManager = requireActiveFrameManager('render.menu_portal');
    const ctx = frameManager.useContext(menuContext);
    const open = ctx.open.get();
    const dismissLayer = vnodeElement(
      'div',
      {
        'data-lumina-menu-dismiss': 'true',
        'data-state': open ? 'open' : 'closed',
        hidden: !open,
        style: {
          position: 'fixed',
          inset: '0',
          background: 'transparent',
          zIndex: '1000',
        },
        onClick: () => {
          closeMenu(ctx);
        },
      },
      []
    );
    return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
  },
  menu_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.menu_trigger');
    const ctx = frameManager.useContext(menuContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getMenuIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              menuRestoreTargets.set(ctx.open as object, target);
              menuAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            const nextOpen = !ctx.open.get();
            ctx.open.set(nextOpen);
            if (!nextOpen) {
              restoreMenuFocus(ctx);
            }
          },
        },
        props
      ),
      children
    );
  },
  menu_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.menu_content');
    const ctx = frameManager.useContext(menuContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getMenuIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'menu',
          id: contentId,
          'aria-labelledby': triggerId,
          hidden: !open,
          tabIndex: -1,
          autoFocus: open,
          'data-lumina-menu-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getMenuAnchorRect(ctx), props),
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeMenu(ctx);
              return false;
            }
            if (key === 'ArrowDown' || key === 'Home') {
              event?.preventDefault?.();
              focusMenuItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.order[0] ?? ''
              );
              return false;
            }
            if (key === 'ArrowUp' || key === 'End') {
              event?.preventDefault?.();
              focusMenuItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.order[ctx.order.length - 1] ?? ''
              );
              return false;
            }
            return undefined;
          },
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  menu_item: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.menu_item');
    const ctx = frameManager.useContext(menuContext);
    registerMenuValue(ctx, value);
    const open = ctx.open.get();
    const isFirst = ctx.order[0] === value;
    const itemId = getMenuItemId(ctx, value);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: itemId,
          role: 'menuitem',
          hidden: !open,
          tabIndex: open ? 0 : -1,
          autoFocus: open && isFirst,
          'data-lumina-menu-item': 'true',
          'data-state': open ? 'open' : 'closed',
          onClick: () => {
            closeMenu(ctx);
          },
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeMenu(ctx);
              return false;
            }
            if (key === 'Enter' || key === ' ') {
              event?.preventDefault?.();
              const click = props?.onClick;
              if (typeof click === 'function') {
                click(event as unknown as Event);
              }
              closeMenu(ctx);
              return false;
            }
            const nextValue = getMenuNavigationTarget(ctx, value, key);
            if (!nextValue) return undefined;
            event?.preventDefault?.();
            focusMenuItem(
              (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
              ctx,
              nextValue
            );
            return false;
          },
        },
        props
      ),
      children
    );
  },
  select_root: (
    open: Signal<boolean>,
    value: Signal<string>,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.select_root');
    return coerceRenderableToVNode(
      frameManager.withContext(selectContext, { open, value, baseId: getSelectBaseId(open), order: [] }, renderChildren)
    );
  },
  select_portal: (children: VNodeInput = []): VNode => {
    const frameManager = requireActiveFrameManager('render.select_portal');
    const ctx = frameManager.useContext(selectContext);
    const open = ctx.open.get();
    const dismissLayer = vnodeElement(
      'div',
      {
        'data-lumina-select-dismiss': 'true',
        'data-state': open ? 'open' : 'closed',
        hidden: !open,
        style: {
          position: 'fixed',
          inset: '0',
          background: 'transparent',
          zIndex: '1000',
        },
        onClick: () => {
          closeSelect(ctx);
        },
      },
      []
    );
    return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
  },
  select_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.select_trigger');
    const ctx = frameManager.useContext(selectContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getSelectIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          role: 'combobox',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              selectRestoreTargets.set(ctx.open as object, target);
              selectAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            const nextOpen = !ctx.open.get();
            ctx.open.set(nextOpen);
            if (!nextOpen) {
              restoreSelectFocus(ctx);
            }
          },
        },
        props
      ),
      children
    );
  },
  select_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.select_content');
    const ctx = frameManager.useContext(selectContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getSelectIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'listbox',
          id: contentId,
          'aria-labelledby': triggerId,
          hidden: !open,
          tabIndex: -1,
          autoFocus: open,
          'data-lumina-select-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getSelectAnchorRect(ctx), props),
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeSelect(ctx);
              return false;
            }
            if (key === 'ArrowDown' || key === 'Home') {
              event?.preventDefault?.();
              focusSelectItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.value.get() && ctx.order.includes(ctx.value.get()) ? ctx.value.get() : (ctx.order[0] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            if (key === 'ArrowUp' || key === 'End') {
              event?.preventDefault?.();
              focusSelectItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.value.get() && ctx.order.includes(ctx.value.get())
                  ? ctx.value.get()
                  : (ctx.order[ctx.order.length - 1] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            return undefined;
          },
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  select_item: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.select_item');
    const ctx = frameManager.useContext(selectContext);
    registerSelectValue(ctx, value);
    const open = ctx.open.get();
    const currentValue = ctx.value.get();
    const selected = currentValue === value;
    const itemId = getSelectItemId(ctx, value);
    const isFirst = ctx.order[0] === value;
    const shouldAutoFocus = open && (selected || (!ctx.order.includes(currentValue) && isFirst));
    return coerceRenderableToVNode(
      frameManager.withContext(selectItemContext, { value, itemId, selected }, () =>
        vnodeElement(
          'button',
          mergeProps(
            {
              type: 'button',
              id: itemId,
              role: 'option',
              hidden: !open,
              tabIndex: open ? (selected ? 0 : -1) : -1,
              autoFocus: shouldAutoFocus,
              'aria-selected': selected ? 'true' : 'false',
              'data-lumina-select-item': 'true',
              'data-state': selected ? 'checked' : 'unchecked',
              onClick: () => {
                ctx.value.set(value);
                closeSelect(ctx);
              },
              onKeyDown: (event?: KeyboardEvent) => {
                const key = String(event?.key ?? '');
                if (key === 'Escape') {
                  event?.preventDefault?.();
                  closeSelect(ctx);
                  return false;
                }
                if (key === 'Enter' || key === ' ') {
                  event?.preventDefault?.();
                  ctx.value.set(value);
                  closeSelect(ctx);
                  return false;
                }
                const nextValue = getSelectNavigationTarget(ctx, value, key);
                if (!nextValue) return undefined;
                event?.preventDefault?.();
                ctx.value.set(nextValue);
                focusSelectItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  nextValue,
                  getFocusTargetFromEvent(event) as DomNodeLike | null
                );
                return false;
              },
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        )
      )
    );
  },
  select_indicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.select_indicator');
    const ctx = frameManager.useContext(selectItemContext);
    return vnodeElement(
      'span',
      mergeProps(
        {
          id: getSelectIndicatorId(ctx.itemId),
          'aria-hidden': 'true',
          hidden: !ctx.selected,
          'data-lumina-select-indicator': 'true',
          'data-state': ctx.selected ? 'checked' : 'unchecked',
        },
        props
      ),
      children
    );
  },
  selectRoot: (
    open: Signal<boolean>,
    value: Signal<string>,
    renderChildren: () => ComponentRenderable
  ): VNode => render.select_root(open, value, renderChildren),
  selectPortal: (children: VNodeInput = []): VNode => render.select_portal(children),
  selectTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.select_trigger(props, children),
  selectContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.select_content(props, children),
  selectItem: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.select_item(value, props, renderChildren),
  selectIndicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.select_indicator(props, children),
  combobox_root: (
    open: Signal<boolean>,
    value: Signal<string>,
    query: Signal<string>,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_root');
    return coerceRenderableToVNode(
      frameManager.withContext(
        comboboxContext,
        { open, value, query, baseId: getComboboxBaseId(open), order: [] },
        renderChildren
      )
    );
  },
  combobox_portal: (children: VNodeInput = []): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_portal');
    const ctx = frameManager.useContext(comboboxContext);
    const open = ctx.open.get();
    const dismissLayer = vnodeElement(
      'div',
      {
        'data-lumina-combobox-dismiss': 'true',
        'data-state': open ? 'open' : 'closed',
        hidden: !open,
        style: {
          position: 'fixed',
          inset: '0',
          background: 'transparent',
          zIndex: '1000',
        },
        onClick: () => {
          closeCombobox(ctx);
        },
      },
      []
    );
    return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
  },
  combobox_input: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_input');
    const ctx = frameManager.useContext(comboboxContext);
    const open = ctx.open.get();
    const { inputId, contentId } = getComboboxIds(ctx);
    return vnodeElement(
      'input',
      mergeProps(
        {
          type: 'text',
          id: inputId,
          role: 'combobox',
          value: ctx.query.get(),
          'aria-autocomplete': 'list',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onInput: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              comboboxRestoreTargets.set(ctx.open as object, target);
              comboboxAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            const nextQuery = String(((event as { target?: { value?: unknown } } | undefined)?.target?.value ?? ''));
            ctx.query.set(nextQuery);
            ctx.open.set(true);
          },
          onFocus: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (!target) return undefined;
            comboboxRestoreTargets.set(ctx.open as object, target);
            comboboxAnchorTargets.set(ctx.open as object, target as DomElementLike);
            ctx.open.set(true);
            return undefined;
          },
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (!target) return undefined;
            comboboxRestoreTargets.set(ctx.open as object, target);
            comboboxAnchorTargets.set(ctx.open as object, target as DomElementLike);
            ctx.open.set(true);
            return undefined;
          },
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeCombobox(ctx);
              return false;
            }
            if (key === 'ArrowDown' || key === 'Home') {
              event?.preventDefault?.();
              ctx.open.set(true);
              const currentValue = ctx.value.get();
              focusComboboxItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                currentValue && ctx.order.includes(currentValue) ? currentValue : (ctx.order[0] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            if (key === 'ArrowUp' || key === 'End') {
              event?.preventDefault?.();
              ctx.open.set(true);
              const currentValue = ctx.value.get();
              focusComboboxItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                currentValue && ctx.order.includes(currentValue)
                  ? currentValue
                  : (ctx.order[ctx.order.length - 1] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            return undefined;
          },
        },
        props
      ),
      children
    );
  },
  combobox_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_content');
    const ctx = frameManager.useContext(comboboxContext);
    const open = ctx.open.get();
    const { inputId, contentId } = getComboboxIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'listbox',
          id: contentId,
          'aria-labelledby': inputId,
          hidden: !open,
          tabIndex: -1,
          'data-lumina-combobox-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getComboboxAnchorRect(ctx), props),
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeCombobox(ctx);
              return false;
            }
            if (key === 'ArrowDown' || key === 'Home') {
              event?.preventDefault?.();
              focusComboboxItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.value.get() && ctx.order.includes(ctx.value.get()) ? ctx.value.get() : (ctx.order[0] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            if (key === 'ArrowUp' || key === 'End') {
              event?.preventDefault?.();
              focusComboboxItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                ctx.value.get() && ctx.order.includes(ctx.value.get())
                  ? ctx.value.get()
                  : (ctx.order[ctx.order.length - 1] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            return undefined;
          },
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  combobox_item: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_item');
    const ctx = frameManager.useContext(comboboxContext);
    const open = ctx.open.get();
    const query = ctx.query.get().trim().toLowerCase();
    const matchesQuery = query.length === 0 || value.toLowerCase().includes(query);
    if (matchesQuery) {
      registerComboboxValue(ctx, value);
    }
    const currentValue = ctx.value.get();
    const selected = currentValue === value;
    const itemId = getComboboxItemId(ctx, value);
    return coerceRenderableToVNode(
      frameManager.withContext(comboboxItemContext, { value, itemId, selected }, () =>
        vnodeElement(
          'button',
          mergeProps(
            {
              type: 'button',
              id: itemId,
              role: 'option',
              hidden: !open || !matchesQuery,
              tabIndex: open && matchesQuery ? (selected ? 0 : -1) : -1,
              'aria-selected': selected ? 'true' : 'false',
              'data-lumina-combobox-item': 'true',
              'data-state': selected ? 'checked' : 'unchecked',
              onClick: () => {
                ctx.value.set(value);
                ctx.query.set(value);
                closeCombobox(ctx);
              },
              onKeyDown: (event?: KeyboardEvent) => {
                const key = String(event?.key ?? '');
                if (key === 'Escape') {
                  event?.preventDefault?.();
                  closeCombobox(ctx);
                  return false;
                }
                if (key === 'Enter' || key === ' ') {
                  event?.preventDefault?.();
                  ctx.value.set(value);
                  ctx.query.set(value);
                  closeCombobox(ctx);
                  return false;
                }
                const nextValue = getComboboxNavigationTarget(ctx, value, key);
                if (!nextValue) return undefined;
                event?.preventDefault?.();
                ctx.value.set(nextValue);
                ctx.query.set(nextValue);
                focusComboboxItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  nextValue,
                  getFocusTargetFromEvent(event) as DomNodeLike | null
                );
                return false;
              },
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        )
      )
    );
  },
  combobox_indicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.combobox_indicator');
    const ctx = frameManager.useContext(comboboxItemContext);
    return vnodeElement(
      'span',
      mergeProps(
        {
          id: getComboboxIndicatorId(ctx.itemId),
          'aria-hidden': 'true',
          hidden: !ctx.selected,
          'data-lumina-combobox-indicator': 'true',
          'data-state': ctx.selected ? 'checked' : 'unchecked',
        },
        props
      ),
      children
    );
  },
  comboboxRoot: (
    open: Signal<boolean>,
    value: Signal<string>,
    query: Signal<string>,
    renderChildren: () => ComponentRenderable
  ): VNode => render.combobox_root(open, value, query, renderChildren),
  comboboxPortal: (children: VNodeInput = []): VNode => render.combobox_portal(children),
  comboboxInput: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.combobox_input(props, children),
  comboboxContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.combobox_content(props, children),
  comboboxItem: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.combobox_item(value, props, renderChildren),
  comboboxIndicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.combobox_indicator(props, children),
  multiselect_root: (
    open: Signal<boolean>,
    values: Signal<string[]>,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_root');
    return coerceRenderableToVNode(
      frameManager.withContext(multiselectContext, { open, values, baseId: getMultiselectBaseId(open), order: [] }, renderChildren)
    );
  },
  multiselect_portal: (children: VNodeInput = []): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_portal');
    const ctx = frameManager.useContext(multiselectContext);
    const open = ctx.open.get();
    const dismissLayer = vnodeElement(
      'div',
      {
        'data-lumina-multiselect-dismiss': 'true',
        'data-state': open ? 'open' : 'closed',
        hidden: !open,
        style: {
          position: 'fixed',
          inset: '0',
          background: 'transparent',
          zIndex: '1000',
        },
        onClick: () => {
          closeMultiselect(ctx);
        },
      },
      []
    );
    return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
  },
  multiselect_trigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_trigger');
    const ctx = frameManager.useContext(multiselectContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getMultiselectIds(ctx);
    return vnodeElement(
      'button',
      mergeProps(
        {
          type: 'button',
          id: triggerId,
          role: 'combobox',
          'aria-haspopup': 'listbox',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': contentId,
          'data-state': open ? 'open' : 'closed',
          onClick: (event?: Event) => {
            const target = getFocusTargetFromEvent(event);
            if (target) {
              multiselectRestoreTargets.set(ctx.open as object, target);
              multiselectAnchorTargets.set(ctx.open as object, target as DomElementLike);
            }
            const nextOpen = !ctx.open.get();
            ctx.open.set(nextOpen);
            if (!nextOpen) {
              restoreMultiselectFocus(ctx);
            }
          },
        },
        props
      ),
      children
    );
  },
  multiselect_content: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_content');
    const ctx = frameManager.useContext(multiselectContext);
    const open = ctx.open.get();
    const { triggerId, contentId } = getMultiselectIds(ctx);
    return vnodeElement(
      'div',
      mergeProps(
        {
          role: 'listbox',
          id: contentId,
          'aria-labelledby': triggerId,
          'aria-multiselectable': 'true',
          hidden: !open,
          tabIndex: -1,
          autoFocus: open,
          'data-lumina-multiselect-content': 'true',
          'data-state': open ? 'open' : 'closed',
          'data-side': pickPopoverSide(props),
          style: getPopoverContentStyle(getMultiselectAnchorRect(ctx), props),
          onKeyDown: (event?: KeyboardEvent) => {
            const key = String(event?.key ?? '');
            if (key === 'Escape') {
              event?.preventDefault?.();
              closeMultiselect(ctx);
              return false;
            }
            const currentValues = readStringSelection(ctx.values.get());
            if (key === 'ArrowDown' || key === 'Home') {
              event?.preventDefault?.();
              focusMultiselectItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                currentValues.find((entry) => ctx.order.includes(entry)) ?? (ctx.order[0] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            if (key === 'ArrowUp' || key === 'End') {
              event?.preventDefault?.();
              focusMultiselectItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                [...currentValues].reverse().find((entry) => ctx.order.includes(entry))
                  ?? (ctx.order[ctx.order.length - 1] ?? ''),
                getFocusTargetFromEvent(event) as DomNodeLike | null
              );
              return false;
            }
            return undefined;
          },
        },
        omitPopoverLayoutProps(props)
      ),
      children
    );
  },
  multiselect_item: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_item');
    const ctx = frameManager.useContext(multiselectContext);
    registerMultiselectValue(ctx, value);
    const open = ctx.open.get();
    const selectedValues = readStringSelection(ctx.values.get());
    const selected = selectedValues.includes(value);
    const itemId = getMultiselectItemId(ctx, value);
    const firstSelected = selectedValues.find((entry) => ctx.order.includes(entry));
    const isFirst = ctx.order[0] === value;
    const shouldAutoFocus = open && ((selected && value === firstSelected) || (!firstSelected && isFirst));
    return coerceRenderableToVNode(
      frameManager.withContext(multiselectItemContext, { value, itemId, selected }, () =>
        vnodeElement(
          'button',
          mergeProps(
            {
              type: 'button',
              id: itemId,
              role: 'option',
              hidden: !open,
              tabIndex: open ? (selected ? 0 : -1) : -1,
              autoFocus: shouldAutoFocus,
              'aria-selected': selected ? 'true' : 'false',
              'data-lumina-multiselect-item': 'true',
              'data-state': selected ? 'checked' : 'unchecked',
              onClick: () => {
                toggleMultiselectValue(ctx, value);
              },
              onKeyDown: (event?: KeyboardEvent) => {
                const key = String(event?.key ?? '');
                if (key === 'Escape') {
                  event?.preventDefault?.();
                  closeMultiselect(ctx);
                  return false;
                }
                if (key === 'Enter' || key === ' ') {
                  event?.preventDefault?.();
                  toggleMultiselectValue(ctx, value);
                  return false;
                }
                const nextValue = getMultiselectNavigationTarget(ctx, value, key);
                if (!nextValue) return undefined;
                event?.preventDefault?.();
                focusMultiselectItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  nextValue,
                  getFocusTargetFromEvent(event) as DomNodeLike | null
                );
                return false;
              },
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        )
      )
    );
  },
  multiselect_indicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.multiselect_indicator');
    const ctx = frameManager.useContext(multiselectItemContext);
    return vnodeElement(
      'span',
      mergeProps(
        {
          id: getMultiselectIndicatorId(ctx.itemId),
          'aria-hidden': 'true',
          hidden: !ctx.selected,
          'data-lumina-multiselect-indicator': 'true',
          'data-state': ctx.selected ? 'checked' : 'unchecked',
        },
        props
      ),
      children
    );
  },
  multiselectRoot: (
    open: Signal<boolean>,
    values: Signal<string[]>,
    renderChildren: () => ComponentRenderable
  ): VNode => render.multiselect_root(open, values, renderChildren),
  multiselectPortal: (children: VNodeInput = []): VNode => render.multiselect_portal(children),
  multiselectTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.multiselect_trigger(props, children),
  multiselectContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.multiselect_content(props, children),
  multiselectItem: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.multiselect_item(value, props, renderChildren),
  multiselectIndicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.multiselect_indicator(props, children),
  checkbox_root: (
    checked: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.checkbox_root');
    return coerceRenderableToVNode(
      frameManager.withContext(checkboxContext, { checked, baseId: getCheckboxBaseId(checked) }, () => {
        const ctx = frameManager.useContext(checkboxContext);
        const current = ctx.checked.get();
        const { rootId, indicatorId } = getCheckboxIds(ctx);
        return vnodeElement(
          'button',
          mergeProps(
            {
              type: 'button',
              id: rootId,
              role: 'checkbox',
              'aria-checked': current ? 'true' : 'false',
              'aria-controls': indicatorId,
              tabIndex: 0,
              'data-lumina-checkbox-root': 'true',
              'data-state': current ? 'checked' : 'unchecked',
              onClick: () => {
                ctx.checked.set(!ctx.checked.get());
              },
              onKeyDown: (event?: KeyboardEvent) => {
                const key = String(event?.key ?? '');
                if (key !== 'Enter' && key !== ' ') return undefined;
                event?.preventDefault?.();
                ctx.checked.set(!ctx.checked.get());
                return false;
              },
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        );
      })
    );
  },
  checkbox_indicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.checkbox_indicator');
    const ctx = frameManager.useContext(checkboxContext);
    const current = ctx.checked.get();
    const { indicatorId } = getCheckboxIds(ctx);
    return vnodeElement(
      'span',
      mergeProps(
        {
          id: indicatorId,
          'aria-hidden': 'true',
          hidden: !current,
          'data-lumina-checkbox-indicator': 'true',
          'data-state': current ? 'checked' : 'unchecked',
        },
        props
      ),
      children
    );
  },
  checkboxRoot: (
    checked: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.checkbox_root(checked, props, renderChildren),
  checkboxIndicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.checkbox_indicator(props, children),
  radio_group: (
    value: Signal<string>,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.radio_group');
    return coerceRenderableToVNode(
      frameManager.withContext(radioGroupContext, { value, baseId: getRadioBaseId(value), order: [] }, () =>
        vnodeElement(
          'div',
          mergeProps(
            {
              role: 'radiogroup',
              'data-lumina-radio-group': 'true',
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        )
      )
    );
  },
  radio_item: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.radio_item');
    const ctx = frameManager.useContext(radioGroupContext);
    registerRadioValue(ctx, value);
    const selected = ctx.value.get() === value;
    const itemId = getRadioItemId(ctx, value);
    return coerceRenderableToVNode(
      frameManager.withContext(radioItemContext, { value, itemId, selected }, () =>
        vnodeElement(
          'button',
          mergeProps(
            {
              type: 'button',
              id: itemId,
              role: 'radio',
              'aria-checked': selected ? 'true' : 'false',
              tabIndex: selected ? 0 : -1,
              'data-lumina-radio-item': 'true',
              'data-state': selected ? 'checked' : 'unchecked',
              onClick: () => {
                ctx.value.set(value);
              },
              onKeyDown: (event?: KeyboardEvent) => {
                const key = String(event?.key ?? '');
                if (key === 'Enter' || key === ' ') {
                  event?.preventDefault?.();
                  ctx.value.set(value);
                  return false;
                }
                const nextValue = getRadioNavigationTarget(ctx, value, key);
                if (!nextValue) return undefined;
                event?.preventDefault?.();
                ctx.value.set(nextValue);
                const focusTarget = getFocusTargetFromEvent(event) as DomElementLike | null;
                focusRadioItem(
                  (focusTarget as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  nextValue,
                  focusTarget?.parentNode ?? null
                );
                return false;
              },
            },
            props
          ),
          resolveChildrenInput(renderChildren)
        )
      )
    );
  },
  radio_indicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => {
    const frameManager = requireActiveFrameManager('render.radio_indicator');
    const ctx = frameManager.useContext(radioItemContext);
    return vnodeElement(
      'span',
      mergeProps(
        {
          id: getRadioIndicatorId(ctx.itemId),
          'aria-hidden': 'true',
          hidden: !ctx.selected,
          'data-lumina-radio-indicator': 'true',
          'data-state': ctx.selected ? 'checked' : 'unchecked',
        },
        props
      ),
      children
    );
  },
  radioGroup: (
    value: Signal<string>,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.radio_group(value, props, renderChildren),
  radioItem: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.radio_item(value, props, renderChildren),
  radioIndicator: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.radio_indicator(props, children),
  portalBody: (children: VNodeInput = []): VNode => render.portal_body(children),
  tabsRoot: (value: Signal<string>, renderChildren: () => ComponentRenderable): VNode =>
    render.tabs_root(value, renderChildren),
  tabsList: (
    props: Record<string, unknown> | null | undefined,
    renderChildren: () => ComponentRenderable
  ): VNode => render.tabs_list(props, renderChildren),
  tabsTrigger: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.tabs_trigger(value, props, children),
  tabsPanel: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.tabs_panel(value, props, children),
  dialogRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
    render.dialog_root(open, renderChildren),
  dialogPortal: (children: VNodeInput = []): VNode => render.dialog_portal(children),
  dialogTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.dialog_trigger(props, children),
  dialogOverlay: (props: Record<string, unknown> | null | undefined): VNode => render.dialog_overlay(props),
  dialogContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.dialog_content(props, children),
  dialogTitle: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.dialog_title(props, children),
  dialogDescription: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.dialog_description(props, children),
  dialogClose: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.dialog_close(props, children),
  popoverRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
    render.popover_root(open, renderChildren),
  popoverPortal: (children: VNodeInput = []): VNode => render.popover_portal(children),
  popoverTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.popover_trigger(props, children),
  popoverContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.popover_content(props, children),
  tooltipRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
    render.tooltip_root(open, renderChildren),
  tooltipPortal: (children: VNodeInput = []): VNode => render.tooltip_portal(children),
  tooltipTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.tooltip_trigger(props, children),
  tooltipContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.tooltip_content(props, children),
  menuRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
    render.menu_root(open, renderChildren),
  menuPortal: (children: VNodeInput = []): VNode => render.menu_portal(children),
  menuTrigger: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.menu_trigger(props, children),
  menuContent: (
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.menu_content(props, children),
  menuItem: (
    value: string,
    props: Record<string, unknown> | null | undefined,
    children: VNodeInput = []
  ): VNode => render.menu_item(value, props, children),
  text: (value: unknown): VNode => vnodeText(value),
  live_text: (signal: Signal<unknown> | Memo<unknown>): VNode => vnodeLiveText(signal),
  liveText: (signal: Signal<unknown> | Memo<unknown>): VNode => vnodeLiveText(signal),
  index_list: (
    itemsSignal: Signal<unknown>,
    renderItem: (item: Signal<unknown>, index: number) => VNodeInput
  ): VNode => vnodeIndexList(itemsSignal, renderItem),
  indexList: (
    itemsSignal: Signal<unknown>,
    renderItem: (item: Signal<unknown>, index: number) => VNodeInput
  ): VNode => vnodeIndexList(itemsSignal, renderItem),
  for_list: (
    itemsSignal: Signal<unknown>,
    keyOf: (item: unknown, index: number) => string | number,
    renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
  ): VNode => vnodeForList(itemsSignal, keyOf, renderItem),
  forList: (
    itemsSignal: Signal<unknown>,
    keyOf: (item: unknown, index: number) => string | number,
    renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
  ): VNode => vnodeForList(itemsSignal, keyOf, renderItem),
  element: (tag: string, props?: Record<string, unknown> | null, children: VNodeInput = []): VNode =>
    vnodeElement(tag, props, children),
  props_empty: propsEmpty,
  props_class: propsClass,
  props_on_click: propsOnClick,
  props_on_click_delta: propsOnClickDelta,
  props_on_click_inc: propsOnClickInc,
  props_on_click_dec: propsOnClickDec,
  props_id: propsId,
  props_style: propsStyle,
  props_value: propsValue,
  props_checked: propsChecked,
  props_type: propsType,
  props_name: propsName,
  props_placeholder: propsPlaceholder,
  props_href: propsHref,
  props_disabled: propsDisabled,
  props_on_input: propsOnInput,
  props_on_change: propsOnChange,
  props_on_checked_change: propsOnCheckedChange,
  props_on_submit: propsOnSubmit,
  props_key: propsKey,
  props_attr: (name: string, value: unknown): Record<string, unknown> => propsAttr(name, value),
  props_when: (condition: unknown, props: unknown): Record<string, unknown> => propsWhen(condition, props),
  props_merge: (left: unknown, right: unknown): Record<string, unknown> => mergeProps(left, right),
  dom_get_element_by_id: (id: string): unknown => {
    const doc = (globalThis as { document?: { getElementById?: (value: string) => unknown } }).document;
    if (!doc || typeof doc.getElementById !== 'function') return null;
    return doc.getElementById(id);
  },
  fragment: (children: VNodeInput = []): VNode => vnodeFragment(children),
  is_vnode: (value: unknown): boolean => isVNode(value),
  serialize: (node: VNode): string => serializeVNode(node),
  parse: (json: string): VNode => parseVNode(json),
  create_renderer: (renderer: unknown): Renderer => coerceRenderer(renderer),
  create_dom_renderer: (options?: DomRendererOptions): Renderer => createDomRenderer(options),
  create_ssr_renderer: (): Renderer => createSsrRenderer(),
  create_canvas_renderer: (options?: CanvasRendererOptions): Renderer => createCanvasRenderer(options),
  create_terminal_renderer: (): Renderer => createTerminalRenderer(),
  render_to_string: (node: VNode): string => renderToString(node),
  render_to_terminal: (node: VNode): string => renderToTerminal(node),
  create_root: (renderer: unknown, container: unknown): RenderRoot => new RenderRoot(coerceRenderer(renderer), container),
  mount: (renderer: unknown, container: unknown, node: VNode): RenderRoot | { $tag: string; $payload?: unknown } => {
    if (container == null) return Result.Err('Render container is required');
    const root = new RenderRoot(coerceRenderer(renderer), container);
    try {
      root.mount(node);
      return root;
    } catch (error) {
      return Result.Err(toRenderErrorMessage(error));
    }
  },
  hydrate: (renderer: unknown, container: unknown, node: VNode): RenderRoot | { $tag: string; $payload?: unknown } => {
    if (container == null) return Result.Err('Render container is required');
    const root = new RenderRoot(coerceRenderer(renderer), container);
    try {
      root.hydrate(node);
      return root;
    } catch (error) {
      return Result.Err(toRenderErrorMessage(error));
    }
  },
  mount_reactive: (
    renderer: unknown,
    container: unknown,
    view: () => VNode
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } => {
    if (container == null) return Result.Err('Render container is required');
    const root = new RenderRoot(coerceRenderer(renderer), container);
    const frameManager = new FrameManager();
    try {
      const fx = new Effect(() => {
        const node = runWithFrameManager(frameManager, view);
        root.update(node);
      });
      return new ReactiveRenderRoot(root, fx, frameManager);
    } catch (error) {
      return Result.Err(toRenderErrorMessage(error));
    }
  },
  hydrate_reactive: (
    renderer: unknown,
    container: unknown,
    view: () => VNode
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } => {
    if (container == null) return Result.Err('Render container is required');
    const root = new RenderRoot(coerceRenderer(renderer), container);
    const frameManager = new FrameManager();
    let initialized = false;
    try {
      const fx = new Effect(() => {
        const node = runWithFrameManager(frameManager, view);
        if (!initialized) {
          root.hydrate(node);
          initialized = true;
          return;
        }
        root.update(node);
      });
      return new ReactiveRenderRoot(root, fx, frameManager);
    } catch (error) {
      return Result.Err(toRenderErrorMessage(error));
    }
  },
  mount_app: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    mountReactiveApp(renderer, container, componentFn, props),
  hydrate_app: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    hydrateReactiveApp(renderer, container, componentFn, props),
  testing_create_dom_harness: (): TestingDomHarness => testingFacade.testing_create_dom_harness(),
  testing_mount_app: <P>(
    harness: TestingDomHarness,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    testingFacade.testing_mount_app(harness, componentFn as ComponentFunction<unknown, ComponentRenderable>, props),
  testing_hydrate_app: <P>(
    harness: TestingDomHarness,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
    testingFacade.testing_hydrate_app(harness, componentFn as ComponentFunction<unknown, ComponentRenderable>, props),
  testing_container: (harness: unknown): unknown => testingFacade.testing_container(harness),
  testing_body: (harness: unknown): unknown => testingFacade.testing_body(harness),
  testing_get_by_id: (harness: unknown, id: string): unknown => testingFacade.testing_get_by_id(harness, id),
  testing_get_by_text: (scope: unknown, value: string): unknown => testingFacade.testing_get_by_text(scope, value),
  testing_query_all_by_role: (scope: unknown, role: string): unknown =>
    testingFacade.testing_query_all_by_role(scope, role),
  testing_text_content: (node: unknown): string => testingFacade.testing_text_content(node),
  testing_click: (node: unknown): void => testingFacade.testing_click(node),
  testing_input: (node: unknown, value: string): void => testingFacade.testing_input(node, value),
  testing_change_checked: (node: unknown, checked: boolean): void =>
    testingFacade.testing_change_checked(node, checked),
  testing_keydown: (node: unknown, key: string, shiftKey?: boolean): void =>
    testingFacade.testing_keydown(node, key, shiftKey),
  testing_submit: (node: unknown): void => testingFacade.testing_submit(node),
  mount_custom_element: <P>(
    host: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    options?: CustomElementMountOptions<P>
  ): CustomElementController<P, ReactiveRenderRoot | { $tag: string; $payload?: unknown }, Signal<P>> =>
    mountCustomElementInternal(host, componentFn, options),
  define_custom_element: <P>(
    tagName: string,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    options?: CustomElementMountOptions<P>
  ): new () => unknown => defineCustomElementInternal(tagName, componentFn, options),
  update: (root: unknown, node: VNode): void => {
    if (!root || typeof root !== 'object') return;
    if (typeof (root as { update?: unknown }).update !== 'function') return;
    try {
      (root as { update: (next: VNode) => void }).update(node);
    } catch {
      // Keep stale/invalid handles idempotent.
    }
  },
  unmount: (root: unknown): void => {
    if (!isUnmountableLike(root)) return;
    try {
      root.unmount();
    } catch {
      // Keep stale/invalid handles idempotent.
    }
  },
  dispose_reactive: (root: unknown): void => {
    if (!isDisposableLike(root)) return;
    try {
      root.dispose();
    } catch {
      // Keep stale/invalid handles idempotent.
    }
  },
};

export const createSignal = <T>(initial: T): Signal<T> => render.signal(initial);
export const get = <T>(signal: Signal<T>): T => render.get(signal);
export const set = <T>(signal: Signal<T>, value: T): boolean => render.set(signal, value);
export const createMemo = <T>(compute: () => T): Memo<T> => render.memo(compute);
export const createEffect = (fn: (onCleanup: (cleanup: ReactiveCleanup) => void) => void | ReactiveCleanup): Effect =>
  render.effect(fn);
export const batch = <T>(fn: () => T): T => render.batch(fn);
export const untrack = <T>(fn: () => T): T => render.untrack(fn);
export const component = <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, key?: unknown): VNode =>
  render.component(componentFn, props, key);
export const component_keyed = <P>(
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P,
  key: unknown
): VNode => render.component_keyed(componentFn, props, key);
export const renderApp = <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
  render.render_app(componentFn, props);
export const renderToStringApp = <P>(
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): string => render.render_to_string_app(componentFn, props);
export const createContext = <T>(defaultValue?: T): ContextToken<T> => render.create_context(defaultValue);
export const create_required_context = <T>(): ContextToken<T> => render.create_required_context<T>();
export const withContext = <T>(context: ContextToken<T>, value: T, renderChildren: () => ComponentRenderable): VNode =>
  render.with_context(context, value, renderChildren);
export const useContext = <T>(context: ContextToken<T>): T => render.use_context(context);
export const state = <T>(initial: T): Signal<T> => render.state(initial);
export const remember = <T>(compute: () => T): T => render.remember(compute);
export const createResource = <T>(
  key: unknown,
  loader: (() => Promise<T>) | (() => T),
  options?: unknown
): ResourceHandle<T> => render.resource_create(key, loader, options);
export const resourceStatus = (resource: unknown): string => render.resource_status(resource);
export const resourceData = (resource: unknown): unknown => render.resource_data(resource);
export const resourceError = (resource: unknown): unknown => render.resource_error(resource);
export const resourceRead = <T>(resource: unknown): T => render.resource_read<T>(resource);
export const resourceRefresh = <T>(resource: unknown): Promise<T> => render.resource_refresh<T>(resource);
export const resourceInvalidate = (resource: unknown): void => render.resource_invalidate(resource);
export const resourceMutate = <T>(resource: unknown, value: T): T => render.resource_mutate(resource, value);
export const suspense = (fallback: unknown, renderChildren: () => ComponentRenderable): VNode =>
  render.suspense(fallback, renderChildren);
export const errorBoundary = (fallback: unknown, renderChildren: () => ComponentRenderable): VNode =>
  render.error_boundary(fallback, renderChildren);
export const show = (
  condition: unknown,
  renderChildren: () => ComponentRenderable,
  fallback: unknown = []
): VNode => render.show(condition, renderChildren, fallback);
export const mountApp = <P>(
  renderer: unknown,
  container: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.mount_app(renderer, container, componentFn, props);
export const hydrateApp = <P>(
  renderer: unknown,
  container: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.hydrate_app(renderer, container, componentFn, props);
export const testingCreateDomHarness = (): TestingDomHarness => render.testing_create_dom_harness();
export const testingMountApp = <P>(
  harness: TestingDomHarness,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.testing_mount_app(harness, componentFn, props);
export const testingHydrateApp = <P>(
  harness: TestingDomHarness,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  render.testing_hydrate_app(harness, componentFn, props);
export const testingContainer = (harness: unknown): unknown => render.testing_container(harness);
export const testingBody = (harness: unknown): unknown => render.testing_body(harness);
export const testingGetById = (harness: unknown, id: string): unknown => render.testing_get_by_id(harness, id);
export const testingTextContent = (node: unknown): string => render.testing_text_content(node);
export const testingClick = (node: unknown): void => render.testing_click(node);
export const testingInput = (node: unknown, value: string): void => render.testing_input(node, value);
export const testingChangeChecked = (node: unknown, checked: boolean): void =>
  render.testing_change_checked(node, checked);
export const testingKeydown = (node: unknown, key: string, shiftKey?: boolean): void =>
  render.testing_keydown(node, key, shiftKey);
export const testingSubmit = (node: unknown): void => render.testing_submit(node);
export const mountCustomElement = <P>(
  host: unknown,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  options?: CustomElementMountOptions<P>
): CustomElementController<P> => render.mount_custom_element(host, componentFn, options);
export const defineCustomElement = <P>(
  tagName: string,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  options?: CustomElementMountOptions<P>
): new () => unknown => render.define_custom_element(tagName, componentFn, options);
export const children = (input: unknown): VNode[] => render.children(input);
export const slot = <P>(
  slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
  props: P,
  fallback?: VNodeInput
): VNode => render.slot(slotValue, props, fallback);
export const slot_or = <P>(
  slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
  props: P,
  fallback: VNodeInput
): VNode => render.slot_or(slotValue, props, fallback);
export const compose_handlers = <Args extends unknown[]>(
  left: ((...args: Args) => unknown) | null | undefined,
  right: ((...args: Args) => unknown) | null | undefined
): ((...args: Args) => unknown) | undefined => render.compose_handlers(left, right);
export const portal = (target: string | null | undefined, children: VNodeInput = []): VNode =>
  render.portal(target, children);
export const portalBody = (children: VNodeInput = []): VNode => render.portal_body(children);
export const tabsRoot = (value: Signal<string>, renderChildren: () => ComponentRenderable): VNode =>
  render.tabs_root(value, renderChildren);
export const tabsList = (
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.tabs_list(props, renderChildren);
export const tabsTrigger = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.tabs_trigger(value, props, children);
export const tabsPanel = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.tabs_panel(value, props, children);
export const dialogRoot = (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
  render.dialog_root(open, renderChildren);
export const dialogPortal = (children: VNodeInput = []): VNode => render.dialog_portal(children);
export const dialogTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.dialog_trigger(props, children);
export const dialogOverlay = (props: Record<string, unknown> | null | undefined): VNode =>
  render.dialog_overlay(props);
export const dialogContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.dialog_content(props, children);
export const dialogTitle = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.dialog_title(props, children);
export const dialogDescription = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.dialog_description(props, children);
export const dialogClose = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.dialog_close(props, children);
export const popoverRoot = (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
  render.popover_root(open, renderChildren);
export const popoverPortal = (children: VNodeInput = []): VNode => render.popover_portal(children);
export const popoverTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.popover_trigger(props, children);
export const popoverContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.popover_content(props, children);
export const tooltipRoot = (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
  render.tooltip_root(open, renderChildren);
export const tooltipPortal = (children: VNodeInput = []): VNode => render.tooltip_portal(children);
export const tooltipTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.tooltip_trigger(props, children);
export const tooltipContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.tooltip_content(props, children);
export const toastRoot = (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
  render.toast_root(open, renderChildren);
export const toastPortal = (children: VNodeInput = []): VNode => render.toast_portal(children);
export const toastContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.toast_content(props, children);
export const toastTitle = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.toast_title(props, children);
export const toastDescription = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.toast_description(props, children);
export const toastClose = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.toast_close(props, children);
export const menuRoot = (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
  render.menu_root(open, renderChildren);
export const menuPortal = (children: VNodeInput = []): VNode => render.menu_portal(children);
export const menuTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.menu_trigger(props, children);
export const menuContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.menu_content(props, children);
export const menuItem = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.menu_item(value, props, children);
export const selectRoot = (
  open: Signal<boolean>,
  value: Signal<string>,
  renderChildren: () => ComponentRenderable
): VNode => render.select_root(open, value, renderChildren);
export const selectPortal = (children: VNodeInput = []): VNode => render.select_portal(children);
export const selectTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.select_trigger(props, children);
export const selectContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.select_content(props, children);
export const selectItem = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.select_item(value, props, renderChildren);
export const selectIndicator = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.select_indicator(props, children);
export const comboboxRoot = (
  open: Signal<boolean>,
  value: Signal<string>,
  query: Signal<string>,
  renderChildren: () => ComponentRenderable
): VNode => render.combobox_root(open, value, query, renderChildren);
export const comboboxPortal = (children: VNodeInput = []): VNode => render.combobox_portal(children);
export const comboboxInput = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.combobox_input(props, children);
export const comboboxContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.combobox_content(props, children);
export const comboboxItem = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.combobox_item(value, props, renderChildren);
export const comboboxIndicator = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.combobox_indicator(props, children);
export const multiselectRoot = (
  open: Signal<boolean>,
  values: Signal<string[]>,
  renderChildren: () => ComponentRenderable
): VNode => render.multiselect_root(open, values, renderChildren);
export const multiselectPortal = (children: VNodeInput = []): VNode => render.multiselect_portal(children);
export const multiselectTrigger = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.multiselect_trigger(props, children);
export const multiselectContent = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.multiselect_content(props, children);
export const multiselectItem = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.multiselect_item(value, props, renderChildren);
export const multiselectIndicator = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.multiselect_indicator(props, children);
export const checkboxRoot = (
  checked: Signal<boolean>,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.checkbox_root(checked, props, renderChildren);
export const checkboxIndicator = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.checkbox_indicator(props, children);
export const radioGroup = (
  value: Signal<string>,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.radio_group(value, props, renderChildren);
export const radioItem = (
  value: string,
  props: Record<string, unknown> | null | undefined,
  renderChildren: () => ComponentRenderable
): VNode => render.radio_item(value, props, renderChildren);
export const radioIndicator = (
  props: Record<string, unknown> | null | undefined,
  children: VNodeInput = []
): VNode => render.radio_indicator(props, children);
export const vnode = (tag: string, attrs?: Record<string, unknown> | null, children: VNodeInput = []): VNode =>
  render.element(tag, attrs, children);
export const text = (value: unknown): VNode => render.text(value);
export const liveText = (signal: Signal<unknown> | Memo<unknown>): VNode => render.liveText(signal);
export const indexList = (
  itemsSignal: Signal<unknown>,
  renderItem: (item: Signal<unknown>, index: number) => VNodeInput
): VNode => render.indexList(itemsSignal, renderItem);
export const forList = (
  itemsSignal: Signal<unknown>,
  keyOf: (item: unknown, index: number) => string | number,
  renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
): VNode => render.forList(itemsSignal, keyOf, renderItem);
export const mount_reactive = (
  renderer: unknown,
  container: unknown,
  view: () => VNode
): ReturnType<typeof render.mount_reactive> =>
  render.mount_reactive(renderer, container, view);
export const props_empty = (): Record<string, unknown> => render.props_empty();
export const props_class = (className: string): Record<string, unknown> => render.props_class(className);
export const props_on_click = (handler: (() => unknown) | null | undefined): Record<string, unknown> =>
  render.props_on_click(handler);
export const props_on_click_delta = (signal: Signal<number>, delta: number): Record<string, unknown> =>
  render.props_on_click_delta(signal, delta);
export const props_on_click_inc = (signal: Signal<number>): Record<string, unknown> => render.props_on_click_inc(signal);
export const props_on_click_dec = (signal: Signal<number>): Record<string, unknown> => render.props_on_click_dec(signal);
export const props_id = (id: string): Record<string, unknown> => render.props_id(id);
export const props_style = (style: string): Record<string, unknown> => render.props_style(style);
export const props_value = (value: string): Record<string, unknown> => render.props_value(value);
export const props_checked = (checked: boolean): Record<string, unknown> => render.props_checked(checked);
export const props_type = (type: string): Record<string, unknown> => render.props_type(type);
export const props_name = (name: string): Record<string, unknown> => render.props_name(name);
export const props_placeholder = (placeholder: string): Record<string, unknown> => render.props_placeholder(placeholder);
export const props_href = (href: string): Record<string, unknown> => render.props_href(href);
export const props_disabled = (disabled: boolean): Record<string, unknown> => render.props_disabled(disabled);
export const props_on_input = (handler: (value: string) => unknown): Record<string, unknown> => render.props_on_input(handler);
export const props_on_change = (handler: (value: string) => unknown): Record<string, unknown> => render.props_on_change(handler);
export const props_on_checked_change = (handler: (checked: boolean) => unknown): Record<string, unknown> =>
  render.props_on_checked_change(handler);
export const props_on_submit = (handler: (() => unknown) | null | undefined): Record<string, unknown> =>
  render.props_on_submit(handler);
export const props_key = (key: unknown): Record<string, unknown> => render.props_key(key);
export const props_attr = (name: string, value: unknown): Record<string, unknown> => render.props_attr(name, value);
export const props_when = (condition: unknown, props: unknown): Record<string, unknown> =>
  render.props_when(condition, props);
export const props_merge = (left: unknown, right: unknown): Record<string, unknown> => render.props_merge(left, right);
export const dom_get_element_by_id = (id: string): unknown => render.dom_get_element_by_id(id);
export const transitionPresence = (
  open: Signal<boolean>,
  props: Record<string, unknown> | null | undefined,
  durationMs: number,
  renderChildren: () => ComponentRenderable
): VNode => render.transition_presence(open, props, durationMs, renderChildren);
export const testingGetByText = (scope: unknown, value: string): unknown => render.testing_get_by_text(scope, value);
export const testingGetByRole = (scope: unknown, role: string): unknown => render.testingGetByRole(scope, role);
export const testingQueryAllByRole = (scope: unknown, role: string): unknown =>
  render.testing_query_all_by_role(scope, role);
export const devtoolsSnapshot = (): DevtoolsSnapshot => render.devtools_snapshot();
export const installDevtools = (key?: string): Record<string, unknown> => render.install_devtools(key);
export const ssgPage = (body: unknown, options?: unknown): string => render.ssg_page(body, options);
export const ssgRenderApp = <P>(
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P,
  options?: unknown
): string => render.ssg_render_app(componentFn, props, options);
export const ssgWritePage = (filePath: string, body: unknown, options?: unknown): string =>
  render.ssg_write_page(filePath, body, options);
export const ssgWriteApp = <P>(
  filePath: string,
  componentFn: ComponentFunction<P, ComponentRenderable>,
  props: P,
  options?: unknown
): string => render.ssg_write_app(filePath, componentFn, props, options);

export const reactive = {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  disposeEffect: render.dispose_effect,
  updateSignal: render.update_signal,
  batch: render.batch,
  untrack: render.untrack,
};

const mapHashMapValues = <K, V, U>(map: HashMap<K, V>, mapper: (value: V) => U): HashMap<K, U> => {
  const out = HashMap.new<K, U>();
  for (const key of map.keys()) {
    const current = map.get(key);
    if (current && typeof current === 'object' && (current as { $tag?: string }).$tag === 'Some') {
      out.insert(key, mapper((current as unknown as { $payload: V }).$payload));
    }
  }
  return out;
};

const pureHashMap = <K, V>(key: K, value: V): HashMap<K, V> => {
  const out = HashMap.new<K, V>();
  out.insert(key, value);
  return out;
};

const apHashMapValues = <K, A, B>(
  fns: HashMap<K, (input: A) => B>,
  values: HashMap<K, A>
): HashMap<K, B> => {
  const out = HashMap.new<K, B>();
  for (const key of fns.keys()) {
    const fnEntry = fns.get(key);
    const valueEntry = values.get(key);
    if (
      !fnEntry ||
      typeof fnEntry !== 'object' ||
      (fnEntry as { $tag?: string }).$tag !== 'Some' ||
      !valueEntry ||
      typeof valueEntry !== 'object' ||
      (valueEntry as { $tag?: string }).$tag !== 'Some'
    ) {
      continue;
    }
    const fn = (fnEntry as unknown as { $payload: unknown }).$payload;
    if (typeof fn !== 'function') continue;
    out.insert(key, (fn as (input: A) => B)((valueEntry as unknown as { $payload: A }).$payload));
  }
  return out;
};

const flatMapHashMapValues = <K, A, B>(
  values: HashMap<K, A>,
  mapper: (input: A) => HashMap<K, B>
): HashMap<K, B> => {
  const out = HashMap.new<K, B>();
  for (const key of values.keys()) {
    const current = values.get(key);
    if (!current || typeof current !== 'object' || (current as { $tag?: string }).$tag !== 'Some') continue;
    const mapped = mapper((current as unknown as { $payload: A }).$payload);
    if (!(mapped instanceof HashMap)) continue;
    for (const mappedKey of mapped.keys()) {
      const mappedValue = mapped.get(mappedKey);
      if (
        mappedValue &&
        typeof mappedValue === 'object' &&
        (mappedValue as { $tag?: string }).$tag === 'Some'
      ) {
        out.insert(mappedKey, (mappedValue as unknown as { $payload: B }).$payload);
      }
    }
  }
  return out;
};

export const functor = {
  map_option: <A, B>(value: unknown, mapper: (input: A) => B): unknown => Option.map(mapper as (x: unknown) => unknown, value),
  map_result: <A, B>(value: unknown, mapper: (input: A) => B): unknown =>
    Result.map(mapper as (x: unknown) => unknown, value),
  map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => B): Vec<B> => vec.map(values, mapper),
  map_hashmap_values: <K, V, U>(values: HashMap<K, V>, mapper: (input: V) => U): HashMap<K, U> =>
    mapHashMapValues(values, mapper),
};

export const applicative = {
  pure_option: <A>(value: A): unknown => Option.Some(value),
  pure_result: <A>(value: A): unknown => Result.Ok(value),
  pure_vec: <A>(value: A): Vec<A> => Vec.from([value]),
  pure_hashmap: <K, V>(key: K, value: V): HashMap<K, V> => pureHashMap(key, value),
  ap_option: <A, B>(fns: unknown, value: unknown): unknown => {
    const fnTag = fns && typeof fns === 'object' && isEnumLike(fns) ? getEnumTag(fns) : '';
    const valueTag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (fnTag !== 'Some' || valueTag !== 'Some') return Option.None;
    const fn = getEnumPayload(fns as LuminaEnumLike);
    if (typeof fn !== 'function') return Option.None;
    return Option.Some((fn as (arg: A) => B)(getEnumPayload(value as LuminaEnumLike) as A));
  },
  ap_result: <A, B>(fns: unknown, value: unknown): unknown => {
    const fnTag = fns && typeof fns === 'object' && isEnumLike(fns) ? getEnumTag(fns) : '';
    if (fnTag !== 'Ok') return fns;
    const valueTag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (valueTag !== 'Ok') return value;
    const fn = getEnumPayload(fns as LuminaEnumLike);
    if (typeof fn !== 'function') return Result.Err('Result ap expected Ok(function)');
    return Result.Ok((fn as (arg: A) => B)(getEnumPayload(value as LuminaEnumLike) as A));
  },
  ap_vec: <A, B>(fns: Vec<(input: A) => B>, values: Vec<A>): Vec<B> => {
    const out = Vec.new<B>();
    for (const fn of fns) {
      for (const value of values) {
        out.push(fn(value));
      }
    }
    return out;
  },
  ap_hashmap_values: <K, A, B>(fns: HashMap<K, (input: A) => B>, values: HashMap<K, A>): HashMap<K, B> =>
    apHashMapValues(fns, values),
};

export const monad = {
  flat_map_option: <A>(value: unknown, mapper: (input: A) => unknown): unknown =>
    Option.and_then(mapper as (x: unknown) => unknown, value),
  flat_map_result: <A>(value: unknown, mapper: (input: A) => unknown): unknown =>
    Result.and_then(mapper as (x: unknown) => unknown, value),
  flat_map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => Vec<B>): Vec<B> => {
    const out = Vec.new<B>();
    for (const value of values) {
      const mapped = mapper(value);
      if (!(mapped instanceof Vec)) continue;
      for (const inner of mapped) out.push(inner);
    }
    return out;
  },
  flat_map_hashmap_values: <K, A, B>(values: HashMap<K, A>, mapper: (input: A) => HashMap<K, B>): HashMap<K, B> =>
    flatMapHashMapValues(values, mapper),
  join_option: (value: unknown): unknown => Option.and_then((v) => v, value),
  join_result: (value: unknown): unknown => Result.and_then((v) => v, value),
  join_vec: <A>(values: Vec<Vec<A>>): Vec<A> => {
    const out = Vec.new<A>();
    for (const inner of values) {
      if (!(inner instanceof Vec)) continue;
      for (const value of inner) out.push(value);
    }
    return out;
  },
  join_hashmap_values: <K, A>(values: HashMap<K, HashMap<K, A>>): HashMap<K, A> =>
    flatMapHashMapValues(values, (inner) => inner),
};

export const foldable = {
  fold_option: <A, B>(value: unknown, init: B, folder: (acc: B, input: A) => B): B => {
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag !== 'Some') return init;
    return folder(init, getEnumPayload(value as LuminaEnumLike) as A);
  },
  fold_result: <A, B>(value: unknown, init: B, folder: (acc: B, input: A) => B): B => {
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag !== 'Ok') return init;
    return folder(init, getEnumPayload(value as LuminaEnumLike) as A);
  },
  fold_vec: <A, B>(values: Vec<A>, init: B, folder: (acc: B, input: A) => B): B => vec.fold(values, init, folder),
  fold_hashmap_values: <K, V, B>(
    values: HashMap<K, V>,
    init: B,
    folder: (acc: B, input: V) => B
  ): B => {
    let acc = init;
    for (const value of values.values()) {
      acc = folder(acc, value);
    }
    return acc;
  },
};

export const traversable = {
  traverse_vec_option: <A, B>(values: Vec<A>, mapper: (input: A) => unknown): unknown => {
    const out = Vec.new<B>();
    for (const value of values) {
      const mapped = mapper(value);
      const tag = mapped && typeof mapped === 'object' && isEnumLike(mapped) ? getEnumTag(mapped) : '';
      if (tag !== 'Some') return Option.None;
      out.push(getEnumPayload(mapped as LuminaEnumLike) as B);
    }
    return Option.Some(out);
  },
  traverse_vec_result: <A, B>(values: Vec<A>, mapper: (input: A) => unknown): unknown => {
    const out = Vec.new<B>();
    for (const value of values) {
      const mapped = mapper(value);
      const tag = mapped && typeof mapped === 'object' && isEnumLike(mapped) ? getEnumTag(mapped) : '';
      if (tag !== 'Ok') return mapped;
      out.push(getEnumPayload(mapped as LuminaEnumLike) as B);
    }
    return Result.Ok(out);
  },
  sequence_vec_option: (values: Vec<unknown>): unknown =>
    traversable.traverse_vec_option(values, (item: unknown) => item as unknown),
  sequence_vec_result: (values: Vec<unknown>): unknown =>
    traversable.traverse_vec_result(values, (item: unknown) => item as unknown),
};

export function __set(obj: Record<string, unknown>, prop: string, value: unknown) {
  obj[prop] = value;
  return value;
}
