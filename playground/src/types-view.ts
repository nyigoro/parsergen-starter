import type { PlaygroundTypeInfo } from './compiler-bridge';

export type TypeFilter = 'all' | 'functions' | 'variables' | 'types';

export type RenderedTypeInfo = {
  declarationsHtml: string;
  expressionsHtml: string;
  footerText: string;
  declarationsCount: number;
  expressionCount: number;
};

export const escapeTypeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const typeFilterMatches = (kind: string, filter: TypeFilter): boolean => {
  const normalized = kind.toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'functions') return normalized === 'function' || normalized === 'fn';
  if (filter === 'variables') return normalized === 'variable' || normalized === 'let' || normalized === 'const';
  return normalized === 'type' || normalized === 'struct' || normalized === 'enum' || normalized === 'trait';
};

export const typeInfoToJson = (typeInfo: PlaygroundTypeInfo): string =>
  JSON.stringify(typeInfo, null, 2);

export const typeRowLocation = (dataset: { typeLine?: string; typeCol?: string }): { line: number; column: number } | null => {
  const line = Number(dataset.typeLine);
  const column = Number(dataset.typeCol);
  if (!Number.isFinite(line) || !Number.isFinite(column) || line < 1 || column < 1) return null;
  return { line, column };
};

export const renderTypesEmptyState = (): string => `<div class="types-empty-card">
  <p class="empty-state">Run Check or Run to see inferred types.</p>
  <pre class="types-hint-code"><code>fn square(x: int) -> int {
  return x * x
}</code></pre>
  <p class="types-hint-copy">Lumina infers expression types from the same HM analysis used by diagnostics.</p>
</div>`;

export const renderTypeInfoTables = (
  typeInfo: PlaygroundTypeInfo,
  filter: TypeFilter
): RenderedTypeInfo => {
  const declarations = typeInfo.declarations.filter((declaration) => typeFilterMatches(declaration.kind, filter));
  const declarationsHtml =
    declarations.length === 0
      ? '<p class="empty-state">No declarations match this filter.</p>'
      : `<table class="types-table">
  <thead>
    <tr><th>Name</th><th>Kind</th><th>Type</th></tr>
  </thead>
  <tbody>
    ${declarations
      .map(
        (declaration) => `<tr>
      <td><code>${escapeTypeHtml(declaration.name)}</code></td>
      <td><span class="type-kind-badge" data-kind="${escapeTypeHtml(declaration.kind)}">${escapeTypeHtml(declaration.kind)}</span></td>
      <td><code>${escapeTypeHtml(declaration.typeStr)}</code></td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>`;

  const expressionsHtml =
    typeInfo.exprTypes.length === 0
      ? '<p class="empty-state">No expression types were emitted for this source.</p>'
      : `<table class="types-table types-expression-table">
  <thead>
    <tr><th>Line</th><th>Preview</th><th>Inferred Type</th></tr>
  </thead>
  <tbody>
    ${typeInfo.exprTypes
      .map(
        (expr) => `<tr class="type-expression-row" tabindex="0" data-type-row="expression" data-type-line="${expr.startLine}" data-type-col="${expr.startCol}">
      <td>${expr.startLine}:${expr.startCol}</td>
      <td><code>${escapeTypeHtml(expr.preview)}</code></td>
      <td><code>${escapeTypeHtml(expr.typeStr)}</code></td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>`;

  return {
    declarationsHtml,
    expressionsHtml,
    footerText: `${typeInfo.declarations.length} declarations · ${typeInfo.exprTypes.length} expression types`,
    declarationsCount: typeInfo.declarations.length,
    expressionCount: typeInfo.exprTypes.length,
  };
};
