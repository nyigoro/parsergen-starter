#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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

// node_modules/peggy/lib/grammar-location.js
var require_grammar_location = __commonJS({
  "node_modules/peggy/lib/grammar-location.js"(exports2, module2) {
    "use strict";
    var _a;
    var GrammarLocation = (_a = class {
      /**
      * Create an instance.
      *
      * @param {any} source The original grammarSource.  Should be a string or
      *   have a toString() method.
      * @param {import("./peg").Location} start The starting offset for the
      *   grammar in the larger file.
      */
      constructor(source, start) {
        this.source = source;
        this.start = start;
      }
      /**
      * Coerce to a string.
      *
      * @returns {string} The source, stringified.
      */
      toString() {
        return String(this.source);
      }
      /**
      * Return a new Location offset from the given location by the start of the
      * grammar.
      *
      * @param {import("./peg").Location} loc The location as if the start of the
      *   grammar was the start of the file.
      * @returns {import("./peg").Location} The offset location.
      */
      offset(loc) {
        return {
          line: loc.line + this.start.line - 1,
          column: loc.line === 1 ? loc.column + this.start.column - 1 : loc.column,
          offset: loc.offset + this.start.offset
        };
      }
      /**
      * If the range has a grammarSource that is a GrammarLocation, offset the
      * start of that range by the GrammarLocation.
      *
      * @param {import("./peg").LocationRange} range The range to extract from.
      * @returns {import("./peg").Location} The offset start if possible, or the
      *   original start.
      */
      static offsetStart(range) {
        if (range.source && typeof range.source.offset === "function") {
          return range.source.offset(range.start);
        }
        return range.start;
      }
      /**
      * If the range has a grammarSource that is a GrammarLocation, offset the
      * end of that range by the GrammarLocation.
      *
      * @param {import("./peg").LocationRange} range The range to extract from.
      * @returns {import("./peg").Location} The offset end if possible, or the
      *   original end.
      */
      static offsetEnd(range) {
        if (range.source && typeof range.source.offset === "function") {
          return range.source.offset(range.end);
        }
        return range.end;
      }
    }, __name(_a, "GrammarLocation"), _a);
    module2.exports = GrammarLocation;
  }
});

// node_modules/peggy/lib/grammar-error.js
var require_grammar_error = __commonJS({
  "node_modules/peggy/lib/grammar-error.js"(exports2, module2) {
    "use strict";
    var GrammarLocation = require_grammar_location();
    var _a;
    var GrammarError = (_a = class extends SyntaxError {
      /**
      *
      * @param {string} message
      * @param {PEG.LocationRange} [location]
      * @param {PEG.DiagnosticNote[]} [diagnostics]
      */
      constructor(message, location, diagnostics) {
        super(message);
        this.name = "GrammarError";
        this.location = location;
        if (diagnostics === void 0) {
          diagnostics = [];
        }
        this.diagnostics = diagnostics;
        this.stage = null;
        this.problems = [
          /** @type {PEG.Problem} */
          [
            "error",
            message,
            location,
            diagnostics
          ]
        ];
      }
      toString() {
        let str = super.toString();
        if (this.location) {
          str += "\n at ";
          if (this.location.source !== void 0 && this.location.source !== null) {
            str += `${this.location.source}:`;
          }
          str += `${this.location.start.line}:${this.location.start.column}`;
        }
        for (const diag of this.diagnostics) {
          str += "\n from ";
          if (diag.location.source !== void 0 && diag.location.source !== null) {
            str += `${diag.location.source}:`;
          }
          str += `${diag.location.start.line}:${diag.location.start.column}: ${diag.message}`;
        }
        return str;
      }
      /**
      * Format the error with associated sources.  The `location.source` should have
      * a `toString()` representation in order the result to look nice. If source
      * is `null` or `undefined`, it is skipped from the output
      *
      * Sample output:
      * ```
      * Error: Label "head" is already defined
      *  --> examples/arithmetics.pegjs:15:17
      *    |
      * 15 |   = head:Factor head:(_ ("*" / "/") _ Factor)* {
      *    |                 ^^^^
      * note: Original label location
      *  --> examples/arithmetics.pegjs:15:5
      *    |
      * 15 |   = head:Factor head:(_ ("*" / "/") _ Factor)* {
      *    |     ^^^^
      * ```
      *
      * @param {import("./peg").SourceText[]} sources mapping from location source to source text
      *
      * @returns {string} the formatted error
      */
      format(sources) {
        const srcLines = sources.map(({ source, text }) => ({
          source,
          text: text !== null && text !== void 0 ? String(text).split(/\r\n|\n|\r/g) : []
        }));
        function entry(location, indent, message = "") {
          let str = "";
          const src = srcLines.find(({ source }) => source === location.source);
          const s = location.start;
          const offset_s = GrammarLocation.offsetStart(location);
          if (src) {
            const e = location.end;
            const line = src.text[s.line - 1];
            const last = s.line === e.line ? e.column : line.length + 1;
            const hatLen = last - s.column || 1;
            if (message) {
              str += `
note: ${message}`;
            }
            str += `
 --> ${location.source}:${offset_s.line}:${offset_s.column}
${"".padEnd(indent)} |
${offset_s.line.toString().padStart(indent)} | ${line}
${"".padEnd(indent)} | ${"".padEnd(s.column - 1)}${"".padEnd(hatLen, "^")}`;
          } else {
            str += `
 at ${location.source}:${offset_s.line}:${offset_s.column}`;
            if (message) {
              str += `: ${message}`;
            }
          }
          return str;
        }
        __name(entry, "entry");
        function formatProblem(severity, message, location, diagnostics = []) {
          let maxLine = -Infinity;
          if (location) {
            maxLine = diagnostics.reduce((t, { location: location2 }) => Math.max(t, GrammarLocation.offsetStart(location2).line), location.start.line);
          } else {
            maxLine = Math.max.apply(null, diagnostics.map((d) => d.location.start.line));
          }
          maxLine = maxLine.toString().length;
          let str = `${severity}: ${message}`;
          if (location) {
            str += entry(location, maxLine);
          }
          for (const diag of diagnostics) {
            str += entry(diag.location, maxLine, diag.message);
          }
          return str;
        }
        __name(formatProblem, "formatProblem");
        return this.problems.filter((p) => p[0] !== "info").map((p) => formatProblem(...p)).join("\n\n");
      }
    }, __name(_a, "GrammarError"), _a);
    module2.exports = GrammarError;
  }
});

// node_modules/peggy/lib/compiler/visitor.js
var require_visitor = __commonJS({
  "node_modules/peggy/lib/compiler/visitor.js"(exports2, module2) {
    "use strict";
    var visitor2 = {
      build(functions) {
        function visit(node, ...args) {
          return functions[node.type](node, ...args);
        }
        __name(visit, "visit");
        function visitNop() {
        }
        __name(visitNop, "visitNop");
        function visitExpression(node, ...args) {
          return visit(node.expression, ...args);
        }
        __name(visitExpression, "visitExpression");
        function visitChildren(property) {
          return function(node, ...args) {
            node[property].forEach((child) => visit(child, ...args));
          };
        }
        __name(visitChildren, "visitChildren");
        const DEFAULT_FUNCTIONS = {
          grammar(node, ...args) {
            for (const imp of node.imports) {
              visit(imp, ...args);
            }
            if (node.topLevelInitializer) {
              if (Array.isArray(node.topLevelInitializer)) {
                for (const tli of node.topLevelInitializer) {
                  visit(tli, ...args);
                }
              } else {
                visit(node.topLevelInitializer, ...args);
              }
            }
            if (node.initializer) {
              if (Array.isArray(node.initializer)) {
                for (const init of node.initializer) {
                  visit(init, ...args);
                }
              } else {
                visit(node.initializer, ...args);
              }
            }
            node.rules.forEach((rule) => visit(rule, ...args));
          },
          grammar_import: visitNop,
          top_level_initializer: visitNop,
          initializer: visitNop,
          rule: visitExpression,
          named: visitExpression,
          choice: visitChildren("alternatives"),
          action: visitExpression,
          sequence: visitChildren("elements"),
          labeled: visitExpression,
          text: visitExpression,
          simple_and: visitExpression,
          simple_not: visitExpression,
          optional: visitExpression,
          zero_or_more: visitExpression,
          one_or_more: visitExpression,
          repeated(node, ...args) {
            if (node.delimiter) {
              visit(node.delimiter, ...args);
            }
            return visit(node.expression, ...args);
          },
          group: visitExpression,
          semantic_and: visitNop,
          semantic_not: visitNop,
          rule_ref: visitNop,
          library_ref: visitNop,
          literal: visitNop,
          class: visitNop,
          any: visitNop
        };
        Object.keys(DEFAULT_FUNCTIONS).forEach((type) => {
          if (!Object.prototype.hasOwnProperty.call(functions, type)) {
            functions[type] = DEFAULT_FUNCTIONS[type];
          }
        });
        return visit;
      }
    };
    module2.exports = visitor2;
  }
});

// node_modules/peggy/lib/compiler/asts.js
var require_asts = __commonJS({
  "node_modules/peggy/lib/compiler/asts.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function combinePossibleArrays(a, b) {
      if (!(a && b)) {
        return a || b;
      }
      const aa = Array.isArray(a) ? a : [
        a
      ];
      aa.push(b);
      return aa;
    }
    __name(combinePossibleArrays, "combinePossibleArrays");
    var asts = {
      /**
      * Find the rule with the given name, if it exists.
      *
      * @param {PEG.ast.Grammar} ast
      * @param {string} name
      * @returns {PEG.ast.Rule | undefined}
      */
      findRule(ast2, name) {
        for (let i = 0; i < ast2.rules.length; i++) {
          if (ast2.rules[i].name === name) {
            return ast2.rules[i];
          }
        }
        return void 0;
      },
      /**
      * Find the index of the rule with the given name, if it exists.
      * Otherwise returns -1.
      *
      * @param {PEG.ast.Grammar} ast
      * @param {string} name
      * @returns {number}
      */
      indexOfRule(ast2, name) {
        for (let i = 0; i < ast2.rules.length; i++) {
          if (ast2.rules[i].name === name) {
            return i;
          }
        }
        return -1;
      },
      alwaysConsumesOnSuccess(ast2, node) {
        function consumesTrue() {
          return true;
        }
        __name(consumesTrue, "consumesTrue");
        function consumesFalse() {
          return false;
        }
        __name(consumesFalse, "consumesFalse");
        const consumes = visitor2.build({
          choice(node2) {
            return node2.alternatives.every(consumes);
          },
          sequence(node2) {
            return node2.elements.some(consumes);
          },
          simple_and: consumesFalse,
          simple_not: consumesFalse,
          optional: consumesFalse,
          zero_or_more: consumesFalse,
          repeated(node2) {
            const min = node2.min ? node2.min : node2.max;
            if (min.type !== "constant" || min.value === 0) {
              return false;
            }
            if (consumes(node2.expression)) {
              return true;
            }
            if (min.value > 1 && node2.delimiter && consumes(node2.delimiter)) {
              return true;
            }
            return false;
          },
          semantic_and: consumesFalse,
          semantic_not: consumesFalse,
          rule_ref(node2) {
            const rule = asts.findRule(ast2, node2.name);
            return rule ? consumes(rule) : void 0;
          },
          // No way to know for external rules.
          library_ref: consumesFalse,
          literal(node2) {
            return node2.value !== "";
          },
          class: consumesTrue,
          any: consumesTrue
        });
        return consumes(node);
      },
      combine(asts2) {
        return asts2.reduce((combined, ast2) => {
          combined.topLevelInitializer = combinePossibleArrays(combined.topLevelInitializer, ast2.topLevelInitializer);
          combined.initializer = combinePossibleArrays(combined.initializer, ast2.initializer);
          combined.rules = combined.rules.concat(ast2.rules);
          return combined;
        });
      }
    };
    module2.exports = asts;
  }
});

// node_modules/peggy/lib/compiler/passes/add-imported-rules.js
var require_add_imported_rules = __commonJS({
  "node_modules/peggy/lib/compiler/passes/add-imported-rules.js"(exports2, module2) {
    "use strict";
    function addImportedRules2(ast2) {
      let libraryNumber = 0;
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          let original = void 0;
          switch (what.type) {
            case "import_binding_all":
              continue;
            case "import_binding_default":
              break;
            case "import_binding":
              original = what.binding;
              break;
            case "import_binding_rename":
              original = what.rename;
              break;
            default:
              throw new TypeError("Unknown binding type");
          }
          ast2.rules.push({
            type: "rule",
            name: what.binding,
            nameLocation: what.location,
            expression: {
              type: "library_ref",
              name: original,
              library: imp.from.module,
              libraryNumber,
              location: what.location
            },
            location: imp.from.location
          });
        }
        libraryNumber++;
      }
    }
    __name(addImportedRules2, "addImportedRules");
    module2.exports = addImportedRules2;
  }
});

// node_modules/peggy/lib/compiler/passes/fix-library-numbers.js
var require_fix_library_numbers = __commonJS({
  "node_modules/peggy/lib/compiler/passes/fix-library-numbers.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function findLibraryNumber(ast2, name) {
      let libraryNumber = 0;
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          if (what.type === "import_binding_all" && what.binding === name) {
            return libraryNumber;
          }
        }
        libraryNumber++;
      }
      return -1;
    }
    __name(findLibraryNumber, "findLibraryNumber");
    function fixLibraryNumbers2(ast2, _options, session2) {
      const check = visitor2.build({
        library_ref(node) {
          if (node.libraryNumber === -1) {
            node.libraryNumber = findLibraryNumber(ast2, node.library);
            if (node.libraryNumber === -1) {
              session2.error(`Unknown module "${node.library}"`, node.location);
            }
          }
        }
      });
      check(ast2);
    }
    __name(fixLibraryNumbers2, "fixLibraryNumbers");
    module2.exports = fixLibraryNumbers2;
  }
});

// node_modules/peggy/lib/compiler/opcodes.js
var require_opcodes = __commonJS({
  "node_modules/peggy/lib/compiler/opcodes.js"(exports2, module2) {
    "use strict";
    var opcodes = {
      // Stack Manipulation
      /** @deprecated Unused */
      PUSH: 0,
      PUSH_EMPTY_STRING: 35,
      PUSH_UNDEFINED: 1,
      PUSH_NULL: 2,
      PUSH_FAILED: 3,
      PUSH_EMPTY_ARRAY: 4,
      PUSH_CURR_POS: 5,
      POP: 6,
      POP_CURR_POS: 7,
      POP_N: 8,
      NIP: 9,
      APPEND: 10,
      WRAP: 11,
      TEXT: 12,
      PLUCK: 36,
      // Conditions and Loops
      IF: 13,
      IF_ERROR: 14,
      IF_NOT_ERROR: 15,
      IF_LT: 30,
      IF_GE: 31,
      IF_LT_DYNAMIC: 32,
      IF_GE_DYNAMIC: 33,
      WHILE_NOT_ERROR: 16,
      // Matching
      MATCH_ANY: 17,
      MATCH_STRING: 18,
      MATCH_STRING_IC: 19,
      MATCH_CHAR_CLASS: 20,
      MATCH_UNICODE_CLASS: 42,
      /** @deprecated Replaced with `MATCH_CHAR_CLASS` */
      MATCH_REGEXP: 20,
      ACCEPT_N: 21,
      ACCEPT_STRING: 22,
      FAIL: 23,
      // Calls
      LOAD_SAVED_POS: 24,
      UPDATE_SAVED_POS: 25,
      CALL: 26,
      // Rules
      RULE: 27,
      LIBRARY_RULE: 41,
      // Failure Reporting
      SILENT_FAILS_ON: 28,
      SILENT_FAILS_OFF: 29,
      // Because the tests have hard-coded opcode numbers, don't renumber
      // existing opcodes.  New opcodes that have been put in the correct
      // sections above are repeated here in order to ensure we don't
      // reuse them.
      //
      // IF_LT: 30
      // IF_GE: 31
      // IF_LT_DYNAMIC: 32
      // IF_GE_DYNAMIC: 33
      // 34 reserved for @mingun
      // PUSH_EMPTY_STRING: 35
      // PLUCK: 36
      SOURCE_MAP_PUSH: 37,
      SOURCE_MAP_POP: 38,
      SOURCE_MAP_LABEL_PUSH: 39,
      SOURCE_MAP_LABEL_POP: 40
    };
    module2.exports = opcodes;
  }
});

// node_modules/peggy/lib/compiler/intern.js
var require_intern = __commonJS({
  "node_modules/peggy/lib/compiler/intern.js"(exports2, module2) {
    "use strict";
    var _a;
    var Intern = (_a = class {
      /**
      * @typedef {object} InternOptions
      * @property {(input: V) => string} [stringify=String] Represent the
      *   converted input as a string, for value comparison.
      * @property {(input: T) => V} [convert=(x) => x] Convert the input to its
      *   stored form.  Required if type V is not the same as type T.  Return
      *   falsy value to have this input not be added; add() will return -1 in
      *   this case.
      */
      /**
      * @param {InternOptions} [options]
      */
      constructor(options2) {
        this.options = {
          stringify: String,
          convert: /* @__PURE__ */ __name((x) => (
            /** @type {unknown} */
            x
          ), "convert"),
          ...options2
        };
        this.items = [];
        this.offsets = /* @__PURE__ */ Object.create(null);
      }
      /**
      * Intern an item, getting it's asssociated number.  Returns -1 for falsy
      * inputs. O(1) with constants tied to the convert and stringify options.
      *
      * @param {T} input
      * @return {number}
      */
      add(input) {
        const c = this.options.convert(input);
        if (!c) {
          return -1;
        }
        const s = this.options.stringify(c);
        let num = this.offsets[s];
        if (num === void 0) {
          num = this.items.push(c) - 1;
          this.offsets[s] = num;
        }
        return num;
      }
      /**
      * @param {number} i
      * @returns {V}
      */
      get(i) {
        return this.items[i];
      }
      /**
      * @template U
      * @param {(value: V, index: number, array: V[]) => U} fn
      * @returns {U[]}
      */
      map(fn) {
        return this.items.map(fn);
      }
    }, __name(_a, "Intern"), _a);
    module2.exports = Intern;
  }
});

// node_modules/peggy/lib/compiler/passes/inference-match-result.js
var require_inference_match_result = __commonJS({
  "node_modules/peggy/lib/compiler/passes/inference-match-result.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    var asts = require_asts();
    var GrammarError = require_grammar_error();
    var ALWAYS_MATCH = 1;
    var SOMETIMES_MATCH = 0;
    var NEVER_MATCH = -1;
    function inferenceMatchResult2(ast2) {
      function sometimesMatch(node) {
        return node.match = SOMETIMES_MATCH;
      }
      __name(sometimesMatch, "sometimesMatch");
      function alwaysMatch(node) {
        inference(node.expression);
        return node.match = ALWAYS_MATCH;
      }
      __name(alwaysMatch, "alwaysMatch");
      function inferenceExpression(node) {
        return node.match = inference(node.expression);
      }
      __name(inferenceExpression, "inferenceExpression");
      function inferenceElements(elements, forChoice) {
        const length = elements.length;
        let always = 0;
        let never = 0;
        for (let i = 0; i < length; ++i) {
          const result = inference(elements[i]);
          if (result === ALWAYS_MATCH) {
            ++always;
          }
          if (result === NEVER_MATCH) {
            ++never;
          }
        }
        if (always === length) {
          return ALWAYS_MATCH;
        }
        if (forChoice) {
          return never === length ? NEVER_MATCH : SOMETIMES_MATCH;
        }
        return never > 0 ? NEVER_MATCH : SOMETIMES_MATCH;
      }
      __name(inferenceElements, "inferenceElements");
      const inference = visitor2.build({
        rule(node) {
          let oldResult;
          let count = 0;
          if (typeof node.match === "undefined") {
            node.match = SOMETIMES_MATCH;
            do {
              oldResult = node.match;
              node.match = inference(node.expression);
              if (++count > 6) {
                throw new GrammarError("Infinity cycle detected when trying to evaluate node match result", node.location);
              }
            } while (oldResult !== node.match);
          }
          return node.match;
        },
        named: inferenceExpression,
        choice(node) {
          return node.match = inferenceElements(node.alternatives, true);
        },
        action: inferenceExpression,
        sequence(node) {
          return node.match = inferenceElements(node.elements, false);
        },
        labeled: inferenceExpression,
        text: inferenceExpression,
        simple_and: inferenceExpression,
        simple_not(node) {
          return node.match = -inference(node.expression);
        },
        optional: alwaysMatch,
        zero_or_more: alwaysMatch,
        one_or_more: inferenceExpression,
        repeated(node) {
          const match = inference(node.expression);
          const dMatch = node.delimiter ? inference(node.delimiter) : NEVER_MATCH;
          const min = node.min ? node.min : node.max;
          if (min.type !== "constant" || node.max.type !== "constant") {
            return node.match = SOMETIMES_MATCH;
          }
          if (node.max.value === 0 || node.max.value !== null && min.value > node.max.value) {
            return node.match = NEVER_MATCH;
          }
          if (match === NEVER_MATCH) {
            return node.match = min.value === 0 ? ALWAYS_MATCH : NEVER_MATCH;
          }
          if (match === ALWAYS_MATCH) {
            if (node.delimiter && min.value >= 2) {
              return node.match = dMatch;
            }
            return node.match = ALWAYS_MATCH;
          }
          if (node.delimiter && min.value >= 2) {
            return (
              // If a delimiter never match then the range also never match (because
              // there at least one delimiter)
              node.match = dMatch === NEVER_MATCH ? NEVER_MATCH : SOMETIMES_MATCH
            );
          }
          return node.match = min.value === 0 ? ALWAYS_MATCH : SOMETIMES_MATCH;
        },
        group: inferenceExpression,
        semantic_and: sometimesMatch,
        semantic_not: sometimesMatch,
        rule_ref(node) {
          const rule = asts.findRule(ast2, node.name);
          if (!rule) {
            return SOMETIMES_MATCH;
          }
          return node.match = inference(rule);
        },
        library_ref() {
          return 0;
        },
        literal(node) {
          const match = node.value.length === 0 ? ALWAYS_MATCH : SOMETIMES_MATCH;
          return node.match = match;
        },
        class(node) {
          const match = node.parts.length === 0 ? NEVER_MATCH : SOMETIMES_MATCH;
          return node.match = match;
        },
        // |any| not match on empty input
        any: sometimesMatch
      });
      inference(ast2);
    }
    __name(inferenceMatchResult2, "inferenceMatchResult");
    inferenceMatchResult2.ALWAYS_MATCH = ALWAYS_MATCH;
    inferenceMatchResult2.SOMETIMES_MATCH = SOMETIMES_MATCH;
    inferenceMatchResult2.NEVER_MATCH = NEVER_MATCH;
    module2.exports = inferenceMatchResult2;
  }
});

