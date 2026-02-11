import { TextDocument } from 'vscode-languageserver-textdocument';
import { type ModuleExport, type ModuleFunction } from '../lumina/module-registry.js';
import { type Type, type TypeScheme } from '../lumina/types.js';
import { type SymbolInfo } from '../lumina/semantic.js';

export type SignatureData = { label: string; parameters: string[] };
export type SignatureHelpData = { signature: SignatureData; activeParam: number };

export type HoverSignatureContext = {
  doc: TextDocument;
  position: { line: number; character: number };
  symbols?: { get(name: string): SymbolInfo | undefined };
  moduleBindings?: Map<string, ModuleExport>;
  preludeExportMap?: Map<string, ModuleExport>;
  resolveImportedSymbol?: (name: string) => SymbolInfo | undefined;
};

export function getWordAt(doc: TextDocument, line: number, character: number): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (offset < 0 || offset >= text.length) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  if (start === end) return null;
  const word = text.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return null;
  return word;
}

export function findMemberAt(
  doc: TextDocument,
  line: number,
  character: number
): { base: string; member: string } | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (offset < 0 || offset > text.length) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  const word = text.slice(start, end);
  if (!word) return null;
  const leftDot = start - 1;
  if (leftDot >= 0 && text[leftDot] === '.') {
    let baseEnd = leftDot;
    let baseStart = baseEnd - 1;
    while (baseStart >= 0 && isIdent(text[baseStart])) baseStart--;
    baseStart++;
    const base = text.slice(baseStart, baseEnd);
    if (base) return { base, member: word };
  }
  if (text[end] === '.') {
    let memberStart = end + 1;
    let memberEnd = memberStart;
    while (memberEnd < text.length && isIdent(text[memberEnd])) memberEnd++;
    const member = text.slice(memberStart, memberEnd);
    if (member) return { base: word, member };
  }
  return null;
}

export function findCallContext(
  doc: TextDocument,
  line: number,
  character: number
): { callee: string; argIndex: number } | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  let depth = 0;
  let openIndex = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth--;
    }
  }
  if (openIndex === -1) return null;
  let end = openIndex - 1;
  while (end >= 0 && /\s/.test(text[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_.]/.test(text[start])) start--;
  start++;
  const callee = text.slice(start, end + 1);
  if (!callee) return null;
  let argIndex = 0;
  let innerDepth = 0;
  for (let i = openIndex + 1; i < offset; i++) {
    const ch = text[i];
    if (ch === '(') innerDepth++;
    else if (ch === ')') innerDepth = Math.max(0, innerDepth - 1);
    else if (ch === ',' && innerDepth === 0) argIndex++;
  }
  return { callee, argIndex };
}

function formatSignature(
  name: string,
  paramTypes: string[],
  returnType?: string,
  paramNames?: string[]
): SignatureData {
  const parameters = paramTypes.map((type, idx) => {
    const label = paramNames?.[idx];
    return label ? `${label}: ${type}` : type;
  });
  const ret = returnType ?? 'void';
  return {
    label: `${name}(${parameters.join(', ')}) -> ${ret}`,
    parameters,
  };
}

function formatTypeFromScheme(type: Type, typeVars: Map<number, string>): string {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'variable':
      return typeVars.get(type.id) ?? `T${type.id}`;
    case 'function': {
      const args = type.args.map((arg) => formatTypeFromScheme(arg, typeVars)).join(', ');
      const ret = formatTypeFromScheme(type.returnType, typeVars);
      return `(${args}) -> ${ret}`;
    }
    case 'adt': {
      if (type.params.length === 0) return type.name;
      const params = type.params.map((param) => formatTypeFromScheme(param, typeVars)).join(', ');
      return `${type.name}<${params}>`;
    }
    default:
      return 'unknown';
  }
}

function makeTypeVarMap(scheme: TypeScheme): Map<number, string> {
  const names = ['T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const map = new Map<number, string>();
  scheme.variables.forEach((id, idx) => {
    const base = names[idx] ?? 'T';
    map.set(id, idx < names.length ? base : `${base}${idx}`);
  });
  return map;
}

function formatSignatureFromScheme(
  name: string,
  scheme: TypeScheme,
  paramNames?: string[]
): SignatureData | null {
  if (scheme.type.kind !== 'function') return null;
  const typeVars = makeTypeVarMap(scheme);
  const params = scheme.type.args.map((arg) => formatTypeFromScheme(arg, typeVars));
  const returnType = formatTypeFromScheme(scheme.type.returnType, typeVars);
  return formatSignature(name, params, returnType, paramNames);
}

function signatureFromModule(fn: ModuleFunction): SignatureData {
  return formatSignatureFromScheme(fn.name, fn.hmType, fn.paramNames) ?? formatSignature(fn.name, fn.paramTypes, fn.returnType, fn.paramNames);
}

export function resolveHoverLabel(ctx: HoverSignatureContext): string | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const member = findMemberAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (member) {
    const mod = moduleBindings.get(member.base);
    if (mod?.kind === 'module') {
      const exp = mod.exports.get(member.member);
      if (exp?.kind === 'function') {
        return signatureFromModule(exp).label;
      }
    }
  }

  const word = getWordAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (!word) return null;
  const binding = moduleBindings.get(word);
  if (binding?.kind === 'function') {
    return signatureFromModule(binding).label;
  }
  const sym = ctx.symbols?.get(word);
  if (sym?.kind === 'function') {
    return formatSignature(word, sym.paramTypes ?? [], sym.type, sym.paramNames).label;
  }
  const imported = ctx.resolveImportedSymbol?.(word);
  if (imported?.kind === 'function') {
    return formatSignature(word, imported.paramTypes ?? [], imported.type, imported.paramNames).label;
  }
  const prelude = ctx.preludeExportMap?.get(word);
  if (prelude?.kind === 'function') {
    return signatureFromModule(prelude).label;
  }
  return null;
}

export function resolveSignatureHelp(ctx: HoverSignatureContext): SignatureHelpData | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const call = findCallContext(ctx.doc, ctx.position.line, ctx.position.character);
  if (!call) return null;

  let signature: SignatureData | null = null;
  if (call.callee.includes('.')) {
    const [base, member] = call.callee.split('.', 2);
    const mod = moduleBindings.get(base);
    if (mod?.kind === 'module') {
      const exp = mod.exports.get(member);
      if (exp?.kind === 'function') {
        signature = signatureFromModule(exp);
      }
    }
  } else {
    const sym = ctx.symbols?.get(call.callee);
    if (sym?.kind === 'function') {
      signature = formatSignature(call.callee, sym.paramTypes ?? [], sym.type, sym.paramNames);
    } else {
      const binding = moduleBindings.get(call.callee);
      if (binding?.kind === 'function') {
        signature = signatureFromModule(binding);
      }
      if (!signature) {
        const imported = ctx.resolveImportedSymbol?.(call.callee);
        if (imported?.kind === 'function') {
          signature = formatSignature(call.callee, imported.paramTypes ?? [], imported.type, imported.paramNames);
        }
      }
      if (!signature) {
        const prelude = ctx.preludeExportMap?.get(call.callee);
        if (prelude?.kind === 'function') {
          signature = signatureFromModule(prelude);
        }
      }
    }
  }

  if (!signature) return null;
  const activeParam = Math.max(0, Math.min(call.argIndex, signature.parameters.length > 0 ? signature.parameters.length - 1 : 0));
  return { signature, activeParam };
}
