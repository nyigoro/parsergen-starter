"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  compileGrammar: () => compileGrammar,
  createASTNode: () => createASTNode,
  createLexer: () => createLexer,
  createParser: () => createParser,
  formatError: () => formatError,
  formatLocation: () => formatLocation,
  highlightSnippet: () => highlightSnippet,
  parseInput: () => parseInput,
  parseMultiple: () => parseMultiple,
  parseStream: () => parseStream,
  parseWithRecovery: () => parseWithRecovery,
  parseWithTimeout: () => parseWithTimeout,
  traverseAST: () => traverseAST,
  validateSyntax: () => validateSyntax
});
module.exports = __toCommonJS(index_exports);

// src/utils/highlight.ts
var import_chalk = __toESM(require("chalk"), 1);
function highlightSnippet(input, location, useColor = true) {
  const lines = input.split("\n");
  const lineNum = location.start.line;
  const colNum = location.start.column;
  if (lineNum < 1 || lineNum > lines.length) return "";
  const targetLine = lines[lineNum - 1];
  const prefix = `${lineNum}: `;
  const pointerLine = " ".repeat(prefix.length + colNum - 1) + "^";
  const lineStr = useColor ? prefix + import_chalk.default.redBright(targetLine) : prefix + targetLine;
  const pointerStr = useColor ? import_chalk.default.yellow(pointerLine) : pointerLine;
  const resultLines = [];
  if (lineNum > 1) resultLines.push(`${lineNum - 1}: ${lines[lineNum - 2]}`);
  resultLines.push(lineStr);
  resultLines.push(pointerStr);
  if (lineNum < lines.length) resultLines.push(`${lineNum + 1}: ${lines[lineNum]}`);
  return resultLines.join("\n");
}

// src/utils/format.ts
function formatLocation(location) {
  const { start, end } = location;
  return start.line === end.line && start.column === end.column ? `Line ${start.line}, Col ${start.column}` : `Line ${start.line}, Col ${start.column} \u2192 Line ${end.line}, Col ${end.column}`;
}
function formatError(error) {
  const parts = [`\u274C Parse Error: ${error.error}`];
  if (error.location) parts.push(`\u21AA at ${formatLocation(error.location)}`);
  if (error.expected) parts.push(`Expected: ${error.expected.join(", ")}`);
  if (error.found !== void 0) parts.push(`Found: "${error.found}"`);
  if (error.snippet || error.input) {
    const snippet = error.snippet || highlightSnippet(error.input, error.location, true);
    parts.push("\n--- Snippet ---\n" + snippet);
  }
  return parts.join("\n");
}

// src/utils/ast.ts
function createASTNode(type, value, children = [], location, metadata) {
  const node = { type, value, children, location };
  if (metadata) node.metadata = metadata;
  return node;
}
function traverseAST(node, visit, parent, path = []) {
  visit(node, parent, path);
  if (node.children) {
    node.children.forEach(
      (child, index) => traverseAST(child, visit, node, [...path, `children[${index}]`])
    );
  }
}

// src/grammar/index.ts
var import_peggy = __toESM(require("peggy"), 1);
var generate = import_peggy.default.generate;
function compileGrammar(grammar, options = {}) {
  try {
    const defaultOptions = {
      allowedStartRules: ["*"],
      cache: false,
      format: "bare",
      optimize: "speed",
      output: "parser",
      trace: false,
      ...options
    };
    const parser = generate(grammar, defaultOptions);
    return {
      parse: parser.parse.bind(parser),
      source: grammar,
      options: defaultOptions
    };
  } catch (error) {
    const formattedError = formatError(error);
    throw new Error(`Grammar compilation failed: ${formattedError}`);
  }
}

// src/lexer/index.ts
var import_moo = __toESM(require("moo"), 1);
function createLexer(config) {
  try {
    return import_moo.default.compile(config);
  } catch (error) {
    throw new Error(`Lexer compilation failed: ${error.message}`);
  }
}

// src/parser/index.ts
function parseInput(grammar, input, options = {}) {
  try {
    const result = grammar.parse(input, options);
    return {
      result,
      success: true
    };
  } catch (error) {
    return createParseError(error, input, options);
  }
}
function createParser(grammar, defaultOptions = {}) {
  return (input, options = {}) => {
    return parseInput(grammar, input, { ...defaultOptions, ...options });
  };
}
function parseWithRecovery(grammar, input, options = {}) {
  const errors = [];
  try {
    const result = grammar.parse(input, options);
    return { result, errors };
  } catch (error) {
    const parseError = createParseError(error, input, options);
    errors.push(parseError);
    const lines = input.split("\n");
    if (parseError.location && parseError.location.start.line > 1) {
      const recoveredInput = lines.slice(0, parseError.location.start.line - 1).join("\n");
      if (recoveredInput.trim()) {
        try {
          const result = grammar.parse(recoveredInput, options);
          return { result, errors };
        } catch (recoveryError) {
          errors.push(createParseError(recoveryError, recoveredInput, options));
        }
      }
    }
    return { errors };
  }
}
function createParseError(error, input, options) {
  const parseError = {
    success: false,
    error: error.message || "Parse error",
    input
  };
  if (error.location) {
    parseError.location = {
      start: {
        line: error.location.start.line,
        column: error.location.start.column,
        offset: error.location.start.offset
      },
      end: {
        line: error.location.end.line,
        column: error.location.end.column,
        offset: error.location.end.offset
      }
    };
  }
  if (error.expected) {
    parseError.expected = error.expected.map(
      (exp) => exp.description || exp.text || exp.toString()
    );
  }
  if (error.found !== void 0) {
    parseError.found = error.found.toString();
  }
  parseError.stack = error.stack;
  if (parseError.location) {
    parseError.snippet = generateErrorSnippet(input, parseError.location);
  }
  return parseError;
}
function generateErrorSnippet(input, location) {
  const lines = input.split("\n");
  const lineNum = location.start.line;
  const colNum = location.start.column;
  if (lineNum > lines.length) {
    return "";
  }
  const line = lines[lineNum - 1];
  const contextLines = [];
  if (lineNum > 1) {
    contextLines.push(`${lineNum - 1}: ${lines[lineNum - 2]}`);
  }
  contextLines.push(`${lineNum}: ${line}`);
  contextLines.push(`${" ".repeat(lineNum.toString().length)}: ${" ".repeat(colNum - 1)}^`);
  if (lineNum < lines.length) {
    contextLines.push(`${lineNum + 1}: ${lines[lineNum]}`);
  }
  return contextLines.join("\n");
}
function parseMultiple(grammar, inputs, options = {}) {
  return inputs.map((input) => parseInput(grammar, input, options));
}
async function parseStream(grammar, inputs, options = {}) {
  const results = [];
  for await (const input of inputs) {
    const result = parseInput(grammar, input, options);
    results.push(result);
  }
  return results;
}
function parseWithTimeout(grammar, input, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Parse timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    try {
      const result = parseInput(grammar, input, options);
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
function validateSyntax(grammar, input, options = {}) {
  try {
    grammar.parse(input, options);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: createParseError(error, input, options)
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  compileGrammar,
  createASTNode,
  createLexer,
  createParser,
  formatError,
  formatLocation,
  highlightSnippet,
  parseInput,
  parseMultiple,
  parseStream,
  parseWithRecovery,
  parseWithTimeout,
  traverseAST,
  validateSyntax
});
//# sourceMappingURL=index.cjs.map