// node_modules/peggy/lib/compiler/passes/generate-bytecode.js
var require_generate_bytecode = __commonJS({
  "node_modules/peggy/lib/compiler/passes/generate-bytecode.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var op = require_opcodes();
    var visitor2 = require_visitor();
    var Intern = require_intern();
    var { ALWAYS_MATCH, SOMETIMES_MATCH, NEVER_MATCH } = require_inference_match_result();
    function generateBytecode2(ast2, options2) {
      const literals = new Intern();
      const classes = new Intern({
        stringify: JSON.stringify,
        /** @type {(input: PEG.ast.CharacterClass) => PEG.ast.GrammarCharacterClass} */
        convert: /* @__PURE__ */ __name((node) => ({
          value: node.parts,
          inverted: node.inverted,
          ignoreCase: node.ignoreCase,
          unicode: node.unicode
        }), "convert")
      });
      const expectations = new Intern({
        stringify: JSON.stringify
      });
      const importedNames = new Intern();
      const functions = [];
      const locations = [];
      function addFunctionConst(predicate, params, node) {
        const func = {
          predicate,
          params,
          body: node.code,
          location: node.codeLocation
        };
        const pattern = JSON.stringify(func);
        const index = functions.findIndex((f) => JSON.stringify(f) === pattern);
        return index === -1 ? functions.push(func) - 1 : index;
      }
      __name(addFunctionConst, "addFunctionConst");
      function addLocation(location) {
        return locations.push(location) - 1;
      }
      __name(addLocation, "addLocation");
      function cloneEnv(env) {
        const clone = {};
        Object.keys(env).forEach((name) => {
          clone[name] = env[name];
        });
        return clone;
      }
      __name(cloneEnv, "cloneEnv");
      function buildSequence(first, ...args) {
        return first.concat(...args);
      }
      __name(buildSequence, "buildSequence");
      function buildCondition(match, condCode, thenCode, elseCode) {
        if (match === ALWAYS_MATCH) {
          return thenCode;
        }
        if (match === NEVER_MATCH) {
          return elseCode;
        }
        return condCode.concat([
          thenCode.length,
          elseCode.length
        ], thenCode, elseCode);
      }
      __name(buildCondition, "buildCondition");
      function buildLoop(condCode, bodyCode) {
        return condCode.concat([
          bodyCode.length
        ], bodyCode);
      }
      __name(buildLoop, "buildLoop");
      function buildCall(functionIndex, delta, env, sp) {
        const params = Object.keys(env).map((name) => sp - env[name]);
        return [
          op.CALL,
          functionIndex,
          delta,
          params.length
        ].concat(params);
      }
      __name(buildCall, "buildCall");
      function buildSimplePredicate(expression, negative, context) {
        const match = expression.match || 0;
        return buildSequence(
          [
            op.PUSH_CURR_POS
          ],
          [
            op.SILENT_FAILS_ON
          ],
          // eslint-disable-next-line no-use-before-define -- Mutual recursion
          generate2(expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          }),
          [
            op.SILENT_FAILS_OFF
          ],
          buildCondition(negative ? -match : match, [
            negative ? op.IF_ERROR : op.IF_NOT_ERROR
          ], buildSequence([
            op.POP
          ], [
            negative ? op.POP : op.POP_CURR_POS
          ], [
            op.PUSH_UNDEFINED
          ]), buildSequence([
            op.POP
          ], [
            negative ? op.POP_CURR_POS : op.POP
          ], [
            op.PUSH_FAILED
          ]))
        );
      }
      __name(buildSimplePredicate, "buildSimplePredicate");
      function buildSemanticPredicate(node, negative, context) {
        const functionIndex = addFunctionConst(true, Object.keys(context.env), node);
        return buildSequence([
          op.UPDATE_SAVED_POS
        ], buildCall(functionIndex, 0, context.env, context.sp), buildCondition(node.match || 0, [
          op.IF
        ], buildSequence([
          op.POP
        ], negative ? [
          op.PUSH_FAILED
        ] : [
          op.PUSH_UNDEFINED
        ]), buildSequence([
          op.POP
        ], negative ? [
          op.PUSH_UNDEFINED
        ] : [
          op.PUSH_FAILED
        ])));
      }
      __name(buildSemanticPredicate, "buildSemanticPredicate");
      function buildAppendLoop(expressionCode) {
        return buildLoop([
          op.WHILE_NOT_ERROR
        ], buildSequence([
          op.APPEND
        ], expressionCode));
      }
      __name(buildAppendLoop, "buildAppendLoop");
      function unknownBoundary(boundary) {
        const b = (
          /** @type {{ type: string }} */
          boundary
        );
        return new Error(`Unknown boundary type "${b.type}" for the "repeated" node`);
      }
      __name(unknownBoundary, "unknownBoundary");
      function buildRangeCall(boundary, env, sp, offset) {
        switch (boundary.type) {
          case "constant":
            return {
              pre: [],
              post: [],
              sp
            };
          case "variable":
            boundary.sp = offset + sp - env[boundary.value];
            return {
              pre: [],
              post: [],
              sp
            };
          case "function": {
            boundary.sp = offset;
            const functionIndex = addFunctionConst(true, Object.keys(env), {
              code: boundary.value,
              codeLocation: boundary.codeLocation
            });
            return {
              pre: buildCall(functionIndex, 0, env, sp),
              post: [
                op.NIP
              ],
              // +1 for the function result
              sp: sp + 1
            };
          }
          // istanbul ignore next Because we never generate invalid boundary type we cannot reach this branch
          default:
            throw unknownBoundary(boundary);
        }
      }
      __name(buildRangeCall, "buildRangeCall");
      function buildCheckMax(expressionCode, max) {
        if (max.value !== null) {
          const checkCode = max.type === "constant" ? [
            op.IF_GE,
            max.value
          ] : [
            op.IF_GE_DYNAMIC,
            max.sp || 0
          ];
          return buildCondition(
            SOMETIMES_MATCH,
            checkCode,
            [
              op.PUSH_FAILED
            ],
            expressionCode
            // else
          );
        }
        return expressionCode;
      }
      __name(buildCheckMax, "buildCheckMax");
      function buildCheckMin(expressionCode, min) {
        const checkCode = min.type === "constant" ? [
          op.IF_LT,
          min.value
        ] : [
          op.IF_LT_DYNAMIC,
          min.sp || 0
        ];
        return buildSequence(expressionCode, buildCondition(
          SOMETIMES_MATCH,
          checkCode,
          /* eslint-disable @stylistic/indent -- Clarity */
          [
            op.POP,
            op.POP_CURR_POS,
            op.PUSH_FAILED
          ],
          /* eslint-enable @stylistic/indent */
          [
            op.NIP
          ]
          // }                        stack:[ [elem...] ]
        ));
      }
      __name(buildCheckMin, "buildCheckMin");
      function buildRangeBody(delimiterNode, expressionMatch, expressionCode, context, offset) {
        if (delimiterNode) {
          return buildSequence(
            [
              op.PUSH_CURR_POS
            ],
            // eslint-disable-next-line no-use-before-define -- Mutual recursion
            generate2(delimiterNode, {
              // +1 for the saved offset
              sp: context.sp + offset + 1,
              env: cloneEnv(context.env),
              action: null
            }),
            buildCondition(
              delimiterNode.match || 0,
              [
                op.IF_NOT_ERROR
              ],
              buildSequence([
                op.POP
              ], expressionCode, buildCondition(
                -expressionMatch,
                [
                  op.IF_ERROR
                ],
                // If element FAILED, rollback currPos to saved value.
                /* eslint-disable @stylistic/indent -- Clarity */
                [
                  op.POP,
                  op.POP_CURR_POS,
                  op.PUSH_FAILED
                ],
                /* eslint-enable @stylistic/indent */
                // Else, just drop saved currPos.
                [
                  op.NIP
                ]
                //   }                      stack:[ item ]
              )),
              // If delimiter FAILED, currPos not changed, so just drop it.
              [
                op.NIP
              ]
              //                          stack:[ peg$FAILED ]
            )
            //                          stack:[ <?> ]
          );
        }
        return expressionCode;
      }
      __name(buildRangeBody, "buildRangeBody");
      function wrapGenerators(generators) {
        if (options2 && options2.output === "source-and-map") {
          Object.keys(generators).forEach((name) => {
            const generator = generators[name];
            generators[name] = function(node, ...args) {
              const generated = generator(node, ...args);
              if (generated === void 0 || !node.location) {
                return generated;
              }
              return buildSequence([
                op.SOURCE_MAP_PUSH,
                addLocation(node.location)
              ], generated, [
                op.SOURCE_MAP_POP
              ]);
            };
          });
        }
        return visitor2.build(generators);
      }
      __name(wrapGenerators, "wrapGenerators");
      const generate2 = wrapGenerators({
        grammar(node) {
          node.rules.forEach(generate2);
          node.literals = literals.items;
          node.classes = classes.items;
          node.expectations = expectations.items;
          node.importedNames = importedNames.items;
          node.functions = functions;
          node.locations = locations;
        },
        rule(node) {
          node.bytecode = generate2(node.expression, {
            sp: -1,
            env: {},
            pluck: [],
            action: null
          });
        },
        named(node, context) {
          const match = node.match || 0;
          const nameIndex = match === ALWAYS_MATCH ? -1 : expectations.add({
            type: "rule",
            value: node.name
          });
          return buildSequence([
            op.SILENT_FAILS_ON
          ], generate2(node.expression, context), [
            op.SILENT_FAILS_OFF
          ], buildCondition(-match, [
            op.IF_ERROR
          ], [
            op.FAIL,
            nameIndex
          ], []));
        },
        choice(node, context) {
          function buildAlternativesCode(alternatives, context2) {
            const match = alternatives[0].match || 0;
            const first = generate2(alternatives[0], {
              sp: context2.sp,
              env: cloneEnv(context2.env),
              action: null
            });
            if (match === ALWAYS_MATCH) {
              return first;
            }
            return buildSequence(first, alternatives.length > 1 ? buildCondition(SOMETIMES_MATCH, [
              op.IF_ERROR
            ], buildSequence([
              op.POP
            ], buildAlternativesCode(alternatives.slice(1), context2)), []) : []);
          }
          __name(buildAlternativesCode, "buildAlternativesCode");
          return buildAlternativesCode(node.alternatives, context);
        },
        action(node, context) {
          const env = cloneEnv(context.env);
          const emitCall = node.expression.type !== "sequence" || node.expression.elements.length === 0;
          const expressionCode = generate2(node.expression, {
            sp: context.sp + (emitCall ? 1 : 0),
            env,
            action: node
          });
          const match = node.expression.match || 0;
          const functionIndex = emitCall && match !== NEVER_MATCH ? addFunctionConst(false, Object.keys(env), node) : -1;
          return emitCall ? buildSequence([
            op.PUSH_CURR_POS
          ], expressionCode, buildCondition(match, [
            op.IF_NOT_ERROR
          ], buildSequence([
            op.LOAD_SAVED_POS,
            1
          ], buildCall(functionIndex, 1, env, context.sp + 2)), []), [
            op.NIP
          ]) : expressionCode;
        },
        sequence(node, context) {
          function buildElementsCode(elements, context2) {
            if (elements.length > 0) {
              const processedCount = node.elements.length - elements.length + 1;
              return buildSequence(generate2(elements[0], {
                sp: context2.sp,
                env: context2.env,
                pluck: context2.pluck,
                action: null
              }), buildCondition(elements[0].match || 0, [
                op.IF_NOT_ERROR
              ], buildElementsCode(elements.slice(1), {
                sp: context2.sp + 1,
                env: context2.env,
                pluck: context2.pluck,
                action: context2.action
              }), buildSequence(processedCount > 1 ? [
                op.POP_N,
                processedCount
              ] : [
                op.POP
              ], [
                op.POP_CURR_POS
              ], [
                op.PUSH_FAILED
              ])));
            } else {
              if (context2.pluck && context2.pluck.length > 0) {
                return buildSequence([
                  op.PLUCK,
                  node.elements.length + 1,
                  context2.pluck.length
                ], context2.pluck.map((eSP) => context2.sp - eSP));
              }
              if (context2.action) {
                const functionIndex = addFunctionConst(false, Object.keys(context2.env), context2.action);
                return buildSequence([
                  op.LOAD_SAVED_POS,
                  node.elements.length
                ], buildCall(functionIndex, node.elements.length + 1, context2.env, context2.sp));
              } else {
                return buildSequence([
                  op.WRAP,
                  node.elements.length
                ], [
                  op.NIP
                ]);
              }
            }
          }
          __name(buildElementsCode, "buildElementsCode");
          return buildSequence([
            op.PUSH_CURR_POS
          ], buildElementsCode(node.elements, {
            sp: context.sp + 1,
            env: context.env,
            pluck: [],
            action: context.action
          }));
        },
        labeled(node, context) {
          let env = context.env;
          const label = node.label;
          const sp = context.sp + 1;
          if (label) {
            env = cloneEnv(context.env);
            context.env[label] = sp;
          }
          if (node.pick) {
            context.pluck.push(sp);
          }
          const expression = generate2(node.expression, {
            sp: context.sp,
            env,
            action: null
          });
          if (label && node.labelLocation && options2 && options2.output === "source-and-map") {
            return buildSequence([
              op.SOURCE_MAP_LABEL_PUSH,
              sp,
              literals.add(label),
              addLocation(node.labelLocation)
            ], expression, [
              op.SOURCE_MAP_LABEL_POP,
              sp
            ]);
          }
          return expression;
        },
        text(node, context) {
          return buildSequence([
            op.PUSH_CURR_POS
          ], generate2(node.expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          }), buildCondition(node.match || 0, [
            op.IF_NOT_ERROR
          ], buildSequence([
            op.POP
          ], [
            op.TEXT
          ]), [
            op.NIP
          ]));
        },
        simple_and(node, context) {
          return buildSimplePredicate(node.expression, false, context);
        },
        simple_not(node, context) {
          return buildSimplePredicate(node.expression, true, context);
        },
        optional(node, context) {
          return buildSequence(generate2(node.expression, {
            sp: context.sp,
            env: cloneEnv(context.env),
            action: null
          }), buildCondition(
            // Check expression match, not the node match
            // If expression always match, no need to replace FAILED to NULL,
            // because FAILED will never appeared
            -(node.expression.match || 0),
            [
              op.IF_ERROR
            ],
            buildSequence([
              op.POP
            ], [
              op.PUSH_NULL
            ]),
            []
          ));
        },
        zero_or_more(node, context) {
          const expressionCode = generate2(node.expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          });
          return buildSequence([
            op.PUSH_EMPTY_ARRAY
          ], expressionCode, buildAppendLoop(expressionCode), [
            op.POP
          ]);
        },
        one_or_more(node, context) {
          const expressionCode = generate2(node.expression, {
            sp: context.sp + 1,
            env: cloneEnv(context.env),
            action: null
          });
          return buildSequence([
            op.PUSH_EMPTY_ARRAY
          ], expressionCode, buildCondition(
            // Condition depends on the expression match, not the node match
            node.expression.match || 0,
            [
              op.IF_NOT_ERROR
            ],
            buildSequence(buildAppendLoop(expressionCode), [
              op.POP
            ]),
            buildSequence([
              op.POP
            ], [
              op.POP
            ], [
              op.PUSH_FAILED
            ])
          ));
        },
        repeated(node, context) {
          const min = node.min ? node.min : node.max;
          const hasMin = min.type !== "constant" || min.value > 0;
          const hasBoundedMax = node.max.type !== "constant" && node.max.value !== null;
          const offset = hasMin ? 2 : 1;
          const minCode = node.min ? buildRangeCall(
            node.min,
            context.env,
            context.sp,
            // +1 for the result slot with an array
            // +1 for the saved position
            // +1 if we have a "function" maximum it occupies an additional slot in the stack
            2 + (node.max.type === "function" ? 1 : 0)
          ) : {
            pre: [],
            post: [],
            sp: context.sp
          };
          const maxCode = buildRangeCall(node.max, context.env, minCode.sp, offset);
          const firstExpressionCode = generate2(node.expression, {
            sp: maxCode.sp + offset,
            env: cloneEnv(context.env),
            action: null
          });
          const expressionCode = node.delimiter !== null ? generate2(node.expression, {
            // +1 for the saved position before parsing the `delimiter elem` pair
            sp: maxCode.sp + offset + 1,
            env: cloneEnv(context.env),
            action: null
          }) : firstExpressionCode;
          const bodyCode = buildRangeBody(node.delimiter, node.expression.match || 0, expressionCode, context, offset);
          const checkMaxCode = buildCheckMax(bodyCode, node.max);
          const firstElemCode = hasBoundedMax ? buildCheckMax(firstExpressionCode, node.max) : firstExpressionCode;
          const mainLoopCode = buildSequence(
            // If the low boundary present, then backtracking is possible, so save the current pos
            hasMin ? [
              op.PUSH_CURR_POS
            ] : [],
            [
              op.PUSH_EMPTY_ARRAY
            ],
            firstElemCode,
            buildAppendLoop(checkMaxCode),
            [
              op.POP
            ]
            //                          stack:[ pos, [...] ] (pop elem===`peg$FAILED`)
          );
          return buildSequence(
            minCode.pre,
            maxCode.pre,
            // Check the low boundary, if it is defined and not |0|.
            hasMin ? buildCheckMin(mainLoopCode, min) : mainLoopCode,
            maxCode.post,
            minCode.post
          );
        },
        group(node, context) {
          return generate2(node.expression, {
            sp: context.sp,
            env: cloneEnv(context.env),
            action: null
          });
        },
        semantic_and(node, context) {
          return buildSemanticPredicate(node, false, context);
        },
        semantic_not(node, context) {
          return buildSemanticPredicate(node, true, context);
        },
        rule_ref(node) {
          return [
            op.RULE,
            asts.indexOfRule(ast2, node.name)
          ];
        },
        library_ref(node) {
          return [
            op.LIBRARY_RULE,
            node.libraryNumber,
            importedNames.add(node.name)
          ];
        },
        literal(node) {
          if (node.value.length > 0) {
            const match = node.match || 0;
            const needConst = match === SOMETIMES_MATCH || match === ALWAYS_MATCH && !node.ignoreCase;
            const stringIndex = needConst ? literals.add(node.ignoreCase ? node.value.toLowerCase() : node.value) : -1;
            const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
              type: "literal",
              value: node.value,
              ignoreCase: node.ignoreCase
            }) : -1;
            return buildCondition(match, node.ignoreCase ? [
              op.MATCH_STRING_IC,
              stringIndex
            ] : [
              op.MATCH_STRING,
              stringIndex
            ], node.ignoreCase ? [
              op.ACCEPT_N,
              node.value.length
            ] : [
              op.ACCEPT_STRING,
              stringIndex
            ], [
              op.FAIL,
              expectedIndex
            ]);
          }
          return [
            op.PUSH_EMPTY_STRING
          ];
        },
        class(node) {
          const match = node.match || 0;
          const classIndex = match === SOMETIMES_MATCH ? classes.add(node) : -1;
          const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
            type: "class",
            value: node.parts,
            inverted: node.inverted,
            ignoreCase: node.ignoreCase,
            unicode: node.unicode
          }) : -1;
          return buildCondition(match, [
            node.unicode ? op.MATCH_UNICODE_CLASS : op.MATCH_CHAR_CLASS,
            classIndex
          ], [
            op.ACCEPT_N,
            node.unicode ? -1 : 1
          ], [
            op.FAIL,
            expectedIndex
          ]);
        },
        any(node) {
          const match = node.match || 0;
          const expectedIndex = match !== ALWAYS_MATCH ? expectations.add({
            type: "any"
          }) : -1;
          return buildCondition(match, [
            op.MATCH_ANY
          ], [
            op.ACCEPT_N,
            1
          ], [
            op.FAIL,
            expectedIndex
          ]);
        }
      });
      generate2(ast2);
    }
    __name(generateBytecode2, "generateBytecode");
    module2.exports = generateBytecode2;
  }
});

// node_modules/source-map-generator/lib/base64.js
var require_base64 = __commonJS({
  "node_modules/source-map-generator/lib/base64.js"(exports2) {
    "use strict";
    var intToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
    exports2.encode = function(number) {
      if (0 <= number && number < intToCharMap.length) {
        return intToCharMap[number];
      }
      throw new TypeError("Must be between 0 and 63: " + number);
    };
  }
});

// node_modules/source-map-generator/lib/base64-vlq.js
var require_base64_vlq = __commonJS({
  "node_modules/source-map-generator/lib/base64-vlq.js"(exports2) {
    "use strict";
    var base642 = require_base64();
    var VLQ_BASE_SHIFT = 5;
    var VLQ_BASE = 1 << VLQ_BASE_SHIFT;
    var VLQ_BASE_MASK = VLQ_BASE - 1;
    var VLQ_CONTINUATION_BIT = VLQ_BASE;
    function toVLQSigned(aValue) {
      return aValue < 0 ? (-aValue << 1) + 1 : (aValue << 1) + 0;
    }
    __name(toVLQSigned, "toVLQSigned");
    exports2.encode = /* @__PURE__ */ __name(function base64VLQ_encode(aValue) {
      let encoded = "";
      let digit;
      let vlq = toVLQSigned(aValue);
      do {
        digit = vlq & VLQ_BASE_MASK;
        vlq >>>= VLQ_BASE_SHIFT;
        if (vlq > 0) {
          digit |= VLQ_CONTINUATION_BIT;
        }
        encoded += base642.encode(digit);
      } while (vlq > 0);
      return encoded;
    }, "base64VLQ_encode");
  }
});

// node_modules/source-map-generator/lib/util.js
var require_util = __commonJS({
  "node_modules/source-map-generator/lib/util.js"(exports2) {
    "use strict";
    function getArg(aArgs, aName, aDefaultValue) {
      if (aName in aArgs) {
        return aArgs[aName];
      } else if (arguments.length === 3) {
        return aDefaultValue;
      }
      throw new Error('"' + aName + '" is a required argument.');
    }
    __name(getArg, "getArg");
    exports2.getArg = getArg;
    var supportsNullProto = function() {
      const obj = /* @__PURE__ */ Object.create(null);
      return !("__proto__" in obj);
    }();
    function identity(s) {
      return s;
    }
    __name(identity, "identity");
    function toSetString(aStr) {
      if (isProtoString(aStr)) {
        return "$" + aStr;
      }
      return aStr;
    }
    __name(toSetString, "toSetString");
    exports2.toSetString = supportsNullProto ? identity : toSetString;
    function fromSetString(aStr) {
      if (isProtoString(aStr)) {
        return aStr.slice(1);
      }
      return aStr;
    }
    __name(fromSetString, "fromSetString");
    exports2.fromSetString = supportsNullProto ? identity : fromSetString;
    function isProtoString(s) {
      if (!s) {
        return false;
      }
      const length = s.length;
      if (length < 9) {
        return false;
      }
      if (s.charCodeAt(length - 1) !== 95 || s.charCodeAt(length - 2) !== 95 || s.charCodeAt(length - 3) !== 111 || s.charCodeAt(length - 4) !== 116 || s.charCodeAt(length - 5) !== 111 || s.charCodeAt(length - 6) !== 114 || s.charCodeAt(length - 7) !== 112 || s.charCodeAt(length - 8) !== 95 || s.charCodeAt(length - 9) !== 95) {
        return false;
      }
      for (let i = length - 10; i >= 0; i--) {
        if (s.charCodeAt(i) !== 36) {
          return false;
        }
      }
      return true;
    }
    __name(isProtoString, "isProtoString");
    function strcmp(aStr1, aStr2) {
      if (aStr1 === aStr2) {
        return 0;
      }
      if (aStr1 === null) {
        return 1;
      }
      if (aStr2 === null) {
        return -1;
      }
      if (aStr1 > aStr2) {
        return 1;
      }
      return -1;
    }
    __name(strcmp, "strcmp");
    function compareByGeneratedPositionsInflated(mappingA, mappingB) {
      let cmp = mappingA.generatedLine - mappingB.generatedLine;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.generatedColumn - mappingB.generatedColumn;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = strcmp(mappingA.source, mappingB.source);
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.originalLine - mappingB.originalLine;
      if (cmp !== 0) {
        return cmp;
      }
      cmp = mappingA.originalColumn - mappingB.originalColumn;
      if (cmp !== 0) {
        return cmp;
      }
      return strcmp(mappingA.name, mappingB.name);
    }
    __name(compareByGeneratedPositionsInflated, "compareByGeneratedPositionsInflated");
    exports2.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;
    var PROTOCOL = "http:";
    var PROTOCOL_AND_HOST = `${PROTOCOL}//host`;
    function createSafeHandler(cb) {
      return (input) => {
        const type = getURLType(input);
        const base = buildSafeBase(input);
        const url = new URL(input, base);
        cb(url);
        const result = url.toString();
        if (type === "absolute") {
          return result;
        } else if (type === "scheme-relative") {
          return result.slice(PROTOCOL.length);
        } else if (type === "path-absolute") {
          return result.slice(PROTOCOL_AND_HOST.length);
        }
        return computeRelativeURL(base, result);
      };
    }
    __name(createSafeHandler, "createSafeHandler");
    function withBase(url, base) {
      return new URL(url, base).toString();
    }
    __name(withBase, "withBase");
    function buildUniqueSegment(prefix, str) {
      let id = 0;
      do {
        const ident = prefix + id++;
        if (str.indexOf(ident) === -1) return ident;
      } while (true);
    }
    __name(buildUniqueSegment, "buildUniqueSegment");
    function buildSafeBase(str) {
      const maxDotParts = str.split("..").length - 1;
      const segment = buildUniqueSegment("p", str);
      let base = `${PROTOCOL_AND_HOST}/`;
      for (let i = 0; i < maxDotParts; i++) {
        base += `${segment}/`;
      }
      return base;
    }
    __name(buildSafeBase, "buildSafeBase");
    var ABSOLUTE_SCHEME = /^[A-Za-z0-9\+\-\.]+:/;
    function getURLType(url) {
      if (url[0] === "/") {
        if (url[1] === "/") return "scheme-relative";
        return "path-absolute";
      }
      return ABSOLUTE_SCHEME.test(url) ? "absolute" : "path-relative";
    }
    __name(getURLType, "getURLType");
    function computeRelativeURL(rootURL, targetURL) {
      if (typeof rootURL === "string") rootURL = new URL(rootURL);
      if (typeof targetURL === "string") targetURL = new URL(targetURL);
      const targetParts = targetURL.pathname.split("/");
      const rootParts = rootURL.pathname.split("/");
      if (rootParts.length > 0 && !rootParts[rootParts.length - 1]) {
        rootParts.pop();
      }
      while (targetParts.length > 0 && rootParts.length > 0 && targetParts[0] === rootParts[0]) {
        targetParts.shift();
        rootParts.shift();
      }
      const relativePath = rootParts.map(() => "..").concat(targetParts).join("/");
      return relativePath + targetURL.search + targetURL.hash;
    }
    __name(computeRelativeURL, "computeRelativeURL");
    var ensureDirectory = createSafeHandler((url) => {
      url.pathname = url.pathname.replace(/\/?$/, "/");
    });
    var normalize = createSafeHandler((url) => {
    });
    exports2.normalize = normalize;
    function join(aRoot, aPath) {
      const pathType = getURLType(aPath);
      const rootType = getURLType(aRoot);
      aRoot = ensureDirectory(aRoot);
      if (pathType === "absolute") {
        return withBase(aPath, void 0);
      }
      if (rootType === "absolute") {
        return withBase(aPath, aRoot);
      }
      if (pathType === "scheme-relative") {
        return normalize(aPath);
      }
      if (rootType === "scheme-relative") {
        return withBase(aPath, withBase(aRoot, PROTOCOL_AND_HOST)).slice(PROTOCOL.length);
      }
      if (pathType === "path-absolute") {
        return normalize(aPath);
      }
      if (rootType === "path-absolute") {
        return withBase(aPath, withBase(aRoot, PROTOCOL_AND_HOST)).slice(PROTOCOL_AND_HOST.length);
      }
      const base = buildSafeBase(aPath + aRoot);
      const newPath = withBase(aPath, withBase(aRoot, base));
      return computeRelativeURL(base, newPath);
    }
    __name(join, "join");
    exports2.join = join;
    function relative(rootURL, targetURL) {
      const result = relativeIfPossible(rootURL, targetURL);
      return typeof result === "string" ? result : normalize(targetURL);
    }
    __name(relative, "relative");
    exports2.relative = relative;
    function relativeIfPossible(rootURL, targetURL) {
      const urlType = getURLType(rootURL);
      if (urlType !== getURLType(targetURL)) {
        return null;
      }
      const base = buildSafeBase(rootURL + targetURL);
      const root = new URL(rootURL, base);
      const target = new URL(targetURL, base);
      try {
        new URL("", target.toString());
      } catch (_err) {
        return null;
      }
      if (target.protocol !== root.protocol || target.user !== root.user || target.password !== root.password || target.hostname !== root.hostname || target.port !== root.port) {
        return null;
      }
      return computeRelativeURL(root, target);
    }
    __name(relativeIfPossible, "relativeIfPossible");
  }
});

// node_modules/source-map-generator/lib/array-set.js
var require_array_set = __commonJS({
  "node_modules/source-map-generator/lib/array-set.js"(exports2) {
    "use strict";
    var _a;
    var ArraySet = (_a = class {
      constructor() {
        this._array = [];
        this._set = /* @__PURE__ */ new Map();
      }
      /**
      * Static method for creating ArraySet instances from an existing array.
      */
      static fromArray(aArray, aAllowDuplicates) {
        const set = new _a();
        for (let i = 0, len = aArray.length; i < len; i++) {
          set.add(aArray[i], aAllowDuplicates);
        }
        return set;
      }
      /**
      * Return how many unique items are in this ArraySet. If duplicates have been
      * added, than those do not count towards the size.
      *
      * @returns Number
      */
      size() {
        return this._set.size;
      }
      /**
      * Add the given string to this set.
      *
      * @param String aStr
      */
      add(aStr, aAllowDuplicates) {
        const isDuplicate = this.has(aStr);
        const idx = this._array.length;
        if (!isDuplicate || aAllowDuplicates) {
          this._array.push(aStr);
        }
        if (!isDuplicate) {
          this._set.set(aStr, idx);
        }
      }
      /**
      * Is the given string a member of this set?
      *
      * @param String aStr
      */
      has(aStr) {
        return this._set.has(aStr);
      }
      /**
      * What is the index of the given string in the array?
      *
      * @param String aStr
      */
      indexOf(aStr) {
        const idx = this._set.get(aStr);
        if (idx >= 0) {
          return idx;
        }
        throw new Error('"' + aStr + '" is not in the set.');
      }
      /**
      * What is the element at the given index?
      *
      * @param Number aIdx
      */
      at(aIdx) {
        if (aIdx >= 0 && aIdx < this._array.length) {
          return this._array[aIdx];
        }
        throw new Error("No element indexed by " + aIdx);
      }
      /**
      * Returns the array representation of this set (which has the proper indices
      * indicated by indexOf). Note that this is a copy of the internal array used
      * for storing the members so that no one can mess with internal state.
      */
      toArray() {
        return this._array.slice();
      }
    }, __name(_a, "ArraySet"), _a);
    exports2.ArraySet = ArraySet;
  }
});

// node_modules/source-map-generator/lib/mapping-list.js
var require_mapping_list = __commonJS({
  "node_modules/source-map-generator/lib/mapping-list.js"(exports2) {
    "use strict";
    var util = require_util();
    function generatedPositionAfter(mappingA, mappingB) {
      const lineA = mappingA.generatedLine;
      const lineB = mappingB.generatedLine;
      const columnA = mappingA.generatedColumn;
      const columnB = mappingB.generatedColumn;
      return lineB > lineA || lineB == lineA && columnB >= columnA || util.compareByGeneratedPositionsInflated(mappingA, mappingB) <= 0;
    }
    __name(generatedPositionAfter, "generatedPositionAfter");
    var _a;
    var MappingList = (_a = class {
      constructor() {
        this._array = [];
        this._sorted = true;
        this._last = {
          generatedLine: -1,
          generatedColumn: 0
        };
      }
      /**
      * Iterate through internal items. This method takes the same arguments that
      * `Array.prototype.forEach` takes.
      *
      * NOTE: The order of the mappings is NOT guaranteed.
      */
      unsortedForEach(aCallback, aThisArg) {
        this._array.forEach(aCallback, aThisArg);
      }
      /**
      * Add the given source mapping.
      *
      * @param Object aMapping
      */
      add(aMapping) {
        if (generatedPositionAfter(this._last, aMapping)) {
          this._last = aMapping;
          this._array.push(aMapping);
        } else {
          this._sorted = false;
          this._array.push(aMapping);
        }
      }
      /**
      * Returns the flat, sorted array of mappings. The mappings are sorted by
      * generated position.
      *
      * WARNING: This method returns internal data without copying, for
      * performance. The return value must NOT be mutated, and should be treated as
      * an immutable borrow. If you want to take ownership, you must make your own
      * copy.
      */
      toArray() {
        if (!this._sorted) {
          this._array.sort(util.compareByGeneratedPositionsInflated);
          this._sorted = true;
        }
        return this._array;
      }
    }, __name(_a, "MappingList"), _a);
    exports2.MappingList = MappingList;
  }
});

