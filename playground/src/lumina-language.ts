import { defineLanguageFacet, Language, languageDataProp } from '@codemirror/language';
import { NodeSet, NodeType, Parser, Tree, type Input, type PartialParse, type TreeFragment } from '@lezer/common';
import { styleTags, tags } from '@lezer/highlight';

type TokenKind =
  | 'LineComment'
  | 'BlockComment'
  | 'String'
  | 'Character'
  | 'Number'
  | 'DefinitionKeyword'
  | 'ControlKeyword'
  | 'ModuleKeyword'
  | 'Modifier'
  | 'Keyword'
  | 'Self'
  | 'Null'
  | 'Bool'
  | 'TypeName'
  | 'TypeDefinition'
  | 'ValueDefinition'
  | 'ModuleDefinition'
  | 'PropertyName'
  | 'CallName'
  | 'VariableName'
  | 'Operator'
  | 'Brace'
  | 'Paren'
  | 'SquareBracket'
  | 'Separator'
  | 'Punctuation'
  | 'Invalid';

type Token = {
  kind: TokenKind;
  from: number;
  to: number;
};

type ScanState = {
  pendingDefinition: 'value' | 'type' | 'module' | null;
  afterDot: boolean;
};

const languageData = {
  closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
  commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
};

const dataFacet = defineLanguageFacet(languageData);
const topNode = NodeType.define({
  id: 0,
  name: 'Lumina',
  top: true,
  props: [[languageDataProp, dataFacet]],
});

const tokenNames: TokenKind[] = [
  'LineComment',
  'BlockComment',
  'String',
  'Character',
  'Number',
  'DefinitionKeyword',
  'ControlKeyword',
  'ModuleKeyword',
  'Modifier',
  'Keyword',
  'Self',
  'Null',
  'Bool',
  'TypeName',
  'TypeDefinition',
  'ValueDefinition',
  'ModuleDefinition',
  'PropertyName',
  'CallName',
  'VariableName',
  'Operator',
  'Brace',
  'Paren',
  'SquareBracket',
  'Separator',
  'Punctuation',
  'Invalid',
];

const typeByName = new Map<TokenKind | 'Lumina', NodeType>([['Lumina', topNode]]);
const baseNodeSet = new NodeSet([
  topNode,
  ...tokenNames.map((name, index) => {
    const type = NodeType.define({ id: index + 1, name });
    typeByName.set(name, type);
    return type;
  }),
]);

const nodeSet = baseNodeSet.extend(
  styleTags({
    'LineComment BlockComment': tags.comment,
    String: tags.string,
    Character: tags.character,
    Number: tags.number,
    DefinitionKeyword: tags.definitionKeyword,
    ControlKeyword: tags.controlKeyword,
    ModuleKeyword: tags.moduleKeyword,
    Modifier: tags.modifier,
    Keyword: tags.keyword,
    Self: tags.self,
    Null: tags.null,
    Bool: tags.bool,
    TypeName: tags.typeName,
    TypeDefinition: tags.definition(tags.typeName),
    ValueDefinition: tags.definition(tags.variableName),
    ModuleDefinition: tags.definition(tags.namespace),
    PropertyName: tags.propertyName,
    CallName: tags.function(tags.variableName),
    VariableName: tags.variableName,
    Operator: tags.operator,
    Brace: tags.brace,
    Paren: tags.paren,
    SquareBracket: tags.squareBracket,
    Separator: tags.separator,
    Punctuation: tags.punctuation,
    Invalid: tags.invalid,
  })
);

const nodeType = (kind: TokenKind | 'Lumina'): NodeType => nodeSet.types[typeByName.get(kind)?.id ?? 0];

const definitionKeywords = new Map<string, ScanState['pendingDefinition']>([
  ['const', 'value'],
  ['enum', 'type'],
  ['fn', 'value'],
  ['let', 'value'],
  ['module', 'module'],
  ['trait', 'type'],
  ['type', 'type'],
]);

const controlKeywords = new Set(['break', 'continue', 'else', 'if', 'loop', 'match', 'return', 'while']);
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
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*/;
const numberPattern = /^(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?)/;
const multiCharOperatorPattern = /^(?:->|=>|::|==|!=|<=|>=|\+=|-=|\*=|\/=|&&|\|\||\.\.)/;

const token = (kind: TokenKind, from: number, to: number): Token => ({ kind, from, to });

const skipQuoted = (source: string, start: number, quote: '"' | "'"): number => {
  let index = start + 1;
  let escaped = false;
  while (index < source.length) {
    const char = source[index];
    index += 1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) break;
  }
  return index;
};

const skipTripleString = (source: string, start: number): number => {
  const end = source.indexOf('"""', start + 3);
  return end === -1 ? source.length : end + 3;
};

const skipBlockComment = (source: string, start: number): number => {
  let depth = 1;
  let index = start + 2;
  while (index < source.length && depth > 0) {
    if (source.startsWith('/*', index)) {
      depth += 1;
      index += 2;
      continue;
    }
    if (source.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      continue;
    }
    index += 1;
  }
  return index;
};

