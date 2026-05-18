const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const jsKeywords = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'let',
  'new',
  'of',
  'return',
  'static',
  'switch',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'yield',
]);

const jsLiterals = new Set(['false', 'null', 'true', 'undefined']);

const watForms = new Set([
  'module',
  'func',
  'import',
  'export',
  'memory',
  'global',
  'local',
  'param',
  'result',
  'type',
  'table',
  'elem',
  'data',
  'start',
]);

const watTypes = new Set(['i32', 'i64', 'f32', 'f64', 'funcref', 'externref', 'mut']);

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);

const span = (kind: string, value: string): string =>
  `<span class="code-token syntax-${kind}">${escapeHtml(value)}</span>`;

const isWhitespace = (char: string): boolean => /\s/.test(char);
const isIdentifierStart = (char: string): boolean => /[A-Za-z_$]/.test(char);
const isIdentifierPart = (char: string): boolean => /[A-Za-z0-9_$]/.test(char);
const isDigit = (char: string): boolean => /[0-9]/.test(char);

const readWhile = (source: string, start: number, predicate: (char: string) => boolean): number => {
  let index = start;
  while (index < source.length && predicate(source[index] ?? '')) index += 1;
  return index;
};

const readQuoted = (source: string, start: number, quote: string): number => {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index] ?? '';
    if (char === '\\') {
      index += 2;
      continue;
    }
    index += 1;
    if (char === quote) break;
  }
  return index;
};

export const renderHighlightedJavaScript = (source: string): string => {
  let html = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (isWhitespace(char)) {
      const end = readWhile(source, index, isWhitespace);
      html += escapeHtml(source.slice(index, end));
      index = end;
      continue;
    }

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      html += span('comment', source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      html += span('comment', source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const end = readQuoted(source, index, char);
      html += span('string', source.slice(index, end));
      index = end;
      continue;
    }

    if (isDigit(char)) {
      const end = readWhile(source, index, (value) => /[0-9A-Fa-f._xob]/.test(value));
      html += span('number', source.slice(index, end));
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      const end = readWhile(source, index, isIdentifierPart);
      const word = source.slice(index, end);
      const lookahead = source.slice(end).match(/^\s*\(/);
      const kind = jsKeywords.has(word)
        ? 'keyword'
        : jsLiterals.has(word)
          ? 'literal'
          : lookahead
            ? 'function'
            : 'identifier';
      html += span(kind, word);
      index = end;
      continue;
    }

    const kind = /[{}()[\],.;:]/.test(char) ? 'punctuation' : 'operator';
    html += span(kind, char);
    index += 1;
  }
  return html;
};

export const renderHighlightedWat = (source: string): string => {
  let html = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (isWhitespace(char)) {
      const end = readWhile(source, index, isWhitespace);
      html += escapeHtml(source.slice(index, end));
      index = end;
      continue;
    }

    if (char === ';' && next === ';') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      html += span('comment', source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '(' && next === ';') {
      const end = source.indexOf(';)', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      html += span('comment', source.slice(index, stop));
      index = stop;
      continue;
    }

    if (char === '"') {
      const end = readQuoted(source, index, char);
      html += span('string', source.slice(index, end));
      index = end;
      continue;
    }

    if (char === '(' || char === ')') {
      html += span('punctuation', char);
      index += 1;
      continue;
    }

    if (char === '$') {
      const end = readWhile(source, index + 1, (value) => !isWhitespace(value) && value !== '(' && value !== ')');
      html += span('variable', source.slice(index, end));
      index = end;
      continue;
    }

    if (isDigit(char) || ((char === '-' || char === '+') && isDigit(next))) {
      const end = readWhile(source, index, (value) => /[0-9A-Fa-f._x+-]/.test(value));
      html += span('number', source.slice(index, end));
      index = end;
      continue;
    }

    const end = readWhile(source, index, (value) => !isWhitespace(value) && value !== '(' && value !== ')');
    const word = source.slice(index, end);
    const kind = watForms.has(word) ? 'keyword' : watTypes.has(word) ? 'type' : 'instruction';
    html += span(kind, word);
    index = end;
  }
  return html;
};