// node_modules/source-map-generator/lib/source-map-generator.js
var require_source_map_generator = __commonJS({
  "node_modules/source-map-generator/lib/source-map-generator.js"(exports2) {
    "use strict";
    var base64VLQ = require_base64_vlq();
    var util = require_util();
    var ArraySet = require_array_set().ArraySet;
    var MappingList = require_mapping_list().MappingList;
    var _a;
    var SourceMapGenerator = (_a = class {
      constructor(aArgs) {
        if (!aArgs) {
          aArgs = {};
        }
        this._file = util.getArg(aArgs, "file", null);
        this._sourceRoot = util.getArg(aArgs, "sourceRoot", null);
        this._skipValidation = util.getArg(aArgs, "skipValidation", false);
        this._sources = new ArraySet();
        this._names = new ArraySet();
        this._mappings = new MappingList();
        this._sourcesContents = null;
      }
      /**
      * Creates a new SourceMapGenerator based on a SourceMapConsumer
      *
      * @param aSourceMapConsumer The SourceMap.
      */
      static fromSourceMap(aSourceMapConsumer) {
        const sourceRoot = aSourceMapConsumer.sourceRoot;
        const generator = new _a({
          file: aSourceMapConsumer.file,
          sourceRoot
        });
        aSourceMapConsumer.eachMapping(function(mapping) {
          const newMapping = {
            generated: {
              line: mapping.generatedLine,
              column: mapping.generatedColumn
            }
          };
          if (mapping.source != null) {
            newMapping.source = mapping.source;
            if (sourceRoot != null) {
              newMapping.source = util.relative(sourceRoot, newMapping.source);
            }
            newMapping.original = {
              line: mapping.originalLine,
              column: mapping.originalColumn
            };
            if (mapping.name != null) {
              newMapping.name = mapping.name;
            }
          }
          generator.addMapping(newMapping);
        });
        aSourceMapConsumer.sources.forEach(function(sourceFile) {
          let sourceRelative = sourceFile;
          if (sourceRoot != null) {
            sourceRelative = util.relative(sourceRoot, sourceFile);
          }
          if (!generator._sources.has(sourceRelative)) {
            generator._sources.add(sourceRelative);
          }
          const content = aSourceMapConsumer.sourceContentFor(sourceFile);
          if (content != null) {
            generator.setSourceContent(sourceFile, content);
          }
        });
        return generator;
      }
      /**
      * Add a single mapping from original source line and column to the generated
      * source's line and column for this source map being created. The mapping
      * object should have the following properties:
      *
      *   - generated: An object with the generated line and column positions.
      *   - original: An object with the original line and column positions.
      *   - source: The original source file (relative to the sourceRoot).
      *   - name: An optional original token name for this mapping.
      */
      addMapping(aArgs) {
        const generated = util.getArg(aArgs, "generated");
        const original = util.getArg(aArgs, "original", null);
        let source = util.getArg(aArgs, "source", null);
        let name = util.getArg(aArgs, "name", null);
        if (!this._skipValidation) {
          this._validateMapping(generated, original, source, name);
        }
        if (source != null) {
          source = String(source);
          if (!this._sources.has(source)) {
            this._sources.add(source);
          }
        }
        if (name != null) {
          name = String(name);
          if (!this._names.has(name)) {
            this._names.add(name);
          }
        }
        this._mappings.add({
          generatedLine: generated.line,
          generatedColumn: generated.column,
          originalLine: original && original.line,
          originalColumn: original && original.column,
          source,
          name
        });
      }
      /**
      * Set the source content for a source file.
      */
      setSourceContent(aSourceFile, aSourceContent) {
        let source = aSourceFile;
        if (this._sourceRoot != null) {
          source = util.relative(this._sourceRoot, source);
        }
        if (aSourceContent != null) {
          if (!this._sourcesContents) {
            this._sourcesContents = /* @__PURE__ */ Object.create(null);
          }
          this._sourcesContents[util.toSetString(source)] = aSourceContent;
        } else if (this._sourcesContents) {
          delete this._sourcesContents[util.toSetString(source)];
          if (Object.keys(this._sourcesContents).length === 0) {
            this._sourcesContents = null;
          }
        }
      }
      /**
      * Applies the mappings of a sub-source-map for a specific source file to the
      * source map being generated. Each mapping to the supplied source file is
      * rewritten using the supplied source map. Note: The resolution for the
      * resulting mappings is the minimium of this map and the supplied map.
      *
      * @param aSourceMapConsumer The source map to be applied.
      * @param aSourceFile Optional. The filename of the source file.
      *        If omitted, SourceMapConsumer's file property will be used.
      * @param aSourceMapPath Optional. The dirname of the path to the source map
      *        to be applied. If relative, it is relative to the SourceMapConsumer.
      *        This parameter is needed when the two source maps aren't in the same
      *        directory, and the source map to be applied contains relative source
      *        paths. If so, those relative source paths need to be rewritten
      *        relative to the SourceMapGenerator.
      */
      applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
        let sourceFile = aSourceFile;
        if (aSourceFile == null) {
          if (aSourceMapConsumer.file == null) {
            throw new Error(`SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map's "file" property. Both were omitted.`);
          }
          sourceFile = aSourceMapConsumer.file;
        }
        const sourceRoot = this._sourceRoot;
        if (sourceRoot != null) {
          sourceFile = util.relative(sourceRoot, sourceFile);
        }
        const newSources = this._mappings.toArray().length > 0 ? new ArraySet() : this._sources;
        const newNames = new ArraySet();
        this._mappings.unsortedForEach(function(mapping) {
          if (mapping.source === sourceFile && mapping.originalLine != null) {
            const original = aSourceMapConsumer.originalPositionFor({
              line: mapping.originalLine,
              column: mapping.originalColumn
            });
            if (original.source != null) {
              mapping.source = original.source;
              if (aSourceMapPath != null) {
                mapping.source = util.join(aSourceMapPath, mapping.source);
              }
              if (sourceRoot != null) {
                mapping.source = util.relative(sourceRoot, mapping.source);
              }
              mapping.originalLine = original.line;
              mapping.originalColumn = original.column;
              if (original.name != null) {
                mapping.name = original.name;
              }
            }
          }
          const source = mapping.source;
          if (source != null && !newSources.has(source)) {
            newSources.add(source);
          }
          const name = mapping.name;
          if (name != null && !newNames.has(name)) {
            newNames.add(name);
          }
        }, this);
        this._sources = newSources;
        this._names = newNames;
        aSourceMapConsumer.sources.forEach(function(srcFile) {
          const content = aSourceMapConsumer.sourceContentFor(srcFile);
          if (content != null) {
            if (aSourceMapPath != null) {
              srcFile = util.join(aSourceMapPath, srcFile);
            }
            if (sourceRoot != null) {
              srcFile = util.relative(sourceRoot, srcFile);
            }
            this.setSourceContent(srcFile, content);
          }
        }, this);
      }
      /**
      * A mapping can have one of the three levels of data:
      *
      *   1. Just the generated position.
      *   2. The Generated position, original position, and original source.
      *   3. Generated and original position, original source, as well as a name
      *      token.
      *
      * To maintain consistency, we validate that any new mapping being added falls
      * in to one of these categories.
      */
      _validateMapping(aGenerated, aOriginal, aSource, aName) {
        if (aOriginal && typeof aOriginal.line !== "number" && typeof aOriginal.column !== "number") {
          throw new Error("original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values.");
        }
        if (aGenerated && "line" in aGenerated && "column" in aGenerated && aGenerated.line > 0 && aGenerated.column >= 0 && !aOriginal && !aSource && !aName) {
        } else if (aGenerated && "line" in aGenerated && "column" in aGenerated && aOriginal && "line" in aOriginal && "column" in aOriginal && aGenerated.line > 0 && aGenerated.column >= 0 && aOriginal.line > 0 && aOriginal.column >= 0 && aSource) {
        } else {
          throw new Error("Invalid mapping: " + JSON.stringify({
            generated: aGenerated,
            source: aSource,
            original: aOriginal,
            name: aName
          }));
        }
      }
      /**
      * Serialize the accumulated mappings in to the stream of base 64 VLQs
      * specified by the source map format.
      */
      _serializeMappings() {
        let previousGeneratedColumn = 0;
        let previousGeneratedLine = 1;
        let previousOriginalColumn = 0;
        let previousOriginalLine = 0;
        let previousName = 0;
        let previousSource = 0;
        let result = "";
        let next;
        let mapping;
        let nameIdx;
        let sourceIdx;
        const mappings = this._mappings.toArray();
        for (let i = 0, len = mappings.length; i < len; i++) {
          mapping = mappings[i];
          next = "";
          if (mapping.generatedLine !== previousGeneratedLine) {
            previousGeneratedColumn = 0;
            while (mapping.generatedLine !== previousGeneratedLine) {
              next += ";";
              previousGeneratedLine++;
            }
          } else if (i > 0) {
            if (!util.compareByGeneratedPositionsInflated(mapping, mappings[i - 1])) {
              continue;
            }
            next += ",";
          }
          next += base64VLQ.encode(mapping.generatedColumn - previousGeneratedColumn);
          previousGeneratedColumn = mapping.generatedColumn;
          if (mapping.source != null) {
            sourceIdx = this._sources.indexOf(mapping.source);
            next += base64VLQ.encode(sourceIdx - previousSource);
            previousSource = sourceIdx;
            next += base64VLQ.encode(mapping.originalLine - 1 - previousOriginalLine);
            previousOriginalLine = mapping.originalLine - 1;
            next += base64VLQ.encode(mapping.originalColumn - previousOriginalColumn);
            previousOriginalColumn = mapping.originalColumn;
            if (mapping.name != null) {
              nameIdx = this._names.indexOf(mapping.name);
              next += base64VLQ.encode(nameIdx - previousName);
              previousName = nameIdx;
            }
          }
          result += next;
        }
        return result;
      }
      _generateSourcesContent(aSources, aSourceRoot) {
        return aSources.map(function(source) {
          if (!this._sourcesContents) {
            return null;
          }
          if (aSourceRoot != null) {
            source = util.relative(aSourceRoot, source);
          }
          const key = util.toSetString(source);
          return Object.prototype.hasOwnProperty.call(this._sourcesContents, key) ? this._sourcesContents[key] : null;
        }, this);
      }
      /**
      * Externalize the source map.
      */
      toJSON() {
        const map = {
          version: this._version,
          sources: this._sources.toArray(),
          names: this._names.toArray(),
          mappings: this._serializeMappings()
        };
        if (this._file != null) {
          map.file = this._file;
        }
        if (this._sourceRoot != null) {
          map.sourceRoot = this._sourceRoot;
        }
        if (this._sourcesContents) {
          map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
        }
        return map;
      }
      /**
      * Render the source map being generated to a string.
      */
      toString() {
        return JSON.stringify(this.toJSON());
      }
    }, __name(_a, "SourceMapGenerator"), _a);
    SourceMapGenerator.prototype._version = 3;
    exports2.SourceMapGenerator = SourceMapGenerator;
  }
});

// node_modules/source-map-generator/lib/source-node.js
var require_source_node = __commonJS({
  "node_modules/source-map-generator/lib/source-node.js"(exports2) {
    "use strict";
    var SourceMapGenerator = require_source_map_generator().SourceMapGenerator;
    var util = require_util();
    var REGEX_NEWLINE = /(\r?\n)/;
    var NEWLINE_CODE = 10;
    var isSourceNode = "$$$isSourceNode$$$";
    var _a;
    var SourceNode = (_a = class {
      constructor(aLine, aColumn, aSource, aChunks, aName) {
        this.children = [];
        this.sourceContents = {};
        this.line = aLine == null ? null : aLine;
        this.column = aColumn == null ? null : aColumn;
        this.source = aSource == null ? null : aSource;
        this.name = aName == null ? null : aName;
        this[isSourceNode] = true;
        if (aChunks != null) this.add(aChunks);
      }
      /**
      * Creates a SourceNode from generated code and a SourceMapConsumer.
      *
      * @param aGeneratedCode The generated code
      * @param aSourceMapConsumer The SourceMap for the generated code
      * @param aRelativePath Optional. The path that relative sources in the
      *        SourceMapConsumer should be relative to.
      */
      static fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
        const node = new _a();
        const remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
        let remainingLinesIndex = 0;
        const shiftNextLine = /* @__PURE__ */ __name(function() {
          const lineContents = getNextLine();
          const newLine = getNextLine() || "";
          return lineContents + newLine;
          function getNextLine() {
            return remainingLinesIndex < remainingLines.length ? remainingLines[remainingLinesIndex++] : void 0;
          }
          __name(getNextLine, "getNextLine");
        }, "shiftNextLine");
        let lastGeneratedLine = 1, lastGeneratedColumn = 0;
        let lastMapping = null;
        let nextLine;
        aSourceMapConsumer.eachMapping(function(mapping) {
          if (lastMapping !== null) {
            if (lastGeneratedLine < mapping.generatedLine) {
              addMappingWithCode(lastMapping, shiftNextLine());
              lastGeneratedLine++;
              lastGeneratedColumn = 0;
            } else {
              nextLine = remainingLines[remainingLinesIndex] || "";
              const code = nextLine.substr(0, mapping.generatedColumn - lastGeneratedColumn);
              remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn - lastGeneratedColumn);
              lastGeneratedColumn = mapping.generatedColumn;
              addMappingWithCode(lastMapping, code);
              lastMapping = mapping;
              return;
            }
          }
          while (lastGeneratedLine < mapping.generatedLine) {
            node.add(shiftNextLine());
            lastGeneratedLine++;
          }
          if (lastGeneratedColumn < mapping.generatedColumn) {
            nextLine = remainingLines[remainingLinesIndex] || "";
            node.add(nextLine.substr(0, mapping.generatedColumn));
            remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
          }
          lastMapping = mapping;
        }, this);
        if (remainingLinesIndex < remainingLines.length) {
          if (lastMapping) {
            addMappingWithCode(lastMapping, shiftNextLine());
          }
          node.add(remainingLines.splice(remainingLinesIndex).join(""));
        }
        aSourceMapConsumer.sources.forEach(function(sourceFile) {
          const content = aSourceMapConsumer.sourceContentFor(sourceFile);
          if (content != null) {
            if (aRelativePath != null) {
              sourceFile = util.join(aRelativePath, sourceFile);
            }
            node.setSourceContent(sourceFile, content);
          }
        });
        return node;
        function addMappingWithCode(mapping, code) {
          if (mapping === null || mapping.source === void 0) {
            node.add(code);
          } else {
            const source = aRelativePath ? util.join(aRelativePath, mapping.source) : mapping.source;
            node.add(new _a(mapping.originalLine, mapping.originalColumn, source, code, mapping.name));
          }
        }
        __name(addMappingWithCode, "addMappingWithCode");
      }
      /**
      * Add a chunk of generated JS to this source node.
      *
      * @param aChunk A string snippet of generated JS code, another instance of
      *        SourceNode, or an array where each member is one of those things.
      */
      add(aChunk) {
        if (Array.isArray(aChunk)) {
          aChunk.forEach(function(chunk) {
            this.add(chunk);
          }, this);
        } else if (aChunk[isSourceNode] || typeof aChunk === "string") {
          if (aChunk) {
            this.children.push(aChunk);
          }
        } else {
          throw new TypeError("Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk);
        }
        return this;
      }
      /**
      * Add a chunk of generated JS to the beginning of this source node.
      *
      * @param aChunk A string snippet of generated JS code, another instance of
      *        SourceNode, or an array where each member is one of those things.
      */
      prepend(aChunk) {
        if (Array.isArray(aChunk)) {
          for (let i = aChunk.length - 1; i >= 0; i--) {
            this.prepend(aChunk[i]);
          }
        } else if (aChunk[isSourceNode] || typeof aChunk === "string") {
          this.children.unshift(aChunk);
        } else {
          throw new TypeError("Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk);
        }
        return this;
      }
      /**
      * Walk over the tree of JS snippets in this node and its children. The
      * walking function is called once for each snippet of JS and is passed that
      * snippet and the its original associated source's line/column location.
      *
      * @param aFn The traversal function.
      */
      walk(aFn) {
        let chunk;
        for (let i = 0, len = this.children.length; i < len; i++) {
          chunk = this.children[i];
          if (chunk[isSourceNode]) {
            chunk.walk(aFn);
          } else if (chunk !== "") {
            aFn(chunk, {
              source: this.source,
              line: this.line,
              column: this.column,
              name: this.name
            });
          }
        }
      }
      /**
      * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
      * each of `this.children`.
      *
      * @param aSep The separator.
      */
      join(aSep) {
        let newChildren;
        let i;
        const len = this.children.length;
        if (len > 0) {
          newChildren = [];
          for (i = 0; i < len - 1; i++) {
            newChildren.push(this.children[i]);
            newChildren.push(aSep);
          }
          newChildren.push(this.children[i]);
          this.children = newChildren;
        }
        return this;
      }
      /**
      * Call String.prototype.replace on the very right-most source snippet. Useful
      * for trimming whitespace from the end of a source node, etc.
      *
      * @param aPattern The pattern to replace.
      * @param aReplacement The thing to replace the pattern with.
      */
      replaceRight(aPattern, aReplacement) {
        const lastChild = this.children[this.children.length - 1];
        if (lastChild[isSourceNode]) {
          lastChild.replaceRight(aPattern, aReplacement);
        } else if (typeof lastChild === "string") {
          this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
        } else {
          this.children.push("".replace(aPattern, aReplacement));
        }
        return this;
      }
      /**
      * Set the source content for a source file. This will be added to the SourceMapGenerator
      * in the sourcesContent field.
      *
      * @param aSourceFile The filename of the source file
      * @param aSourceContent The content of the source file
      */
      setSourceContent(aSourceFile, aSourceContent) {
        this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
      }
      /**
      * Walk over the tree of SourceNodes. The walking function is called for each
      * source file content and is passed the filename and source content.
      *
      * @param aFn The traversal function.
      */
      walkSourceContents(aFn) {
        for (let i = 0, len = this.children.length; i < len; i++) {
          if (this.children[i][isSourceNode]) {
            this.children[i].walkSourceContents(aFn);
          }
        }
        const sources = Object.keys(this.sourceContents);
        for (let i = 0, len = sources.length; i < len; i++) {
          aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
        }
      }
      /**
      * Return the string representation of this source node. Walks over the tree
      * and concatenates all the various snippets together to one string.
      */
      toString() {
        let str = "";
        this.walk(function(chunk) {
          str += chunk;
        });
        return str;
      }
      /**
      * Returns the string representation of this source node along with a source
      * map.
      */
      toStringWithSourceMap(aArgs) {
        const generated = {
          code: "",
          line: 1,
          column: 0
        };
        const map = new SourceMapGenerator(aArgs);
        let sourceMappingActive = false;
        let lastOriginalSource = null;
        let lastOriginalLine = null;
        let lastOriginalColumn = null;
        let lastOriginalName = null;
        this.walk(function(chunk, original) {
          generated.code += chunk;
          if (original.source !== null && original.line !== null && original.column !== null) {
            if (lastOriginalSource !== original.source || lastOriginalLine !== original.line || lastOriginalColumn !== original.column || lastOriginalName !== original.name) {
              map.addMapping({
                source: original.source,
                original: {
                  line: original.line,
                  column: original.column
                },
                generated: {
                  line: generated.line,
                  column: generated.column
                },
                name: original.name
              });
            }
            lastOriginalSource = original.source;
            lastOriginalLine = original.line;
            lastOriginalColumn = original.column;
            lastOriginalName = original.name;
            sourceMappingActive = true;
          } else if (sourceMappingActive) {
            map.addMapping({
              generated: {
                line: generated.line,
                column: generated.column
              }
            });
            lastOriginalSource = null;
            sourceMappingActive = false;
          }
          for (let idx = 0, length = chunk.length; idx < length; idx++) {
            if (chunk.charCodeAt(idx) === NEWLINE_CODE) {
              generated.line++;
              generated.column = 0;
              if (idx + 1 === length) {
                lastOriginalSource = null;
                sourceMappingActive = false;
              } else if (sourceMappingActive) {
                map.addMapping({
                  source: original.source,
                  original: {
                    line: original.line,
                    column: original.column
                  },
                  generated: {
                    line: generated.line,
                    column: generated.column
                  },
                  name: original.name
                });
              }
            } else {
              generated.column++;
            }
          }
        });
        this.walkSourceContents(function(sourceFile, sourceContent) {
          map.setSourceContent(sourceFile, sourceContent);
        });
        return {
          code: generated.code,
          map
        };
      }
    }, __name(_a, "SourceNode"), _a);
    exports2.SourceNode = SourceNode;
  }
});

// node_modules/source-map-generator/source-map.js
var require_source_map = __commonJS({
  "node_modules/source-map-generator/source-map.js"(exports2) {
    "use strict";
    exports2.SourceMapGenerator = require_source_map_generator().SourceMapGenerator;
    exports2.SourceNode = require_source_node().SourceNode;
  }
});

// node_modules/peggy/lib/compiler/stack.js
var require_stack = __commonJS({
  "node_modules/peggy/lib/compiler/stack.js"(exports2, module2) {
    "use strict";
    var { SourceNode } = require_source_map();
    var GrammarLocation = require_grammar_location();
    var _a;
    var Stack = (_a = class {
      /**
      * Constructs the helper for tracking variable slots of the stack virtual machine
      *
      * @param {string} ruleName The name of rule that will be used in error messages
      * @param {string} varName The prefix for generated names of variables
      * @param {string} type The type of the variables. For JavaScript there are `var` or `let`
      * @param {number[]} bytecode Bytecode for error messages
      */
      constructor(ruleName, varName, type, bytecode) {
        this.sp = -1;
        this.maxSp = -1;
        this.varName = varName;
        this.ruleName = ruleName;
        this.type = type;
        this.bytecode = bytecode;
        this.labels = {};
        this.sourceMapStack = [];
      }
      /**
      * Returns name of the variable at the index `i`.
      *
      * @param {number} i Index for which name must be generated
      * @return {string} Generated name
      *
      * @throws {RangeError} If `i < 0`, which means a stack underflow (there are more `pop`s than `push`es)
      */
      name(i) {
        if (i < 0) {
          throw new RangeError(`Rule '${this.ruleName}': The variable stack underflow: attempt to use a variable '${this.varName}<x>' at an index ${i}.
Bytecode: ${this.bytecode}`);
        }
        return this.varName + i;
      }
      /**
      *
      * @param {PEG.LocationRange} location
      * @param {SourceArray} chunks
      * @param {string} [name]
      * @returns
      */
      static sourceNode(location, chunks, name) {
        const start = GrammarLocation.offsetStart(location);
        return new SourceNode(start.line, start.column ? start.column - 1 : null, String(location.source), chunks, name);
      }
      /**
      * Assigns `exprCode` to the new variable in the stack, returns generated code.
      * As the result, the size of a stack increases on 1.
      *
      * @param {string} exprCode Any expression code that must be assigned to the new variable in the stack
      * @return {string|SourceNode} Assignment code
      */
      push(exprCode) {
        if (++this.sp > this.maxSp) {
          this.maxSp = this.sp;
        }
        const label = this.labels[this.sp];
        const code = [
          this.name(this.sp),
          " = ",
          exprCode,
          ";"
        ];
        if (label) {
          if (this.sourceMapStack.length) {
            const sourceNode = _a.sourceNode(label.location, code.splice(0, 2), label.label);
            const { parts, location } = this.sourceMapPopInternal();
            const newLoc = location.start.offset < label.location.end.offset ? {
              start: label.location.end,
              end: location.end,
              source: location.source
            } : location;
            const outerNode = _a.sourceNode(newLoc, code.concat("\n"));
            this.sourceMapStack.push([
              parts,
              parts.length + 1,
              location
            ]);
            return new SourceNode(null, null, label.location.source, [
              sourceNode,
              outerNode
            ]);
          } else {
            return _a.sourceNode(label.location, code.concat("\n"));
          }
        }
        return code.join("");
      }
      /**
      * @overload
      * @param {undefined} [n]
      * @return {string}
      */
      /**
      * @overload
      * @param {number} n
      * @return {string[]}
      */
      /**
      * Returns name or `n` names of the variable(s) from the top of the stack.
      *
      * @param {number} [n] Quantity of variables, which need to be removed from the stack
      * @returns {string[]|string} Generated name(s). If n is defined then it returns an
      *                            array of length `n`
      *
      * @throws {RangeError} If the stack underflow (there are more `pop`s than `push`es)
      */
      pop(n) {
        if (n !== void 0) {
          this.sp -= n;
          return Array.from({
            length: n
          }, (v, i) => this.name(this.sp + 1 + i));
        }
        return this.name(this.sp--);
      }
      /**
      * Returns name of the first free variable. The same as `index(0)`.
      *
      * @return {string} Generated name
      *
      * @throws {RangeError} If the stack is empty (there was no `push`'s yet)
      */
      top() {
        return this.name(this.sp);
      }
      /**
      * Returns name of the variable at index `i`.
      *
      * @param {number} i Index of the variable from top of the stack
      * @return {string} Generated name
      *
      * @throws {RangeError} If `i < 0` or more than the stack size
      */
      index(i) {
        if (i < 0) {
          throw new RangeError(`Rule '${this.ruleName}': The variable stack overflow: attempt to get a variable at a negative index ${i}.
Bytecode: ${this.bytecode}`);
        }
        return this.name(this.sp - i);
      }
      /**
      * Returns variable name that contains result (bottom of the stack).
      *
      * @return {string} Generated name
      *
      * @throws {RangeError} If the stack is empty (there was no `push`es yet)
      */
      result() {
        if (this.maxSp < 0) {
          throw new RangeError(`Rule '${this.ruleName}': The variable stack is empty, can't get the result.
Bytecode: ${this.bytecode}`);
        }
        return this.name(0);
      }
      /**
      * Returns defines of all used variables.
      *
      * @return {string} Generated define variable expression with the type `this.type`.
      *         If the stack is empty, returns empty string
      */
      defines() {
        if (this.maxSp < 0) {
          return "";
        }
        return this.type + " " + Array.from({
          length: this.maxSp + 1
        }, (v, i) => this.name(i)).join(", ") + ";";
      }
      /**
      * Checks that code in the `generateIf` and `generateElse` move the stack pointer in the same way.
      *
      * @template T
      * @param {number} pos Opcode number for error messages
      * @param {() => T} generateIf First function that works with this stack
      * @param {(() => T)|null} [generateElse] Second function that works with this stack
      * @return {T[]}
      *
      * @throws {Error} If `generateElse` is defined and the stack pointer moved differently in the
      *         `generateIf` and `generateElse`
      */
      checkedIf(pos, generateIf, generateElse) {
        const baseSp = this.sp;
        const ifResult = generateIf();
        if (!generateElse) {
          return [
            ifResult
          ];
        }
        const thenSp = this.sp;
        this.sp = baseSp;
        const elseResult = generateElse();
        if (thenSp !== this.sp) {
          throw new Error("Rule '" + this.ruleName + "', position " + pos + ": Branches of a condition can't move the stack pointer differently (before: " + baseSp + ", after then: " + thenSp + ", after else: " + this.sp + "). Bytecode: " + this.bytecode);
        }
        return [
          ifResult,
          elseResult
        ];
      }
      /**
      * Checks that code in the `generateBody` do not move stack pointer.
      *
      * @template T
      * @param {number} pos Opcode number for error messages
      * @param {() => T} generateBody Function that works with this stack
      * @return {T}
      *
      * @throws {Error} If `generateBody` move the stack pointer (if it contains unbalanced `push`es and `pop`s)
      */
      checkedLoop(pos, generateBody) {
        const baseSp = this.sp;
        const result = generateBody();
        if (baseSp !== this.sp) {
          throw new Error("Rule '" + this.ruleName + "', position " + pos + ": Body of a loop can't move the stack pointer (before: " + baseSp + ", after: " + this.sp + "). Bytecode: " + this.bytecode);
        }
        return result;
      }
      /**
      *
      * @param {SourceArray} parts
      * @param {PEG.LocationRange} location
      */
      sourceMapPush(parts, location) {
        if (this.sourceMapStack.length) {
          const top = this.sourceMapStack[this.sourceMapStack.length - 1];
          if (top[2].start.offset === location.start.offset && top[2].end.offset > location.end.offset) {
            top[2] = {
              start: location.end,
              end: top[2].end,
              source: top[2].source
            };
          }
        }
        this.sourceMapStack.push([
          parts,
          parts.length,
          location
        ]);
      }
      /**
      * @returns {{parts:SourceArray,location:PEG.LocationRange}}
      */
      sourceMapPopInternal() {
        const elt = this.sourceMapStack.pop();
        if (!elt) {
          throw new RangeError(`Rule '${this.ruleName}': Attempting to pop an empty source map stack.
Bytecode: ${this.bytecode}`);
        }
        const [parts, index, location] = elt;
        const chunks = parts.splice(index).map((chunk) => chunk instanceof SourceNode ? chunk : chunk + "\n");
        if (chunks.length) {
          const start = GrammarLocation.offsetStart(location);
          parts.push(new SourceNode(start.line, start.column - 1, String(location.source), chunks));
        }
        return {
          parts,
          location
        };
      }
      /**
      * @param {number} [offset]
      * @returns {[SourceArray, number, PEG.LocationRange]|undefined}
      */
      sourceMapPop(offset) {
        const { location } = this.sourceMapPopInternal();
        if (this.sourceMapStack.length && location.end.offset < this.sourceMapStack[this.sourceMapStack.length - 1][2].end.offset) {
          const { parts, location: outer } = this.sourceMapPopInternal();
          const newLoc = outer.start.offset < location.end.offset ? {
            start: location.end,
            end: outer.end,
            source: outer.source
          } : outer;
          this.sourceMapStack.push([
            parts,
            parts.length + (offset || 0),
            newLoc
          ]);
        }
        return void 0;
      }
    }, __name(_a, "Stack"), _a);
    module2.exports = Stack;
  }
});

// node_modules/peggy/lib/version.js
var require_version = __commonJS({
  "node_modules/peggy/lib/version.js"(exports2) {
    "use strict";
    exports2.version = "5.0.5";
  }
});

// node_modules/peggy/lib/compiler/utils.js
var require_utils = __commonJS({
  "node_modules/peggy/lib/compiler/utils.js"(exports2) {
    "use strict";
    function hex(ch) {
      return ch.codePointAt(0).toString(16).toUpperCase();
    }
    __name(hex, "hex");
    exports2.hex = hex;
    function stringEscape(s) {
      if (typeof s === "object") {
        return `\\\\${s.value}`;
      }
      return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\v/g, "\\v").replace(/\f/g, "\\f").replace(/\r/g, "\\r").replace(/[\u{10000}-\u{10FFFF}]/gu, (ch) => `\\u{${hex(ch)}}`).replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\xFF]/g, (ch) => "\\x" + hex(ch)).replace(/[\u0100-\u0FFF]/g, (ch) => "\\u0" + hex(ch)).replace(/[\u1000-\uFFFF]/g, (ch) => "\\u" + hex(ch));
    }
    __name(stringEscape, "stringEscape");
    exports2.stringEscape = stringEscape;
    function regexpClassEscape(s) {
      if (typeof s === "object") {
        return `\\${s.value}`;
      }
      return s.replace(/\\/g, "\\\\").replace(/\//g, "\\/").replace(/]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\v/g, "\\v").replace(/\f/g, "\\f").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\xFF]/g, (ch) => "\\x" + hex(ch)).replace(/[\u{10000}-\u{10FFFF}]/gu, (ch) => "\\u{" + hex(ch) + "}").replace(/[\u0100-\u0FFF]/g, (ch) => "\\u0" + hex(ch)).replace(/[\u1000-\uFFFF]/g, (ch) => "\\u" + hex(ch));
    }
    __name(regexpClassEscape, "regexpClassEscape");
    exports2.regexpClassEscape = regexpClassEscape;
    function base642(u8) {
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const rem = u8.length % 3;
      const len = u8.length - rem;
      let res = "";
      for (let i = 0; i < len; i += 3) {
        res += A[u8[i] >> 2];
        res += A[(u8[i] & 3) << 4 | u8[i + 1] >> 4];
        res += A[(u8[i + 1] & 15) << 2 | u8[i + 2] >> 6];
        res += A[u8[i + 2] & 63];
      }
      if (rem === 1) {
        res += A[u8[len] >> 2];
        res += A[(u8[len] & 3) << 4];
        res += "==";
      } else if (rem === 2) {
        res += A[u8[len] >> 2];
        res += A[(u8[len] & 3) << 4 | u8[len + 1] >> 4];
        res += A[(u8[len + 1] & 15) << 2];
        res += "=";
      }
      return res;
    }
    __name(base642, "base64");
    exports2.base64 = base642;
    function codePointLen1(s) {
      const iter = s[Symbol.iterator]();
      const first = iter.next();
      if (first.done) {
        return -1;
      }
      const second = iter.next();
      if (!second.done) {
        return -1;
      }
      return first.value.codePointAt(0);
    }
    __name(codePointLen1, "codePointLen1");
    exports2.codePointLen1 = codePointLen1;
  }
});

