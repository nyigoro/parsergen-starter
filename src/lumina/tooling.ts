import path from 'node:path';
import type {
  LuminaProgram,
  LuminaStatement,
  LuminaFnDecl,
  LuminaTypeExpr,
} from './ast.js';

export type LintSeverity = 'warning' | 'error';

export interface LintIssue {
  code: string;
  message: string;
  severity: LintSeverity;
  line: number;
  column: number;
}

const MAX_EMPTY_LINES = 1;

export function formatLuminaSource(source: string): string {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let emptyRun = 0;

  for (const line of lines) {
    const trimmedRight = line.replace(/[ \t]+$/g, '');
    if (trimmedRight.length === 0) {
      emptyRun += 1;
      if (emptyRun <= MAX_EMPTY_LINES) out.push('');
      continue;
    }
    emptyRun = 0;
    out.push(trimmedRight);
  }

  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }

  return `${out.join('\n')}\n`;
}

export function collectStyleLintIssues(source: string, maxLineLength = 120): LintIssue[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const issues: LintIssue[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    const trailing = line.match(/[ \t]+$/);
    if (trailing) {
      issues.push({
        code: 'LINT-TRAILING-WS',
        message: 'Trailing whitespace',
        severity: 'warning',
        line: lineNo,
        column: trailing.index! + 1,
      });
    }

    const tabIndex = line.indexOf('\t');
    if (tabIndex >= 0) {
      issues.push({
        code: 'LINT-TAB-INDENT',
        message: 'Tab indentation found; use spaces',
        severity: 'warning',
        line: lineNo,
        column: tabIndex + 1,
      });
    }

    if (line.length > maxLineLength) {
      issues.push({
        code: 'LINT-LINE-LENGTH',
        message: `Line exceeds ${maxLineLength} characters`,
        severity: 'warning',
        line: lineNo,
        column: maxLineLength + 1,
      });
    }
  }

  return issues;
}

function formatTypeExpr(typeExpr: LuminaTypeExpr | null | undefined): string {
  if (typeExpr == null) return 'void';
  if (typeof typeExpr === 'string') return typeExpr;
  if (typeof typeExpr === 'object' && 'kind' in typeExpr && typeExpr.kind === 'TypeHole') return '_';
  return String(typeExpr);
}

function formatTypeParams(
  params: Array<{ name: string; bound?: LuminaTypeExpr[] }> | undefined
): string {
  if (!params || params.length === 0) return '';
  const rendered = params.map((param) => {
    if (!param.bound || param.bound.length === 0) return param.name;
    const bounds = param.bound.map((bound) => formatTypeExpr(bound)).join(' + ');
    return `${param.name}: ${bounds}`;
  });
  return `<${rendered.join(', ')}>`;
}

function formatParams(params: Array<{ name: string; typeName: LuminaTypeExpr | null; ref?: boolean; refMut?: boolean }>): string {
  return params
    .map((param) => {
      const refPrefix = param.refMut ? 'ref mut ' : param.ref ? 'ref ' : '';
      const type = param.typeName ? `: ${formatTypeExpr(param.typeName)}` : '';
      return `${refPrefix}${param.name}${type}`;
    })
    .join(', ');
}

function formatFnSignature(fn: LuminaFnDecl): string {
  const asyncPrefix = fn.async ? 'async ' : '';
  const typeParams = formatTypeParams(fn.typeParams);
  const params = formatParams(fn.params);
  return `${asyncPrefix}fn ${fn.name}${typeParams}(${params}) -> ${formatTypeExpr(fn.returnType)}`;
}

function formatTraitMethodSignature(method: {
  name: string;
  params: Array<{ name: string; typeName: LuminaTypeExpr | null; ref?: boolean; refMut?: boolean }>;
  returnType: LuminaTypeExpr | null;
  typeParams?: Array<{ name: string; bound?: LuminaTypeExpr[] }>;
}): string {
  const typeParams = formatTypeParams(method.typeParams);
  const params = formatParams(method.params);
  return `fn ${method.name}${typeParams}(${params}) -> ${formatTypeExpr(method.returnType)}`;
}

