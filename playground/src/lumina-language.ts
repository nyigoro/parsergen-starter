import { StreamLanguage, StringStream, type StreamParser } from '@codemirror/language';
import { tags } from '@lezer/highlight';

type LuminaState = {
  blockCommentDepth: number;
  pendingDefinition: 'value' | 'type' | 'module' | null;
  afterDot: boolean;
};

const definitionKeywords = new Map<string, LuminaState['pendingDefinition']>([
  ['const', 'value'],
  ['enum', 'type'],
  ['fn', 'value'],
  ['let', 'value'],
  ['module', 'module'],
  ['trait', 'type'],
  ['type', 'type'],
]);

const controlKeywords = new Set([
  'break',
  'continue',
  'else',
  'if',
  'loop',
  'match',
  'return',
  'while',
]);
const moduleKeywords = new Set(['as', 'export', 'from', 'import', 'use']);
const modifierKeywords = new Set(['async', 'extern', 'impl', 'mut', 'pub', 'where']);
const plainKeywords = new Set(['await', 'for', 'in', 'key']);
const builtinTypes = new Set([
  'bool',
  'char',
  'f32',
  'f64',
  'float',
  'i32',
  'i64',
  'int',
  'never',
  'string',
  'u32',
  'u64',
  'unit',
  'void',
]);
const booleanLiterals = new Set(['false', 'true']);

const readBlockComment = (stream: StringStream, state: LuminaState): string => {
  while (!stream.eol()) {
    if (stream.match('/*')) {
      state.blockCommentDepth += 1;
    } else if (stream.match('*/')) {
      state.blockCommentDepth -= 1;
      if (state.blockCommentDepth === 0) break;
    } else {
      stream.next();
    }
  }

  return 'comment';
};

const readQuotedLiteral = (stream: StringStream, quote: '"' | "'"): string => {
  stream.next();
  let escaped = false;

  while (!stream.eol()) {
    const next = stream.next();
    if (escaped) {
      escaped = false;
      continue;
    }

    if (next === '\\') {
      escaped = true;
      continue;
    }

    if (next === quote) break;
  }

  return quote === '"' ? 'string' : 'character';
};

const classifyIdentifier = (stream: StringStream, state: LuminaState, word: string): string => {
  if (definitionKeywords.has(word)) {
    state.pendingDefinition = definitionKeywords.get(word) ?? null;
    state.afterDot = false;
    return 'definitionKeyword';
  }

  if (controlKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'controlKeyword';
  }

  if (moduleKeywords.has(word)) {
    state.pendingDefinition = word === 'module' ? 'module' : null;
    state.afterDot = false;
    return 'moduleKeyword';
  }

  if (modifierKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'modifier';
  }

  if (plainKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'keyword';
  }

  if (word === 'self') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'self';
  }

  if (word === 'null') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'null';
  }

  if (booleanLiterals.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'bool';
  }

  if (builtinTypes.has(word) || /^(?:[iu]\d+|f\d+)$/.test(word) || word === 'Self') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'typeName';
  }

  const wasAfterDot = state.afterDot;
  const pendingDefinition = state.pendingDefinition;
  state.pendingDefinition = null;
  state.afterDot = false;

  if (wasAfterDot) return 'propertyName';

  if (pendingDefinition === 'type' || pendingDefinition === 'module') return 'typeDefinition';
  if (pendingDefinition === 'value') return 'valueDefinition';

  if (/^[A-Z]/.test(word)) return 'typeName';
  if (stream.match(/^\s*\(/, false)) return 'callName';

  return 'variableName';
};

const luminaStreamParser: StreamParser<LuminaState> = {
  name: 'lumina',
  startState: () => ({
    blockCommentDepth: 0,
    pendingDefinition: null,
    afterDot: false,
  }),
  token(stream, state) {
    if (state.blockCommentDepth > 0) return readBlockComment(stream, state);
    if (stream.eatSpace()) return null;

    if (stream.match('//')) {
      state.pendingDefinition = null;
      state.afterDot = false;
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match('/*')) {
      state.pendingDefinition = null;
      state.afterDot = false;
      state.blockCommentDepth = 1;
      return readBlockComment(stream, state);
    }

    const next = stream.peek();
    if (next === '"' || next === "'") {
      state.pendingDefinition = null;
      state.afterDot = false;
      return readQuotedLiteral(stream, next);
    }

    if (stream.match(/^(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?)/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'number';
    }

    if (stream.match(/^(?:->|=>|::|==|!=|<=|>=|\+=|-=|\*=|\/=|&&|\|\||\.\.)/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'operator';
    }

    if (stream.match(/^[{}]/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'brace';
    }

    if (stream.match(/^[()]/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'paren';
    }

    if (stream.match(/^(?:\[|\])/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'squareBracket';
    }

    if (stream.match(/^[,;]/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'separator';
    }

    if (stream.match(/^[:?]/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'punctuation';
    }

    if (stream.match(/^\./)) {
      state.pendingDefinition = null;
      state.afterDot = true;
      return 'punctuation';
    }

    if (stream.match(/^[+\-*/%=&|!<>]/)) {
      state.pendingDefinition = null;
      state.afterDot = false;
      return 'operator';
    }

    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      return classifyIdentifier(stream, state, stream.current());
    }

    state.pendingDefinition = null;
    state.afterDot = false;
    stream.next();
    return 'invalid';
  },
  languageData: {
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
  tokenTable: {
    bool: tags.bool,
    brace: tags.brace,
    callName: tags.function(tags.variableName),
    character: tags.character,
    comment: tags.comment,
    controlKeyword: tags.controlKeyword,
    definitionKeyword: tags.definitionKeyword,
    invalid: tags.invalid,
    keyword: tags.keyword,
    modifier: tags.modifier,
    moduleKeyword: tags.moduleKeyword,
    null: tags.null,
    number: tags.number,
    operator: tags.operator,
    paren: tags.paren,
    propertyName: tags.propertyName,
    punctuation: tags.punctuation,
    self: tags.self,
    separator: tags.separator,
    squareBracket: tags.squareBracket,
    string: tags.string,
    typeDefinition: tags.definition(tags.typeName),
    typeName: tags.typeName,
    valueDefinition: tags.definition(tags.variableName),
    variableName: tags.variableName,
  },
};

export const luminaLanguage = StreamLanguage.define(luminaStreamParser);