// node_modules/peggy/lib/parser.js
var require_parser = __commonJS({
  "node_modules/peggy/lib/parser.js"(exports2, module2) {
    "use strict";
    var OPS_TO_PREFIXED_TYPES = {
      "$": "text",
      "&": "simple_and",
      "!": "simple_not"
    };
    var OPS_TO_SUFFIXED_TYPES = {
      "?": "optional",
      "*": "zero_or_more",
      "+": "one_or_more"
    };
    var OPS_TO_SEMANTIC_PREDICATE_TYPES = {
      "&": "semantic_and",
      "!": "semantic_not"
    };
    var _a;
    var peg$SyntaxError = (_a = class extends SyntaxError {
      constructor(message, expected, found, location) {
        super(message);
        this.expected = expected;
        this.found = found;
        this.location = location;
        this.name = "SyntaxError";
      }
      format(sources) {
        let str = "Error: " + this.message;
        if (this.location) {
          let src = null;
          const st = sources.find((s2) => s2.source === this.location.source);
          if (st) {
            src = st.text.split(/\r\n|\n|\r/g);
          }
          const s = this.location.start;
          const offset_s = this.location.source && typeof this.location.source.offset === "function" ? this.location.source.offset(s) : s;
          const loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
          if (src) {
            const e = this.location.end;
            const filler = "".padEnd(offset_s.line.toString().length, " ");
            const line = src[s.line - 1];
            const last = s.line === e.line ? e.column : line.length + 1;
            const hatLen = last - s.column || 1;
            str += "\n --> " + loc + "\n" + filler + " |\n" + offset_s.line + " | " + line + "\n" + filler + " | " + "".padEnd(s.column - 1, " ") + "".padEnd(hatLen, "^");
          } else {
            str += "\n at " + loc;
          }
        }
        return str;
      }
      static buildMessage(expected, found) {
        function hex(ch) {
          return ch.codePointAt(0).toString(16).toUpperCase();
        }
        __name(hex, "hex");
        const nonPrintable = Object.prototype.hasOwnProperty.call(RegExp.prototype, "unicode") ? new RegExp("[\\p{C}\\p{Mn}\\p{Mc}]", "gu") : null;
        function unicodeEscape(s) {
          if (nonPrintable) {
            return s.replace(nonPrintable, (ch) => "\\u{" + hex(ch) + "}");
          }
          return s;
        }
        __name(unicodeEscape, "unicodeEscape");
        function literalEscape(s) {
          return unicodeEscape(s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\x9F]/g, (ch) => "\\x" + hex(ch)));
        }
        __name(literalEscape, "literalEscape");
        function classEscape(s) {
          return unicodeEscape(s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, (ch) => "\\x0" + hex(ch)).replace(/[\x10-\x1F\x7F-\x9F]/g, (ch) => "\\x" + hex(ch)));
        }
        __name(classEscape, "classEscape");
        const DESCRIBE_EXPECTATION_FNS = {
          literal(expectation) {
            return '"' + literalEscape(expectation.text) + '"';
          },
          class(expectation) {
            const escapedParts = expectation.parts.map((part) => Array.isArray(part) ? classEscape(part[0]) + "-" + classEscape(part[1]) : classEscape(part));
            return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]" + (expectation.unicode ? "u" : "");
          },
          any() {
            return "any character";
          },
          end() {
            return "end of input";
          },
          other(expectation) {
            return expectation.description;
          }
        };
        function describeExpectation(expectation) {
          return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
        }
        __name(describeExpectation, "describeExpectation");
        function describeExpected(expected2) {
          const descriptions = expected2.map(describeExpectation);
          descriptions.sort();
          if (descriptions.length > 0) {
            let j = 1;
            for (let i = 1; i < descriptions.length; i++) {
              if (descriptions[i - 1] !== descriptions[i]) {
                descriptions[j] = descriptions[i];
                j++;
              }
            }
            descriptions.length = j;
          }
          switch (descriptions.length) {
            case 1:
              return descriptions[0];
            case 2:
              return descriptions[0] + " or " + descriptions[1];
            default:
              return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
          }
        }
        __name(describeExpected, "describeExpected");
        function describeFound(found2) {
          return found2 ? '"' + literalEscape(found2) + '"' : "end of input";
        }
        __name(describeFound, "describeFound");
        return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
      }
    }, __name(_a, "peg$SyntaxError"), _a);
    function peg$parse(input, options2) {
      options2 = options2 !== void 0 ? options2 : {};
      const peg$FAILED = {};
      const peg$source = options2.grammarSource;
      const peg$startRuleFunctions = {
        Grammar: peg$parseGrammar,
        ImportsAndSource: peg$parseImportsAndSource
      };
      let peg$startRuleFunction = peg$parseGrammar;
      const peg$c0 = "import";
      const peg$c1 = ";";
      const peg$c2 = ",";
      const peg$c3 = "*";
      const peg$c4 = "as";
      const peg$c5 = "{";
      const peg$c6 = "}";
      const peg$c7 = "from";
      const peg$c8 = "=";
      const peg$c9 = "/";
      const peg$c10 = "@";
      const peg$c11 = ":";
      const peg$c12 = "|";
      const peg$c13 = "..";
      const peg$c14 = "(";
      const peg$c15 = ")";
      const peg$c16 = ".";
      const peg$c17 = "\n";
      const peg$c18 = "\r\n";
      const peg$c19 = "/*";
      const peg$c20 = "*/";
      const peg$c21 = "//";
      const peg$c22 = "\\";
      const peg$c23 = "i";
      const peg$c24 = '"';
      const peg$c25 = "'";
      const peg$c26 = "[";
      const peg$c27 = "^";
      const peg$c28 = "]";
      const peg$c29 = "p";
      const peg$c30 = "_";
      const peg$c31 = "u";
      const peg$c32 = "-";
      const peg$c33 = "0";
      const peg$c34 = "b";
      const peg$c35 = "f";
      const peg$c36 = "n";
      const peg$c37 = "r";
      const peg$c38 = "t";
      const peg$c39 = "v";
      const peg$c40 = "x";
      const peg$r0 = /^[!$&]/;
      const peg$r1 = /^[*-+?]/;
      const peg$r2 = /^[!&]/;
      const peg$r3 = /^[\0-\uD7FF\uE000-\uFFFF]/;
      const peg$r4 = /^[\uD800-\uDBFF]/;
      const peg$r5 = /^[\uDC00-\uDFFF]/;
      const peg$r6 = /^[\uD800-\uDFFF]/;
      const peg$r7 = /^[\t\v-\f \p{Zs}\xA0\uFEFF]/u;
      const peg$r8 = /^[\n\r\u2028\u2029]/;
      const peg$r9 = /^[\r\u2028-\u2029]/;
      const peg$r10 = /^[\p{ID_Start}_]/u;
      const peg$r11 = /^[$\p{ID_Continue}]/u;
      const peg$r12 = /^[\n\r"\\\u2028-\u2029]/;
      const peg$r13 = /^[\n\r'\\\u2028-\u2029]/;
      const peg$r14 = /^[a-z]/i;
      const peg$r15 = /^[\n\r\\-\]\u2028-\u2029]/;
      const peg$r16 = /^["'\\]/;
      const peg$r17 = /^[0-9pux]/;
      const peg$r18 = /^[0-9]/;
      const peg$r19 = /^[0-9a-f]/i;
      const peg$r20 = /^[{}]/;
      const peg$e0 = peg$anyExpectation();
      const peg$e1 = peg$literalExpectation("import", false);
      const peg$e2 = peg$literalExpectation(";", false);
      const peg$e3 = peg$literalExpectation(",", false);
      const peg$e4 = peg$literalExpectation("*", false);
      const peg$e5 = peg$literalExpectation("as", false);
      const peg$e6 = peg$literalExpectation("{", false);
      const peg$e7 = peg$literalExpectation("}", false);
      const peg$e8 = peg$literalExpectation("from", false);
      const peg$e9 = peg$literalExpectation("=", false);
      const peg$e10 = peg$literalExpectation("/", false);
      const peg$e11 = peg$literalExpectation("@", false);
      const peg$e12 = peg$literalExpectation(":", false);
      const peg$e13 = peg$classExpectation([
        "!",
        "$",
        "&"
      ], false, false, false);
      const peg$e14 = peg$classExpectation([
        [
          "*",
          "+"
        ],
        "?"
      ], false, false, false);
      const peg$e15 = peg$literalExpectation("|", false);
      const peg$e16 = peg$literalExpectation("..", false);
      const peg$e17 = peg$literalExpectation("(", false);
      const peg$e18 = peg$literalExpectation(")", false);
      const peg$e19 = peg$literalExpectation(".", false);
      const peg$e20 = peg$classExpectation([
        "!",
        "&"
      ], false, false, false);
      const peg$e21 = peg$classExpectation([
        [
          "\0",
          "\uD7FF"
        ],
        [
          "\uE000",
          "\uFFFF"
        ]
      ], false, false, false);
      const peg$e22 = peg$classExpectation([
        [
          "\uD800",
          "\uDBFF"
        ]
      ], false, false, false);
      const peg$e23 = peg$classExpectation([
        [
          "\uDC00",
          "\uDFFF"
        ]
      ], false, false, false);
      const peg$e24 = peg$classExpectation([
        [
          "\uD800",
          "\uDFFF"
        ]
      ], false, false, false);
      const peg$e25 = peg$otherExpectation("whitespace");
      const peg$e26 = peg$classExpectation([
        "	",
        [
          "\v",
          "\f"
        ],
        " ",
        "\\p{Zs}",
        "\xA0",
        "\uFEFF"
      ], false, false, true);
      const peg$e27 = peg$classExpectation([
        "\n",
        "\r",
        "\u2028",
        "\u2029"
      ], false, false, false);
      const peg$e28 = peg$otherExpectation("end of line");
      const peg$e29 = peg$literalExpectation("\n", false);
      const peg$e30 = peg$literalExpectation("\r\n", false);
      const peg$e31 = peg$classExpectation([
        "\r",
        [
          "\u2028",
          "\u2029"
        ]
      ], false, false, false);
      const peg$e32 = peg$otherExpectation("comment");
      const peg$e33 = peg$literalExpectation("/*", false);
      const peg$e34 = peg$literalExpectation("*/", false);
      const peg$e35 = peg$literalExpectation("//", false);
      const peg$e36 = peg$otherExpectation("identifier");
      const peg$e37 = peg$classExpectation([
        "\\p{ID_Start}",
        "_"
      ], false, false, true);
      const peg$e38 = peg$literalExpectation("\\", false);
      const peg$e39 = peg$classExpectation([
        "$",
        "\\p{ID_Continue}"
      ], false, false, true);
      const peg$e40 = peg$otherExpectation("literal");
      const peg$e41 = peg$literalExpectation("i", false);
      const peg$e42 = peg$otherExpectation("string");
      const peg$e43 = peg$literalExpectation('"', false);
      const peg$e44 = peg$literalExpectation("'", false);
      const peg$e45 = peg$classExpectation([
        "\n",
        "\r",
        '"',
        "\\",
        [
          "\u2028",
          "\u2029"
        ]
      ], false, false, false);
      const peg$e46 = peg$classExpectation([
        "\n",
        "\r",
        "'",
        "\\",
        [
          "\u2028",
          "\u2029"
        ]
      ], false, false, false);
      const peg$e47 = peg$otherExpectation("character class");
      const peg$e48 = peg$literalExpectation("[", false);
      const peg$e49 = peg$literalExpectation("^", false);
      const peg$e50 = peg$literalExpectation("]", false);
      const peg$e51 = peg$literalExpectation("p", true);
      const peg$e52 = peg$literalExpectation("_", false);
      const peg$e53 = peg$classExpectation([
        [
          "a",
          "z"
        ]
      ], false, true, false);
      const peg$e54 = peg$literalExpectation("u", false);
      const peg$e55 = peg$literalExpectation("-", false);
      const peg$e56 = peg$classExpectation([
        "\n",
        "\r",
        [
          "\\",
          "]"
        ],
        [
          "\u2028",
          "\u2029"
        ]
      ], false, false, false);
      const peg$e57 = peg$literalExpectation("0", false);
      const peg$e58 = peg$classExpectation([
        '"',
        "'",
        "\\"
      ], false, false, false);
      const peg$e59 = peg$literalExpectation("b", false);
      const peg$e60 = peg$literalExpectation("f", false);
      const peg$e61 = peg$literalExpectation("n", false);
      const peg$e62 = peg$literalExpectation("r", false);
      const peg$e63 = peg$literalExpectation("t", false);
      const peg$e64 = peg$literalExpectation("v", false);
      const peg$e65 = peg$classExpectation([
        [
          "0",
          "9"
        ],
        "p",
        "u",
        "x"
      ], false, false, false);
      const peg$e66 = peg$literalExpectation("x", false);
      const peg$e67 = peg$classExpectation([
        [
          "0",
          "9"
        ]
      ], false, false, false);
      const peg$e68 = peg$classExpectation([
        [
          "0",
          "9"
        ],
        [
          "a",
          "f"
        ]
      ], false, true, false);
      const peg$e69 = peg$otherExpectation("code block");
      const peg$e70 = peg$classExpectation([
        "{",
        "}"
      ], false, false, false);
      function peg$f0(imports, topLevelInitializer, initializer, rules) {
        return {
          type: "grammar",
          imports,
          topLevelInitializer,
          initializer,
          rules,
          location: location()
        };
      }
      __name(peg$f0, "peg$f0");
      function peg$f1(imports, body) {
        return [
          imports,
          body
        ];
      }
      __name(peg$f1, "peg$f1");
      function peg$f2(code) {
        return {
          type: "top_level_initializer",
          code,
          codeLocation: location()
        };
      }
      __name(peg$f2, "peg$f2");
      function peg$f3(code) {
        return {
          type: "top_level_initializer",
          code,
          codeLocation: location()
        };
      }
      __name(peg$f3, "peg$f3");
      function peg$f4(what, from) {
        return {
          type: "grammar_import",
          what,
          from,
          location: location()
        };
      }
      __name(peg$f4, "peg$f4");
      function peg$f5(from) {
        return {
          type: "grammar_import",
          what: [],
          from,
          location: location()
        };
      }
      __name(peg$f5, "peg$f5");
      function peg$f6(first, others) {
        if (!others) {
          return [
            first
          ];
        }
        others.unshift(first);
        return others;
      }
      __name(peg$f6, "peg$f6");
      function peg$f7(binding) {
        return {
          type: "import_binding_default",
          binding: binding[0],
          location: binding[1]
        };
      }
      __name(peg$f7, "peg$f7");
      function peg$f8(binding) {
        return [
          {
            type: "import_binding_all",
            binding: binding[0],
            location: binding[1]
          }
        ];
      }
      __name(peg$f8, "peg$f8");
      function peg$f9() {
        return [];
      }
      __name(peg$f9, "peg$f9");
      function peg$f10(rename, binding) {
        return {
          type: "import_binding_rename",
          rename: rename[0],
          renameLocation: rename[1],
          binding: binding[0],
          location: binding[1]
        };
      }
      __name(peg$f10, "peg$f10");
      function peg$f11(binding) {
        return {
          type: "import_binding",
          binding: binding[0],
          location: binding[1]
        };
      }
      __name(peg$f11, "peg$f11");
      function peg$f12(module1) {
        return {
          type: "import_module_specifier",
          module: module1,
          location: location()
        };
      }
      __name(peg$f12, "peg$f12");
      function peg$f13(id) {
        return [
          id,
          location()
        ];
      }
      __name(peg$f13, "peg$f13");
      function peg$f14(id) {
        return [
          id,
          location()
        ];
      }
      __name(peg$f14, "peg$f14");
      function peg$f15(id) {
        if (reservedWords.has(id[0])) {
          error(`Binding identifier can't be a reserved word "${id[0]}"`, id[1]);
        }
        return id[0];
      }
      __name(peg$f15, "peg$f15");
      function peg$f16(code) {
        return {
          type: "top_level_initializer",
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      }
      __name(peg$f16, "peg$f16");
      function peg$f17(code) {
        return {
          type: "initializer",
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      }
      __name(peg$f17, "peg$f17");
      function peg$f18(name, displayName, expression) {
        return {
          type: "rule",
          name: name[0],
          nameLocation: name[1],
          expression: displayName !== null ? {
            type: "named",
            name: displayName,
            expression,
            location: location()
          } : expression,
          location: location()
        };
      }
      __name(peg$f18, "peg$f18");
      function peg$f19(head, tail) {
        return tail.length > 0 ? {
          type: "choice",
          alternatives: [
            head
          ].concat(tail),
          location: location()
        } : head;
      }
      __name(peg$f19, "peg$f19");
      function peg$f20(expression, code) {
        return code !== null ? {
          type: "action",
          expression,
          code: code[0],
          codeLocation: code[1],
          location: location()
        } : expression;
      }
      __name(peg$f20, "peg$f20");
      function peg$f21(head, tail) {
        return tail.length > 0 || head.type === "labeled" && head.pick ? {
          type: "sequence",
          elements: [
            head
          ].concat(tail),
          location: location()
        } : head;
      }
      __name(peg$f21, "peg$f21");
      function peg$f22(pluck, label, expression) {
        if (expression.type.startsWith("semantic_")) {
          error('"@" cannot be used on a semantic predicate', pluck);
        }
        return {
          type: "labeled",
          label: label !== null ? label[0] : null,
          // Use location of "@" if label is unavailable
          labelLocation: label !== null ? label[1] : pluck,
          pick: true,
          expression,
          location: location()
        };
      }
      __name(peg$f22, "peg$f22");
      function peg$f23(label, expression) {
        return {
          type: "labeled",
          label: label[0],
          labelLocation: label[1],
          expression,
          location: location()
        };
      }
      __name(peg$f23, "peg$f23");
      function peg$f24() {
        return location();
      }
      __name(peg$f24, "peg$f24");
      function peg$f25(label) {
        if (reservedWords.has(label[0])) {
          error(`Label can't be a reserved word "${label[0]}"`, label[1]);
        }
        return label;
      }
      __name(peg$f25, "peg$f25");
      function peg$f26(operator, expression) {
        return {
          type: OPS_TO_PREFIXED_TYPES[operator],
          expression,
          location: location()
        };
      }
      __name(peg$f26, "peg$f26");
      function peg$f27(expression, operator) {
        return {
          type: OPS_TO_SUFFIXED_TYPES[operator],
          expression,
          location: location()
        };
      }
      __name(peg$f27, "peg$f27");
      function peg$f28(expression, boundaries, delimiter) {
        const min = boundaries[0];
        const max = boundaries[1];
        if (max.type === "constant" && max.value === 0) {
          error("The maximum count of repetitions of the rule must be > 0", max.location);
        }
        return {
          type: "repeated",
          min,
          max,
          expression,
          delimiter,
          location: location()
        };
      }
      __name(peg$f28, "peg$f28");
      function peg$f29(min, max) {
        return [
          min !== null ? min : {
            type: "constant",
            value: 0
          },
          max !== null ? max : {
            type: "constant",
            value: null
          }
        ];
      }
      __name(peg$f29, "peg$f29");
      function peg$f30(exact) {
        return [
          null,
          exact
        ];
      }
      __name(peg$f30, "peg$f30");
      function peg$f31(value) {
        return {
          type: "constant",
          value,
          location: location()
        };
      }
      __name(peg$f31, "peg$f31");
      function peg$f32(value) {
        return {
          type: "variable",
          value: value[0],
          location: location()
        };
      }
      __name(peg$f32, "peg$f32");
      function peg$f33(value) {
        return {
          type: "function",
          value: value[0],
          codeLocation: value[1],
          location: location()
        };
      }
      __name(peg$f33, "peg$f33");
      function peg$f34(expression) {
        return expression.type === "labeled" || expression.type === "sequence" ? {
          type: "group",
          expression,
          location: location()
        } : expression;
      }
      __name(peg$f34, "peg$f34");
      function peg$f35(library, name) {
        return {
          type: "library_ref",
          name: name[0],
          library: library[0],
          libraryNumber: -1,
          location: location()
        };
      }
      __name(peg$f35, "peg$f35");
      function peg$f36(name) {
        return {
          type: "rule_ref",
          name: name[0],
          location: location()
        };
      }
      __name(peg$f36, "peg$f36");
      function peg$f37(operator, code) {
        return {
          type: OPS_TO_SEMANTIC_PREDICATE_TYPES[operator],
          code: code[0],
          codeLocation: code[1],
          location: location()
        };
      }
      __name(peg$f37, "peg$f37");
      function peg$f38(head, tail) {
        return [
          head + tail.join(""),
          location()
        ];
      }
      __name(peg$f38, "peg$f38");
      function peg$f39(value, ignoreCase) {
        return {
          type: "literal",
          value,
          ignoreCase: ignoreCase !== null,
          location: location()
        };
      }
      __name(peg$f39, "peg$f39");
      function peg$f40(chars) {
        return chars.join("");
      }
      __name(peg$f40, "peg$f40");
      function peg$f41(chars) {
        return chars.join("");
      }
      __name(peg$f41, "peg$f41");
      function peg$f42(inverted, parts, flags) {
        if (inverted && parts.length === 0) {
          if (flags.unicode) {
            parts = [
              [
                "\uD800",
                "\uDFFF"
              ]
            ];
          } else {
            return {
              type: "any",
              location: location()
            };
          }
        }
        return {
          type: "class",
          parts: parts.filter((part) => part !== ""),
          inverted: Boolean(inverted),
          ignoreCase: Boolean(flags.ignoreCase),
          location: location(),
          unicode: Boolean(flags.unicode) || parts.flat().some((c) => typeof c === "object" && c.unicode || c.codePointAt(0) > 65535)
        };
      }
      __name(peg$f42, "peg$f42");
      function peg$f43(value) {
        try {
          new RegExp(`[\\${value}]`, "u");
        } catch (er) {
          error("Invalid Unicode property escape");
        }
        return {
          type: "classEscape",
          value,
          unicode: true,
          location: location()
        };
      }
      __name(peg$f43, "peg$f43");
      function peg$f44(flags) {
        const ret = Object.fromEntries(flags);
        if (Object.keys(ret).length !== flags.length) {
          error("Invalid flags");
        }
        return ret;
      }
      __name(peg$f44, "peg$f44");
      function peg$f45() {
        return [
          "ignoreCase",
          true
        ];
      }
      __name(peg$f45, "peg$f45");
      function peg$f46() {
        return [
          "unicode",
          true
        ];
      }
      __name(peg$f46, "peg$f46");
      function peg$f47(begin, end) {
        if (begin.codePointAt(0) > end.codePointAt(0)) {
          error("Invalid character range: " + text() + ".");
        }
        return [
          begin,
          end
        ];
      }
      __name(peg$f47, "peg$f47");
      function peg$f48() {
        return "";
      }
      __name(peg$f48, "peg$f48");
      function peg$f49() {
        return "\0";
      }
      __name(peg$f49, "peg$f49");
      function peg$f50() {
        return "\b";
      }
      __name(peg$f50, "peg$f50");
      function peg$f51() {
        return "\f";
      }
      __name(peg$f51, "peg$f51");
      function peg$f52() {
        return "\n";
      }
      __name(peg$f52, "peg$f52");
      function peg$f53() {
        return "\r";
      }
      __name(peg$f53, "peg$f53");
      function peg$f54() {
        return "	";
      }
      __name(peg$f54, "peg$f54");
      function peg$f55() {
        return "\v";
      }
      __name(peg$f55, "peg$f55");
      function peg$f56(digits) {
        return String.fromCharCode(parseInt(digits, 16));
      }
      __name(peg$f56, "peg$f56");
      function peg$f57(digits) {
        return String.fromCharCode(parseInt(digits, 16));
      }
      __name(peg$f57, "peg$f57");
      function peg$f58(digits) {
        return String.fromCodePoint(parseInt(digits, 16));
      }
      __name(peg$f58, "peg$f58");
      function peg$f59() {
        return {
          type: "any",
          location: location()
        };
      }
      __name(peg$f59, "peg$f59");
      function peg$f60(code) {
        return [
          code,
          location()
        ];
      }
      __name(peg$f60, "peg$f60");
      function peg$f61(digits) {
        return parseInt(digits, 10);
      }
      __name(peg$f61, "peg$f61");
      let peg$currPos = options2.peg$currPos | 0;
      let peg$savedPos = peg$currPos;
      const peg$posDetailsCache = [
        {
          line: 1,
          column: 1
        }
      ];
      let peg$maxFailPos = peg$currPos;
      let peg$maxFailExpected = options2.peg$maxFailExpected || [];
      let peg$silentFails = options2.peg$silentFails | 0;
      let peg$result;
      if (options2.startRule) {
        if (!(options2.startRule in peg$startRuleFunctions)) {
          throw new Error(`Can't start parsing from rule "` + options2.startRule + '".');
        }
        peg$startRuleFunction = peg$startRuleFunctions[options2.startRule];
      }
      function text() {
        return input.substring(peg$savedPos, peg$currPos);
      }
      __name(text, "text");
      function offset() {
        return peg$savedPos;
      }
      __name(offset, "offset");
      function range() {
        return {
          source: peg$source,
          start: peg$savedPos,
          end: peg$currPos
        };
      }
      __name(range, "range");
      function location() {
        return peg$computeLocation(peg$savedPos, peg$currPos);
      }
      __name(location, "location");
      function expected(description, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildStructuredError([
          peg$otherExpectation(description)
        ], input.substring(peg$savedPos, peg$currPos), location2);
      }
      __name(expected, "expected");
      function error(message, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildSimpleError(message, location2);
      }
      __name(error, "error");
      function peg$getUnicode(pos = peg$currPos) {
        const cp = input.codePointAt(pos);
        if (cp === void 0) {
          return "";
        }
        return String.fromCodePoint(cp);
      }
      __name(peg$getUnicode, "peg$getUnicode");
      function peg$literalExpectation(text2, ignoreCase) {
        return {
          type: "literal",
          text: text2,
          ignoreCase
        };
      }
      __name(peg$literalExpectation, "peg$literalExpectation");
      function peg$classExpectation(parts, inverted, ignoreCase, unicode) {
        return {
          type: "class",
          parts,
          inverted,
          ignoreCase,
          unicode
        };
      }
      __name(peg$classExpectation, "peg$classExpectation");
      function peg$anyExpectation() {
        return {
          type: "any"
        };
      }
      __name(peg$anyExpectation, "peg$anyExpectation");
      function peg$endExpectation() {
        return {
          type: "end"
        };
      }
      __name(peg$endExpectation, "peg$endExpectation");
      function peg$otherExpectation(description) {
        return {
          type: "other",
          description
        };
      }
      __name(peg$otherExpectation, "peg$otherExpectation");
      function peg$computePosDetails(pos) {
        let details = peg$posDetailsCache[pos];
        let p;
        if (details) {
          return details;
        } else {
          if (pos >= peg$posDetailsCache.length) {
            p = peg$posDetailsCache.length - 1;
          } else {
            p = pos;
            while (!peg$posDetailsCache[--p]) {
            }
          }
          details = peg$posDetailsCache[p];
          details = {
            line: details.line,
            column: details.column
          };
          while (p < pos) {
            if (input.charCodeAt(p) === 10) {
              details.line++;
              details.column = 1;
            } else {
              details.column++;
            }
            p++;
          }
          peg$posDetailsCache[pos] = details;
          return details;
        }
      }
      __name(peg$computePosDetails, "peg$computePosDetails");
      function peg$computeLocation(startPos, endPos, offset2) {
        const startPosDetails = peg$computePosDetails(startPos);
        const endPosDetails = peg$computePosDetails(endPos);
        const res = {
          source: peg$source,
          start: {
            offset: startPos,
            line: startPosDetails.line,
            column: startPosDetails.column
          },
          end: {
            offset: endPos,
            line: endPosDetails.line,
            column: endPosDetails.column
          }
        };
        if (offset2 && peg$source && typeof peg$source.offset === "function") {
          res.start = peg$source.offset(res.start);
          res.end = peg$source.offset(res.end);
        }
        return res;
      }
      __name(peg$computeLocation, "peg$computeLocation");
      function peg$fail(expected2) {
        if (peg$currPos < peg$maxFailPos) {
          return;
        }
        if (peg$currPos > peg$maxFailPos) {
          peg$maxFailPos = peg$currPos;
          peg$maxFailExpected = [];
        }
        peg$maxFailExpected.push(expected2);
      }
      __name(peg$fail, "peg$fail");
      function peg$buildSimpleError(message, location2) {
        return new peg$SyntaxError(message, null, null, location2);
      }
      __name(peg$buildSimpleError, "peg$buildSimpleError");
      function peg$buildStructuredError(expected2, found, location2) {
        return new peg$SyntaxError(peg$SyntaxError.buildMessage(expected2, found), expected2, found, location2);
      }
      __name(peg$buildStructuredError, "peg$buildStructuredError");
      function peg$parseGrammar() {
        let s0, s1, s2, s3, s4, s5, s6, s7, s8;
        s0 = peg$currPos;
        s1 = peg$parseImportDeclarations();
        s2 = peg$currPos;
        s3 = peg$parse__();
        s4 = peg$parseTopLevelInitializer();
        if (s4 !== peg$FAILED) {
          s2 = s4;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        s3 = peg$currPos;
        s4 = peg$parse__();
        s5 = peg$parseInitializer();
        if (s5 !== peg$FAILED) {
          s3 = s5;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        s4 = peg$parse__();
        s5 = [];
        s6 = peg$currPos;
        s7 = peg$parseRule();
        if (s7 !== peg$FAILED) {
          s8 = peg$parse__();
          s6 = s7;
        } else {
          peg$currPos = s6;
          s6 = peg$FAILED;
        }
        if (s6 !== peg$FAILED) {
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$currPos;
            s7 = peg$parseRule();
            if (s7 !== peg$FAILED) {
              s8 = peg$parse__();
              s6 = s7;
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
          }
        } else {
          s5 = peg$FAILED;
        }
        if (s5 !== peg$FAILED) {
          peg$savedPos = s0;
          s0 = peg$f0(s1, s2, s3, s5);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseGrammar, "peg$parseGrammar");
      function peg$parseImportsAndSource() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$parseImportsAsText();
        s2 = peg$parseGrammarBody();
        peg$savedPos = s0;
        s0 = peg$f1(s1, s2);
        return s0;
      }
      __name(peg$parseImportsAndSource, "peg$parseImportsAndSource");
      function peg$parseGrammarBody() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = [];
        if (input.length > peg$currPos) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e0);
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (input.length > peg$currPos) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e0);
            }
          }
        }
        s1 = input.substring(s1, peg$currPos);
        peg$savedPos = s0;
        s1 = peg$f2(s1);
        s0 = s1;
        return s0;
      }
      __name(peg$parseGrammarBody, "peg$parseGrammarBody");
      function peg$parseImportsAsText() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$parseImportDeclarations();
        s1 = input.substring(s1, peg$currPos);
        peg$savedPos = s0;
        s1 = peg$f3(s1);
        s0 = s1;
        return s0;
      }
      __name(peg$parseImportsAsText, "peg$parseImportsAsText");
      function peg$parseImportDeclarations() {
        let s0, s1;
        s0 = [];
        s1 = peg$parseImportDeclaration();
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseImportDeclaration();
        }
        return s0;
      }
      __name(peg$parseImportDeclarations, "peg$parseImportDeclarations");
      function peg$parseImportDeclaration() {
        let s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;
        s0 = peg$currPos;
        s1 = peg$parse__();
        if (input.substr(peg$currPos, 6) === peg$c0) {
          s2 = peg$c0;
          peg$currPos += 6;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e1);
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parse__();
          s4 = peg$parseImportClause();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s6 = peg$parseFromClause();
            if (s6 !== peg$FAILED) {
              s7 = peg$currPos;
              s8 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 59) {
                s9 = peg$c1;
                peg$currPos++;
              } else {
                s9 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e2);
                }
              }
              if (s9 !== peg$FAILED) {
                s8 = [
                  s8,
                  s9
                ];
                s7 = s8;
              } else {
                peg$currPos = s7;
                s7 = peg$FAILED;
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f4(s4, s6);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parse__();
          if (input.substr(peg$currPos, 6) === peg$c0) {
            s2 = peg$c0;
            peg$currPos += 6;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e1);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parse__();
            s4 = peg$parseModuleSpecifier();
            if (s4 !== peg$FAILED) {
              s5 = peg$currPos;
              s6 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c1;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e2);
                }
              }
              if (s7 !== peg$FAILED) {
                s6 = [
                  s6,
                  s7
                ];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f5(s4);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      __name(peg$parseImportDeclaration, "peg$parseImportDeclaration");
      function peg$parseImportClause() {
        let s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$parseNameSpaceImport();
        if (s0 === peg$FAILED) {
          s0 = peg$parseNamedImports();
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseImportedDefaultBinding();
            if (s1 !== peg$FAILED) {
              s2 = peg$currPos;
              s3 = peg$parse__();
              if (input.charCodeAt(peg$currPos) === 44) {
                s4 = peg$c2;
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse__();
                s6 = peg$parseNameSpaceImport();
                if (s6 === peg$FAILED) {
                  s6 = peg$parseNamedImports();
                }
                if (s6 !== peg$FAILED) {
                  s2 = s6;
                } else {
                  peg$currPos = s2;
                  s2 = peg$FAILED;
                }
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
              if (s2 === peg$FAILED) {
                s2 = null;
              }
              peg$savedPos = s0;
              s0 = peg$f6(s1, s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          }
        }
        return s0;
      }
      __name(peg$parseImportClause, "peg$parseImportClause");
      function peg$parseImportedDefaultBinding() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseImportedBinding();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f7(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseImportedDefaultBinding, "peg$parseImportedDefaultBinding");
      function peg$parseNameSpaceImport() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 42) {
          s1 = peg$c3;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e4);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.substr(peg$currPos, 2) === peg$c4) {
            s3 = peg$c4;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e5);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseImportedBinding();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f8(s5);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseNameSpaceImport, "peg$parseNameSpaceImport");
      function peg$parseNamedImports() {
        let s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e7);
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f9();
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s1 = peg$c5;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e6);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse__();
            s3 = peg$parseImportsList();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse__();
              s5 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s6 = peg$c2;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parse__();
                s6 = [
                  s6,
                  s7
                ];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c6;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e7);
                }
              }
              if (s6 !== peg$FAILED) {
                s0 = s3;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      __name(peg$parseNamedImports, "peg$parseNamedImports");
      function peg$parseFromClause() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c7) {
          s1 = peg$c7;
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e8);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseModuleSpecifier();
          if (s3 !== peg$FAILED) {
            s0 = s3;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseFromClause, "peg$parseFromClause");
      function peg$parseImportsList() {
        let s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseImportSpecifier();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c2;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e3);
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            s4 = [
              s4,
              s5,
              s6
            ];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s3 = peg$parseImportSpecifier();
            if (s3 === peg$FAILED) {
              peg$currPos = s2;
              s2 = peg$FAILED;
            } else {
              s2 = s3;
            }
          } else {
            s2 = s3;
          }
        }
        if (s1.length < 1) {
          peg$currPos = s0;
          s0 = peg$FAILED;
        } else {
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseImportsList, "peg$parseImportsList");
      function peg$parseImportSpecifier() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseModuleExportName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.substr(peg$currPos, 2) === peg$c4) {
            s3 = peg$c4;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e5);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseImportedBinding();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f10(s1, s5);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseImportedBinding();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f11(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseImportSpecifier, "peg$parseImportSpecifier");
      function peg$parseModuleSpecifier() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseStringLiteral();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f12(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseModuleSpecifier, "peg$parseModuleSpecifier");
      function peg$parseImportedBinding() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseBindingIdentifier();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f13(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseImportedBinding, "peg$parseImportedBinding");
      function peg$parseModuleExportName() {
        let s0, s1;
        s0 = peg$parseIdentifierName();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseStringLiteral();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f14(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseModuleExportName, "peg$parseModuleExportName");
      function peg$parseBindingIdentifier() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f15(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseBindingIdentifier, "peg$parseBindingIdentifier");
      function peg$parseTopLevelInitializer() {
        let s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseCodeBlock();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c6;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e7);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseEOS();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f16(s2);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseTopLevelInitializer, "peg$parseTopLevelInitializer");
      function peg$parseInitializer() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$parseCodeBlock();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseEOS();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f17(s1);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseInitializer, "peg$parseInitializer");
      function peg$parseRule() {
        let s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$currPos;
          s4 = peg$parseStringLiteral();
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (input.charCodeAt(peg$currPos) === 61) {
            s4 = peg$c8;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e9);
            }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse__();
            s6 = peg$parseChoiceExpression();
            if (s6 !== peg$FAILED) {
              s7 = peg$parseEOS();
              if (s7 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f18(s1, s3, s6);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseRule, "peg$parseRule");
      function peg$parseChoiceExpression() {
        let s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseActionExpression();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c9;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e10);
            }
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parse__();
            s7 = peg$parseActionExpression();
            if (s7 !== peg$FAILED) {
              s3 = s7;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$parse__();
            if (input.charCodeAt(peg$currPos) === 47) {
              s5 = peg$c9;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e10);
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              s7 = peg$parseActionExpression();
              if (s7 !== peg$FAILED) {
                s3 = s7;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          peg$savedPos = s0;
          s0 = peg$f19(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseChoiceExpression, "peg$parseChoiceExpression");
      function peg$parseActionExpression() {
        let s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$parseSequenceExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$parse__();
          s4 = peg$parseCodeBlock();
          if (s4 !== peg$FAILED) {
            s2 = s4;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f20(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseActionExpression, "peg$parseActionExpression");
      function peg$parseSequenceExpression() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseLabeledExpression();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$parse__();
          s5 = peg$parseLabeledExpression();
          if (s5 !== peg$FAILED) {
            s3 = s5;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$parse__();
            s5 = peg$parseLabeledExpression();
            if (s5 !== peg$FAILED) {
              s3 = s5;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          peg$savedPos = s0;
          s0 = peg$f21(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseSequenceExpression, "peg$parseSequenceExpression");
      function peg$parseLabeledExpression() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePluck();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseLabelColon();
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = peg$parsePrefixedExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f22(s1, s2, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseLabelColon();
          if (s1 !== peg$FAILED) {
            s2 = peg$parsePrefixedExpression();
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f23(s1, s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parsePrefixedExpression();
          }
        }
        return s0;
      }
      __name(peg$parseLabeledExpression, "peg$parseLabeledExpression");
      function peg$parsePluck() {
        let s0, s1;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 64) {
          s1 = peg$c10;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e11);
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f24();
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parsePluck, "peg$parsePluck");
      function peg$parseLabelColon() {
        let s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c11;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e12);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            peg$savedPos = s0;
            s0 = peg$f25(s1);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseLabelColon, "peg$parseLabelColon");
      function peg$parsePrefixedExpression() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePrefixedOperator();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseSuffixedExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f26(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseSuffixedExpression();
        }
        return s0;
      }
      __name(peg$parsePrefixedExpression, "peg$parsePrefixedExpression");
      function peg$parsePrefixedOperator() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r0.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e13);
          }
        }
        return s0;
      }
      __name(peg$parsePrefixedOperator, "peg$parsePrefixedOperator");
      function peg$parseSuffixedExpression() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parsePrimaryExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseSuffixedOperator();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f27(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseRepeatedExpression();
          if (s0 === peg$FAILED) {
            s0 = peg$parsePrimaryExpression();
          }
        }
        return s0;
      }
      __name(peg$parseSuffixedExpression, "peg$parseSuffixedExpression");
      function peg$parseSuffixedOperator() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r1.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e14);
          }
        }
        return s0;
      }
      __name(peg$parseSuffixedOperator, "peg$parseSuffixedOperator");
      function peg$parseRepeatedExpression() {
        let s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;
        s0 = peg$currPos;
        s1 = peg$parsePrimaryExpression();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          if (input.charCodeAt(peg$currPos) === 124) {
            s3 = peg$c12;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e15);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parse__();
            s5 = peg$parseBoundaries();
            if (s5 !== peg$FAILED) {
              s6 = peg$parse__();
              s7 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s8 = peg$c2;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e3);
                }
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parse__();
                s10 = peg$parseChoiceExpression();
                if (s10 !== peg$FAILED) {
                  s11 = peg$parse__();
                  s7 = s10;
                } else {
                  peg$currPos = s7;
                  s7 = peg$FAILED;
                }
              } else {
                peg$currPos = s7;
                s7 = peg$FAILED;
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              if (input.charCodeAt(peg$currPos) === 124) {
                s8 = peg$c12;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e15);
                }
              }
              if (s8 !== peg$FAILED) {
                peg$savedPos = s0;
                s0 = peg$f28(s1, s5, s7);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseRepeatedExpression, "peg$parseRepeatedExpression");
      function peg$parseBoundaries() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseBoundary();
        if (s1 === peg$FAILED) {
          s1 = null;
        }
        s2 = peg$parse__();
        if (input.substr(peg$currPos, 2) === peg$c13) {
          s3 = peg$c13;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e16);
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parse__();
          s5 = peg$parseBoundary();
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f29(s1, s5);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseBoundary();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f30(s1);
          }
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseBoundaries, "peg$parseBoundaries");
      function peg$parseBoundary() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseInteger();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f31(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseIdentifierName();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f32(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseCodeBlock();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$f33(s1);
            }
            s0 = s1;
          }
        }
        return s0;
      }
      __name(peg$parseBoundary, "peg$parseBoundary");
      function peg$parsePrimaryExpression() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$parseLiteralMatcher();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCharacterClassMatcher();
          if (s0 === peg$FAILED) {
            s0 = peg$parseAnyMatcher();
            if (s0 === peg$FAILED) {
              s0 = peg$parseRuleReferenceExpression();
              if (s0 === peg$FAILED) {
                s0 = peg$parseSemanticPredicateExpression();
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s1 = peg$c14;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e17);
                    }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parse__();
                    s3 = peg$parseChoiceExpression();
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parse__();
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s5 = peg$c15;
                        peg$currPos++;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) {
                          peg$fail(peg$e18);
                        }
                      }
                      if (s5 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s0 = peg$f34(s3);
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                }
              }
            }
          }
        }
        return s0;
      }
      __name(peg$parsePrimaryExpression, "peg$parsePrimaryExpression");
      function peg$parseRuleReferenceExpression() {
        let s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierName();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s2 = peg$c16;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e19);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseIdentifierName();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f35(s1, s3);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseIdentifierName();
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            peg$silentFails++;
            s3 = peg$currPos;
            s4 = peg$parse__();
            s5 = peg$currPos;
            s6 = peg$parseStringLiteral();
            if (s6 !== peg$FAILED) {
              s7 = peg$parse__();
              s6 = [
                s6,
                s7
              ];
              s5 = s6;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (input.charCodeAt(peg$currPos) === 61) {
              s6 = peg$c8;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e9);
              }
            }
            if (s6 !== peg$FAILED) {
              s4 = [
                s4,
                s5,
                s6
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            peg$silentFails--;
            if (s3 === peg$FAILED) {
              s2 = void 0;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f36(s1);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      __name(peg$parseRuleReferenceExpression, "peg$parseRuleReferenceExpression");
      function peg$parseSemanticPredicateExpression() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseSemanticPredicateOperator();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse__();
          s3 = peg$parseCodeBlock();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f37(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseSemanticPredicateExpression, "peg$parseSemanticPredicateExpression");
      function peg$parseSemanticPredicateOperator() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r2.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e20);
          }
        }
        return s0;
      }
      __name(peg$parseSemanticPredicateOperator, "peg$parseSemanticPredicateOperator");
      function peg$parseSourceCharacter() {
        let s0;
        s0 = peg$parseSourceCharacterLow();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSourceCharacterHigh();
        }
        return s0;
      }
      __name(peg$parseSourceCharacter, "peg$parseSourceCharacter");
      function peg$parseSourceCharacterLow() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r3.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e21);
          }
        }
        return s0;
      }
      __name(peg$parseSourceCharacterLow, "peg$parseSourceCharacterLow");
      function peg$parseSourceCharacterHigh() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = input.charAt(peg$currPos);
        if (peg$r4.test(s2)) {
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e22);
          }
        }
        if (s2 !== peg$FAILED) {
          s3 = input.charAt(peg$currPos);
          if (peg$r5.test(s3)) {
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e23);
            }
          }
          if (s3 !== peg$FAILED) {
            s2 = [
              s2,
              s3
            ];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = input.charAt(peg$currPos);
          if (peg$r6.test(s0)) {
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e24);
            }
          }
        }
        return s0;
      }
      __name(peg$parseSourceCharacterHigh, "peg$parseSourceCharacterHigh");
      function peg$parseWhiteSpace() {
        let s0, s1;
        peg$silentFails++;
        s0 = peg$getUnicode();
        if (peg$r7.test(s0)) {
          peg$currPos += s0.length;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e26);
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e25);
          }
        }
        return s0;
      }
      __name(peg$parseWhiteSpace, "peg$parseWhiteSpace");
      function peg$parseLineTerminator() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r8.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e27);
          }
        }
        return s0;
      }
      __name(peg$parseLineTerminator, "peg$parseLineTerminator");
      function peg$parseLineTerminatorSequence() {
        let s0, s1;
        peg$silentFails++;
        if (input.charCodeAt(peg$currPos) === 10) {
          s0 = peg$c17;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e29);
          }
        }
        if (s0 === peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c18) {
            s0 = peg$c18;
            peg$currPos += 2;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          if (s0 === peg$FAILED) {
            s0 = input.charAt(peg$currPos);
            if (peg$r9.test(s0)) {
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e31);
              }
            }
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e28);
          }
        }
        return s0;
      }
      __name(peg$parseLineTerminatorSequence, "peg$parseLineTerminatorSequence");
      function peg$parseComment() {
        let s0, s1;
        peg$silentFails++;
        s0 = peg$parseMultiLineComment();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSingleLineComment();
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e32);
          }
        }
        return s0;
      }
      __name(peg$parseComment, "peg$parseComment");
      function peg$parseMultiLineComment() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c19) {
          s1 = peg$c19;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e33);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s5 = peg$c20;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [
                s4,
                s5
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            if (input.substr(peg$currPos, 2) === peg$c20) {
              s5 = peg$c20;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e34);
              }
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [
                  s4,
                  s5
                ];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s3 = peg$c20;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s3 !== peg$FAILED) {
            s1 = [
              s1,
              s2,
              s3
            ];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseMultiLineComment, "peg$parseMultiLineComment");
      function peg$parseMultiLineCommentNoLineTerminator() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c19) {
          s1 = peg$c19;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e33);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s5 = peg$c20;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s5 === peg$FAILED) {
            s5 = peg$parseLineTerminator();
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [
                s4,
                s5
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            if (input.substr(peg$currPos, 2) === peg$c20) {
              s5 = peg$c20;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e34);
              }
            }
            if (s5 === peg$FAILED) {
              s5 = peg$parseLineTerminator();
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [
                  s4,
                  s5
                ];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          if (input.substr(peg$currPos, 2) === peg$c20) {
            s3 = peg$c20;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s3 !== peg$FAILED) {
            s1 = [
              s1,
              s2,
              s3
            ];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseMultiLineCommentNoLineTerminator, "peg$parseMultiLineCommentNoLineTerminator");
      function peg$parseSingleLineComment() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c21) {
          s1 = peg$c21;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e35);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = peg$parseLineTerminator();
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [
                s4,
                s5
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            s5 = peg$parseLineTerminator();
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [
                  s4,
                  s5
                ];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
          s1 = [
            s1,
            s2
          ];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseSingleLineComment, "peg$parseSingleLineComment");
      function peg$parseIdentifierName() {
        let s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        s1 = peg$parseIdentifierStart();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseIdentifierPart();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseIdentifierPart();
          }
          peg$savedPos = s0;
          s0 = peg$f38(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e36);
          }
        }
        return s0;
      }
      __name(peg$parseIdentifierName, "peg$parseIdentifierName");
      function peg$parseIdentifierStart() {
        let s0, s1, s2;
        s0 = peg$getUnicode();
        if (peg$r10.test(s0)) {
          peg$currPos += s0.length;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e37);
          }
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e38);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseUnicodeEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      __name(peg$parseIdentifierStart, "peg$parseIdentifierStart");
      function peg$parseIdentifierPart() {
        let s0;
        s0 = peg$getUnicode();
        if (peg$r11.test(s0)) {
          peg$currPos += s0.length;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e39);
          }
        }
        return s0;
      }
      __name(peg$parseIdentifierPart, "peg$parseIdentifierPart");
      function peg$parseLiteralMatcher() {
        let s0, s1, s2;
        peg$silentFails++;
        s0 = peg$currPos;
        s1 = peg$parseStringLiteral();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 105) {
            s2 = peg$c23;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e41);
            }
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          peg$savedPos = s0;
          s0 = peg$f39(s1, s2);
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e40);
          }
        }
        return s0;
      }
      __name(peg$parseLiteralMatcher, "peg$parseLiteralMatcher");
      function peg$parseStringLiteral() {
        let s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 34) {
          s1 = peg$c24;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e43);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseDoubleStringCharacter();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseDoubleStringCharacter();
          }
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c24;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e43);
            }
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f40(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 39) {
            s1 = peg$c25;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e44);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseSingleStringCharacter();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseSingleStringCharacter();
            }
            if (input.charCodeAt(peg$currPos) === 39) {
              s3 = peg$c25;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e44);
              }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f41(s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e42);
          }
        }
        return s0;
      }
      __name(peg$parseStringLiteral, "peg$parseStringLiteral");
      function peg$parseDoubleStringCharacter() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r12.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e45);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [
              s2,
              s3
            ];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e38);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      __name(peg$parseDoubleStringCharacter, "peg$parseDoubleStringCharacter");
      function peg$parseSingleStringCharacter() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r13.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e46);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [
              s2,
              s3
            ];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e38);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      __name(peg$parseSingleStringCharacter, "peg$parseSingleStringCharacter");
      function peg$parseCharacterClassMatcher() {
        let s0, s1, s2, s3, s4, s5;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 91) {
          s1 = peg$c26;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e48);
          }
        }
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 94) {
            s2 = peg$c27;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e49);
            }
          }
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = [];
          s4 = peg$parseAtomEscape();
          if (s4 === peg$FAILED) {
            s4 = peg$parseClassCharacterRange();
            if (s4 === peg$FAILED) {
              s4 = peg$parseClassCharacter();
            }
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseAtomEscape();
            if (s4 === peg$FAILED) {
              s4 = peg$parseClassCharacterRange();
              if (s4 === peg$FAILED) {
                s4 = peg$parseClassCharacter();
              }
            }
          }
          if (input.charCodeAt(peg$currPos) === 93) {
            s4 = peg$c28;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e50);
            }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseClassFlags();
            peg$savedPos = s0;
            s0 = peg$f42(s2, s3, s5);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e47);
          }
        }
        return s0;
      }
      __name(peg$parseCharacterClassMatcher, "peg$parseCharacterClassMatcher");
      function peg$parseAtomEscape() {
        let s0, s1, s2;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 92) {
          s1 = peg$c22;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e38);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseCharacterClassEscape();
          if (s2 !== peg$FAILED) {
            s0 = s2;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseAtomEscape, "peg$parseAtomEscape");
      function peg$parseCharacterClassEscape() {
        let s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        s3 = input.charAt(peg$currPos);
        if (s3.toLowerCase() === peg$c29) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e51);
          }
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 123) {
            s4 = peg$c5;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e6);
            }
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseUnicodePropertyValueExpression();
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c6;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e7);
                }
              }
              if (s6 !== peg$FAILED) {
                s3 = [
                  s3,
                  s4,
                  s5,
                  s6
                ];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s1 = input.substring(s1, peg$currPos);
        } else {
          s1 = s2;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f43(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseCharacterClassEscape, "peg$parseCharacterClassEscape");
      function peg$parseUnicodePropertyValueExpression() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseUnicodePropertyName();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 61) {
            s2 = peg$c8;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e9);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseUnicodePropertyValue();
            if (s3 !== peg$FAILED) {
              s1 = [
                s1,
                s2,
                s3
              ];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parseLoneUnicodePropertyNameOrValue();
        }
        return s0;
      }
      __name(peg$parseUnicodePropertyValueExpression, "peg$parseUnicodePropertyValueExpression");
      function peg$parseUnicodePropertyName() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseUnicodePropertyNameCharacter();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseUnicodePropertyNameCharacter();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseUnicodePropertyName, "peg$parseUnicodePropertyName");
      function peg$parseUnicodePropertyValue() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseUnicodePropertyValueCharacter();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseUnicodePropertyValueCharacter();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseUnicodePropertyValue, "peg$parseUnicodePropertyValue");
      function peg$parseLoneUnicodePropertyNameOrValue() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseUnicodePropertyValueCharacter();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseUnicodePropertyValueCharacter();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseLoneUnicodePropertyNameOrValue, "peg$parseLoneUnicodePropertyNameOrValue");
      function peg$parseUnicodePropertyValueCharacter() {
        let s0;
        s0 = peg$parseUnicodePropertyNameCharacter();
        if (s0 === peg$FAILED) {
          s0 = peg$parseDecimalDigit();
        }
        return s0;
      }
      __name(peg$parseUnicodePropertyValueCharacter, "peg$parseUnicodePropertyValueCharacter");
      function peg$parseUnicodePropertyNameCharacter() {
        let s0;
        s0 = peg$parseAsciiLetter();
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 95) {
            s0 = peg$c30;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e52);
            }
          }
        }
        return s0;
      }
      __name(peg$parseUnicodePropertyNameCharacter, "peg$parseUnicodePropertyNameCharacter");
      function peg$parseAsciiLetter() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r14.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e53);
          }
        }
        return s0;
      }
      __name(peg$parseAsciiLetter, "peg$parseAsciiLetter");
      function peg$parseClassFlags() {
        let s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseClassFlag();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseClassFlag();
        }
        peg$savedPos = s0;
        s1 = peg$f44(s1);
        s0 = s1;
        return s0;
      }
      __name(peg$parseClassFlags, "peg$parseClassFlags");
      function peg$parseClassFlag() {
        let s0, s1;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 105) {
          s1 = peg$c23;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e41);
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f45();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 117) {
            s1 = peg$c31;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e54);
            }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f46();
          }
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseClassFlag, "peg$parseClassFlag");
      function peg$parseClassCharacterRange() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseClassCharacter();
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s2 = peg$c32;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e55);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseClassCharacter();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f47(s1, s3);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseClassCharacterRange, "peg$parseClassCharacterRange");
      function peg$parseClassCharacter() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = input.charAt(peg$currPos);
        if (peg$r15.test(s3)) {
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e56);
          }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [
              s2,
              s3
            ];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 92) {
            s1 = peg$c22;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e38);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseEscapeSequence();
            if (s2 !== peg$FAILED) {
              s0 = s2;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseLineContinuation();
          }
        }
        return s0;
      }
      __name(peg$parseClassCharacter, "peg$parseClassCharacter");
      function peg$parseLineContinuation() {
        let s0, s1, s2;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 92) {
          s1 = peg$c22;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e38);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseLineTerminatorSequence();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f48();
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseLineContinuation, "peg$parseLineContinuation");
      function peg$parseEscapeSequence() {
        let s0, s1, s2, s3;
        s0 = peg$parseCharacterEscapeSequence();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 48) {
            s1 = peg$c33;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e57);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            peg$silentFails++;
            s3 = peg$parseDecimalDigit();
            peg$silentFails--;
            if (s3 === peg$FAILED) {
              s2 = void 0;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s0 = peg$f49();
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$parseHexEscapeSequence();
            if (s0 === peg$FAILED) {
              s0 = peg$parseUnicodeEscapeSequence();
            }
          }
        }
        return s0;
      }
      __name(peg$parseEscapeSequence, "peg$parseEscapeSequence");
      function peg$parseCharacterEscapeSequence() {
        let s0;
        s0 = peg$parseSingleEscapeCharacter();
        if (s0 === peg$FAILED) {
          s0 = peg$parseNonEscapeCharacter();
        }
        return s0;
      }
      __name(peg$parseCharacterEscapeSequence, "peg$parseCharacterEscapeSequence");
      function peg$parseSingleEscapeCharacter() {
        let s0, s1;
        s0 = input.charAt(peg$currPos);
        if (peg$r16.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e58);
          }
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 98) {
            s1 = peg$c34;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e59);
            }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$f50();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 102) {
              s1 = peg$c35;
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e60);
              }
            }
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$f51();
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 110) {
                s1 = peg$c36;
                peg$currPos++;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e61);
                }
              }
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$f52();
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 114) {
                  s1 = peg$c37;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e62);
                  }
                }
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$f53();
                }
                s0 = s1;
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 116) {
                    s1 = peg$c38;
                    peg$currPos++;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e63);
                    }
                  }
                  if (s1 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$f54();
                  }
                  s0 = s1;
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 118) {
                      s1 = peg$c39;
                      peg$currPos++;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) {
                        peg$fail(peg$e64);
                      }
                    }
                    if (s1 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$f55();
                    }
                    s0 = s1;
                  }
                }
              }
            }
          }
        }
        return s0;
      }
      __name(peg$parseSingleEscapeCharacter, "peg$parseSingleEscapeCharacter");
      function peg$parseNonEscapeCharacter() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$currPos;
        peg$silentFails++;
        s3 = peg$parseEscapeCharacter();
        if (s3 === peg$FAILED) {
          s3 = peg$parseLineTerminator();
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = void 0;
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseSourceCharacter();
          if (s3 !== peg$FAILED) {
            s2 = [
              s2,
              s3
            ];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s0 = input.substring(s0, peg$currPos);
        } else {
          s0 = s1;
        }
        return s0;
      }
      __name(peg$parseNonEscapeCharacter, "peg$parseNonEscapeCharacter");
      function peg$parseEscapeCharacter() {
        let s0;
        s0 = peg$parseSingleEscapeCharacter();
        if (s0 === peg$FAILED) {
          s0 = input.charAt(peg$currPos);
          if (peg$r17.test(s0)) {
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e65);
            }
          }
        }
        return s0;
      }
      __name(peg$parseEscapeCharacter, "peg$parseEscapeCharacter");
      function peg$parseHexEscapeSequence() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 120) {
          s1 = peg$c40;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e66);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parseHexDigit();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseHexDigit();
            if (s5 !== peg$FAILED) {
              s4 = [
                s4,
                s5
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s2 = input.substring(s2, peg$currPos);
          } else {
            s2 = s3;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f56(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseHexEscapeSequence, "peg$parseHexEscapeSequence");
      function peg$parseUnicodeEscapeSequence() {
        let s0, s1, s2, s3, s4, s5, s6, s7;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 117) {
          s1 = peg$c31;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e54);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = peg$currPos;
          s4 = peg$parseHexDigit();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseHexDigit();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseHexDigit();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseHexDigit();
                if (s7 !== peg$FAILED) {
                  s4 = [
                    s4,
                    s5,
                    s6,
                    s7
                  ];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            s2 = input.substring(s2, peg$currPos);
          } else {
            s2 = s3;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s0 = peg$f57(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 117) {
            s1 = peg$c31;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e54);
            }
          }
          if (s1 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 123) {
              s2 = peg$c5;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e6);
              }
            }
            if (s2 !== peg$FAILED) {
              s3 = peg$currPos;
              s4 = [];
              s5 = peg$parseHexDigit();
              if (s5 !== peg$FAILED) {
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseHexDigit();
                }
              } else {
                s4 = peg$FAILED;
              }
              if (s4 !== peg$FAILED) {
                s3 = input.substring(s3, peg$currPos);
              } else {
                s3 = s4;
              }
              if (s3 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s4 = peg$c6;
                  peg$currPos++;
                } else {
                  s4 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e7);
                  }
                }
                if (s4 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s0 = peg$f58(s3);
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      __name(peg$parseUnicodeEscapeSequence, "peg$parseUnicodeEscapeSequence");
      function peg$parseDecimalDigit() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r18.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e67);
          }
        }
        return s0;
      }
      __name(peg$parseDecimalDigit, "peg$parseDecimalDigit");
      function peg$parseHexDigit() {
        let s0;
        s0 = input.charAt(peg$currPos);
        if (peg$r19.test(s0)) {
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e68);
          }
        }
        return s0;
      }
      __name(peg$parseHexDigit, "peg$parseHexDigit");
      function peg$parseAnyMatcher() {
        let s0, s1;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s1 = peg$c16;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e19);
          }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f59();
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseAnyMatcher, "peg$parseAnyMatcher");
      function peg$parseCodeBlock() {
        let s0, s1, s2, s3;
        peg$silentFails++;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c5;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseBareCodeBlock();
          if (input.charCodeAt(peg$currPos) === 125) {
            s3 = peg$c6;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e7);
            }
          }
          if (s3 !== peg$FAILED) {
            s0 = s2;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e69);
          }
        }
        return s0;
      }
      __name(peg$parseCodeBlock, "peg$parseCodeBlock");
      function peg$parseBareCodeBlock() {
        let s0, s1;
        s0 = peg$currPos;
        s1 = peg$parseCode();
        peg$savedPos = s0;
        s1 = peg$f60(s1);
        s0 = s1;
        return s0;
      }
      __name(peg$parseBareCodeBlock, "peg$parseBareCodeBlock");
      function peg$parseCode() {
        let s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = [];
        s2 = [];
        s3 = peg$currPos;
        s4 = peg$currPos;
        peg$silentFails++;
        s5 = input.charAt(peg$currPos);
        if (peg$r20.test(s5)) {
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e70);
          }
        }
        peg$silentFails--;
        if (s5 === peg$FAILED) {
          s4 = void 0;
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parseSourceCharacter();
          if (s5 !== peg$FAILED) {
            s4 = [
              s4,
              s5
            ];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$currPos;
            s4 = peg$currPos;
            peg$silentFails++;
            s5 = input.charAt(peg$currPos);
            if (peg$r20.test(s5)) {
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e70);
              }
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = void 0;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseSourceCharacter();
              if (s5 !== peg$FAILED) {
                s4 = [
                  s4,
                  s5
                ];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s3 = peg$c5;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e6);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseCode();
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c6;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e7);
              }
            }
            if (s5 !== peg$FAILED) {
              s3 = [
                s3,
                s4,
                s5
              ];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        }
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$currPos;
          peg$silentFails++;
          s5 = input.charAt(peg$currPos);
          if (peg$r20.test(s5)) {
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e70);
            }
          }
          peg$silentFails--;
          if (s5 === peg$FAILED) {
            s4 = void 0;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSourceCharacter();
            if (s5 !== peg$FAILED) {
              s4 = [
                s4,
                s5
              ];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$currPos;
              s4 = peg$currPos;
              peg$silentFails++;
              s5 = input.charAt(peg$currPos);
              if (peg$r20.test(s5)) {
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e70);
                }
              }
              peg$silentFails--;
              if (s5 === peg$FAILED) {
                s4 = void 0;
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parseSourceCharacter();
                if (s5 !== peg$FAILED) {
                  s4 = [
                    s4,
                    s5
                  ];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            }
          } else {
            s2 = peg$FAILED;
          }
          if (s2 === peg$FAILED) {
            s2 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 123) {
              s3 = peg$c5;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e6);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseCode();
              if (input.charCodeAt(peg$currPos) === 125) {
                s5 = peg$c6;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e7);
                }
              }
              if (s5 !== peg$FAILED) {
                s3 = [
                  s3,
                  s4,
                  s5
                ];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$FAILED;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          }
        }
        s0 = input.substring(s0, peg$currPos);
        return s0;
      }
      __name(peg$parseCode, "peg$parseCode");
      function peg$parseInteger() {
        let s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = [];
        s3 = peg$parseDecimalDigit();
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseDecimalDigit();
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s1 = input.substring(s1, peg$currPos);
        } else {
          s1 = s2;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$f61(s1);
        }
        s0 = s1;
        return s0;
      }
      __name(peg$parseInteger, "peg$parseInteger");
      function peg$parse__() {
        let s0, s1;
        s0 = [];
        s1 = peg$parseWhiteSpace();
        if (s1 === peg$FAILED) {
          s1 = peg$parseLineTerminatorSequence();
          if (s1 === peg$FAILED) {
            s1 = peg$parseComment();
          }
        }
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseWhiteSpace();
          if (s1 === peg$FAILED) {
            s1 = peg$parseLineTerminatorSequence();
            if (s1 === peg$FAILED) {
              s1 = peg$parseComment();
            }
          }
        }
        return s0;
      }
      __name(peg$parse__, "peg$parse__");
      function peg$parse_() {
        let s0, s1;
        s0 = [];
        s1 = peg$parseWhiteSpace();
        if (s1 === peg$FAILED) {
          s1 = peg$parseMultiLineCommentNoLineTerminator();
        }
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parseWhiteSpace();
          if (s1 === peg$FAILED) {
            s1 = peg$parseMultiLineCommentNoLineTerminator();
          }
        }
        return s0;
      }
      __name(peg$parse_, "peg$parse_");
      function peg$parseEOS() {
        let s0, s1, s2, s3;
        s0 = [];
        s1 = peg$currPos;
        s2 = peg$parse__();
        if (input.charCodeAt(peg$currPos) === 59) {
          s3 = peg$c1;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e2);
          }
        }
        if (s3 !== peg$FAILED) {
          s2 = [
            s2,
            s3
          ];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          while (s1 !== peg$FAILED) {
            s0.push(s1);
            s1 = peg$currPos;
            s2 = peg$parse__();
            if (input.charCodeAt(peg$currPos) === 59) {
              s3 = peg$c1;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e2);
              }
            }
            if (s3 !== peg$FAILED) {
              s2 = [
                s2,
                s3
              ];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          }
        } else {
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parse_();
          s2 = peg$parseSingleLineComment();
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          s3 = peg$parseLineTerminatorSequence();
          if (s3 !== peg$FAILED) {
            s1 = [
              s1,
              s2,
              s3
            ];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parse__();
            s2 = peg$parseEOF();
            if (s2 !== peg$FAILED) {
              s1 = [
                s1,
                s2
              ];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          }
        }
        return s0;
      }
      __name(peg$parseEOS, "peg$parseEOS");
      function peg$parseEOF() {
        let s0, s1;
        s0 = peg$currPos;
        peg$silentFails++;
        if (input.length > peg$currPos) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e0);
          }
        }
        peg$silentFails--;
        if (s1 === peg$FAILED) {
          s0 = void 0;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      __name(peg$parseEOF, "peg$parseEOF");
      const reservedWords = new Set(options2.reservedWords);
      peg$result = peg$startRuleFunction();
      const peg$success = peg$result !== peg$FAILED && peg$currPos === input.length;
      function peg$throw() {
        if (peg$result !== peg$FAILED && peg$currPos < input.length) {
          peg$fail(peg$endExpectation());
        }
        throw peg$buildStructuredError(peg$maxFailExpected, peg$maxFailPos < input.length ? peg$getUnicode(peg$maxFailPos) : null, peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos));
      }
      __name(peg$throw, "peg$throw");
      if (options2.peg$library) {
        return (
          /** @type {any} */
          {
            peg$result,
            peg$currPos,
            peg$FAILED,
            peg$maxFailExpected,
            peg$maxFailPos,
            peg$success,
            peg$throw: peg$success ? void 0 : peg$throw
          }
        );
      }
      if (peg$success) {
        return peg$result;
      } else {
        peg$throw();
      }
    }
    __name(peg$parse, "peg$parse");
    module2.exports = {
      StartRules: [
        "Grammar",
        "ImportsAndSource"
      ],
      SyntaxError: peg$SyntaxError,
      parse: peg$parse
    };
  }
});

