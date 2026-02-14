import { normalizeTypeForComparison } from './type-utils.js';

export interface TraitMethodResolution {
  traitName: string;
  traitType: string;
  forType: string;
  methodName: string;
  mangledName: string;
}

const sanitizeSegment = (value: string): string =>
  value
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

export function mangleTraitMethodName(traitType: string, forType: string, methodName: string): string {
  const traitSegment = sanitizeSegment(normalizeTypeForComparison(traitType));
  const forSegment = sanitizeSegment(normalizeTypeForComparison(forType));
  const methodSegment = sanitizeSegment(methodName);
  return `${traitSegment}$${forSegment}$${methodSegment}`;
}