function renderSection(title: string, rows: string[]): string {
  if (rows.length === 0) return '';
  return `## ${title}\n\n${rows.join('\n')}\n\n`;
}

function renderFunctions(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'FnDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    rows.push(`- \`${formatFnSignature(stmt)}\``);
  }
  return rows;
}

function renderStructs(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'StructDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    const typeParams = formatTypeParams(stmt.typeParams);
    rows.push(`- \`struct ${stmt.name}${typeParams}\``);
    for (const field of stmt.body) {
      rows.push(`  - \`${field.name}: ${formatTypeExpr(field.typeName)}\``);
    }
  }
  return rows;
}

function renderEnums(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'EnumDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    const typeParams = formatTypeParams(stmt.typeParams);
    rows.push(`- \`enum ${stmt.name}${typeParams}\``);
    for (const variant of stmt.variants) {
      const payload =
        variant.params.length === 0
          ? ''
          : `(${variant.params.map((param) => formatTypeExpr(param)).join(', ')})`;
      rows.push(`  - \`${variant.name}${payload}\``);
    }
  }
  return rows;
}

function renderTraits(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'TraitDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    const typeParams = formatTypeParams(stmt.typeParams);
    rows.push(`- \`trait ${stmt.name}${typeParams}\``);
    for (const assoc of stmt.associatedTypes ?? []) {
      const typeName = assoc.typeName ? ` = ${formatTypeExpr(assoc.typeName)}` : '';
      rows.push(`  - \`type ${assoc.name}${typeName}\``);
    }
    for (const method of stmt.methods) {
      rows.push(`  - \`${formatTraitMethodSignature(method)}\`${method.body ? ' _(default)_ ' : ''}`);
    }
  }
  return rows;
}

function renderImpls(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'ImplDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    const typeParams = formatTypeParams(stmt.typeParams);
    rows.push(`- \`impl${typeParams ? typeParams : ''} ${formatTypeExpr(stmt.traitType)} for ${formatTypeExpr(stmt.forType)}\``);
    for (const assoc of stmt.associatedTypes ?? []) {
      rows.push(`  - \`type ${assoc.name} = ${formatTypeExpr(assoc.typeName)}\``);
    }
    for (const method of stmt.methods) {
      rows.push(`  - \`${formatFnSignature(method)}\``);
    }
  }
  return rows;
}

function renderTypeAliases(statements: LuminaStatement[], publicOnly: boolean): string[] {
  const rows: string[] = [];
  for (const stmt of statements) {
    if (stmt.type !== 'TypeDecl') continue;
    if (publicOnly && stmt.visibility !== 'public') continue;
    const typeParams = formatTypeParams(stmt.typeParams);
    rows.push(`- \`type ${stmt.name}${typeParams}\``);
    for (const field of stmt.body) {
      rows.push(`  - \`${field.name}: ${formatTypeExpr(field.typeName)}\``);
    }
  }
  return rows;
}

export function generateLuminaDocsMarkdown(
  program: LuminaProgram,
  filePath: string,
  options?: { publicOnly?: boolean }
): string {
  const publicOnly = options?.publicOnly ?? false;
  const title = path.basename(filePath);
  const sections = [
    renderSection('Functions', renderFunctions(program.body, publicOnly)),
    renderSection('Structs', renderStructs(program.body, publicOnly)),
    renderSection('Enums', renderEnums(program.body, publicOnly)),
    renderSection('Traits', renderTraits(program.body, publicOnly)),
    renderSection('Implementations', renderImpls(program.body, publicOnly)),
    renderSection('Type Aliases', renderTypeAliases(program.body, publicOnly)),
  ].filter((chunk) => chunk.length > 0);

  if (sections.length === 0) {
    return `# ${title}\n\n_No documentable declarations found._\n`;
  }

  return `# ${title}\n\n${sections.join('')}`.trimEnd() + '\n';
}