// node_modules/peggy/lib/compiler/passes/generate-js.js
var require_generate_js = __commonJS({
  "node_modules/peggy/lib/compiler/passes/generate-js.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var op = require_opcodes();
    var Stack = require_stack();
    var { version } = require_version();
    var { stringEscape, regexpClassEscape } = require_utils();
    var { SourceNode } = require_source_map();
    var GrammarLocation = require_grammar_location();
    var { parse } = require_parser();
    function toSourceNode(code, location, name) {
      const start = GrammarLocation.offsetStart(location);
      const line = start.line;
      const column = start.column - 1;
      const lines = code.split("\n");
      if (lines.length === 1) {
        return new SourceNode(line, column, String(location.source), code, name);
      }
      return new SourceNode(null, null, String(location.source), lines.map((l, i) => new SourceNode(line + i, i === 0 ? column : 0, String(location.source), i === lines.length - 1 ? l : [
        l,
        "\n"
      ], name)));
    }
    __name(toSourceNode, "toSourceNode");
    function wrapInSourceNode(prefix, chunk, location, suffix, name) {
      if (location) {
        const end = GrammarLocation.offsetEnd(location);
        return new SourceNode(null, null, String(location.source), [
          prefix,
          toSourceNode(chunk, location, name),
          // Mark end location with column information otherwise
          // mapping will be always continue to the end of line
          new SourceNode(
            end.line,
            // `source-map` columns are 0-based, peggy columns is 1-based
            end.column - 1,
            String(location.source),
            suffix
          )
        ]);
      }
      return new SourceNode(null, null, null, [
        prefix,
        chunk,
        suffix
      ]);
    }
    __name(wrapInSourceNode, "wrapInSourceNode");
    function generateJS2(ast2, options2) {
      if (!ast2.literals || !ast2.locations || !ast2.classes || !ast2.expectations || !ast2.functions || !ast2.importedNames) {
        throw new Error("generateJS: generate bytecode was not called.");
      }
      const { literals, locations, classes, expectations, functions, importedNames } = ast2;
      if (!options2.allowedStartRules) {
        throw new Error("generateJS: options.allowedStartRules was not set.");
      }
      const { allowedStartRules } = options2;
      const dependencies = options2.dependencies || {};
      function reIndent(str, indent = "") {
        const leadingSpace = str.match(/^\n*([ \t]+)/);
        const body = leadingSpace ? str.replace(new RegExp(`^${leadingSpace[1]}`, "gm"), indent) : str;
        return body.replace(/[ \t]+$/, "");
      }
      __name(reIndent, "reIndent");
      function indent2(code) {
        let sawEol = true;
        let inSourceNode = 0;
        function helper(code2) {
          if (Array.isArray(code2)) {
            return code2.map((s) => helper(s));
          }
          if (code2 instanceof SourceNode) {
            inSourceNode++;
            code2.children = helper(code2.children);
            inSourceNode--;
            return code2;
          }
          if (sawEol) {
            code2 = code2.replace(/^(.+)$/gm, "  $1");
          } else {
            code2 = code2.replace(/\n(\s*\S)/g, "\n  $1");
          }
          sawEol = !inSourceNode || code2.endsWith("\n");
          return code2;
        }
        __name(helper, "helper");
        return helper(code);
      }
      __name(indent2, "indent2");
      function l(i) {
        return "peg$c" + i;
      }
      __name(l, "l");
      function r(i) {
        return "peg$r" + i;
      }
      __name(r, "r");
      function e(i) {
        return "peg$e" + i;
      }
      __name(e, "e");
      function f(i) {
        return "peg$f" + i;
      }
      __name(f, "f");
      function gi(i) {
        return "peg$import" + i;
      }
      __name(gi, "gi");
      function name(name2) {
        return "peg$parse" + name2;
      }
      __name(name, "name");
      function generateTables() {
        function buildLiteral(literal) {
          return '"' + stringEscape(literal) + '"';
        }
        __name(buildLiteral, "buildLiteral");
        function buildRegexp(cls) {
          return "/^[" + (cls.inverted ? "^" : "") + cls.value.map((part) => Array.isArray(part) ? regexpClassEscape(part[0]) + "-" + regexpClassEscape(part[1]) : regexpClassEscape(part)).join("") + "]/" + (cls.ignoreCase ? "i" : "") + (cls.unicode ? "u" : "");
        }
        __name(buildRegexp, "buildRegexp");
        function buildExpectation(e2) {
          switch (e2.type) {
            case "rule": {
              return 'peg$otherExpectation("' + stringEscape(e2.value) + '")';
            }
            case "literal": {
              return 'peg$literalExpectation("' + stringEscape(e2.value) + '", ' + e2.ignoreCase + ")";
            }
            case "class": {
              const parts = e2.value.map((part) => Array.isArray(part) ? '["' + stringEscape(part[0]) + '", "' + stringEscape(part[1]) + '"]' : '"' + stringEscape(part) + '"').join(", ");
              return "peg$classExpectation([" + parts + "], " + e2.inverted + ", " + e2.ignoreCase + ", " + e2.unicode + ")";
            }
            case "any":
              return "peg$anyExpectation()";
            // istanbul ignore next Because we never generate expectation type we cannot reach this branch
            default:
              throw new Error("Unknown expectation type (" + JSON.stringify(e2) + ")");
          }
        }
        __name(buildExpectation, "buildExpectation");
        function buildFunc(a, i) {
          return wrapInSourceNode(`
  function ${f(i)}(${a.params.join(", ")}) {`, reIndent(a.body, "    "), a.location, "  }");
        }
        __name(buildFunc, "buildFunc");
        return new SourceNode(null, null, options2.grammarSource, [
          literals.map((c, i) => "  const " + l(i) + " = " + buildLiteral(c) + ";").concat("", classes.map((c, i) => "  const " + r(i) + " = " + buildRegexp(c) + ";")).concat("", expectations.map((c, i) => "  const " + e(i) + " = " + buildExpectation(c) + ";")).concat("").join("\n"),
          ...functions.map(buildFunc)
        ]);
      }
      __name(generateTables, "generateTables");
      function generateRuleHeader(ruleNameCode, ruleIndexCode) {
        const parts = [];
        parts.push("");
        if (options2.trace) {
          parts.push("peg$tracer.trace({", '  type: "rule.enter",', "  rule: " + ruleNameCode + ",", "  location: peg$computeLocation(startPos, startPos, true)", "});", "");
        }
        if (options2.cache) {
          parts.push("const key = peg$currPos * " + ast2.rules.length + " + " + ruleIndexCode + ";", "const cached = peg$resultsCache[key];", "", "if (cached) {", "  peg$currPos = cached.nextPos;", "");
          if (options2.trace) {
            parts.push("if (cached.result !== peg$FAILED) {", "  peg$tracer.trace({", '    type: "rule.match",', "    rule: " + ruleNameCode + ",", "    result: cached.result,", "    location: peg$computeLocation(startPos, peg$currPos, true)", "  });", "} else {", "  peg$tracer.trace({", '    type: "rule.fail",', "    rule: " + ruleNameCode + ",", "    location: peg$computeLocation(startPos, startPos, true)", "  });", "}", "");
          }
          parts.push("  return cached.result;", "}", "");
        }
        return parts;
      }
      __name(generateRuleHeader, "generateRuleHeader");
      function generateRuleFooter(ruleNameCode, resultCode) {
        const parts = [];
        if (options2.cache) {
          parts.push("", "peg$resultsCache[key] = { nextPos: peg$currPos, result: " + resultCode + " };");
        }
        if (options2.trace) {
          parts.push("", "if (" + resultCode + " !== peg$FAILED) {", "  peg$tracer.trace({", '    type: "rule.match",', "    rule: " + ruleNameCode + ",", "    result: " + resultCode + ",", "    location: peg$computeLocation(startPos, peg$currPos, true)", "  });", "} else {", "  peg$tracer.trace({", '    type: "rule.fail",', "    rule: " + ruleNameCode + ",", "    location: peg$computeLocation(startPos, startPos, true)", "  });", "}");
        }
        parts.push("", "return " + resultCode + ";");
        return parts;
      }
      __name(generateRuleFooter, "generateRuleFooter");
      function generateRuleFunction(rule) {
        const parts = [];
        const bytecode = (
          /** @type {number[]} */
          rule.bytecode
        );
        const stack = new Stack(rule.name, "s", "let", bytecode);
        function compile(bc) {
          let ip = 0;
          const end = bc.length;
          const parts2 = [];
          let value = void 0;
          function compileCondition(cond, argCount, thenFn) {
            const baseLength = argCount + 3;
            const thenLength = bc[ip + baseLength - 2];
            const elseLength = bc[ip + baseLength - 1];
            const [thenCode, elseCode] = stack.checkedIf(ip, () => {
              ip += baseLength + thenLength;
              return (thenFn || compile)(bc.slice(ip - thenLength, ip));
            }, elseLength > 0 ? () => {
              ip += elseLength;
              return compile(bc.slice(ip - elseLength, ip));
            } : null);
            parts2.push("if (" + cond + ") {");
            parts2.push(...indent2(thenCode));
            if (elseLength > 0) {
              parts2.push("} else {");
              parts2.push(...indent2(elseCode));
            }
            parts2.push("}");
          }
          __name(compileCondition, "compileCondition");
          function getChunkCode(inputChunkLength) {
            switch (inputChunkLength) {
              case -1:
                return "peg$getUnicode()";
              case 1:
                return "input.charAt(peg$currPos)";
              default:
                return `input.substr(peg$currPos, ${inputChunkLength})`;
            }
          }
          __name(getChunkCode, "getChunkCode");
          function getIncrCode(inputChunkLength, varName) {
            switch (inputChunkLength) {
              case -1:
                return `peg$currPos += ${varName}.length;`;
              case 1:
                return "peg$currPos++;";
              default:
                return "peg$currPos += (" + inputChunkLength + ");";
            }
          }
          __name(getIncrCode, "getIncrCode");
          function compileInputChunkCondition(condFn, argCount, inputChunkLength) {
            const baseLength = argCount + 3;
            let inputChunk = getChunkCode(inputChunkLength);
            let thenFn = null;
            if (bc[ip + baseLength] === op.ACCEPT_N && bc[ip + baseLength + 1] === inputChunkLength) {
              parts2.push(stack.push(inputChunk));
              inputChunk = stack.pop();
              thenFn = /* @__PURE__ */ __name((bc2) => {
                stack.sp++;
                const code2 = compile(bc2.slice(2));
                code2.unshift(getIncrCode(inputChunkLength, inputChunk));
                return code2;
              }, "thenFn");
            }
            compileCondition(condFn(inputChunk, thenFn !== null), argCount, thenFn);
          }
          __name(compileInputChunkCondition, "compileInputChunkCondition");
          function compileLoop(cond) {
            const baseLength = 2;
            const bodyLength = bc[ip + baseLength - 1];
            const bodyCode = stack.checkedLoop(ip, () => {
              ip += baseLength + bodyLength;
              return compile(bc.slice(ip - bodyLength, ip));
            });
            parts2.push("while (" + cond + ") {");
            parts2.push(...indent2(bodyCode));
            parts2.push("}");
          }
          __name(compileLoop, "compileLoop");
          function compileCall(baseLength) {
            const paramsLength = bc[ip + baseLength - 1];
            return f(bc[ip + 1]) + "(" + bc.slice(ip + baseLength, ip + baseLength + paramsLength).map((p) => stack.index(p)).join(", ") + ")";
          }
          __name(compileCall, "compileCall");
          while (ip < end) {
            switch (bc[ip]) {
              case op.PUSH_EMPTY_STRING:
                parts2.push(stack.push("''"));
                ip++;
                break;
              case op.PUSH_CURR_POS:
                parts2.push(stack.push("peg$currPos"));
                ip++;
                break;
              case op.PUSH_UNDEFINED:
                parts2.push(stack.push("undefined"));
                ip++;
                break;
              case op.PUSH_NULL:
                parts2.push(stack.push("null"));
                ip++;
                break;
              case op.PUSH_FAILED:
                parts2.push(stack.push("peg$FAILED"));
                ip++;
                break;
              case op.PUSH_EMPTY_ARRAY:
                parts2.push(stack.push("[]"));
                ip++;
                break;
              case op.POP:
                stack.pop();
                ip++;
                break;
              case op.POP_CURR_POS:
                parts2.push("peg$currPos = " + stack.pop() + ";");
                ip++;
                break;
              case op.POP_N:
                stack.pop(bc[ip + 1]);
                ip += 2;
                break;
              case op.NIP:
                value = stack.pop();
                stack.pop();
                parts2.push(stack.push(value));
                ip++;
                break;
              case op.APPEND:
                value = stack.pop();
                parts2.push(stack.top() + ".push(" + value + ");");
                ip++;
                break;
              case op.WRAP:
                parts2.push(stack.push("[" + stack.pop(bc[ip + 1]).join(", ") + "]"));
                ip += 2;
                break;
              case op.TEXT:
                parts2.push(stack.push("input.substring(" + stack.pop() + ", peg$currPos)"));
                ip++;
                break;
              case op.PLUCK: {
                const baseLength = 3;
                const paramsLength = bc[ip + baseLength - 1];
                const n = baseLength + paramsLength;
                value = bc.slice(ip + baseLength, ip + n);
                value = paramsLength === 1 ? stack.index(value[0]) : `[ ${value.map((p) => stack.index(p)).join(", ")} ]`;
                stack.pop(bc[ip + 1]);
                parts2.push(stack.push(value));
                ip += n;
                break;
              }
              case op.IF:
                compileCondition(stack.top(), 0);
                break;
              case op.IF_ERROR:
                compileCondition(stack.top() + " === peg$FAILED", 0);
                break;
              case op.IF_NOT_ERROR:
                compileCondition(stack.top() + " !== peg$FAILED", 0);
                break;
              case op.IF_LT:
                compileCondition(stack.top() + ".length < " + bc[ip + 1], 1);
                break;
              case op.IF_GE:
                compileCondition(stack.top() + ".length >= " + bc[ip + 1], 1);
                break;
              case op.IF_LT_DYNAMIC:
                compileCondition(stack.top() + ".length < (" + stack.index(bc[ip + 1]) + "|0)", 1);
                break;
              case op.IF_GE_DYNAMIC:
                compileCondition(stack.top() + ".length >= (" + stack.index(bc[ip + 1]) + "|0)", 1);
                break;
              case op.WHILE_NOT_ERROR:
                compileLoop(stack.top() + " !== peg$FAILED");
                break;
              case op.MATCH_ANY:
                compileCondition("input.length > peg$currPos", 0);
                break;
              case op.MATCH_STRING: {
                const litNum = bc[ip + 1];
                const literal = literals[litNum];
                compileInputChunkCondition((inputChunk, optimized) => {
                  if (literal.length > 1) {
                    return `${inputChunk} === ${l(litNum)}`;
                  }
                  inputChunk = !optimized ? "input.charCodeAt(peg$currPos)" : `${inputChunk}.charCodeAt(0)`;
                  return `${inputChunk} === ${literal.charCodeAt(0)}`;
                }, 1, literal.length);
                break;
              }
              case op.MATCH_STRING_IC: {
                const litNum = bc[ip + 1];
                compileInputChunkCondition((inputChunk) => `${inputChunk}.toLowerCase() === ${l(litNum)}`, 1, literals[litNum].length);
                break;
              }
              case op.MATCH_CHAR_CLASS: {
                const regNum = bc[ip + 1];
                compileInputChunkCondition((inputChunk) => `${r(regNum)}.test(${inputChunk})`, 1, 1);
                break;
              }
              case op.MATCH_UNICODE_CLASS: {
                const regNum = bc[ip + 1];
                compileInputChunkCondition((inputChunk) => `${r(regNum)}.test(${inputChunk})`, 1, -1);
                break;
              }
              case op.ACCEPT_N:
                parts2.push(stack.push(getChunkCode(bc[ip + 1])));
                parts2.push(getIncrCode(bc[ip + 1], stack.top()));
                ip += 2;
                break;
              case op.ACCEPT_STRING:
                parts2.push(stack.push(l(bc[ip + 1])));
                parts2.push(literals[bc[ip + 1]].length > 1 ? "peg$currPos += " + literals[bc[ip + 1]].length + ";" : "peg$currPos++;");
                ip += 2;
                break;
              case op.FAIL:
                parts2.push(stack.push("peg$FAILED"));
                parts2.push("if (peg$silentFails === 0) { peg$fail(" + e(bc[ip + 1]) + "); }");
                ip += 2;
                break;
              case op.LOAD_SAVED_POS:
                parts2.push("peg$savedPos = " + stack.index(bc[ip + 1]) + ";");
                ip += 2;
                break;
              case op.UPDATE_SAVED_POS:
                parts2.push("peg$savedPos = peg$currPos;");
                ip++;
                break;
              case op.CALL:
                value = compileCall(4);
                stack.pop(bc[ip + 2]);
                parts2.push(stack.push(value));
                ip += 4 + bc[ip + 3];
                break;
              case op.RULE:
                parts2.push(stack.push(name(ast2.rules[bc[ip + 1]].name) + "()"));
                ip += 2;
                break;
              case op.LIBRARY_RULE: {
                const nm = bc[ip + 2];
                const cnm = nm === -1 ? "" : ', "' + importedNames[nm] + '"';
                parts2.push(stack.push("peg$callLibrary(" + gi(bc[ip + 1]) + cnm + ")"));
                ip += 3;
                break;
              }
              case op.SILENT_FAILS_ON:
                parts2.push("peg$silentFails++;");
                ip++;
                break;
              case op.SILENT_FAILS_OFF:
                parts2.push("peg$silentFails--;");
                ip++;
                break;
              case op.SOURCE_MAP_PUSH:
                stack.sourceMapPush(parts2, locations[bc[ip + 1]]);
                ip += 2;
                break;
              case op.SOURCE_MAP_POP: {
                stack.sourceMapPop();
                ip++;
                break;
              }
              case op.SOURCE_MAP_LABEL_PUSH:
                stack.labels[bc[ip + 1]] = {
                  label: literals[bc[ip + 2]],
                  location: locations[bc[ip + 3]]
                };
                ip += 4;
                break;
              case op.SOURCE_MAP_LABEL_POP:
                delete stack.labels[bc[ip + 1]];
                ip += 2;
                break;
              // istanbul ignore next Because we never generate invalid bytecode we cannot reach this branch
              default:
                throw new Error("Invalid opcode: " + bc[ip] + ".");
            }
          }
          return parts2;
        }
        __name(compile, "compile");
        const code = compile(bytecode);
        parts.push(wrapInSourceNode("function ", name(rule.name), rule.nameLocation, "() {\n", rule.name));
        if (options2.trace) {
          parts.push("  var startPos = peg$currPos;");
        }
        parts.push(indent2(stack.defines()));
        parts.push(...indent2(generateRuleHeader('"' + stringEscape(rule.name) + '"', asts.indexOfRule(ast2, rule.name))));
        parts.push(...indent2(code));
        parts.push(...indent2(generateRuleFooter('"' + stringEscape(rule.name) + '"', stack.result())));
        parts.push("}");
        parts.push("");
        return parts;
      }
      __name(generateRuleFunction, "generateRuleFunction");
      function ast2SourceNode(node) {
        if (node.codeLocation) {
          return toSourceNode(node.code, node.codeLocation, "$" + node.type);
        }
        return node.code;
      }
      __name(ast2SourceNode, "ast2SourceNode");
      function generateToplevel() {
        const parts = [];
        let topLevel = ast2.topLevelInitializer;
        if (topLevel) {
          if (Array.isArray(topLevel)) {
            if (options2.format === "es") {
              const imps = [];
              const codes = [];
              for (const tli of topLevel) {
                const [imports, code] = (
                  /** @type {PEG.ast.TopLevelInitializer[]} */
                  parse(tli.code, {
                    startRule: "ImportsAndSource",
                    grammarSource: new GrammarLocation(tli.codeLocation.source, tli.codeLocation.start)
                  })
                );
                if (imports.code) {
                  imps.push(imports);
                  codes.push(code);
                } else {
                  codes.push(tli);
                }
              }
              topLevel = codes.concat(imps);
            }
            const reversed = topLevel.slice(0).reverse();
            for (const tli of reversed) {
              parts.push(ast2SourceNode(tli));
              parts.push("");
            }
          } else {
            parts.push(ast2SourceNode(topLevel));
            parts.push("");
          }
        }
        parts.push("class peg$SyntaxError extends SyntaxError {", "  constructor(message, expected, found, location) {", "    super(message);", "    this.expected = expected;", "    this.found = found;", "    this.location = location;", '    this.name = "SyntaxError";', "  }", "", "  format(sources) {", '    let str = "Error: " + this.message;', "    if (this.location) {", "      let src = null;", "      const st = sources.find(s => s.source === this.location.source);", "      if (st) {", "        src = st.text.split(/\\r\\n|\\n|\\r/g);", "      }", "      const s = this.location.start;", '      const offset_s = (this.location.source && (typeof this.location.source.offset === "function"))', "        ? this.location.source.offset(s)", "        : s;", '      const loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;', "      if (src) {", "        const e = this.location.end;", '        const filler = "".padEnd(offset_s.line.toString().length, " ");', "        const line = src[s.line - 1];", "        const last = s.line === e.line ? e.column : line.length + 1;", "        const hatLen = (last - s.column) || 1;", '        str += "\\n --> " + loc + "\\n"', '            + filler + " |\\n"', '            + offset_s.line + " | " + line + "\\n"', '            + filler + " | " + "".padEnd(s.column - 1, " ")', '            + "".padEnd(hatLen, "^");', "      } else {", '        str += "\\n at " + loc;', "      }", "    }", "    return str;", "  }", "", "  static buildMessage(expected, found) {", "    function hex(ch) {", "      return ch.codePointAt(0).toString(16).toUpperCase();", "    }", "", '    const nonPrintable = Object.prototype.hasOwnProperty.call(RegExp.prototype, "unicode")', '      ? new RegExp("[\\\\p{C}\\\\p{Mn}\\\\p{Mc}]", "gu")', "      : null;", "    function unicodeEscape(s) {", "      if (nonPrintable) {", '        return s.replace(nonPrintable,  ch => "\\\\u{" + hex(ch) + "}");', "      }", "      return s;", "    }", "", "    function literalEscape(s) {", "      return unicodeEscape(s", '        .replace(/\\\\/g, "\\\\\\\\")', '        .replace(/"/g,  "\\\\\\"")', '        .replace(/\\0/g, "\\\\0")', '        .replace(/\\t/g, "\\\\t")', '        .replace(/\\n/g, "\\\\n")', '        .replace(/\\r/g, "\\\\r")', '        .replace(/[\\x00-\\x0F]/g,          ch => "\\\\x0" + hex(ch))', '        .replace(/[\\x10-\\x1F\\x7F-\\x9F]/g, ch => "\\\\x"  + hex(ch)));', "    }", "", "    function classEscape(s) {", "      return unicodeEscape(s", '        .replace(/\\\\/g, "\\\\\\\\")', '        .replace(/\\]/g, "\\\\]")', '        .replace(/\\^/g, "\\\\^")', '        .replace(/-/g,  "\\\\-")', '        .replace(/\\0/g, "\\\\0")', '        .replace(/\\t/g, "\\\\t")', '        .replace(/\\n/g, "\\\\n")', '        .replace(/\\r/g, "\\\\r")', '        .replace(/[\\x00-\\x0F]/g,          ch => "\\\\x0" + hex(ch))', '        .replace(/[\\x10-\\x1F\\x7F-\\x9F]/g, ch => "\\\\x"  + hex(ch)));', "    }", "", "    const DESCRIBE_EXPECTATION_FNS = {", "      literal(expectation) {", '        return "\\"" + literalEscape(expectation.text) + "\\"";', "      },", "", "      class(expectation) {", "        const escapedParts = expectation.parts.map(", "          part => (Array.isArray(part)", '            ? classEscape(part[0]) + "-" + classEscape(part[1])', "            : classEscape(part))", "        );", "", '        return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]" + (expectation.unicode ? "u" : "");', "      },", "", "      any() {", '        return "any character";', "      },", "", "      end() {", '        return "end of input";', "      },", "", "      other(expectation) {", "        return expectation.description;", "      },", "    };", "", "    function describeExpectation(expectation) {", "      return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);", "    }", "", "    function describeExpected(expected) {", "      const descriptions = expected.map(describeExpectation);", "      descriptions.sort();", "", "      if (descriptions.length > 0) {", "        let j = 1;", "        for (let i = 1; i < descriptions.length; i++) {", "          if (descriptions[i - 1] !== descriptions[i]) {", "            descriptions[j] = descriptions[i];", "            j++;", "          }", "        }", "        descriptions.length = j;", "      }", "", "      switch (descriptions.length) {", "        case 1:", "          return descriptions[0];", "", "        case 2:", '          return descriptions[0] + " or " + descriptions[1];', "", "        default:", '          return descriptions.slice(0, -1).join(", ")', '            + ", or "', "            + descriptions[descriptions.length - 1];", "      }", "    }", "", "    function describeFound(found) {", '      return found ? "\\"" + literalEscape(found) + "\\"" : "end of input";', "    }", "", '    return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";', "  }", "}", "");
        if (options2.trace) {
          parts.push("class peg$DefaultTracer {", "  constructor() {", "    this.indentLevel = 0;", "  }", "", "  trace(event) {", "    const that = this;", "", "    function log(event) {", "      console?.log?.(", '        event.location.start.line + ":" + event.location.start.column + "-"', '          + event.location.end.line + ":" + event.location.end.column + " "', '          + event.type.padEnd(10, " ")', '          + "".padEnd((that.indentLevel * 2) + 1, " ") + event.rule', "       );", "    }", "", "    switch (event.type) {", '      case "rule.enter":', "        log(event);", "        this.indentLevel++;", "        break;", "", '      case "rule.match":', "        this.indentLevel--;", "        log(event);", "        break;", "", '      case "rule.fail":', "        this.indentLevel--;", "        log(event);", "        break;", "", "      default:", '        throw new Error("Invalid event type: " + event.type + ".");', "    }", "  }", "}", "");
        }
        const startRuleFunctions = "{\n" + allowedStartRules.map((r2) => `    ${r2}: ${name(r2)},
`).join("") + "  }";
        const startRuleFunction = name(allowedStartRules[0]);
        parts.push("function peg$parse(input, options) {", "  options = options !== undefined ? options : {};", "", "  const peg$FAILED = {};", "  const peg$source = options.grammarSource;", "", "  const peg$startRuleFunctions = " + startRuleFunctions + ";", "  let peg$startRuleFunction = " + startRuleFunction + ";", "", generateTables(), "", "  let peg$currPos = options.peg$currPos | 0;", "  let peg$savedPos = peg$currPos;", "  const peg$posDetailsCache = [{ line: 1, column: 1 }];", "  let peg$maxFailPos = peg$currPos;", "  let peg$maxFailExpected = options.peg$maxFailExpected || [];", "  let peg$silentFails = options.peg$silentFails | 0;", "");
        if (options2.cache) {
          parts.push("  let peg$resultsCache = {};", "");
        }
        if (options2.trace) {
          parts.push('  let peg$tracer = "tracer" in options ? options.tracer : new peg$DefaultTracer();', "");
        }
        parts.push("  let peg$result;", "", "  if (options.startRule) {", "    if (!(options.startRule in peg$startRuleFunctions)) {", `      throw new Error("Can't start parsing from rule \\"" + options.startRule + "\\".");`, "    }", "", "    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];", "  }", "", "  function text() {", "    return input.substring(peg$savedPos, peg$currPos);", "  }", "", "  function offset() {", "    return peg$savedPos;", "  }", "", "  function range() {", "    return {", "      source: peg$source,", "      start: peg$savedPos,", "      end: peg$currPos,", "    };", "  }", "", "  function location() {", "    return peg$computeLocation(peg$savedPos, peg$currPos);", "  }", "", "  function expected(description, location) {", "    location = location !== undefined", "      ? location", "      : peg$computeLocation(peg$savedPos, peg$currPos);", "", "    throw peg$buildStructuredError(", "      [peg$otherExpectation(description)],", "      input.substring(peg$savedPos, peg$currPos),", "      location", "    );", "  }", "", "  function error(message, location) {", "    location = location !== undefined", "      ? location", "      : peg$computeLocation(peg$savedPos, peg$currPos);", "", "    throw peg$buildSimpleError(message, location);", "  }", "", "  function peg$getUnicode(pos = peg$currPos) {", "    const cp = input.codePointAt(pos);", "    if (cp === undefined) {", '      return "";', "    }", "    return String.fromCodePoint(cp);", "  }", "", "  function peg$literalExpectation(text, ignoreCase) {", '    return { type: "literal", text, ignoreCase };', "  }", "", "  function peg$classExpectation(parts, inverted, ignoreCase, unicode) {", '    return { type: "class", parts, inverted, ignoreCase, unicode };', "  }", "", "  function peg$anyExpectation() {", '    return { type: "any" };', "  }", "", "  function peg$endExpectation() {", '    return { type: "end" };', "  }", "", "  function peg$otherExpectation(description) {", '    return { type: "other", description };', "  }", "", "  function peg$computePosDetails(pos) {", "    let details = peg$posDetailsCache[pos];", "    let p;", "", "    if (details) {", "      return details;", "    } else {", "      if (pos >= peg$posDetailsCache.length) {", "        p = peg$posDetailsCache.length - 1;", "      } else {", "        p = pos;", "        while (!peg$posDetailsCache[--p]) {}", "      }", "", "      details = peg$posDetailsCache[p];", "      details = {", "        line: details.line,", "        column: details.column,", "      };", "", "      while (p < pos) {", "        if (input.charCodeAt(p) === 10) {", "          details.line++;", "          details.column = 1;", "        } else {", "          details.column++;", "        }", "", "        p++;", "      }", "", "      peg$posDetailsCache[pos] = details;", "", "      return details;", "    }", "  }", "", "  function peg$computeLocation(startPos, endPos, offset) {", "    const startPosDetails = peg$computePosDetails(startPos);", "    const endPosDetails = peg$computePosDetails(endPos);", "", "    const res = {", "      source: peg$source,", "      start: {", "        offset: startPos,", "        line: startPosDetails.line,", "        column: startPosDetails.column,", "      },", "      end: {", "        offset: endPos,", "        line: endPosDetails.line,", "        column: endPosDetails.column,", "      },", "    };", '    if (offset && peg$source && (typeof peg$source.offset === "function")) {', "      res.start = peg$source.offset(res.start);", "      res.end = peg$source.offset(res.end);", "    }", "    return res;", "  }", "", "  function peg$fail(expected) {", "    if (peg$currPos < peg$maxFailPos) { return; }", "", "    if (peg$currPos > peg$maxFailPos) {", "      peg$maxFailPos = peg$currPos;", "      peg$maxFailExpected = [];", "    }", "", "    peg$maxFailExpected.push(expected);", "  }", "", "  function peg$buildSimpleError(message, location) {", "    return new peg$SyntaxError(message, null, null, location);", "  }", "", "  function peg$buildStructuredError(expected, found, location) {", "    return new peg$SyntaxError(", "      peg$SyntaxError.buildMessage(expected, found),", "      expected,", "      found,", "      location", "    );", "  }", "");
        if (ast2.imports.length > 0) {
          parts.push("  function peg$callLibrary(lib, startRule) {", "    const opts = Object.assign({}, options, {", "      startRule: startRule,", "      peg$currPos: peg$currPos,", "      peg$silentFails: peg$silentFails,", "      peg$library: true,", "      peg$maxFailExpected: peg$maxFailExpected", "    });", "    const res = lib.parse(input, opts);", "    peg$currPos = res.peg$currPos;", "    peg$maxFailPos = res.peg$maxFailPos;", "    peg$maxFailExpected = res.peg$maxFailExpected;", "    return (res.peg$result === res.peg$FAILED) ? peg$FAILED : res.peg$result;", "  }", "");
        }
        ast2.rules.forEach((rule) => {
          parts.push(...indent2(generateRuleFunction(rule)));
        });
        if (ast2.initializer) {
          if (Array.isArray(ast2.initializer)) {
            for (const init of ast2.initializer) {
              parts.push(ast2SourceNode(init));
              parts.push("");
            }
          } else {
            parts.push(ast2SourceNode(ast2.initializer));
            parts.push("");
          }
        }
        parts.push(
          "  peg$result = peg$startRuleFunction();",
          "",
          "  const peg$success = (peg$result !== peg$FAILED && peg$currPos === input.length);",
          "  function peg$throw() {",
          "    if (peg$result !== peg$FAILED && peg$currPos < input.length) {",
          "      peg$fail(peg$endExpectation());",
          "    }",
          "",
          "    throw peg$buildStructuredError(",
          "      peg$maxFailExpected,",
          "      peg$maxFailPos < input.length ? peg$getUnicode(peg$maxFailPos) : null,",
          "      peg$maxFailPos < input.length",
          "        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)",
          "        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)",
          "    );",
          "  }",
          "  if (options.peg$library) {",
          // Hide this from TypeScript.  It's internal-only until library mode is stabilized.
          "    return /** @type {any} */ ({",
          "      peg$result,",
          "      peg$currPos,",
          "      peg$FAILED,",
          "      peg$maxFailExpected,",
          "      peg$maxFailPos,",
          "      peg$success,",
          "      peg$throw: peg$success ? undefined : peg$throw,",
          "    });",
          "  }",
          "  if (peg$success) {",
          "    return peg$result;",
          "  } else {",
          "    peg$throw();",
          "  }",
          "}"
        );
        return new SourceNode(
          // This expression has a better readability when on two lines
          // eslint-disable-next-line @stylistic/function-call-argument-newline
          null,
          null,
          options2.grammarSource,
          parts.map((s) => s instanceof SourceNode ? s : s + "\n")
        );
      }
      __name(generateToplevel, "generateToplevel");
      function generateWrapper(toplevelCode) {
        function generateGeneratedByComment() {
          return [
            `// @generated by Peggy ${version}.`,
            "//",
            "// https://peggyjs.org/"
          ];
        }
        __name(generateGeneratedByComment, "generateGeneratedByComment");
        function generateParserObject() {
          const res = [
            "{"
          ];
          if (options2.trace) {
            res.push("  DefaultTracer: peg$DefaultTracer,");
          }
          if (options2.allowedStartRules) {
            res.push("  StartRules: [" + options2.allowedStartRules.map((r2) => '"' + r2 + '"').join(", ") + "],");
          }
          res.push("  SyntaxError: peg$SyntaxError,", "  parse: peg$parse,");
          res.push("}");
          return res.join("\n");
        }
        __name(generateParserObject, "generateParserObject");
        const generators = {
          bare() {
            if (Object.keys(dependencies).length > 0 || ast2.imports.length > 0) {
              throw new Error("Dependencies not supported in format 'bare'.");
            }
            return [
              ...generateGeneratedByComment(),
              "(function() {",
              '  "use strict";',
              toplevelCode,
              indent2("return " + generateParserObject() + ";"),
              "})()"
            ];
          },
          commonjs() {
            const dependencyVars = Object.keys(dependencies);
            const parts2 = generateGeneratedByComment();
            parts2.push("", '"use strict";');
            if (dependencyVars.length > 0) {
              dependencyVars.forEach((variable) => {
                parts2.push("const " + variable + ' = require("' + stringEscape(dependencies[variable]) + '");');
              });
              parts2.push("");
            }
            const impLen = ast2.imports.length;
            for (let i = 0; i < impLen; i++) {
              parts2.push("const " + gi(i) + ' = require("' + stringEscape(ast2.imports[i].from.module) + '");');
            }
            parts2.push("", toplevelCode, "", "module.exports = " + generateParserObject() + ";");
            return parts2;
          },
          es() {
            const dependencyVars = Object.keys(dependencies);
            const parts2 = generateGeneratedByComment();
            parts2.push("");
            if (dependencyVars.length > 0) {
              dependencyVars.forEach((variable) => {
                parts2.push("import " + variable + ' from "' + stringEscape(dependencies[variable]) + '";');
              });
              parts2.push("");
            }
            for (let i = 0; i < ast2.imports.length; i++) {
              parts2.push("import * as " + gi(i) + ' from "' + stringEscape(ast2.imports[i].from.module) + '";');
            }
            parts2.push("", toplevelCode, "");
            parts2.push("const peg$allowedStartRules = [", "  " + (options2.allowedStartRules ? options2.allowedStartRules.map((r2) => '"' + r2 + '"').join(",\n  ") : ""), "];", "");
            parts2.push("export {");
            if (options2.trace) {
              parts2.push("  peg$DefaultTracer as DefaultTracer,");
            }
            parts2.push("  peg$allowedStartRules as StartRules,", "  peg$SyntaxError as SyntaxError,", "  peg$parse as parse", "};");
            return parts2;
          },
          amd() {
            if (ast2.imports.length > 0) {
              throw new Error("Imports are not supported in format 'amd'.");
            }
            const dependencyVars = Object.keys(dependencies);
            const dependencyIds = dependencyVars.map((v) => dependencies[v]);
            const deps = "[" + dependencyIds.map((id) => '"' + stringEscape(id) + '"').join(", ") + "]";
            const params = dependencyVars.join(", ");
            return [
              ...generateGeneratedByComment(),
              "define(" + deps + ", function(" + params + ") {",
              '  "use strict";',
              toplevelCode,
              "",
              indent2("return " + generateParserObject() + ";"),
              "});"
            ];
          },
          globals() {
            if (Object.keys(dependencies).length > 0 || ast2.imports.length > 0) {
              throw new Error("Dependencies not supported in format 'globals'.");
            }
            if (!options2.exportVar) {
              throw new Error("No export variable defined for format 'globals'.");
            }
            return [
              ...generateGeneratedByComment(),
              "(function(root) {",
              '  "use strict";',
              toplevelCode,
              "",
              indent2("root." + options2.exportVar + " = " + generateParserObject() + ";"),
              "})(this);"
            ];
          },
          umd() {
            if (ast2.imports.length > 0) {
              throw new Error("Imports are not supported in format 'umd'.");
            }
            const dependencyVars = Object.keys(dependencies);
            const dependencyIds = dependencyVars.map((v) => dependencies[v]);
            const deps = "[" + dependencyIds.map((id) => '"' + stringEscape(id) + '"').join(", ") + "]";
            const requires = dependencyIds.map((id) => 'require("' + stringEscape(id) + '")').join(", ");
            const params = dependencyVars.join(", ");
            const parts2 = generateGeneratedByComment();
            parts2.push("(function(root, factory) {", '  if (typeof define === "function" && define.amd) {', "    define(" + deps + ", factory);", '  } else if (typeof module === "object" && module.exports) {', "    module.exports = factory(" + requires + ");");
            if (options2.exportVar) {
              parts2.push("  } else {", "    root." + options2.exportVar + " = factory();");
            }
            parts2.push("  }", "})(this, function(" + params + ") {", '  "use strict";', toplevelCode, "", indent2("return " + generateParserObject() + ";"), "});");
            return parts2;
          }
        };
        const parts = generators[options2.format || "bare"]();
        return new SourceNode(
          // eslint-disable-next-line @stylistic/function-call-argument-newline -- This expression has a better readability when on two lines
          null,
          null,
          options2.grammarSource,
          parts.map((s) => s instanceof SourceNode ? s : s + "\n")
        );
      }
      __name(generateWrapper, "generateWrapper");
      ast2.code = generateWrapper(generateToplevel());
    }
    __name(generateJS2, "generateJS");
    module2.exports = generateJS2;
  }
});