const classifyIdentifier = (source: string, from: number, to: number, state: ScanState): TokenKind => {
  const word = source.slice(from, to);
  if (definitionKeywords.has(word)) {
    state.pendingDefinition = definitionKeywords.get(word) ?? null;
    state.afterDot = false;
    return 'DefinitionKeyword';
  }
  if (controlKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'ControlKeyword';
  }
  if (moduleKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'ModuleKeyword';
  }
  if (modifierKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'Modifier';
  }
  if (plainKeywords.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'Keyword';
  }
  if (word === 'self') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'Self';
  }
  if (word === 'null') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'Null';
  }
  if (booleanLiterals.has(word)) {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'Bool';
  }
  if (builtinTypes.has(word) || /^(?:[iu]\d+|f\d+)$/.test(word) || word === 'Self') {
    state.pendingDefinition = null;
    state.afterDot = false;
    return 'TypeName';
  }

  const wasAfterDot = state.afterDot;
  const pendingDefinition = state.pendingDefinition;
  state.pendingDefinition = null;
  state.afterDot = false;

  if (wasAfterDot) return 'PropertyName';
  if (pendingDefinition === 'type') return 'TypeDefinition';
  if (pendingDefinition === 'module') return 'ModuleDefinition';
  if (pendingDefinition === 'value') return 'ValueDefinition';
  if (/^[A-Z]/.test(word)) return 'TypeName';
  if (/^\s*\(/.test(source.slice(to))) return 'CallName';
  return 'VariableName';
};

export const scanLuminaTokens = (source: string): Token[] => {
  const tokens: Token[] = [];
  const state: ScanState = { pendingDefinition: null, afterDot: false };
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const start = index;
    if (source.startsWith('//', index)) {
      index = source.indexOf('\n', index + 2);
      if (index === -1) index = source.length;
      tokens.push(token('LineComment', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (source.startsWith('/*', index)) {
      index = skipBlockComment(source, index);
      tokens.push(token('BlockComment', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (source.startsWith('r"""', index)) {
      index = skipTripleString(source, index + 1);
      tokens.push(token('String', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (source.startsWith('"""', index)) {
      index = skipTripleString(source, index);
      tokens.push(token('String', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (source.startsWith('r"', index)) {
      index = source.indexOf('"', index + 2);
      index = index === -1 ? source.length : index + 1;
      tokens.push(token('String', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      tokens.push(token(char === '"' ? 'String' : 'Character', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }

    const numberMatch = source.slice(index).match(numberPattern);
    if (numberMatch) {
      index += numberMatch[0].length;
      tokens.push(token('Number', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }

    const operatorMatch = source.slice(index).match(multiCharOperatorPattern);
    if (operatorMatch) {
      index += operatorMatch[0].length;
      tokens.push(token('Operator', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }

    if ('{}'.includes(char)) {
      index += 1;
      tokens.push(token('Brace', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if ('()'.includes(char)) {
      index += 1;
      tokens.push(token('Paren', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if ('[]'.includes(char)) {
      index += 1;
      tokens.push(token('SquareBracket', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (',;'.includes(char)) {
      index += 1;
      tokens.push(token('Separator', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (':?'.includes(char)) {
      index += 1;
      tokens.push(token('Punctuation', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }
    if (char === '.') {
      index += 1;
      tokens.push(token('Punctuation', start, index));
      state.pendingDefinition = null;
      state.afterDot = true;
      continue;
    }
    if ('+-*/%=&|!<>'.includes(char)) {
      index += 1;
      tokens.push(token('Operator', start, index));
      state.pendingDefinition = null;
      state.afterDot = false;
      continue;
    }

    const identifierMatch = source.slice(index).match(identifierPattern);
    if (identifierMatch) {
      index += identifierMatch[0].length;
      tokens.push(token(classifyIdentifier(source, start, index, state), start, index));
      continue;
    }

    index += 1;
    tokens.push(token('Invalid', start, index));
    state.pendingDefinition = null;
    state.afterDot = false;
  }

  return tokens;
};

const treeFromSource = (source: string): Tree => {
  const tokens = scanLuminaTokens(source);
  const children = tokens.map((item) => new Tree(nodeType(item.kind), [], [], item.to - item.from));
  const positions = tokens.map((item) => item.from);
  return new Tree(nodeType('Lumina'), children, positions, source.length);
};

class LuminaParse implements PartialParse {
  readonly parsedPos: number;
  stoppedAt: number | null = null;

  constructor(private readonly source: string) {
    this.parsedPos = source.length;
  }

  advance(): Tree {
    return treeFromSource(this.source);
  }

  stopAt(pos: number): void {
    this.stoppedAt = pos;
  }
}

class LuminaParser extends Parser {
  createParse(input: Input, _fragments: readonly TreeFragment[], _ranges: readonly { from: number; to: number }[]): PartialParse {
    return new LuminaParse(input.read(0, input.length));
  }
}

export const luminaParser = new LuminaParser();
export const luminaLanguage = new Language(dataFacet, luminaParser, [], 'lumina');
