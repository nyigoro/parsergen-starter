import type { LuminaTypeParam } from './ast.js';
import { kindFromArity, type Kind } from './kinds.js';

export function inferTypeParamKinds(
  params: ReadonlyArray<LuminaTypeParam> | undefined
): Map<string, Kind> {
  const kinds = new Map<string, Kind>();
  for (const param of params ?? []) {
    const arity = Math.max(0, Math.trunc(Number(param.higherKindArity ?? 0)));
    kinds.set(param.name, kindFromArity(arity));
  }
  return kinds;
}