// node_modules/peggy/lib/compiler/passes/remove-proxy-rules.js
var require_remove_proxy_rules = __commonJS({
  "node_modules/peggy/lib/compiler/passes/remove-proxy-rules.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function removeProxyRules2(ast2, options2, session2) {
      function isProxyRule(node) {
        return node.type === "rule" && node.expression.type === "rule_ref";
      }
      __name(isProxyRule, "isProxyRule");
      function replaceRuleRefs(ast3, from, to) {
        const replace = visitor2.build({
          rule_ref(node) {
            if (node.name === from) {
              node.name = to;
              session2.info(`Proxy rule "${from}" replaced by the rule "${to}"`, node.location, [
                {
                  message: "This rule will be used",
                  location: asts.findRule(ast3, to).nameLocation
                }
              ]);
            }
          }
        });
        replace(ast3);
      }
      __name(replaceRuleRefs, "replaceRuleRefs");
      ast2.rules.forEach((rule) => {
        if (isProxyRule(rule)) {
          replaceRuleRefs(ast2, rule.name, rule.expression.name);
        }
      });
    }
    __name(removeProxyRules2, "removeProxyRules");
    module2.exports = removeProxyRules2;
  }
});

// node_modules/peggy/lib/compiler/passes/merge-character-classes.js
var require_merge_character_classes = __commonJS({
  "node_modules/peggy/lib/compiler/passes/merge-character-classes.js"(exports2, module2) {
    "use strict";
    var { stringEscape } = require_utils();
    var visitor2 = require_visitor();
    var { codePointLen1 } = require_utils();
    function cloneOver(target, source) {
      const t = (
        /** @type {Record<string,unknown>} */
        target
      );
      const s = (
        /** @type {Record<string,unknown>} */
        source
      );
      Object.keys(t).forEach((key) => delete t[key]);
      Object.keys(s).forEach((key) => {
        t[key] = s[key];
      });
    }
    __name(cloneOver, "cloneOver");
    function cleanParts(parts) {
      parts.sort((a, b) => {
        const [aStart, aEnd] = Array.isArray(a) ? a : [
          a,
          a
        ];
        const [bStart, bEnd] = Array.isArray(b) ? b : [
          b,
          b
        ];
        if (aStart !== bStart) {
          return aStart < bStart ? -1 : 1;
        }
        if (aEnd !== bEnd) {
          return aEnd > bEnd ? -1 : 1;
        }
        return 0;
      });
      let prevStart = "";
      let prevEnd = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const [curStart, curEnd] = Array.isArray(part) ? part : [
          part,
          part
        ];
        if (typeof curStart === "string" && typeof curEnd === "string" && typeof prevStart === "string" && typeof prevEnd === "string") {
          if (curEnd <= prevEnd) {
            parts.splice(i--, 1);
            continue;
          }
          if (prevEnd.charCodeAt(0) + 1 >= curStart.charCodeAt(0)) {
            parts.splice(i--, 1);
            parts[i] = [
              prevStart,
              prevEnd = curEnd
            ];
            continue;
          }
        }
        prevStart = curStart;
        prevEnd = curEnd;
      }
      return parts;
    }
    __name(cleanParts, "cleanParts");
    var LAST_LOW = String.fromCodePoint(55295);
    var FIRST_SURROGATE = 55296;
    var LAST_SURROGATE = 57343;
    var FIRST_HIGH = String.fromCodePoint(57344);
    function splitUnicodeRanges(ast2, session2) {
      const split = visitor2.build({
        /**
        * @param {PEG.ast.CharacterClass} node
        */
        class(node) {
          if (!node.unicode) {
            return;
          }
          const extras = [];
          for (const p of node.parts) {
            if (Array.isArray(p)) {
              const [s, e] = p.map((c) => (
                /** @type {number} */
                c.codePointAt(0)
              ));
              if (s < FIRST_SURROGATE && e > LAST_SURROGATE) {
                session2.info(`Removing surrogate range from [${stringEscape(p[0])}-${stringEscape(p[1])}]`, node.location);
                extras.push([
                  FIRST_HIGH,
                  p[1]
                ]);
                p[1] = LAST_LOW;
              }
            }
          }
          node.parts.push(...extras);
        }
      });
      split(ast2);
    }
    __name(splitUnicodeRanges, "splitUnicodeRanges");
    function mergeCharacterClasses2(ast2, _options, session2) {
      const rules = /* @__PURE__ */ Object.create(null);
      ast2.rules.forEach((rule) => rules[rule.name] = rule.expression);
      const processedRules = /* @__PURE__ */ new Set();
      splitUnicodeRanges(ast2, session2);
      const [asClass, merge] = [
        /**
        * Determine whether a node can be represented as a simple character class,
        * and return that class if so.
        *
        * @param {PEG.ast.Expression} node - the node to inspect
        * @param {boolean} [clone=false] - if true, always return a new node that
        *   can be modified by the caller
        * @returns {PEG.ast.CharacterClass | null}
        */
        (node, clone = false) => {
          switch (node.type) {
            case "class":
              if (node.inverted) {
                break;
              }
              return clone ? {
                ...node,
                parts: [
                  ...node.parts
                ]
              } : node;
            case "literal": {
              const ul = codePointLen1(node.value);
              if (ul < 0) {
                break;
              }
              return {
                type: "class",
                parts: [
                  node.value
                ],
                inverted: false,
                ignoreCase: node.ignoreCase,
                location: node.location,
                unicode: ul > 65535
              };
            }
            case "rule_ref": {
              const ref = rules[node.name];
              if (!ref) {
                break;
              }
              if (!processedRules.has(node.name)) {
                processedRules.add(node.name);
                merge(ref);
              }
              const cls = asClass(ref, true);
              if (cls) {
                cls.location = node.location;
              }
              return cls;
            }
          }
          return null;
        },
        visitor2.build({
          choice(node) {
            let prev = null;
            let changed = false;
            node.alternatives.forEach((alt, i) => {
              merge(alt);
              const cls = asClass(alt);
              if (!cls) {
                prev = null;
                return;
              }
              if (prev && prev.ignoreCase === cls.ignoreCase) {
                prev.parts.push(...cls.parts);
                node.alternatives[i - 1] = prev;
                node.alternatives[i] = prev;
                prev.unicode = prev.unicode || cls.unicode;
                prev.location = {
                  // Fix this when imports work.  Needs a combined source class.
                  source: prev.location.source,
                  start: prev.location.start,
                  end: cls.location.end
                };
                changed = true;
              } else {
                prev = cls;
              }
            });
            if (changed) {
              node.alternatives = node.alternatives.filter((alt, i, arr) => !i || alt !== arr[i - 1]);
              node.alternatives.forEach((alt, i) => {
                if (alt.type === "class") {
                  alt.parts = cleanParts(alt.parts);
                  if (alt.parts.length === 1 && !Array.isArray(alt.parts[0]) && typeof alt.parts[0] === "string" && !alt.inverted) {
                    node.alternatives[i] = {
                      type: "literal",
                      value: alt.parts[0],
                      ignoreCase: alt.ignoreCase,
                      location: alt.location
                    };
                  }
                }
              });
              if (node.alternatives.length === 1) {
                cloneOver(node, node.alternatives[0]);
              }
            }
          },
          text(node) {
            merge(node.expression);
            if (node.expression.type === "class" || node.expression.type === "literal") {
              const location = node.location;
              cloneOver(node, node.expression);
              node.location = location;
            }
          }
        })
      ];
      ast2.rules.forEach((rule) => {
        processedRules.add(rule.name);
        merge(rule.expression);
      });
    }
    __name(mergeCharacterClasses2, "mergeCharacterClasses");
    module2.exports = mergeCharacterClasses2;
  }
});

// node_modules/peggy/lib/compiler/passes/remove-unused-rules.js
var require_remove_unused_rules = __commonJS({
  "node_modules/peggy/lib/compiler/passes/remove-unused-rules.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function removeUnusedRules2(ast2, options2, session2) {
      const rules = /* @__PURE__ */ Object.create(null);
      ast2.rules.forEach((rule) => {
        rules[rule.name] = rule;
      });
      const queue = [
        ...options2.allowedStartRules
      ];
      const found = /* @__PURE__ */ new Set();
      const findRefs = visitor2.build({
        rule_ref(node) {
          queue.push(node.name);
        }
      });
      while (queue.length) {
        const r = queue.shift();
        if (!found.has(r)) {
          found.add(r);
          findRefs(rules[r]);
        }
      }
      ast2.rules = ast2.rules.filter((r) => {
        if (found.has(r.name)) {
          return true;
        }
        session2.info(`Removing unused rule: "${r.name}"`, r.location);
        return false;
      });
    }
    __name(removeUnusedRules2, "removeUnusedRules");
    module2.exports = removeUnusedRules2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-duplicate-imports.js
var require_report_duplicate_imports = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-duplicate-imports.js"(exports2, module2) {
    "use strict";
    function reportDuplicateImports2(ast2, _options, session2) {
      const all = {};
      for (const imp of ast2.imports) {
        for (const what of imp.what) {
          if (what.type === "import_binding_all") {
            if (Object.prototype.hasOwnProperty.call(all, what.binding)) {
              session2.error(`Module "${what.binding}" is already imported`, what.location, [
                {
                  message: "Original module location",
                  location: all[what.binding]
                }
              ]);
            }
            all[what.binding] = what.location;
          }
        }
      }
    }
    __name(reportDuplicateImports2, "reportDuplicateImports");
    module2.exports = reportDuplicateImports2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-duplicate-labels.js
var require_report_duplicate_labels = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-duplicate-labels.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportDuplicateLabels2(ast2, options2, session2) {
      function cloneEnv(env) {
        const clone = {};
        Object.keys(env).forEach((name) => {
          clone[name] = env[name];
        });
        return clone;
      }
      __name(cloneEnv, "cloneEnv");
      function checkExpressionWithClonedEnv(node, env) {
        check(node.expression, cloneEnv(env));
      }
      __name(checkExpressionWithClonedEnv, "checkExpressionWithClonedEnv");
      const check = visitor2.build({
        rule(node) {
          check(node.expression, {});
        },
        choice(node, env) {
          node.alternatives.forEach((alternative) => {
            check(alternative, cloneEnv(env));
          });
        },
        action: checkExpressionWithClonedEnv,
        labeled(node, env) {
          const label = node.label;
          if (label && Object.prototype.hasOwnProperty.call(env, label)) {
            session2.error(`Label "${node.label}" is already defined`, node.labelLocation, [
              {
                message: "Original label location",
                location: env[label]
              }
            ]);
          }
          check(node.expression, env);
          env[node.label] = node.labelLocation;
        },
        text: checkExpressionWithClonedEnv,
        simple_and: checkExpressionWithClonedEnv,
        simple_not: checkExpressionWithClonedEnv,
        optional: checkExpressionWithClonedEnv,
        zero_or_more: checkExpressionWithClonedEnv,
        one_or_more: checkExpressionWithClonedEnv,
        repeated(node, env) {
          if (node.delimiter) {
            check(node.delimiter, cloneEnv(env));
          }
          check(node.expression, cloneEnv(env));
        },
        group: checkExpressionWithClonedEnv
      });
      check(ast2);
    }
    __name(reportDuplicateLabels2, "reportDuplicateLabels");
    module2.exports = reportDuplicateLabels2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-duplicate-rules.js
var require_report_duplicate_rules = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-duplicate-rules.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportDuplicateRules2(ast2, options2, session2) {
      const rules = {};
      const check = visitor2.build({
        rule(node) {
          if (Object.prototype.hasOwnProperty.call(rules, node.name)) {
            session2.error(`Rule "${node.name}" is already defined`, node.nameLocation, [
              {
                message: "Original rule location",
                location: rules[node.name]
              }
            ]);
            return;
          }
          rules[node.name] = node.nameLocation;
        }
      });
      check(ast2);
    }
    __name(reportDuplicateRules2, "reportDuplicateRules");
    module2.exports = reportDuplicateRules2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-infinite-recursion.js
var require_report_infinite_recursion = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-infinite-recursion.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportInfiniteRecursion2(ast2, options2, session2) {
      const visitedRules = [];
      const backtraceRefs = [];
      const seen = /* @__PURE__ */ new Set();
      const check = visitor2.build({
        rule(node) {
          if (session2.errors > 0 || seen.has(node.name)) {
            return;
          }
          seen.add(node.name);
          visitedRules.push(node.name);
          check(node.expression);
          visitedRules.pop();
        },
        sequence(node) {
          if (session2.errors > 0) {
            return;
          }
          node.elements.every((element) => {
            check(element);
            if (session2.errors > 0) {
              return false;
            }
            return !asts.alwaysConsumesOnSuccess(ast2, element);
          });
        },
        repeated(node) {
          if (session2.errors > 0) {
            return;
          }
          check(node.expression);
          if (node.delimiter && !asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            check(node.delimiter);
          }
        },
        rule_ref(node) {
          if (session2.errors > 0) {
            return;
          }
          backtraceRefs.push(node);
          const rule = asts.findRule(ast2, node.name);
          if (visitedRules.indexOf(node.name) !== -1) {
            visitedRules.push(node.name);
            session2.error("Possible infinite loop when parsing (left recursion: " + visitedRules.join(" -> ") + ")", rule.nameLocation, backtraceRefs.map((ref, i, a) => ({
              message: i + 1 !== a.length ? `Step ${i + 1}: call of the rule "${ref.name}" without input consumption` : `Step ${i + 1}: calls itself without input consumption - left recursion`,
              location: ref.location
            })));
            return;
          }
          if (rule) {
            check(rule);
          }
          backtraceRefs.pop();
        }
      });
      check(ast2);
    }
    __name(reportInfiniteRecursion2, "reportInfiniteRecursion");
    module2.exports = reportInfiniteRecursion2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-infinite-repetition.js
var require_report_infinite_repetition = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-infinite-repetition.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportInfiniteRepetition2(ast2, options2, session2) {
      const check = visitor2.build({
        zero_or_more(node) {
          if (!asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            session2.error("Possible infinite loop when parsing (repetition used with an expression that may not consume any input)", node.location);
          }
        },
        one_or_more(node) {
          if (!asts.alwaysConsumesOnSuccess(ast2, node.expression)) {
            session2.error("Possible infinite loop when parsing (repetition used with an expression that may not consume any input)", node.location);
          }
        },
        repeated(node) {
          if (node.delimiter) {
            check(node.delimiter);
          }
          if (asts.alwaysConsumesOnSuccess(ast2, node.expression) || node.delimiter && asts.alwaysConsumesOnSuccess(ast2, node.delimiter)) {
            return;
          }
          if (node.max.value === null) {
            session2.error("Possible infinite loop when parsing (unbounded range repetition used with an expression that may not consume any input)", node.location);
          } else {
            const min = node.min ? node.min : node.max;
            session2.warning(min.type === "constant" && node.max.type === "constant" ? `An expression may not consume any input and may always match ${node.max.value} times` : "An expression may not consume any input and may always match with a maximum repetition count", node.location);
          }
        }
      });
      check(ast2);
    }
    __name(reportInfiniteRepetition2, "reportInfiniteRepetition");
    module2.exports = reportInfiniteRepetition2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-undefined-rules.js
var require_report_undefined_rules = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-undefined-rules.js"(exports2, module2) {
    "use strict";
    var asts = require_asts();
    var visitor2 = require_visitor();
    function reportUndefinedRules2(ast2, options2, session2) {
      const check = visitor2.build({
        rule_ref(node) {
          if (!asts.findRule(ast2, node.name)) {
            session2.error(`Rule "${node.name}" is not defined`, node.location);
          }
        }
      });
      check(ast2);
    }
    __name(reportUndefinedRules2, "reportUndefinedRules");
    module2.exports = reportUndefinedRules2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-incorrect-plucking.js
var require_report_incorrect_plucking = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-incorrect-plucking.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    function reportIncorrectPlucking2(ast2, options2, session2) {
      const check = visitor2.build({
        action(node) {
          check(node.expression, node);
        },
        labeled(node, action) {
          if (node.pick) {
            if (action) {
              session2.error('"@" cannot be used with an action block', node.labelLocation, [
                {
                  message: "Action block location",
                  location: action.codeLocation
                }
              ]);
            }
          }
          check(node.expression);
        }
      });
      check(ast2);
    }
    __name(reportIncorrectPlucking2, "reportIncorrectPlucking");
    module2.exports = reportIncorrectPlucking2;
  }
});

// node_modules/peggy/lib/compiler/passes/report-unreachable.js
var require_report_unreachable = __commonJS({
  "node_modules/peggy/lib/compiler/passes/report-unreachable.js"(exports2, module2) {
    "use strict";
    var visitor2 = require_visitor();
    var { ALWAYS_MATCH, NEVER_MATCH } = require_inference_match_result();
    function reportUnreachable2(ast2, options2, session2) {
      const visit = visitor2.build({
        /**
        * @param {PEG.ast.Choice} node
        */
        choice(node) {
          node.alternatives.forEach((a) => visit(a));
          for (let i = 0; i < node.alternatives.length - 1; i++) {
            const alt = node.alternatives[i];
            if (alt.match === ALWAYS_MATCH) {
              session2.warning("Always matches.  Following alternatives may not be reachable.", alt.location);
            }
          }
        },
        /**
        * @param {PEG.ast.Prefixed} node
        */
        simple_and(node) {
          visit(node.expression);
          if (node.expression.match === ALWAYS_MATCH) {
            session2.warning("Always matches, making the & predicate redundant.", node.expression.location);
          } else if (node.expression.match === NEVER_MATCH) {
            session2.warning("Never matches, making the & predicate always fail.", node.expression.location);
          }
        },
        /**
        * @param {PEG.ast.Prefixed} node
        */
        simple_not(node) {
          visit(node.expression);
          if (node.expression.match === ALWAYS_MATCH) {
            session2.warning("Always matches, making the ! predicate always fail.", node.expression.location);
          } else if (node.expression.match === NEVER_MATCH) {
            session2.warning("Never matches, making the ! predicate redundant.", node.expression.location);
          }
        }
      });
      visit(ast2);
    }
    __name(reportUnreachable2, "reportUnreachable");
    module2.exports = reportUnreachable2;
  }
});

// node_modules/peggy/lib/compiler/session.js
var require_session = __commonJS({
  "node_modules/peggy/lib/compiler/session.js"(exports2, module2) {
    "use strict";
    var GrammarError = require_grammar_error();
    var _a;
    var Defaults = (_a = class {
      constructor(options2) {
        options2 = typeof options2 !== "undefined" ? options2 : {};
        if (typeof options2.error === "function") {
          this.error = options2.error;
        }
        if (typeof options2.warning === "function") {
          this.warning = options2.warning;
        }
        if (typeof options2.info === "function") {
          this.info = options2.info;
        }
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      error() {
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      warning() {
      }
      // eslint-disable-next-line class-methods-use-this -- Abstract
      info() {
      }
    }, __name(_a, "Defaults"), _a);
    var _a2;
    var Session2 = (_a2 = class {
      constructor(options2) {
        this._callbacks = new Defaults(options2);
        this._firstError = null;
        this.errors = 0;
        this.problems = [];
        this.stage = null;
      }
      error(...args) {
        ++this.errors;
        if (this._firstError === null) {
          this._firstError = new GrammarError(...args);
          this._firstError.stage = this.stage;
          this._firstError.problems = this.problems;
        }
        this.problems.push([
          "error",
          ...args
        ]);
        this._callbacks.error(this.stage, ...args);
      }
      warning(...args) {
        this.problems.push([
          "warning",
          ...args
        ]);
        this._callbacks.warning(this.stage, ...args);
      }
      info(...args) {
        this.problems.push([
          "info",
          ...args
        ]);
        this._callbacks.info(this.stage, ...args);
      }
      checkErrors() {
        if (this.errors !== 0) {
          throw this._firstError;
        }
      }
    }, __name(_a2, "Session"), _a2);
    module2.exports = Session2;
  }
});

// node_modules/peggy/lib/compiler/index.js
var require_compiler = __commonJS({
  "node_modules/peggy/lib/compiler/index.js"(exports, module) {
    "use strict";
    var addImportedRules = require_add_imported_rules();
    var fixLibraryNumbers = require_fix_library_numbers();
    var generateBytecode = require_generate_bytecode();
    var generateJS = require_generate_js();
    var inferenceMatchResult = require_inference_match_result();
    var removeProxyRules = require_remove_proxy_rules();
    var mergeCharacterClasses = require_merge_character_classes();
    var removeUnusedRules = require_remove_unused_rules();
    var reportDuplicateImports = require_report_duplicate_imports();
    var reportDuplicateLabels = require_report_duplicate_labels();
    var reportDuplicateRules = require_report_duplicate_rules();
    var reportInfiniteRecursion = require_report_infinite_recursion();
    var reportInfiniteRepetition = require_report_infinite_repetition();
    var reportUndefinedRules = require_report_undefined_rules();
    var reportIncorrectPlucking = require_report_incorrect_plucking();
    var reportUnreachable = require_report_unreachable();
    var Session = require_session();
    var visitor = require_visitor();
    var { base64 } = require_utils();
    function processOptions(options2, defaults) {
      const processedOptions = {};
      Object.keys(options2).forEach((name) => {
        processedOptions[name] = options2[name];
      });
      Object.keys(defaults).forEach((name) => {
        if (!Object.prototype.hasOwnProperty.call(processedOptions, name)) {
          processedOptions[name] = defaults[name];
        }
      });
      return processedOptions;
    }
    __name(processOptions, "processOptions");
    function isSourceMapCapable(target) {
      if (typeof target === "string") {
        return target.length > 0;
      }
      return target && typeof target.offset === "function";
    }
    __name(isSourceMapCapable, "isSourceMapCapable");
    var compiler = {
      // AST node visitor builder. Useful mainly for plugins which manipulate the
      // AST.
      visitor,
      // Compiler passes.
      //
      // Each pass is a function that is passed the AST. It can perform checks on it
      // or modify it as needed. If the pass encounters a semantic error, it throws
      // |peg.GrammarError|.
      passes: {
        prepare: [
          addImportedRules,
          reportInfiniteRecursion
        ],
        check: [
          reportUndefinedRules,
          reportDuplicateRules,
          reportDuplicateLabels,
          reportInfiniteRepetition,
          reportIncorrectPlucking,
          reportDuplicateImports
        ],
        transform: [
          fixLibraryNumbers,
          removeProxyRules,
          mergeCharacterClasses,
          removeUnusedRules,
          inferenceMatchResult
        ],
        semantic: [
          reportUnreachable
        ],
        generate: [
          generateBytecode,
          generateJS
        ]
      },
      // Generates a parser from a specified grammar AST. Throws |peg.GrammarError|
      // if the AST contains a semantic error. Note that not all errors are detected
      // during the generation and some may protrude to the generated parser and
      // cause its malfunction.
      compile(ast, passes, options) {
        options = options !== void 0 ? options : {};
        const defaultStartRules = [
          ast.rules[0].name
        ];
        options = processOptions(options, {
          allowedStartRules: defaultStartRules,
          cache: false,
          dependencies: {},
          exportVar: null,
          format: "bare",
          output: "parser",
          trace: false
        });
        if (options.allowedStartRules === null || options.allowedStartRules === void 0) {
          options.allowedStartRules = defaultStartRules;
        }
        if (!Array.isArray(options.allowedStartRules)) {
          throw new Error("allowedStartRules must be an array");
        }
        if (options.allowedStartRules.length === 0) {
          options.allowedStartRules = defaultStartRules;
        }
        const allRules = ast.rules.map((r) => r.name);
        if (options.allowedStartRules.some((r) => r === "*")) {
          options.allowedStartRules = allRules;
        } else {
          for (const rule of options.allowedStartRules) {
            if (allRules.indexOf(rule) === -1) {
              throw new Error(`Unknown start rule "${rule}"`);
            }
          }
        }
        if ((options.output === "source-and-map" || options.output === "source-with-inline-map") && !isSourceMapCapable(options.grammarSource)) {
          throw new Error("Must provide grammarSource (as a string or GrammarLocation) in order to generate source maps");
        }
        const session = new Session(options);
        Object.keys(passes).forEach((stage) => {
          session.stage = stage;
          session.info(`Process stage ${stage}`);
          passes[stage].forEach((pass) => {
            session.info(`Process pass ${stage}.${pass.name}`);
            pass(ast, options, session);
          });
          session.checkErrors();
        });
        switch (options.output) {
          case "parser":
            return eval(ast.code.toString());
          case "source":
            return ast.code.toString();
          case "source-and-map":
            return ast.code;
          case "source-with-inline-map": {
            if (typeof TextEncoder === "undefined") {
              throw new Error("TextEncoder is not supported by this platform");
            }
            const sourceMap = ast.code.toStringWithSourceMap();
            const encoder = new TextEncoder();
            const b64 = base64(encoder.encode(JSON.stringify(sourceMap.map.toJSON())));
            return sourceMap.code + `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64}
`;
          }
          case "ast":
            return ast;
          default:
            throw new Error("Invalid output format: " + options.output + ".");
        }
      }
    };
    module.exports = compiler;
  }
});

// node_modules/peggy/lib/peg.js
var require_peg = __commonJS({
  "node_modules/peggy/lib/peg.js"(exports2, module2) {
    "use strict";
    var GrammarError = require_grammar_error();
    var GrammarLocation = require_grammar_location();
    var asts = require_asts();
    var compiler2 = require_compiler();
    var parser = require_parser();
    var { version: VERSION } = require_version();
    var RESERVED_WORDS = [
      // Reserved keywords as of ECMAScript 2015
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "export",
      "extends",
      "finally",
      "for",
      "function",
      "if",
      "import",
      "in",
      "instanceof",
      "new",
      "return",
      "super",
      "switch",
      "this",
      "throw",
      "try",
      "typeof",
      "var",
      "void",
      "while",
      "with",
      // Special constants
      "null",
      "true",
      "false",
      // These are always reserved:
      "enum",
      // The following are only reserved when they are found in strict mode code
      // Peggy generates code in strict mode, so they are applicable
      "implements",
      "interface",
      "let",
      "package",
      "private",
      "protected",
      "public",
      "static",
      "yield",
      // The following are only reserved when they are found in module code:
      "await",
      // The following are reserved as future keywords by ECMAScript 1..3
      // specifications, but not any more in modern ECMAScript. We don't need these
      // because the code-generation of Peggy only targets ECMAScript >= 5.
      //
      // - abstract
      // - boolean
      // - byte
      // - char
      // - double
      // - final
      // - float
      // - goto
      // - int
      // - long
      // - native
      // - short
      // - synchronized
      // - throws
      // - transient
      // - volatile
      // These are not reserved keywords, but using them as variable names is problematic.
      "arguments",
      "eval"
    ];
    var peg = {
      // Peggy version (filled in by /tools/release).
      VERSION,
      /**
      * Default list of reserved words. Contains list of currently and future
      * JavaScript (ECMAScript 2015) reserved words.
      *
      * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#reserved_words
      */
      RESERVED_WORDS,
      GrammarError,
      GrammarLocation,
      parser,
      compiler: compiler2,
      // Generates a parser from a specified grammar and returns it.
      //
      // The grammar must be a string in the format described by the meta-grammar in
      // the parser.pegjs file.
      //
      // Throws |peg.parser.SyntaxError| if the grammar contains a syntax error or
      // |peg.GrammarError| if it contains a semantic error. Note that not all
      // errors are detected during the generation and some may protrude to the
      // generated parser and cause its malfunction.
      generate(grammar, options2) {
        options2 = options2 !== void 0 ? options2 : {};
        function copyPasses(passes2) {
          const converted = {};
          Object.keys(passes2).forEach((stage) => {
            converted[stage] = passes2[stage].slice();
          });
          return converted;
        }
        __name(copyPasses, "copyPasses");
        const plugins = "plugins" in options2 ? options2.plugins : [];
        const config = {
          parser: peg.parser,
          passes: copyPasses(peg.compiler.passes),
          reservedWords: peg.RESERVED_WORDS.slice()
        };
        plugins.forEach((p) => {
          p.use(config, options2);
        });
        if (!Array.isArray(grammar)) {
          grammar = [
            {
              source: options2.grammarSource,
              text: grammar
            }
          ];
        }
        const combined = asts.combine(grammar.map(({ source, text }) => config.parser.parse(text, {
          grammarSource: source,
          reservedWords: config.reservedWords
        })));
        return peg.compiler.compile(combined, config.passes, options2);
      }
    };
    module2.exports = peg;
  }
});

// src/bin/cli.ts
var import_promises = __toESM(require("fs/promises"), 1);
var import_node_fs = require("fs");
var import_node_process = require("process");

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
__name(highlightSnippet, "highlightSnippet");

// src/utils/format.ts
var import_chalk2 = __toESM(require("chalk"), 1);
function isParseError(err) {
  return err && typeof err === "object" && typeof err.error === "string";
}
__name(isParseError, "isParseError");
function isPeggyError(err) {
  return err && typeof err === "object" && typeof err.message === "string" && (err.location || err.expected || err.found !== void 0);
}
__name(isPeggyError, "isPeggyError");
function toParseError(err) {
  if (isParseError(err)) {
    return err;
  }
  if (isPeggyError(err)) {
    return {
      error: err.message,
      location: isValidLocation(err.location) ? err.location : void 0,
      success: false,
      expected: Array.isArray(err.expected) ? err.expected : [],
      found: typeof err.found === "string" ? err.found : void 0,
      input: typeof err.input === "string" ? err.input : void 0,
      snippet: void 0
    };
  }
  if (err instanceof Error) {
    return {
      error: err.message,
      location: void 0,
      success: false,
      expected: void 0,
      found: void 0,
      input: void 0,
      snippet: void 0
    };
  }
  return {
    error: typeof err === "string" ? err : "Unknown error",
    location: void 0,
    success: false,
    expected: void 0,
    found: void 0,
    input: void 0,
    snippet: void 0
  };
}
__name(toParseError, "toParseError");
function isValidLocation(loc) {
  return loc && typeof loc === "object" && loc.start && loc.end && typeof loc.start.line === "number" && typeof loc.start.column === "number" && typeof loc.start.offset === "number" && typeof loc.end.line === "number" && typeof loc.end.column === "number" && typeof loc.end.offset === "number";
}
__name(isValidLocation, "isValidLocation");
function formatLocation(location) {
  const { start, end } = location;
  return start.line === end.line && start.column === end.column ? `Line ${start.line}, Col ${start.column}` : `Line ${start.line}, Col ${start.column} \u2192 Line ${end.line}, Col ${end.column}`;
}
__name(formatLocation, "formatLocation");
function formatError(error) {
  const errorMessage = error.error || "Unknown error";
  const parts = [
    `\u274C Parse Error: ${errorMessage}`
  ];
  if (error.location) {
    parts.push(`\u21AA at ${formatLocation(error.location)}`);
  }
  if (error.expected && error.expected.length > 0) {
    parts.push(`Expected: ${error.expected.join(", ")}`);
  }
  if (error.found !== void 0) {
    parts.push(`Found: "${error.found}"`);
  }
  if (error.snippet || error.input && error.location) {
    try {
      const snippet = error.snippet || highlightSnippet(error.input, error.location, true);
      parts.push("\n--- Snippet ---\n" + snippet);
    } catch (snippetError) {
      parts.push("\n--- Snippet unavailable ---");
    }
  }
  return parts.join("\n");
}
__name(formatError, "formatError");
function formatErrorWithColors(error, useColors = true) {
  if (!useColors) {
    return formatError(error);
  }
  const errorMessage = error.error || "Unknown error";
  const parts = [
    `${import_chalk2.default.red("\u274C Parse Error:")} ${errorMessage}`
  ];
  if (error.location) {
    parts.push(`${import_chalk2.default.blue("\u21AA at")} ${formatLocation(error.location)}`);
  }
  if (error.expected && error.expected.length > 0) {
    parts.push(`${import_chalk2.default.yellow("Expected:")} ${error.expected.join(", ")}`);
  }
  if (error.found !== void 0) {
    parts.push(`${import_chalk2.default.yellow("Found:")} "${error.found}"`);
  }
  if (error.snippet || error.input && error.location) {
    try {
      const snippet = error.snippet || highlightSnippet(error.input, error.location, useColors);
      parts.push("\n" + import_chalk2.default.dim("--- Snippet ---") + "\n" + snippet);
    } catch (snippetError) {
      parts.push("\n" + import_chalk2.default.dim("--- Snippet unavailable ---"));
    }
  }
  return parts.join("\n");
}
__name(formatErrorWithColors, "formatErrorWithColors");
function formatAnyError(err, useColors = true) {
  const parseError = toParseError(err);
  return formatErrorWithColors(parseError, useColors);
}
__name(formatAnyError, "formatAnyError");
function getErrorSuggestions(error) {
  const suggestions = [];
  const errorMsg = error.error?.toLowerCase() || "";
  if (errorMsg.includes("expected") && errorMsg.includes("but")) {
    suggestions.push("Check for missing or incorrect syntax near the error location");
  }
  if (errorMsg.includes("rule") || errorMsg.includes("undefined")) {
    suggestions.push("Verify all referenced rules are defined");
  }
  if (errorMsg.includes("end of input")) {
    suggestions.push("Check for missing closing brackets, quotes, or semicolons");
  }
  if (errorMsg.includes("duplicate")) {
    suggestions.push("Remove duplicate rule definitions");
  }
  if (error.expected && error.expected.length > 0) {
    const expectedItems = error.expected.slice(0, 3).join(", ");
    suggestions.push(`Try using one of: ${expectedItems}`);
  }
  return suggestions;
}
__name(getErrorSuggestions, "getErrorSuggestions");
function formatErrorWithSuggestions(error, useColors = true) {
  const baseFormatted = formatErrorWithColors(error, useColors);
  const suggestions = getErrorSuggestions(error);
  if (suggestions.length === 0) {
    return baseFormatted;
  }
  const suggestionHeader = useColors ? import_chalk2.default.cyan("\n\u{1F4A1} Suggestions:") : "\n\u{1F4A1} Suggestions:";
  const formattedSuggestions = suggestions.map((suggestion, index) => {
    const bullet = useColors ? import_chalk2.default.dim(`  ${index + 1}.`) : `  ${index + 1}.`;
    return `${bullet} ${suggestion}`;
  }).join("\n");
  return `${baseFormatted}${suggestionHeader}
${formattedSuggestions}`;
}
__name(formatErrorWithSuggestions, "formatErrorWithSuggestions");
function formatCompilationError(err, grammarSource) {
  const parseError = toParseError(err);
  if (grammarSource && !parseError.input) {
    parseError.input = grammarSource;
  }
  return formatErrorWithSuggestions(parseError, true);
}
__name(formatCompilationError, "formatCompilationError");

// src/grammar/index.ts
var import_peggy = __toESM(require_peg(), 1);
var generate = import_peggy.default.generate;
function compileGrammar(grammar, options2 = {}) {
  try {
    const defaultOptions = {
      allowedStartRules: [
        "*"
      ],
      cache: false,
      format: "bare",
      optimize: "speed",
      output: "parser",
      trace: false,
      ...options2
    };
    const parser = generate(grammar, defaultOptions);
    return {
      parse: parser.parse.bind(parser),
      source: grammar,
      options: defaultOptions
    };
  } catch (error) {
    const formattedError = formatCompilationError ? formatCompilationError(error, grammar) : formatAnyError(error);
    throw new Error(`Grammar compilation failed:
${formattedError}`);
  }
}
__name(compileGrammar, "compileGrammar");
async function compileGrammarFromFile(filePath, options2 = {}) {
  try {
    const fs2 = await import("fs/promises");
    const grammar = await fs2.readFile(filePath, "utf-8");
    return compileGrammar(grammar, {
      ...options2,
      grammarSource: filePath
    });
  } catch (error) {
    throw new Error(`Failed to compile grammar from file ${filePath}: ${error.message}`);
  }
}
__name(compileGrammarFromFile, "compileGrammarFromFile");
function validateGrammar(grammar) {
  try {
    generate(grammar, {
      output: "source"
    });
    return {
      valid: true
    };
  } catch (error) {
    return {
      valid: false,
      error: formatError(error)
    };
  }
}
__name(validateGrammar, "validateGrammar");
function analyzeGrammarAdvanced(grammar) {
  const lines = grammar.split("\n");
  const rules = [];
  const imports = [];
  const exports2 = [];
  const dependencies = /* @__PURE__ */ new Map();
  const warnings = [];
  let currentRule = null;
  let inRule = false;
  let braceCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || !trimmed) {
      continue;
    }
    const ruleMatch = trimmed.match(/^(\w+)\s*=/);
    if (ruleMatch && !inRule) {
      if (currentRule) {
        rules.push(currentRule);
      }
      currentRule = {
        name: ruleMatch[1],
        line: i + 1,
        column: line.indexOf(ruleMatch[1]) + 1,
        expression: "",
        references: [],
        isStartRule: rules.length === 0,
        isLeftRecursive: false
      };
      inRule = true;
    }
    if (inRule && currentRule) {
      currentRule.expression += line + "\n";
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      if (i === lines.length - 1 || i < lines.length - 1 && lines[i + 1].trim().match(/^\w+\s*=/) && braceCount === 0) {
        const references = extractReferences(currentRule.expression);
        currentRule.references = references;
        dependencies.set(currentRule.name, references);
        currentRule.isLeftRecursive = checkLeftRecursion(currentRule.expression, currentRule.name);
        rules.push(currentRule);
        inRule = false;
        braceCount = 0;
      }
    }
    const importMatch = trimmed.match(/import\s+(\w+)/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }
    const exportMatch = trimmed.match(/export\s+(\w+)/);
    if (exportMatch) {
      exports2.push(exportMatch[1]);
    }
  }
  const reachableRules = /* @__PURE__ */ new Set();
  const startRule = rules.find((r) => r.isStartRule);
  if (startRule) {
    findReachableRules(startRule.name, dependencies, reachableRules);
  }
  const unreachableRules = rules.filter((r) => !reachableRules.has(r.name)).map((r) => r.name);
  const leftRecursive = rules.filter((r) => r.isLeftRecursive).map((r) => r.name);
  if (unreachableRules.length > 0) {
    warnings.push(`Unreachable rules: ${unreachableRules.join(", ")}`);
  }
  if (leftRecursive.length > 0) {
    warnings.push(`Left-recursive rules: ${leftRecursive.join(", ")}`);
  }
  return {
    rules,
    startRule: startRule?.name,
    imports,
    exports: exports2,
    dependencies,
    unreachableRules,
    leftRecursive,
    warnings
  };
}
__name(analyzeGrammarAdvanced, "analyzeGrammarAdvanced");
function extractReferences(expression) {
  const references = [];
  const matches = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
  if (matches) {
    const keywords = /* @__PURE__ */ new Set([
      "return",
      "if",
      "else",
      "while",
      "for",
      "function",
      "var",
      "let",
      "const"
    ]);
    const uniqueRefs = new Set(matches.filter((m) => !keywords.has(m)));
    references.push(...uniqueRefs);
  }
  return references;
}
__name(extractReferences, "extractReferences");
function checkLeftRecursion(expression, ruleName) {
  const firstAlternative = expression.split("|")[0];
  const trimmed = firstAlternative.replace(/\s+/g, " ").trim();
  return trimmed.startsWith(`${ruleName} `) || trimmed.startsWith(`${ruleName}/`);
}
__name(checkLeftRecursion, "checkLeftRecursion");
function findReachableRules(ruleName, dependencies, reachable) {
  if (reachable.has(ruleName)) {
    return;
  }
  reachable.add(ruleName);
  const deps = dependencies.get(ruleName) || [];
  for (const dep of deps) {
    if (dependencies.has(dep)) {
      findReachableRules(dep, dependencies, reachable);
    }
  }
}
__name(findReachableRules, "findReachableRules");

// src/parser/index.ts
function parseInput(grammar, input, options2 = {}) {
  try {
    const result = grammar.parse(input, options2);
    return {
      result,
      success: true
    };
  } catch (error) {
    return createParseError(error, input, options2);
  }
}
__name(parseInput, "parseInput");
function createParseError(error, input, options2) {
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
    parseError.expected = error.expected.map((exp) => exp.description || exp.text || exp.toString());
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
__name(createParseError, "createParseError");
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
__name(generateErrorSnippet, "generateErrorSnippet");
var _ParserUtils = class _ParserUtils {
  static isSuccess(result) {
    return result.success === true;
  }
  static isError(result) {
    return result.success === false;
  }
  static unwrap(result) {
    if (_ParserUtils.isError(result)) {
      const error = result;
      throw new Error(`[ParseError]: ${error.error}
${error.snippet ?? ""}
Expected: ${error.expected?.join(", ") ?? "unknown"}`);
    }
    return result.result;
  }
};
__name(_ParserUtils, "ParserUtils");
var ParserUtils = _ParserUtils;

// src/bin/cli.ts
var VALID_FORMATS = [
  "bare",
  "commonjs",
  "es",
  "globals",
  "umd"
];
function printHelp() {
  console.log(`
Usage: parsergen <grammar.peg> [options]

Options:
  --test <input>         Test grammar by parsing input string
  --validate             Only validate grammar (no parsing)
  --analyze              Show grammar metadata
  --out <file>           Output compiled parser as JS
  --format <target>      Format for output: ${VALID_FORMATS.join(" | ")} (default: es)
  --ast                  Print parse AST
  --watch                Watch grammar file and auto-recompile
  --help, -h             Show help
`);
}
__name(printHelp, "printHelp");
function isValidFormat(format) {
  return VALID_FORMATS.includes(format);
}
__name(isValidFormat, "isValidFormat");
async function compileAndWrite(grammarPath, outFile, format) {
  const grammarText = await import_promises.default.readFile(grammarPath, "utf-8");
  const PEG2 = await Promise.resolve().then(() => __toESM(require_peg(), 1));
  const baseOptions = {
    allowedStartRules: [
      "*"
    ],
    cache: false,
    optimize: "speed",
    output: "source",
    trace: false
  };
  let compiledSource;
  switch (format) {
    case "bare":
      compiledSource = PEG2.generate(grammarText, {
        ...baseOptions,
        format: "bare"
      });
      break;
    case "commonjs":
      compiledSource = PEG2.generate(grammarText, {
        ...baseOptions,
        format: "commonjs"
      });
      break;
    case "es":
      compiledSource = PEG2.generate(grammarText, {
        ...baseOptions,
        format: "es"
      });
      break;
    case "globals":
      compiledSource = PEG2.generate(grammarText, {
        ...baseOptions,
        format: "globals",
        exportVar: "Parser"
      });
      break;
    case "umd":
      compiledSource = PEG2.generate(grammarText, {
        ...baseOptions,
        format: "umd",
        exportVar: "Parser"
      });
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
  await import_promises.default.writeFile(outFile, compiledSource, "utf-8");
  console.log(`\u2705 Rebuilt parser: ${outFile}`);
}
__name(compileAndWrite, "compileAndWrite");
async function main() {
  const args = import_node_process.argv.slice(2);
  const grammarPath = args[0];
  if (!grammarPath || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const grammarText = await import_promises.default.readFile(grammarPath, "utf-8");
  if (args.includes("--validate")) {
    const result = validateGrammar(grammarText);
    result.valid ? console.log("\u2705 Grammar is valid.") : console.error("\u274C Grammar is invalid:\n" + result.error);
    process.exit(result.valid ? 0 : 1);
  }
  if (args.includes("--analyze")) {
    console.log("\u{1F4CA} Metadata:", analyzeGrammarAdvanced(grammarText));
    return;
  }
  const outIndex = args.indexOf("--out");
  const outFile = outIndex !== -1 ? args[outIndex + 1] : null;
  const formatIndex = args.indexOf("--format");
  const formatArg = formatIndex !== -1 ? args[formatIndex + 1] : "es";
  if (!isValidFormat(formatArg)) {
    console.error(`\u274C Invalid format: ${formatArg}. Valid formats: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }
  const format = formatArg;
  if (args.includes("--watch") && outFile) {
    console.log(`\u{1F440} Watching ${grammarPath}...`);
    await compileAndWrite(grammarPath, outFile, format);
    (0, import_node_fs.watchFile)(grammarPath, {
      interval: 300
    }, async () => {
      try {
        await compileAndWrite(grammarPath, outFile, format);
      } catch (err) {
        console.error("\u274C Error during rebuild:\n" + err.message);
      }
    });
    return;
  }
  if (outFile) {
    await compileAndWrite(grammarPath, outFile, format);
    return;
  }
  const parser = await compileGrammarFromFile(grammarPath);
  console.log(`\u2705 Grammar compiled: ${grammarPath}`);
  const testIndex = args.indexOf("--test");
  if (testIndex !== -1 && args[testIndex + 1]) {
    const input = args[testIndex + 1];
    const result = parseInput(parser, input);
    if (ParserUtils.isSuccess(result)) {
      console.log("\u2705 Parse Success");
      if (args.includes("--ast")) {
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      console.error("\u274C Parse Error:\n" + formatError(result));
      process.exit(1);
    }
  } else {
    console.log("\u2139\uFE0F  No --test provided. Grammar OK.");
  }
}
__name(main, "main");
main();
//# sourceMappingURL=cli.cjs.map