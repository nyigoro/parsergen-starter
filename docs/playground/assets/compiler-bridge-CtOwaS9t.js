import{B as m,c as u}from"./compiler-analysis-BMpPSjAy.js";import{F as p,G as _}from"./compiler-core-BWerKu1p.js";import{g as y,a as f}from"./compiler-js-BTEKQ5z1.js";import"./compiler-parser-D1zSBUbP.js";import"./compiler-stdlib-CiGNBwwk.js";const x=`{\r
  let nodeId = 0;\r
  function createNode(type, data, loc) {\r
    const resolvedLoc = data && data.location ? data.location : loc();\r
    return { id: ++nodeId, type: type, ...data, location: resolvedLoc };\r
  }\r
\r
  function constExprToText(node) {\r
    if (!node || typeof node !== "object") return "_";\r
    if (node.type === "ConstLiteral") return String(node.value);\r
    if (node.type === "ConstParam") return node.name;\r
    if (node.type === "ConstUnary") return \`\${node.op}\${constExprToText(node.expr)}\`;\r
    if (node.type === "ConstBinary") return \`\${constExprToText(node.left)}\${node.op}\${constExprToText(node.right)}\`;\r
    if (node.type === "ConstCall") return \`\${node.name}(\${(node.args || []).map(constExprToText).join(",")})\`;\r
    if (node.type === "ConstIf") return \`if \${constExprToText(node.condition)} { \${constExprToText(node.thenExpr)} } else { \${constExprToText(node.elseExpr)} }\`;\r
    return "_";\r
  }\r
\r
  function typeNameToText(typeName) {\r
    if (typeof typeName === "string") return typeName;\r
    if (!typeName || typeof typeName !== "object") return "_";\r
    if (typeName.kind === "TypeHole") return "_";\r
    if (typeName.kind === "array") {\r
      const elem = typeNameToText(typeName.element);\r
      const size = typeName.size ? constExprToText(typeName.size) : "";\r
      return size ? \`[\${elem};\${size}]\` : \`[\${elem}]\`;\r
    }\r
    return "_";\r
  }\r
\r
  function expectedStatementTokens() {
    return [
      "fn", "component", "async", "comptime", "struct", "enum", "type", "extern", "import", "pub", "trait", "impl", "macro_rules", "shader",
      "let", "if", "while", "match", "return", "break", "continue",
      "identifier", "number", "string", "true", "false",
      "{", "}"
    ];
  }

  function normalizeAttributes(attrs) {
    return Array.isArray(attrs) ? attrs : [];
  }

  function collectAttributeArgs(attrs, name) {
    const values = [];
    for (const attr of normalizeAttributes(attrs)) {
      if (attr && attr.name === name && Array.isArray(attr.args)) {
        values.push(...attr.args);
      }
    }
    return values;
  }

  function stripAttributes(attrs, name) {
    return normalizeAttributes(attrs).filter(attr => attr && attr.name !== name);
  }

  function createIdentifierNode(name, loc) {
    return createNode("Identifier", { name, location: loc }, () => loc);
  }

  function createExprArg(value, loc) {
    return { named: false, value, location: (value && value.location) ? value.location : loc };
  }

  function createCallNode(callee, args, loc, options) {
    return createNode("Call", {
      callee,
      args: (args || []).map(arg => createExprArg(arg, loc)),
      typeArgs: [],
      enumName: options && options.enumName ? options.enumName : null,
      ...(options && options.receiver ? { receiver: options.receiver } : {})
    }, () => loc);
  }

  function createDirectCallNode(name, args, loc) {
    return createCallNode(createIdentifierNode(name, loc), args, loc, null);
  }

  function createRenderCallNode(name, args, loc) {
    return createCallNode(createIdentifierNode(name, loc), args, loc, { enumName: "render" });
  }

  function createStringNode(value, loc) {
    return createNode("String", { value, location: loc }, () => loc);
  }

  function createBlockFromExpr(body, loc) {
    if (body && body.type === "Block") return body;
    const ret = createNode("Return", { value: body }, () => loc);
    return createNode("Block", { body: [ret] }, () => loc);
  }

  function createZeroArgLambda(body, loc) {
    return createNode("Lambda", {
      async: false,
      params: [],
      returnType: null,
      body: createBlockFromExpr(body, loc),
      typeParams: [],
      location: loc
    }, () => loc);
  }

  function createParamNode(name, typeName, loc) {
    return {
      name,
      typeName,
      ref: false,
      refMut: false,
      defaultValue: null,
      location: loc
    };
  }

  function createGetCallNode(value, loc) {
    return createRenderCallNode("get", [value], loc);
  }

  function exprUsesIdentifier(expr, name, shadowed) {
    if (!expr || !name) return false;
    const hidden = shadowed || new Set();
    switch (expr.type) {
      case "Identifier":
        return expr.name === name && !hidden.has(name);
      case "Member":
        return exprUsesIdentifier(expr.object, name, hidden);
      case "Call":
        if (!expr.receiver && !expr.enumName && expr.callee && expr.callee.type !== "Identifier") {
          if (exprUsesIdentifier(expr.callee, name, hidden)) return true;
        }
        if (expr.receiver && exprUsesIdentifier(expr.receiver, name, hidden)) return true;
        return (expr.args || []).some(arg => exprUsesIdentifier(arg && arg.value, name, hidden));
      case "Lambda": {
        const lambdaHidden = new Set(hidden);
        for (const param of expr.params || []) lambdaHidden.add(param.name);
        return (expr.body && expr.body.body || []).some(stmt => stmtUsesIdentifier(stmt, name, lambdaHidden));
      }
      case "Binary":
        return exprUsesIdentifier(expr.left, name, hidden) || exprUsesIdentifier(expr.right, name, hidden);
      case "Move":
        return exprUsesIdentifier(expr.target, name, hidden);
      case "Await":
      case "Try":
        return exprUsesIdentifier(expr.value, name, hidden);
      case "Cast":
        return exprUsesIdentifier(expr.expr, name, hidden);
      case "StructLiteral":
        return (expr.fields || []).some(field => exprUsesIdentifier(field.value, name, hidden));
      case "ArrayLiteral":
        return (expr.elements || []).some(element => exprUsesIdentifier(element, name, hidden));
      case "ArrayRepeatLiteral":
        return exprUsesIdentifier(expr.value, name, hidden) || exprUsesIdentifier(expr.count, name, hidden);
      case "TupleLiteral":
        return (expr.elements || []).some(element => exprUsesIdentifier(element, name, hidden));
      case "Index":
        return exprUsesIdentifier(expr.object, name, hidden) || exprUsesIdentifier(expr.index, name, hidden);
      case "IsExpr":
        return exprUsesIdentifier(expr.value, name, hidden);
      case "MatchExpr":
        return exprUsesIdentifier(expr.value, name, hidden)
          || (expr.arms || []).some(arm => exprUsesIdentifier(arm.guard, name, hidden) || exprUsesIdentifier(arm.body, name, hidden));
      case "SelectExpr":
        return (expr.arms || []).some(arm => exprUsesIdentifier(arm.value, name, hidden) || exprUsesIdentifier(arm.body, name, hidden));
      case "InterpolatedString":
        return (expr.parts || []).some(part => typeof part !== "string" && exprUsesIdentifier(part, name, hidden));
      case "Range":
        return exprUsesIdentifier(expr.start, name, hidden) || exprUsesIdentifier(expr.end, name, hidden);
      case "MacroInvoke":
        return (expr.args || []).some(arg => exprUsesIdentifier(arg, name, hidden));
      case "ListComprehension":
        return exprUsesIdentifier(expr.source, name, hidden)
          || exprUsesIdentifier(expr.source2, name, hidden)
          || exprUsesIdentifier(expr.filter, name, hidden)
          || exprUsesIdentifier(expr.body, name, hidden);
      default:
        return false;
    }
  }

  function stmtUsesIdentifier(stmt, name, shadowed) {
    if (!stmt) return false;
    switch (stmt.type) {
      case "Let":
        return exprUsesIdentifier(stmt.value, name, shadowed);
      case "LetTuple":
        return exprUsesIdentifier(stmt.value, name, shadowed);
      case "LetElse":
        return exprUsesIdentifier(stmt.value, name, shadowed) || stmtUsesIdentifier(stmt.elseBlock, name, shadowed);
      case "Return":
        return exprUsesIdentifier(stmt.value, name, shadowed);
      case "ExprStmt":
        return exprUsesIdentifier(stmt.expr, name, shadowed);
      case "Assign":
        return exprUsesIdentifier(stmt.target, name, shadowed) || exprUsesIdentifier(stmt.value, name, shadowed);
      case "If":
        return exprUsesIdentifier(stmt.condition, name, shadowed)
          || stmtUsesIdentifier(stmt.thenBlock, name, shadowed)
          || stmtUsesIdentifier(stmt.elseBlock, name, shadowed);
      case "IfLet":
        return exprUsesIdentifier(stmt.value, name, shadowed)
          || stmtUsesIdentifier(stmt.thenBlock, name, shadowed)
          || stmtUsesIdentifier(stmt.elseBlock, name, shadowed);
      case "While":
        return exprUsesIdentifier(stmt.condition, name, shadowed) || stmtUsesIdentifier(stmt.body, name, shadowed);
      case "For":
        return exprUsesIdentifier(stmt.iterable, name, shadowed) || stmtUsesIdentifier(stmt.body, name, shadowed);
      case "WhileLet":
        return exprUsesIdentifier(stmt.value, name, shadowed) || stmtUsesIdentifier(stmt.body, name, shadowed);
      case "MatchStmt":
        return exprUsesIdentifier(stmt.value, name, shadowed)
          || (stmt.arms || []).some(arm => exprUsesIdentifier(arm.guard, name, shadowed) || stmtUsesIdentifier(arm.body, name, shadowed));
      case "Block":
        return (stmt.body || []).some(inner => stmtUsesIdentifier(inner, name, shadowed));
      default:
        return false;
    }
  }

  function buildPropsPart(name, value, loc) {
    switch (name) {
      case "class":
        return createRenderCallNode("props_class", [value], loc);
      case "id":
        return createRenderCallNode("props_id", [value], loc);
      case "style":
        return createRenderCallNode("props_style", [value], loc);
      case "value":
        return createRenderCallNode("props_value", [value], loc);
      case "placeholder":
        return createRenderCallNode("props_placeholder", [value], loc);
      case "href":
        return createRenderCallNode("props_href", [value], loc);
      case "disabled":
        return createRenderCallNode("props_disabled", [value], loc);
      case "key":
        return createRenderCallNode("props_key", [value], loc);
      case "checked":
        return createRenderCallNode("props_checked", [value], loc);
      case "type":
        return createRenderCallNode("props_type", [value], loc);
      case "name":
        return createRenderCallNode("props_name", [value], loc);
      case "on_click":
        return createRenderCallNode("props_on_click", [value], loc);
      case "on_input":
        return createRenderCallNode("props_on_input", [value], loc);
      case "on_change":
        return createRenderCallNode("props_on_change", [value], loc);
      case "on_checked_change":
        return createRenderCallNode("props_on_checked_change", [value], loc);
      case "on_submit":
        return createRenderCallNode("props_on_submit", [value], loc);
      default:
        return createRenderCallNode("props_attr", [createStringNode(name, loc), value], loc);
    }
  }

  function buildPropsExpr(entries, loc) {
    let current = createRenderCallNode("props_empty", [], loc);
    for (const entry of entries || []) {
      let part = current;
      if (entry.kind === "spread") {
        part = entry.value;
      } else if (entry.kind === "field") {
        part = buildPropsPart(entry.name, entry.value, entry.location || loc);
      } else if (entry.kind === "conditional") {
        part = createRenderCallNode("props_when", [
          entry.condition,
          buildPropsPart(entry.name, entry.value, entry.location || loc)
        ], entry.location || loc);
      }
      current = createRenderCallNode("props_merge", [current, part], entry.location || loc);
    }
    return current;
  }

  function buildShowExpr(condition, body, fallback, loc) {
    return createRenderCallNode("show", [
      condition,
      createZeroArgLambda(body, loc),
      fallback ? createZeroArgLambda(fallback, loc) : createNode("ArrayLiteral", { elements: [], location: loc }, () => loc)
    ], loc);
  }

  function buildBoundaryExpr(kind, fallback, body, loc) {
    return createRenderCallNode(kind, [fallback, createZeroArgLambda(body, loc)], loc);
  }

  function buildTransitionExpr(open, duration, propsExpr, body, loc) {
    return createRenderCallNode("transitionPresence", [
      open,
      propsExpr || createRenderCallNode("props_empty", [], loc),
      duration,
      createZeroArgLambda(body, loc)
    ], loc);
  }

  function buildIndexAuthoringExpr(itemParam, indexParam, source, body, loc) {
    const itemSignalName = \`__lumina_index_item_\${++nodeId}\`;
    const indexName = \`__lumina_index_pos_\${++nodeId}\`;
    const authorLambda = createNode("Lambda", {
      async: false,
      params: [createParamNode(itemParam, "any", loc)].concat(indexParam ? [createParamNode(indexParam, "int", loc)] : []),
      returnType: "VNode",
      body: createBlockFromExpr(body, loc),
      typeParams: [],
      location: loc
    }, () => loc);
    const forwardParams = [createParamNode(itemSignalName, "Signal<any>", loc)];
    const forwardArgs = [createGetCallNode(createIdentifierNode(itemSignalName, loc), loc)];
    if (indexParam) {
      forwardParams.push(createParamNode(indexName, "int", loc));
      forwardArgs.push(createIdentifierNode(indexName, loc));
    }
    const renderLambda = createNode("Lambda", {
      async: false,
      params: forwardParams,
      returnType: "VNode",
      body: createNode("Block", {
        body: [
          createNode("ExprStmt", {
            expr: createCallNode(authorLambda, forwardArgs, loc, null)
          }, () => loc)
        ]
      }, () => loc),
      typeParams: [],
      location: loc
    }, () => loc);
    return createRenderCallNode("indexList", [source, renderLambda], loc);
  }

  function buildForAuthoringExpr(itemParam, indexParam, source, keyExpr, body, loc) {
    const itemSignalName = \`__lumina_for_item_\${++nodeId}\`;
    const indexSignalName = \`__lumina_for_index_\${++nodeId}\`;
    const authorParams = [createParamNode(itemParam, "any", loc)].concat(indexParam ? [createParamNode(indexParam, "int", loc)] : []);
    const keyParams = [
      createParamNode(exprUsesIdentifier(keyExpr, itemParam) ? itemParam : \`_\${itemParam}\`, "any", loc)
    ].concat(indexParam ? [
      createParamNode(exprUsesIdentifier(keyExpr, indexParam) ? indexParam : \`_\${indexParam}\`, "int", loc)
    ] : []);
    const keyLambda = createNode("Lambda", {
      async: false,
      params: keyParams,
      returnType: null,
      body: createBlockFromExpr(keyExpr, loc),
      typeParams: [],
      location: loc
    }, () => loc);
    const authorLambda = createNode("Lambda", {
      async: false,
      params: authorParams,
      returnType: "VNode",
      body: createBlockFromExpr(body, loc),
      typeParams: [],
      location: loc
    }, () => loc);
    const renderArgs = [createGetCallNode(createIdentifierNode(itemSignalName, loc), loc)];
    if (indexParam) {
      renderArgs.push(createGetCallNode(createIdentifierNode(indexSignalName, loc), loc));
    }
    const renderLambda = createNode("Lambda", {
      async: false,
      params: [
        createParamNode(itemSignalName, "Signal<any>", loc),
        createParamNode(indexSignalName, "Signal<int>", loc)
      ],
      returnType: "VNode",
      body: createNode("Block", {
        body: [
          createNode("ExprStmt", {
            expr: createCallNode(authorLambda, renderArgs, loc, null)
          }, () => loc)
        ]
      }, () => loc),
      typeParams: [],
      location: loc
    }, () => loc);
    return createRenderCallNode("forList", [source, keyLambda, renderLambda], loc);
  }

  function buildKeyedAuthoringExpr(keyExpr, body, loc) {
    return createRenderCallNode("keyed", [
      keyExpr,
      body && body.type === "Block" ? createZeroArgLambda(body, loc) : body
    ], loc);
  }
}
Start\r
  = _ statements:TopStatementList _ { return createNode("Program", { body: statements }, location); }\r
\r
TopStatementList\r
  = head:RecoverableTopStatement tail:(_ RecoverableTopStatement)* { return [head].concat(tail.map(t => t[1])); }\r
  / "" { return []; }\r
\r
RecoverableTopStatement\r
  = stmt:Statement { return stmt; }\r
  / error:InvalidStatement { return error; }\r
  / _ "}" {\r
      return createNode("ErrorNode", {\r
        message: "Unexpected closing brace. Possible double-closing of a block or function.",\r
        expected: expectedStatementTokens()\r
      }, location);\r
    }\r
\r
StatementList\r
  = head:RecoverableStatement tail:(_ RecoverableStatement)* { return [head].concat(tail.map(t => t[1])); }\r
  / "" { return []; }\r
\r
RecoverableStatement\r
  = stmt:Statement { return stmt; }\r
  / error:InvalidStatement { return error; }\r
\r
SyncKeyword
  = "fn" / "component" / "async" / "comptime" / "struct" / "enum" / "type" / "extern" / "import" / "pub" / "trait" / "impl" / "shader"
\r
InvalidStatement\r
  = tokens:(!(";" / "}" / SyncKeyword) .)+ (";" / &"}" / &SyncKeyword / !.) {\r
      return createNode("ErrorNode", {\r
        message: "Invalid syntax",\r
        expected: expectedStatementTokens()\r
      }, location);\r
    }\r
\r
Statement
  = Import
  / MacroRulesDecl\r
  / ShaderDecl\r
  / TraitDecl\r
  / ImplDecl\r
  / StructDecl\r
  / EnumDecl\r
  / TypeDecl\r
  / AdtTypeDecl\r
  / ExternTypeDecl\r
  / FnDecl\r
  / ExternFnDecl\r
  / LetElseStmt\r
  / LetTupleStmt\r
  / LetStmt\r
  / AssignStmt\r
  / IfLetStmt\r
  / IfStmt\r
  / ForStmt\r
  / WhileLetStmt\r
  / WhileStmt\r
  / BreakStmt\r
  / ContinueStmt\r
  / ReturnStmt\r
  / MatchStmt\r
  / ExprStmt
  / Block

OuterAttr
  = "#[" _ node:IdName _ args:AttributeArgs? _ "]" _ {
      return { name: node.name, args: args || [], location: node.location };
    }

AttributeArgs
  = "(" _ head:AttributeArg tail:(_ "," _ AttributeArg)* _ ","? ")" {
      return [head].concat(tail.map(t => t[3]));
    }

AttributeArg
  = value:$((!("," / ")") .)+) { return value.trim(); }

Import
  = attrs:OuterAttr* "import" _ spec:ImportSpec _ "from" _ source:String _ ";"? {
      return createNode("Import", { spec, source, attributes: normalizeAttributes(attrs) }, location);
    }
\r
MacroRulesDecl\r
  = "macro_rules" _ "!" _ node:IdName _ "{" body:MacroRulesBody "}" _ ";"? {\r
      return createNode("MacroRulesDecl", { name: node.name, body, location: node.location }, location);\r
    }\r
\r
ShaderDecl\r
  = "shader" _ stage:("compute" / "vertex" / "fragment") __ node:IdName _ "(" _ params:ShaderParamList? _ ")" _ ret:ShaderReturn? _ workgroup:ShaderWorkgroup? _ body:ShaderBody {\r
      return createNode("ShaderDecl", {\r
        stage,\r
        name: node.name,\r
        params: params || [],\r
        returnType: ret ? ret.typeName : null,\r
        returnAttribute: ret ? ret.attribute : null,\r
        workgroupSize: workgroup || null,\r
        body,\r
        location: node.location,\r
      }, location);\r
    }\r
\r
ShaderParamList\r
  = head:ShaderParam tail:(_ "," _ ShaderParam)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
ShaderParam\r
  = node:IdName _ ":" _ typeName:TypeName _ attr:ShaderAttribute? {\r
      return {\r
        name: node.name,\r
        typeName: typeNameToText(typeName),\r
        attribute: attr || null,\r
        location: node.location,\r
      };\r
    }\r
\r
ShaderReturn\r
  = "->" _ typeName:TypeName _ attr:ShaderAttribute? {\r
      return {\r
        typeName: typeNameToText(typeName),\r
        attribute: attr || null,\r
      };\r
    }\r
\r
ShaderAttribute\r
  = "@" kind:("builtin" / "location") _ "(" _ value:$((!(")") .)*) _ ")" {\r
      return { kind, value: value.trim(), location: location() };\r
    }\r
\r
ShaderWorkgroup\r
  = "@workgroup_size" _ "(" _ x:Number _ "," _ y:Number _ "," _ z:Number _ ")" {\r
      return [\r
        Math.max(1, Math.trunc(x.value)),\r
        Math.max(1, Math.trunc(y.value)),\r
        Math.max(1, Math.trunc(z.value))\r
      ];\r
    }\r
  / "@workgroup_size" _ "(" _ x:Number _ ")" {\r
      return [Math.max(1, Math.trunc(x.value)), 1, 1];\r
    }\r
\r
ShaderBody\r
  = "{" parts:ShaderBodyPart* "}" _ ";"? { return parts.join(""); }\r
\r
ShaderBodyPart\r
  = ShaderBodyBrace\r
  / text:$(!("{" / "}") .) { return text; }\r
\r
ShaderBodyBrace\r
  = "{" inner:ShaderBodyPart* "}" { return "{" + inner.join("") + "}"; }\r
\r
MacroRulesBody\r
  = parts:MacroRulesPart* { return parts.join(""); }\r
\r
MacroRulesPart\r
  = MacroRulesBrace\r
  / MacroRulesBracket\r
  / MacroRulesParen\r
  / text:$(!("}" / "]" / ")") .) { return text; }\r
\r
MacroRulesBrace\r
  = "{" inner:MacroRulesPart* "}" { return "{" + inner.join("") + "}"; }\r
\r
MacroRulesBracket\r
  = "[" inner:MacroRulesPart* "]" { return "[" + inner.join("") + "]"; }\r
\r
MacroRulesParen\r
  = "(" inner:MacroRulesPart* ")" { return "(" + inner.join("") + ")"; }\r
\r
ImportSpec\r
  = "{" _ list:ImportList _ "}" { return list; }\r
  / NamespaceImport\r
  / Identifier\r
\r
ImportList\r
  = head:ImportItem tail:(_ "," _ ImportItem)* { return [head].concat(tail.map(t => t[3])); }\r
\r
ImportItem\r
  = name:IdName _ "as" _ alias:IdName { return { name: name.name, alias: alias.name, location: name.location }; }\r
  / name:IdName { return { name: name.name, location: name.location }; }\r
\r
NamespaceImport\r
  = "*" _ "as" _ alias:IdName { return { name: alias.name, namespace: true, location: alias.location }; }\r
\r
TypeDecl
  = attrs:OuterAttr* visibility:Visibility? _ "type" _ node:IdName _ tparams:TypeParams? _ "=" _ aliasType:TypeName !(_ ("|" / "(")) _ ";"? {
      return createNode("TypeDecl", { name: node.name, body: [], aliasType, typeParams: tparams || [], visibility: visibility ?? "private", extern: false, attributes: normalizeAttributes(attrs), location: node.location }, location);
    }
  / attrs:OuterAttr* visibility:Visibility? _ "type" _ node:IdName _ tparams:TypeParams? _ "=" _ body:TypeBody _ ";"? {
      return createNode("TypeDecl", { name: node.name, body, typeParams: tparams || [], visibility: visibility ?? "private", extern: false, attributes: normalizeAttributes(attrs), location: node.location }, location);
    }

TraitDecl
  = attrs:OuterAttr* visibility:Visibility? _ "trait" _ node:IdName _ tparams:TypeParams? _ supers:(_ ":" _ TypeBounds)? _ "{" _ items:TraitItemList? _ "}" _ ";"? {
      const methods = [];
      const associatedTypes = [];
      for (const item of items || []) {
        if (item && item.type === "TraitMethod") methods.push(item);
        if (item && item.type === "TraitAssocType") associatedTypes.push(item);
      }
      return createNode("TraitDecl", { name: node.name, typeParams: tparams || [], superTraits: supers ? supers[3] : [], methods, associatedTypes, visibility: visibility ?? "private", attributes: normalizeAttributes(attrs), location: node.location }, location);
    }
\r
TraitItemList\r
  = head:TraitItem tail:(_ TraitItem)* { return [head].concat(tail.map(t => t[1])); }\r
  / "" { return []; }\r
\r
TraitItem\r
  = TraitAssocType / TraitMethod\r
\r
TraitAssocType\r
  = "type" _ node:IdName _ arity:TraitAssocTypeArity? _ defaultType:(_ "=" _ TypeName)? _ ";"? {\r
      return createNode("TraitAssocType", { name: node.name, typeName: defaultType ? defaultType[3] : null, higherKindArity: arity || 0, location: node.location }, location);\r
    }\r
\r
TraitAssocTypeArity\r
  = "<" _ head:"_" tail:(_ "," _ "_")* _ ">" { return 1 + tail.length; }\r
\r
TraitMethod\r
  = "fn" _ node:IdName _ tparams:TypeParams? _ "(" _ params:ParamList? _ ")" _ ret:ReturnType? _ whereInfo:WhereClause? _ body:TraitMethodBody {\r
      return createNode("TraitMethod", { name: node.name, params: params || [], returnType: ret || null, typeParams: tparams || [], whereClauses: whereInfo ? whereInfo.constClauses : [], whereTypeBounds: whereInfo ? whereInfo.typeBounds : [], body, location: node.location }, location);\r
    }\r
\r
TraitMethodBody\r
  = _ body:Block { return body; }\r
  / _ ";"? { return null; }\r
\r
ImplDecl
  = attrs:OuterAttr* visibility:Visibility? _ "impl" _ tparams:TypeParams? _ traitType:TypeName _ _ "for" _ forType:TypeName _ whereInfo:WhereClause? _ "{" _ items:ImplItemList? _ "}" _ ";"? {
      const methods = [];
      const associatedTypes = [];
      for (const item of items || []) {
        if (item && item.type === "FnDecl") methods.push(item);
        if (item && item.type === "ImplAssocType") associatedTypes.push(item);
      }
      return createNode("ImplDecl", { traitType, forType, typeParams: tparams || [], whereClauses: whereInfo ? whereInfo.constClauses : [], whereTypeBounds: whereInfo ? whereInfo.typeBounds : [], methods, associatedTypes, visibility: visibility ?? "private", attributes: normalizeAttributes(attrs), location: location() }, location);
    }
\r
ImplItemList\r
  = head:ImplItem tail:(_ ImplItem)* { return [head].concat(tail.map(t => t[1])); }\r
  / "" { return []; }\r
\r
ImplItem\r
  = ImplAssocType / ImplMethod\r
\r
ImplAssocType\r
  = "type" _ node:IdName _ arity:TraitAssocTypeArity? _ "=" _ typeName:TypeName _ ";"? {\r
      return createNode("ImplAssocType", { name: node.name, typeName, higherKindArity: arity || 0, location: node.location }, location);\r
    }\r
\r
ImplMethod\r
  = visibility:Visibility? _ mods:FnModifiers? "fn" _ node:IdName _ tparams:TypeParams? _ "(" _ params:ParamList? _ ")" _ ret:ReturnType? _ whereInfo:WhereClause? _ body:Block {\r
      const fnDecl = { declarationKind: "fn", name: node.name, async: !!mods?.async, params: params || [], returnType: ret || null, whereClauses: whereInfo ? whereInfo.constClauses : [], whereTypeBounds: whereInfo ? whereInfo.typeBounds : [], body, typeParams: tparams || [], visibility: visibility ?? "private", extern: false, location: node.location };
      if (mods?.comptime) fnDecl.comptime = true;\r
      return createNode("FnDecl", fnDecl, location);\r
    }\r
\r
AdtTypeDecl
  = attrs:OuterAttr* visibility:Visibility? _ "type" _ node:IdName _ tparams:TypeParams? _ "=" _ variants:AdtVariantList _ ";"? {
      const deriveList = collectAttributeArgs(attrs, "derive");
      return createNode("EnumDecl", { name: node.name, variants: variants || [], derives: deriveList, typeParams: tparams || [], visibility: visibility ?? "private", attributes: stripAttributes(attrs, "derive"), location: node.location }, location);
    }

StructDecl
  = attrs:OuterAttr* visibility:Visibility? _ "struct" _ node:IdName _ tparams:TypeParams? _ body:StructBody {
      const deriveList = collectAttributeArgs(attrs, "derive");
      return createNode("StructDecl", { name: node.name, body: body.fields || [], derives: deriveList, typeParams: tparams || [], visibility: visibility ?? "private", attributes: stripAttributes(attrs, "derive"), location: node.location }, location);
    }
\r
StructBody\r
  = "{" _ fields:TypeFieldList? _ "}" _ ";"? {\r
      return { fields: fields || [] };\r
    }\r
  / "(" _ types:TupleStructTypeList? _ ")" _ ";"? {\r
      return {\r
        fields: (types || []).map((typeName, idx) => ({\r
          name: \`_\${idx}\`,\r
          typeName,\r
          location: location()\r
        }))\r
      };\r
    }\r
  / ";" {\r
      return { fields: [] };\r
    }\r
\r
TupleStructTypeList\r
  = head:TypeName tail:(_ "," _ TypeName)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
DeriveAttr\r
  = "#[" _ "derive" _ "(" _ names:DeriveList? _ ")" _ "]" _ { return names || []; }\r
\r
DeriveList\r
  = head:IdName tail:(_ "," _ IdName)* _ ","? { return [head.name].concat(tail.map(t => t[3].name)); }\r
\r
EnumDecl
  = attrs:OuterAttr* visibility:Visibility? _ "enum" _ node:IdName _ tparams:TypeParams? _ "{" _ variants:EnumVariantList? _ "}" _ ";"? {
      const deriveList = collectAttributeArgs(attrs, "derive");
      return createNode("EnumDecl", { name: node.name, variants: variants || [], derives: deriveList, typeParams: tparams || [], visibility: visibility ?? "private", attributes: stripAttributes(attrs, "derive"), location: node.location }, location);
    }

ExternTypeDecl
  = attrs:OuterAttr* visibility:Visibility? _ "extern" _ "type" _ node:IdName _ tparams:TypeParams? _ source:FromClause? _ ";"? {
      return createNode("TypeDecl", { name: node.name, body: [], typeParams: tparams || [], visibility: visibility ?? "public", extern: true, externModule: source ?? null, attributes: normalizeAttributes(attrs), location: node.location }, location);
    }
\r
TypeBody\r
  = "{" _ fields:TypeFieldList? _ "}" { return fields || []; }\r
\r
TypeFieldList\r
  = head:TypeField tail:(_ "," _ TypeField)* { return [head].concat(tail.map(t => t[3])); }\r
\r
TypeField\r
  = node:IdName _ ":" _ typeName:TypeName { return { name: node.name, typeName, location: node.location }; }\r
\r
TypeName\r
  = "_" { return { kind: "TypeHole", location: location() }; }\r
  / FunctionTypeName\r
  / ArrayTypeName\r
  / TupleTypeName\r
  / path:TypePath _ args:TypeArgs? {\r
      const base = path.join("::");\r
      if (!args) return base;\r
      const rendered = args.map(arg => {\r
        if (typeof arg === "string") return arg;\r
        if (arg && typeof arg === "object" && arg.type && String(arg.type).startsWith("Const")) {\r
          return constExprToText(arg);\r
        }\r
        return "_";\r
      });\r
      return \`\${base}<\${rendered.join(",")}>\`;\r
    }\r
\r
FunctionTypeName\r
  = "fn" _ "(" _ params:TypeNameList? _ ")" _ "->" _ ret:TypeName {\r
      const parts = (params || []).concat([ret]);\r
      return \`Fn<\${parts.join(",")}>\`;\r
    }\r
\r
ArrayTypeName\r
  = "[" _ elem:TypeName _ ";" _ size:ConstTypeExpr _ "]" {\r
      return { kind: "array", element: elem, size, location: location() };\r
    }\r
\r
TupleTypeName\r
  = "(" _ head:TypeName _ "," _ tail:TypeNameList _ ")" {\r
      const all = [head].concat(tail);\r
      const rendered = all.map(arg => typeof arg === "string" ? arg : "_");\r
      return \`Tuple<\${rendered.join(",")}>\`;\r
    }\r
\r
TypeNameList\r
  = head:TypeName tail:(_ "," _ TypeName)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
TypePath\r
  = head:IdName tail:(_ "::" _ IdName)* { return [head.name].concat(tail.map(t => t[3].name)); }\r
\r
FnDecl
  = attrs:OuterAttr* visibility:Visibility? _ mods:FnModifiers? kind:("fn" / "component") _ node:IdName _ tparams:TypeParams? _ "(" _ params:ParamList? _ ")" _ ret:ReturnType? _ whereInfo:WhereClause? _ body:Block {
      const fnDecl = { declarationKind: kind, name: node.name, async: !!mods?.async, params: params || [], returnType: ret || null, whereClauses: whereInfo ? whereInfo.constClauses : [], whereTypeBounds: whereInfo ? whereInfo.typeBounds : [], body, typeParams: tparams || [], visibility: visibility ?? "private", extern: false, attributes: normalizeAttributes(attrs), location: node.location };
      if (mods?.comptime) fnDecl.comptime = true;
      return createNode("FnDecl", fnDecl, location);
    }

ExternFnDecl
  = attrs:OuterAttr* visibility:Visibility? _ "extern" _ "fn" _ node:IdName _ tparams:TypeParams? _ "(" _ params:ParamList? _ ")" _ ret:ReturnType? _ whereInfo:WhereClause? _ source:FromClause? _ ";"? {
      return createNode("FnDecl", { declarationKind: "fn", name: node.name, params: params || [], returnType: ret || "any", whereClauses: whereInfo ? whereInfo.constClauses : [], whereTypeBounds: whereInfo ? whereInfo.typeBounds : [], body: createNode("Block", { body: [] }, location), typeParams: tparams || [], visibility: visibility ?? "public", extern: true, externModule: source ?? null, attributes: normalizeAttributes(attrs), location: node.location }, location);
    }
\r
FnModifiers\r
  = head:FnModifier __ tail:(FnModifier __)* {\r
      const list = [head].concat(tail.map(t => t[0]));\r
      return { async: list.includes("async"), comptime: list.includes("comptime") };\r
    }\r
\r
FnModifier\r
  = "async" { return "async"; }\r
  / "comptime" { return "comptime"; }\r
\r
FromClause\r
  = _ "from" _ source:String { return source.value; }\r
\r
ReturnType\r
  = "->" _ type:TypeName { return type; }\r
\r
WhereClause\r
  = "where" __ head:WherePredicate tail:(_ "," _ WherePredicate)* {\r
      const items = [head].concat(tail.map(t => t[3]));\r
      const constClauses = [];\r
      const typeBounds = [];\r
      for (const item of items) {\r
        if (item && item.type === "WhereTypeBound") {\r
          typeBounds.push(item);\r
        } else {\r
          constClauses.push(item);\r
        }\r
      }\r
      return { constClauses, typeBounds };\r
    }\r
\r
WherePredicate\r
  = WhereTypeBound\r
  / ConstTypeExpr\r
\r
WhereTypeBound\r
  = node:IdName _ ":" _ bounds:TypeBounds {\r
      return createNode("WhereTypeBound", { name: node.name, bounds, location: node.location }, location);\r
    }\r
\r
TypeArgs\r
  = "<" _ head:TypeArg tail:(_ "," _ TypeArg)* _ ">" { return [head].concat(tail.map(t => t[3])); }\r
\r
TypeArgsWithTurbofish\r
  = ("::" _)? args:TypeArgs { return args; }\r
\r
TypeArg\r
  = TypeName\r
  / constExpr:ConstTypeExpr { return constExpr; }\r
\r
TypeParams\r
  = "<" _ head:TypeParam tail:(_ "," _ TypeParam)* _ ">" { return [head].concat(tail.map(t => t[3])); }\r
\r
TypeParam\r
  = "const" __ name:IdName _ ":" _ typeName:("usize" / "i32" / "i64") {\r
      return { name: name.name, isConst: true, constType: typeName };\r
    }\r
  / name:IdName _ "<" _ head:"_" tail:(_ "," _ "_")* _ ">" _ bound:(_ ":" _ TypeBounds)? {\r
      return { name: name.name, isConst: false, higherKindArity: 1 + tail.length, bound: bound ? bound[3] : undefined };\r
    }\r
  / name:IdName _ ":" _ bound:TypeBounds { return { name: name.name, bound, isConst: false }; }\r
  / name:IdName { return { name: name.name, isConst: false }; }\r
\r
ConstTypeExpr\r
  = ConstIfExpr\r
\r
ConstIfExpr\r
  = "if" __ cond:ConstTypeExpr _ "{" _ thenExpr:ConstTypeExpr _ "}" _ "else" _ "{" _ elseExpr:ConstTypeExpr _ "}" {\r
      return createNode("ConstIf", { condition: cond, thenExpr, elseExpr }, location);\r
    }\r
  / ConstOrExpr\r
\r
ConstOrExpr\r
  = head:ConstAndExpr tail:(_ "||" _ ConstAndExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: "||", left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstAndExpr\r
  = head:ConstEqExpr tail:(_ "&&" _ ConstEqExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: "&&", left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstEqExpr\r
  = head:ConstCmpExpr tail:(_ op:("==" / "!=") _ ConstCmpExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstCmpExpr\r
  = head:ConstAddExpr tail:(_ op:("<=" / ">=" / "<" / ">") __ ConstAddExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstAddExpr\r
  = head:ConstMulExpr tail:(_ op:("+" / "-") _ ConstMulExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstMulExpr\r
  = head:ConstUnaryExpr tail:(_ op:("*" / "/") _ ConstUnaryExpr)* {\r
      return tail.reduce((acc, t) => createNode("ConstBinary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
ConstUnaryExpr\r
  = op:("-" / "!") _ expr:ConstUnaryExpr {\r
      return createNode("ConstUnary", { op, expr }, location);\r
    }\r
  / ConstTypePrimary\r
\r
ConstCallExpr\r
  = name:("min" / "max") _ "(" _ first:ConstTypeExpr _ "," _ second:ConstTypeExpr _ ")" {\r
      return createNode("ConstCall", { name, args: [first, second] }, location);\r
    }\r
\r
ConstTypePrimary\r
  = value:IntConstLiteral {\r
      return createNode("ConstLiteral", { value }, location);\r
    }\r
  / "true" ![A-Za-z0-9_] {\r
      return createNode("ConstLiteral", { value: true }, location);\r
    }\r
  / "false" ![A-Za-z0-9_] {\r
      return createNode("ConstLiteral", { value: false }, location);\r
    }\r
  / call:ConstCallExpr { return call; }\r
  / node:IdName {\r
      return createNode("ConstParam", { name: node.name, location: node.location }, location);\r
    }\r
  / "(" _ expr:ConstTypeExpr _ ")" { return expr; }\r
\r
IntConstLiteral\r
  = digits:$([0-9] [0-9_]*) { return parseInt(digits.replace(/_/g, ""), 10); }\r
\r
TypeBounds\r
  = head:TypeName tail:(_ ("&" / "+") _ TypeName)* { return [head].concat(tail.map(t => t[3])); }\r
\r
EnumVariantList\r
  = head:EnumVariant tail:(_ "," _ EnumVariant)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
EnumVariant\r
  = node:IdName _ exists:EnumVariantExistential? _ params:EnumVariantParams? _ resultType:(_ ":" _ TypeName)? _ constraints:EnumVariantWhere? {\r
      return {\r
        name: node.name,\r
        params: params || [],\r
        resultType: resultType ? resultType[3] : null,\r
        existentialTypeParams: exists || [],\r
        constraints: constraints || [],\r
        location: node.location\r
      };\r
    }\r
\r
EnumVariantParams\r
  = "(" _ head:TypeName tail:(_ "," _ TypeName)* _ ")" { return [head].concat(tail.map(t => t[3])); }\r
\r
EnumVariantExistential\r
  = "exists" __ "<" _ head:TypeParam tail:(_ "," _ TypeParam)* _ ">" {\r
      return [head].concat(tail.map(t => t[3]));\r
    }\r
\r
EnumVariantWhere\r
  = "where" __ head:EnumVariantConstraint tail:(_ "," _ EnumVariantConstraint)* {\r
      return [head].concat(tail.map(t => t[3]));\r
    }\r
\r
EnumVariantConstraint\r
  = node:IdName _ ":" _ bounds:TypeBounds { return { name: node.name, bounds, location: node.location }; }\r
\r
AdtVariantList\r
  = head:AdtVariant tail:(_ "|" _ AdtVariant)* { return [head].concat(tail.map(t => t[3])); }\r
\r
AdtVariant\r
  = node:IdName _ params:EnumVariantParams? { return { name: node.name, params: params || [], location: node.location }; }\r
\r
ParamList\r
  = head:Param tail:(_ "," _ Param)* { return [head].concat(tail.map(t => t[3])); }\r
\r
Param\r
  = leading:ParamRef? node:IdName _ typeAnn:(_ ":" _ trailing:ParamRef? typeName:TypeName {\r
      return { typeName, ref: !!trailing, refMut: !!(trailing && trailing.mut) };\r
    })? defaultVal:(_ "=" _ Expr)? {\r
      const refFlag = !!leading || !!(typeAnn && typeAnn.ref);\r
      const refMut = !!(leading && leading.mut) || !!(typeAnn && typeAnn.refMut);\r
      return {\r
        name: node.name,\r
        typeName: typeAnn ? typeAnn.typeName : null,\r
        ref: refFlag,\r
        refMut,\r
        defaultValue: defaultVal ? defaultVal[3] : null,\r
        location: node.location\r
      };\r
    }\r
\r
ParamRef\r
  = "ref" __ mut:("mut" __)? { return { mut: !!mut }; }\r
\r
Block\r
  = "{" _ statements:StatementList _ "}" { return createNode("Block", { body: statements }, location); }\r
\r
LetStmt\r
  = "let" _ refInfo:("ref" __ refMut:("mut" __)? {\r
      return { ref: true, refMut: !!refMut };\r
    })? mut:("mut" __)? node:IdName _ typeAnn:(_ ":" _ typeName:TypeName { return typeName; })? _ "=" _ value:Expr _ ";"? {\r
      return createNode("Let", {\r
        name: node.name,\r
        typeName: typeAnn || null,\r
        value,\r
        mutable: refInfo ? !!refInfo.refMut : !!mut,\r
        ref: !!refInfo,\r
        refMut: !!(refInfo && refInfo.refMut),\r
        location: node.location\r
      }, location);\r
    }\r
\r
LetTupleStmt\r
  = "let" _ mut:("mut" __)? "(" _ head:IdName tail:(_ "," _ IdName)* _ ","? _ ")" _ "=" _ value:Expr _ ";"? {\r
      const names = [head.name].concat(tail.map(t => t[3].name));\r
      return createNode("LetTuple", { names, value, mutable: !!mut, location: head.location }, location);\r
    }\r
\r
LetElseStmt\r
  = "let" _ mut:("mut" __)? pattern:MatchPattern _ "=" _ value:Expr _ "else" _ elseBlock:Block _ ";"? {\r
      return createNode("LetElse", { pattern, value, elseBlock, mutable: !!mut, location: pattern.location }, location);\r
    }\r
\r
ReturnStmt\r
  = "return" _ value:Expr _ ";"? { return createNode("Return", { value }, location); }\r
\r
BreakStmt\r
  = "break" _ ";"? { return createNode("Break", {}, location); }\r
\r
ContinueStmt\r
  = "continue" _ ";"? { return createNode("Continue", {}, location); }\r
\r
MatchStmt\r
  = "match" _ value:Expr _ "{" _ arms:MatchArmList? _ "}" {\r
      return createNode("MatchStmt", { value, arms: arms || [] }, location);\r
    }\r
\r
WhileStmt\r
  = "while" _ "(" _ condition:Expr _ ")" _ body:Block {\r
      return createNode("While", { condition, body }, location);\r
    }\r
\r
WhileLetStmt\r
  = "while" __ "let" __ pattern:MatchPattern _ "=" _ value:Expr _ body:Block {\r
      return createNode("WhileLet", { pattern, value, body }, location);\r
    }\r
\r
ForStmt\r
  = "for" __ iterator:IdName __ "in" __ iterable:Expr _ body:Block {\r
      return createNode("For", { iterator: iterator.name, iterable, body, location: iterator.location }, location);\r
    }\r
\r
AssignStmt\r
  = target:(Member / Identifier) _ "=" _ value:Expr _ ";"? { return createNode("Assign", { target, value }, location); }\r
\r
IfStmt\r
  = "if" _ "(" _ condition:Expr _ ")" _ thenBlock:Block _ elsePart:(_ "else" _ elseBlock:Block)? {\r
      return createNode("If", { condition, thenBlock, elseBlock: elsePart ? elsePart[3] : null }, location);\r
    }\r
\r
IfLetStmt\r
  = "if" __ "let" __ pattern:MatchPattern _ "=" _ value:Expr _ thenBlock:Block _ elsePart:(_ "else" _ elseBlock:Block)? {\r
      return createNode("IfLet", { pattern, value, thenBlock, elseBlock: elsePart ? elsePart[3] : null, location: pattern.location }, location);\r
    }\r
\r
ExprStmt\r
  = expr:Expr _ ";"? { return createNode("ExprStmt", { expr }, location); }\r
\r
Expr\r
  = LogicOr\r
\r
LogicOr\r
  = head:LogicAnd tail:(_ "||" _ LogicAnd)* {\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
LogicAnd\r
  = head:Pipe tail:(_ "&&" _ Pipe)* {\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
Pipe\r
  = head:CastExpr tail:(_ "|>" _ PipeTarget)* {\r
      return tail.reduce((acc, t) => createNode("Binary", { op: "|>", left: acc, right: t[3] }, location), head);\r
    }\r
\r
CastExpr\r
  = head:Equality tail:(_ "as" _ TypeName)* {\r
      return tail.reduce((acc, t) => createNode("Cast", { expr: acc, targetType: t[3] }, location), head);\r
    }\r
\r
PipeTarget\r
  = callee:IdName _ "(" _ args:ArgList? _ ")" {\r
      return createNode("Call", { callee: createNode("Identifier", { name: callee.name, location: callee.location }, location), args: args || [], typeArgs: [] }, location);\r
    }\r
  / callee:IdName {\r
      return createNode("Call", { callee: createNode("Identifier", { name: callee.name, location: callee.location }, location), args: [], typeArgs: [] }, location);\r
    }\r
\r
Equality\r
  = head:IsExpr tail:(_ ("==" / "!=") _ IsExpr)* {\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
IsExpr\r
  = head:Relational _ "is" _ qual:QualifiedVariant {\r
      return createNode("IsExpr", { value: head, variant: qual.variant, enumName: qual.enumName }, location);\r
    }\r
  / Relational\r
\r
Relational\r
  = head:Range tail:(_ ("<=" / ">=" / "<" / ">") _ Range)* {\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3] }, location), head);\r
    }\r
\r
Range\r
  = start:Add _ "..=" _ end:Add {\r
      return createNode("Range", { start, end, inclusive: true }, location);\r
    }\r
  / "..=" _ end:Add {\r
      return createNode("Range", { start: null, end, inclusive: true }, location);\r
    }\r
  / start:Add _ ".." _ end:Add {\r
      return createNode("Range", { start, end, inclusive: false }, location);\r
    }\r
  / ".." _ end:Add {\r
      return createNode("Range", { start: null, end, inclusive: false }, location);\r
    }\r
  / start:Add _ ".." {\r
      return createNode("Range", { start, end: null, inclusive: false }, location);\r
    }\r
  / ".." {\r
      return createNode("Range", { start: null, end: null, inclusive: false }, location);\r
    }\r
  / Add\r
\r
Add\r
  = head:Mul tail:(_ ("+" / "-") _ Mul)* {\r
      const loc = location();\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3], location: loc }, location), head);\r
    }\r
\r
Mul\r
  = head:Primary tail:(_ ("*" / "/" / "%") _ Primary)* {\r
      const loc = location();\r
      return tail.reduce((acc, t) => createNode("Binary", { op: t[1], left: acc, right: t[3], location: loc }, location), head);\r
    }\r
\r
Primary\r
  = TryExpr\r
\r
TryExpr\r
  = head:AwaitExpr tail:(_ "?")* {\r
      return tail.reduce((acc) => createNode("Try", { value: acc }, location), head);\r
    }\r
  / head:PrimaryNoAwait tail:(_ "?")* {\r
      return tail.reduce((acc) => createNode("Try", { value: acc }, location), head);\r
    }\r
\r
PrimaryNoAwait\r
  = Postfix\r
\r
Postfix\r
  = head:PrimaryAtom tail:PostfixPart* {\r
      return tail.reduce((acc, part) => {\r
        if (part.kind === "member") {\r
          return createNode("Member", { object: acc, property: part.name }, location);\r
        }\r
        if (part.kind === "index") {\r
          return createNode("Index", { object: acc, index: part.index }, location);\r
        }\r
        if (part.kind === "call") {
          if (acc.type === "Identifier") {
            return createNode("Call", { callee: acc, args: part.args, typeArgs: part.typeArgs }, location);
          }
          if (acc.type === "Member") {
            const callee = createNode("Identifier", { name: acc.property, location: acc.location }, location);
            return createNode("Call", { callee, args: part.args, typeArgs: part.typeArgs, receiver: acc.object }, location);
          }
          return createNode("Call", { callee: acc, args: part.args, typeArgs: part.typeArgs }, location);
        }
        return acc;
      }, head);
    }
\r
PostfixPart\r
  = _ "." _ name:IdName { return { kind: "member", name: name.name }; }\r
  / _ "[" _ index:Expr _ "]" { return { kind: "index", index }; }\r
  / _ targs:TypeArgsWithTurbofish? _ "(" _ args:ArgList? _ ")" { return { kind: "call", args: args || [], typeArgs: targs || [] }; }\r
\r
PrimaryAtom
  = PropsExpr
  / ShowExpr
  / SuspenseExpr
  / ErrorBoundaryExpr
  / TransitionExpr
  / IndexAuthoringExpr
  / ForAuthoringExpr
  / KeyedAuthoringExpr
  / SelectExpr
  / MatchExpr
  / MacroInvokeExpr
  / ListComprehension
  / ArrayRepeatLiteral\r
  / ArrayLiteral\r
  / TupleLiteral\r
  / StructLiteral\r
  / PipeLambdaExpr\r
  / MoveLambdaExpr\r
  / ZeroArgLambdaExpr\r
  / LambdaExpr\r
  / MoveExpr\r
  / QualifiedCall\r
  / Call\r
  / String\r
  / Identifier\r
  / Number\r
  / Boolean\r
  / "(" _ expr:Expr _ ")" { return expr; }\r
\r
SelectExpr\r
  = "select" _ "!" _ "{" _ arms:SelectArmList? _ "}" {\r
      return createNode("SelectExpr", { arms: arms || [] }, location);\r
    }\r
\r
SelectArmList\r
  = head:SelectArm tail:(_ "," _ SelectArm)* _ ","? {\r
      return [head].concat(tail.map(t => t[3]));\r
    }\r
\r
SelectArm\r
  = binding:SelectBinding _ "=" _ value:Expr _ "=>" _ body:Expr {\r
      return { binding, value, body, location: location() };\r
    }\r
\r
SelectBinding\r
  = "_" { return null; }\r
  / node:IdName { return node.name; }\r
\r
MacroInvokeExpr\r
  = macro:IdName _ "!" _ "[" _ packed:MacroInvokeArgPack? _ "]" {\r
      return createNode("MacroInvoke", {\r
        name: macro.name,\r
        args: packed ? packed.args : [],\r
        separators: packed ? packed.separators : [],\r
        delimiter: "[]",\r
        location: macro.location\r
      }, location);\r
    }\r
  / macro:IdName _ "!" _ "(" _ packed:MacroInvokeArgPack? _ ")" {\r
      return createNode("MacroInvoke", {\r
        name: macro.name,\r
        args: packed ? packed.args : [],\r
        separators: packed ? packed.separators : [],\r
        delimiter: "()",\r
        location: macro.location\r
      }, location);\r
    }\r
  / macro:IdName _ "!" _ "{" _ packed:MacroInvokeArgPack? _ "}" {\r
      return createNode("MacroInvoke", {\r
        name: macro.name,\r
        args: packed ? packed.args : [],\r
        separators: packed ? packed.separators : [],\r
        delimiter: "{}",\r
        location: macro.location\r
      }, location);\r
    }\r
\r
MacroInvokeArgPack\r
  = head:Expr tail:(_ sep:MacroInvokeSeparator _ Expr)* _ trailing:(_ MacroInvokeSeparator)? {\r
      const args = [head].concat(tail.map(t => t[3]));\r
      const separators = tail.map(t => t[1]);\r
      return { args, separators };\r
    }\r
\r
MacroInvokeSeparator\r
  = "=>" { return "=>"; }\r
  / ";" { return ";"; }\r
  / "," { return ","; }\r
\r
ListComprehension\r
  = "[" _ body:Expr _ "for" __ binding:IdName _ "in" __ source:Expr\r
      _ "for" __ binding2:IdName _ "in" __ source2:Expr\r
      filter:(_ "if" __ Expr)? _ "]" {\r
      return createNode("ListComprehension", {\r
        body,\r
        binding: binding.name,\r
        source,\r
        binding2: binding2.name,\r
        source2,\r
        filter: filter ? filter[3] : null,\r
        location: binding.location\r
      }, location);\r
    }\r
  / "[" _ body:Expr _ "for" __ binding:IdName _ "in" __ source:Expr\r
      filter:(_ "if" __ Expr)? _ "]" {\r
      return createNode("ListComprehension", {\r
        body,\r
        binding: binding.name,\r
        source,\r
        filter: filter ? filter[3] : null,\r
        location: binding.location\r
      }, location);\r
    }\r
\r
StructLiteral\r
  = name:IdName _ targs:TypeArgs? &(_ "{") _ "{" _ fields:StructLiteralFieldList? _ "}" {\r
      return createNode("StructLiteral", { name: name.name, typeArgs: targs || [], fields: fields || [], location: location() }, location);\r
    }\r
\r
ArrayLiteral\r
  = "[" _ elements:ArrayElements? _ "]" {\r
      return createNode("ArrayLiteral", { elements: elements || [] }, location);\r
    }\r
\r
ArrayRepeatLiteral\r
  = "[" _ value:Expr _ ";" _ count:Expr _ "]" {\r
      return createNode("ArrayRepeatLiteral", { value, count }, location);\r
    }\r
\r
ArrayElements\r
  = head:Expr tail:(_ "," _ Expr)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
TupleLiteral\r
  = "(" _ head:Expr _ "," _ tail:ExprList _ ")" {\r
      return createNode("TupleLiteral", { elements: [head].concat(tail) }, location);\r
    }\r
\r
ExprList\r
  = head:Expr tail:(_ "," _ Expr)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
MoveLambdaExpr\r
  = "move" __ lambda:(ZeroArgLambdaExpr / LambdaExpr) {\r
      return createNode("Lambda", {\r
        async: !!lambda.async,\r
        capture: "move",\r
        params: lambda.params || [],\r
        returnType: lambda.returnType || null,\r
        body: lambda.body,\r
        typeParams: lambda.typeParams || [],\r
      }, location);\r
    }\r
\r
ZeroArgLambdaExpr\r
  = "||" _ body:Expr {\r
      const ret = createNode("Return", { value: body }, location);\r
      const lambdaBody = createNode("Block", { body: [ret] }, location);\r
      return createNode("Lambda", {\r
        async: false,\r
        params: [],\r
        returnType: null,\r
        body: lambdaBody,\r
        typeParams: [],\r
      }, location);\r
    }\r
\r
LambdaExpr\r
  = async:("async" __)? "fn" _ tparams:TypeParams? _ "(" _ params:ParamList? _ ")" _ ret:ReturnType? _ body:Block {\r
      return createNode("Lambda", {\r
        async: !!async,\r
        params: params || [],\r
        returnType: ret || null,\r
        body,\r
        typeParams: tparams || [],\r
      }, location);\r
    }\r
\r
PipeLambdaExpr\r
  = "|" _ params:PipeLambdaParams? _ "|" _ body:(Block / Expr) {\r
      let lambdaBody = body;\r
      if (!lambdaBody || lambdaBody.type !== "Block") {\r
        const ret = createNode("Return", { value: body }, location);\r
        lambdaBody = createNode("Block", { body: [ret] }, location);\r
      }\r
      return createNode("Lambda", {\r
        async: false,\r
        params: params || [],\r
        returnType: null,\r
        body: lambdaBody,\r
        typeParams: [],\r
      }, location);\r
    }\r
\r
PipeLambdaParams\r
  = head:IdName tail:(_ "," _ IdName)* {\r
      return [{ name: head.name, typeName: null, location: head.location }].concat(\r
        tail.map(t => ({ name: t[3].name, typeName: null, location: t[3].location }))\r
      );\r
    }\r
\r
StructLiteralFieldList\r
  = head:StructLiteralField tail:(_ "," _ StructLiteralField)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
StructLiteralField
  = field:IdName _ ":" _ value:Expr { return { name: field.name, value, location: field.location }; }

PropsExpr
  = "props" _ "{" _ entries:PropsEntryList? _ "}" {
      return buildPropsExpr(entries || [], location());
    }

PropsEntryList
  = head:PropsEntry tail:(_ "," _ PropsEntry)* _ ","? { return [head].concat(tail.map(t => t[3])); }

PropsEntry
  = "..." _ value:Expr {
      return { kind: "spread", value, location: location() };
    }
  / "when" __ condition:Expr _ "=>" _ name:IdName _ ":" _ value:Expr {
      return { kind: "conditional", condition, name: name.name, value, location: name.location };
    }
  / name:IdName _ ":" _ value:Expr {
      return { kind: "field", name: name.name, value, location: name.location };
    }

ShowExpr
  = "show" _ "(" _ condition:Expr _ ")" _ body:(Block / Expr) _ elsePart:(_ "else" _ fallback:(Block / Expr))? {
      return buildShowExpr(condition, body, elsePart ? elsePart[3] : null, location());
    }

SuspenseExpr
  = "suspense" _ "(" _ fallback:Expr _ ")" _ body:(Block / Expr) {
      return buildBoundaryExpr("suspense", fallback, body, location());
    }

ErrorBoundaryExpr
  = "error_boundary" _ "(" _ fallback:Expr _ ")" _ body:(Block / Expr) {
      return buildBoundaryExpr("errorBoundary", fallback, body, location());
    }

TransitionExpr
  = "transition" _ "(" _ open:Expr _ "," _ duration:Expr _ propsExpr:(_ "," _ Expr)? _ ")" _ body:(Block / Expr) {
      return buildTransitionExpr(open, duration, propsExpr ? propsExpr[3] : null, body, location());
    }

IndexAuthoringExpr
  = "index" _ "(" _ item:IdName indexInfo:(_ "," _ idx:IdName { return idx.name; })? __ "in" __ source:Expr _ ")" _ "=>" _ body:(Block / Expr) {
      return buildIndexAuthoringExpr(item.name, indexInfo || null, source, body, item.location);
    }

ForAuthoringExpr
  = "for" _ "(" _ item:IdName indexInfo:(_ "," _ idx:IdName { return idx.name; })? __ "in" __ source:Expr __ "key" __ keyExpr:Expr _ ")" _ "=>" _ body:(Block / Expr) {
      return buildForAuthoringExpr(item.name, indexInfo || null, source, keyExpr, body, item.location);
    }

KeyedAuthoringExpr
  = "key" _ "(" _ keyExpr:Expr _ ")" _ "=>" _ body:(Block / Expr) {
      return buildKeyedAuthoringExpr(keyExpr, body, location());
    }

Keyword
  = ("fn" / "async" / "comptime" / "await" / "struct" / "enum" / "type" / "extern" / "import" / "pub" / "trait" / "impl" / "shader" / "let" / "mut" / "ref" / "move"
    / "if" / "else" / "while" / "match" / "return" / "break" / "continue" / "for" / "in" / "true" / "false" / "from" / "as" / "is" / "select" / "macro_rules"
    / "exists" / "where") ![a-zA-Z0-9_]\r
\r
IdName\r
  = !Keyword name:$([a-zA-Z_][a-zA-Z0-9_]*) { return { name, location: location() }; }\r
\r
VariantIdName\r
  = !Keyword name:$([A-Z][a-zA-Z0-9_]*) { return { name, location: location() }; }\r
\r
Identifier\r
  = node:IdName { return createNode("Identifier", { name: node.name, location: node.location }, location); }\r
\r
Number\r
  = "0x" digits:$([0-9a-fA-F] [0-9a-fA-F_]*) suffix:NumericSuffix? {\r
      const cleaned = digits.replace(/_/g, "");\r
      const suffixValue = suffix ?? null;\r
      const isFloat = typeof suffixValue === "string" && suffixValue.startsWith("f");\r
      return createNode("Number", { value: parseInt(cleaned, 16), raw: \`0x\${cleaned}\`, suffix: suffixValue, isFloat }, location);\r
    }\r
  / "0b" digits:$([01] [01_]*) suffix:NumericSuffix? {\r
      const cleaned = digits.replace(/_/g, "");\r
      const suffixValue = suffix ?? null;\r
      const isFloat = typeof suffixValue === "string" && suffixValue.startsWith("f");\r
      return createNode("Number", { value: parseInt(cleaned, 2), raw: \`0b\${cleaned}\`, suffix: suffixValue, isFloat }, location);\r
    }\r
  / int:$([0-9] [0-9_]*) frac:("." digits:$([0-9_]+))? exp:ExponentPart? suffix:NumericSuffix? {\r
      const intPart = int.replace(/_/g, "");\r
      const fracPart = frac ? frac[1].replace(/_/g, "") : "";\r
      const expPart = exp ? exp.replace(/_/g, "") : "";\r
      const suffixValue = suffix ?? null;\r
      const hasFloat = !!frac || !!exp || (typeof suffixValue === "string" && suffixValue.startsWith("f"));\r
      const raw = frac ? \`\${intPart}.\${fracPart}\` : intPart;\r
      const rawWithExp = expPart ? \`\${raw}\${expPart}\` : raw;\r
      const value = hasFloat ? parseFloat(rawWithExp) : parseInt(rawWithExp, 10);\r
      return createNode("Number", { value, raw: rawWithExp, suffix: suffixValue, isFloat: hasFloat }, location);\r
    }\r
\r
ExponentPart\r
  = [eE] sign:("+" / "-")? digits:$([0-9] [0-9_]*) { return \`e\${sign ?? ""}\${digits}\`; }\r
\r
NumericSuffix\r
  = "i8" / "i16" / "i32" / "i64" / "i128"\r
  / "u8" / "u16" / "u32" / "u64" / "u128"\r
  / "f32" / "f64"\r
\r
Boolean\r
  = "true" { return createNode("Boolean", { value: true }, location); }\r
  / "false" { return createNode("Boolean", { value: false }, location); }\r
\r
String\r
  = RawString / TripleString / NormalString\r
\r
RawString\r
  = "r\\"" chars:RawChar* "\\"" {\r
      return createNode("String", { value: chars.join("") }, location);\r
    }\r
\r
RawChar\r
  = !"\\"" char:. { return char; }\r
\r
TripleString\r
  = "\\"\\"\\"" parts:TriplePart* "\\"\\"\\"" {\r
      const hasExpr = parts.some(part => part && part.kind === "expr");\r
      if (!hasExpr) {\r
        const text = parts.map(part => part.value).join("");\r
        return createNode("String", { value: text }, location);\r
      }\r
      const normalized = [];\r
      for (const part of parts) {\r
        if (!part) continue;\r
        if (part.kind === "text") {\r
          if (part.value.length > 0) normalized.push(part.value);\r
        } else {\r
          normalized.push(part.value);\r
        }\r
      }\r
      return createNode("InterpolatedString", { parts: normalized }, location);\r
    }\r
\r
TriplePart\r
  = InterpolatedExpr / TripleText\r
\r
TripleText\r
  = chars:TripleChar+ { return { kind: "text", value: chars.join("") }; }\r
\r
TripleChar\r
  = !("\\"\\"\\"" / "\\\\" / "{") char:. { return char; }\r
  / "{" &("\\"" / "\\\\" / "}" / "\\n" / "\\r") { return String.fromCharCode(123); }\r
  / "\\\\" seq:EscapeSequence { return seq; }\r
\r
NormalString\r
  = "\\"" parts:InterpolatedPart* "\\"" {\r
      const hasExpr = parts.some(part => part && part.kind === "expr");\r
      if (!hasExpr) {\r
        const text = parts.map(part => part.value).join("");\r
        return createNode("String", { value: text }, location);\r
      }\r
      const normalized = [];\r
      for (const part of parts) {\r
        if (!part) continue;\r
        if (part.kind === "text") {\r
          if (part.value.length > 0) normalized.push(part.value);\r
        } else {\r
          normalized.push(part.value);\r
        }\r
      }\r
      return createNode("InterpolatedString", { parts: normalized }, location);\r
    }\r
\r
InterpolatedPart\r
  = InterpolatedExpr / InterpolatedText\r
\r
InterpolatedExpr\r
  = "{" !("\\"" / "}" / "\\n" / "\\r") _ expr:Expr _ "}" { return { kind: "expr", value: expr }; }\r
\r
InterpolatedText\r
  = chars:InterpolatedChar+ { return { kind: "text", value: chars.join("") }; }\r
\r
InterpolatedChar\r
  = !("\\"" / "\\\\" / "{") char:. { return char; }\r
  / "{" &("\\"" / "\\\\" / "}" / "\\n" / "\\r") { return String.fromCharCode(123); }\r
  / "\\\\" seq:EscapeSequence { return seq; }\r
\r
EscapeSequence\r
  = "\\"" { return "\\""; }\r
  / "\\\\" { return "\\\\"; }\r
  / "{" { return String.fromCharCode(123); }\r
  / "}" { return String.fromCharCode(125); }\r
  / "b" { return "\\b"; }\r
  / "f" { return "\\f"; }\r
  / "v" { return "\\v"; }\r
  / "e" { return "\\x1B"; }\r
  / "n" { return "\\n"; }\r
  / "r" { return "\\r"; }\r
  / "t" { return "\\t"; }\r
  / "0" { return "\\0"; }\r
  / "x" hex:$([0-9a-fA-F] [0-9a-fA-F]) { return String.fromCharCode(parseInt(hex.replace(/\\s+/g, ""), 16)); }\r
  / "u" "{" hex:$([0-9a-fA-F]+) "}" {\r
      if (hex.length > 6) throw new Error("Invalid unicode escape");\r
      return String.fromCodePoint(parseInt(hex, 16));\r
    }\r
  / "u" hex:$([0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]) { return String.fromCharCode(parseInt(hex.replace(/\\s+/g, ""), 16)); }\r
\r
_ = (WS / Comment)*\r
__ = (WS / Comment)+\r
WS = [ \\t\\r\\n]+\r
Comment = "//" [^\\n]* "\\n"?\r
  / "/*" (!"*/" .)* "*/"\r
\r
MatchArmList\r
  = head:MatchArm tail:(_ "," _ MatchArm)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
MatchArm\r
  = pattern:MatchPattern _ guard:MatchGuard? _ "=>" _ body:Block _ ";"? { return { pattern, guard: guard || null, body, location: location() }; }\r
\r
MatchGuard\r
  = "if" _ condition:Expr { return condition; }\r
\r
MatchPattern\r
  = "_" { return createNode("WildcardPattern", {}, location); }\r
  / RefBindingPattern\r
  / TupleMatchPattern\r
  / StructMatchPattern\r
  / LiteralMatchPattern\r
  / qual:QualifiedVariant _ binds:MatchBindingPatternList? {\r
      const patterns = binds || [];\r
      const bindings = patterns.map(p =>\r
        p.type === "BindingPattern"\r
          ? p.name\r
          : p.type === "RefBindingPattern"\r
            ? p.name\r
            : (p.type === "WildcardPattern" ? "_" : "_")\r
      );\r
      return createNode("EnumPattern", { variant: qual.variant, enumName: qual.enumName, bindings, patterns, location: qual.location }, location);\r
    }\r
  / name:IdName { return createNode("BindingPattern", { name: name.name, location: name.location }, location); }\r
\r
RefBindingPattern\r
  = "ref" __ mut:("mut" __)? name:IdName {\r
      return createNode("RefBindingPattern", {\r
        name: name.name,\r
        mutable: !!mut,\r
        location: name.location\r
      }, location);\r
    }\r
\r
TupleMatchPattern\r
  = "(" _ head:MatchPattern _ "," _ tail:MatchPatternList _ ")" {\r
      return createNode("TuplePattern", { elements: [head].concat(tail) }, location);\r
    }\r
\r
StructMatchPattern\r
  = name:IdName _ "{" _ fields:StructPatternFieldList? _ "}" {\r
      return createNode("StructPattern", { name: name.name, fields: fields || [], location: name.location }, location);\r
    }\r
\r
StructPatternFieldList\r
  = head:StructPatternField tail:(_ "," _ StructPatternField)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
StructPatternField\r
  = field:IdName _ ":" _ pattern:MatchPattern { return { name: field.name, pattern, location: field.location }; }\r
  / field:IdName { return { name: field.name, pattern: createNode("BindingPattern", { name: field.name, location: field.location }, location), location: field.location }; }\r
\r
LiteralMatchPattern\r
  = number:Number { return createNode("LiteralPattern", { value: number.value }, location); }\r
  / str:String { return createNode("LiteralPattern", { value: str.value }, location); }\r
  / bool:Boolean { return createNode("LiteralPattern", { value: bool.value }, location); }\r
\r
MatchPatternList\r
  = head:MatchPattern tail:(_ "," _ MatchPattern)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
QualifiedVariant\r
  = enumName:IdName _ "." _ variant:IdName { return { enumName: enumName.name, variant: variant.name, location: enumName.location }; }\r
  / variant:VariantIdName { return { enumName: null, variant: variant.name, location: variant.location }; }\r
\r
MatchBindingPatternList\r
  = "(" _ head:MatchPattern tail:(_ "," _ MatchPattern)* _ ")" { return [head].concat(tail.map(t => t[3])); }\r
\r
MatchExpr\r
  = "match" _ value:Expr _ "{" _ arms:MatchExprArmList? _ "}" {\r
      return createNode("MatchExpr", { value, arms: arms || [] }, location);\r
    }\r
\r
MatchExprArmList\r
  = head:MatchExprArm tail:(_ "," _ MatchExprArm)* _ ","? { return [head].concat(tail.map(t => t[3])); }\r
\r
MatchExprArm\r
  = pattern:MatchPattern _ guard:MatchGuard? _ "=>" _ body:Expr { return { pattern, guard: guard || null, body, location: location() }; }\r
\r
Member\r
  = base:Identifier tail:(_ "." _ IdName)* {\r
      return tail.reduce((acc, t) => createNode("Member", { object: acc, property: t[3].name }, location), base);\r
    }\r
Call\r
  = callee:IdName _ targs:TypeArgsWithTurbofish? _ "(" _ args:ArgList? _ ")" {\r
      return createNode("Call", { callee: createNode("Identifier", { name: callee.name, location: callee.location }, location), args: args || [], typeArgs: targs || [] }, location);\r
    }\r
\r
QualifiedCall\r
  = enumName:IdName _ "." _ variant:IdName _ targs:TypeArgsWithTurbofish? _ "(" _ args:ArgList? _ ")" {\r
      return createNode("Call", {\r
        callee: createNode("Identifier", { name: variant.name, location: variant.location }, location),\r
        args: args || [],\r
        typeArgs: targs || [],\r
        enumName: enumName.name\r
      }, location);\r
    }\r
\r
\r
ArgList\r
  = head:Arg tail:(_ "," _ Arg)* { return [head].concat(tail.map(t => t[3])); }\r
Arg\r
  = name:IdName _ ":" !(":" / "::") _ value:Expr {\r
      return { named: true, name: name.name, value, location: name.location };\r
    }\r
  / value:Expr {\r
      return { named: false, value, location: value.location };\r
    }\r
Visibility\r
  = "pub" { return "public"; }\r
MoveExpr\r
  = "move" __ target:(Member / Identifier) {\r
      return createNode("Move", { target }, location);\r
    }\r
\r
AwaitExpr\r
  = "await" __ value:PrimaryNoAwait {\r
      return createNode("Await", { value }, location);\r
    }\r
`,h=`extern fn print(message: string) -> void from "console";\r
extern fn abs(value: int) -> int from "math";\r
extern fn max(a: int, b: int) -> int from "math";\r
extern fn min(a: int, b: int) -> int from "math";\r
extern fn len(value: string) -> int from "string";\r
extern fn upper(value: string) -> string from "string";\r
extern fn timeout(ms: int) -> Promise<void> from "@std/async";\r
extern fn join_all<T>(values: Vec<Promise<T>>) -> Promise<Vec<T>> from "@std/async";\r
type List<T> = { length: int };\r
extern type Vec<T> from "@std/vec";\r
extern type HashMap<K, V> from "@std/hashmap";\r
extern type HashSet<T> from "@std/hashset";\r
extern type Deque<T> from "@std/deque";\r
extern type BTreeMap<K, V> from "@std/btreemap";\r
extern type BTreeSet<T> from "@std/btreeset";\r
extern type PriorityQueue<T> from "@std/priority_queue";\r
extern type Sender<T> from "@std/channel";\r
extern type Receiver<T> from "@std/channel";\r
struct Channel<T> { sender: Sender<T>, receiver: Receiver<T> }\r
extern type Thread from "@std/thread";\r
extern type Mutex from "@std/sync";\r
extern type Semaphore from "@std/sync";\r
extern type AtomicI32 from "@std/sync";\r
extern type SABSenderI32 from "@std/sab_channel";\r
extern type SABReceiverI32 from "@std/sab_channel";\r
extern type SABSenderU32 from "@std/sab_channel";\r
extern type SABReceiverU32 from "@std/sab_channel";\r
extern type SABSenderF32 from "@std/sab_channel";\r
extern type SABReceiverF32 from "@std/sab_channel";\r
extern type SABSenderF64 from "@std/sab_channel";\r
extern type SABReceiverF64 from "@std/sab_channel";\r
struct SABChannelI32 { sender: SABSenderI32, receiver: SABReceiverI32 }\r
struct SABChannelU32 { sender: SABSenderU32, receiver: SABReceiverU32 }\r
struct SABChannelF32 { sender: SABSenderF32, receiver: SABReceiverF32 }\r
struct SABChannelF64 { sender: SABSenderF64, receiver: SABReceiverF64 }\r
extern type DOMElement from "@std/dom";\r
extern type EventHandle from "@std/dom";\r
extern type WorkerHandle from "@std/web_worker";\r
extern type ReadableStream from "@std/web_streams";\r
extern type Signal<T> from "@std/render";\r
extern type Memo<T> from "@std/render";\r
extern type Effect from "@std/render";\r
extern type VNode from "@std/render";\r
extern type Renderer from "@std/render";\r
extern type RenderRoot from "@std/render";\r
extern type ReactiveRenderRoot from "@std/render";\r
type Query<T> = { items: Vec<T> };\r
struct FileMetadata { isFile: bool, isDirectory: bool, size: int, modifiedMs: int }\r
type Map<K, V> = { size: int };\r
enum Option<T> { Some(T), None }\r
enum Result<T, E> { Ok(T), Err(E) }\r
extern fn map_vec<A, B>(values: Vec<A>, mapper: fn(A) -> B) -> Vec<B> from "@std/iter";\r
extern fn filter_vec<A>(values: Vec<A>, pred: fn(A) -> bool) -> Vec<A> from "@std/iter";\r
extern fn filter_option<A>(value: Option<A>, pred: fn(A) -> bool) -> Option<A> from "@std/iter";\r
extern fn zip_vec<A, B>(left: Vec<A>, right: Vec<B>) -> Vec<Tuple<A, B>> from "@std/iter";\r
extern fn enumerate_vec<A>(values: Vec<A>) -> Vec<Tuple<int, A>> from "@std/iter";\r
extern fn flatten_vec<A>(values: Vec<Vec<A>>) -> Vec<A> from "@std/iter";\r
extern fn flat_map_vec<A, B>(values: Vec<A>, mapper: fn(A) -> Vec<B>) -> Vec<B> from "@std/iter";\r
extern fn chunk_vec<A>(values: Vec<A>, size: int) -> Vec<Vec<A>> from "@std/iter";\r
extern fn window_vec<A>(values: Vec<A>, size: int) -> Vec<Vec<A>> from "@std/iter";\r
extern fn partition_vec<A>(values: Vec<A>, pred: fn(A) -> bool) -> Tuple<Vec<A>, Vec<A>> from "@std/iter";\r
extern fn take_vec<A>(values: Vec<A>, n: int) -> Vec<A> from "@std/iter";\r
extern fn skip_vec<A>(values: Vec<A>, n: int) -> Vec<A> from "@std/iter";\r
extern fn any_vec<A>(values: Vec<A>, pred: fn(A) -> bool) -> bool from "@std/iter";\r
extern fn all_vec<A>(values: Vec<A>, pred: fn(A) -> bool) -> bool from "@std/iter";\r
extern fn find_vec<A>(values: Vec<A>, pred: fn(A) -> bool) -> Option<A> from "@std/iter";\r
extern fn count_vec<A>(values: Vec<A>) -> int from "@std/iter";\r
extern fn sum_vec(values: Vec<int>) -> int from "@std/iter";\r
extern fn sum_vec_f64(values: Vec<f64>) -> f64 from "@std/iter";\r
extern fn unique_vec<A>(values: Vec<A>) -> Vec<A> from "@std/iter";\r
extern fn reverse_vec<A>(values: Vec<A>) -> Vec<A> from "@std/iter";\r
extern fn sort_vec<A>(values: Vec<A>, cmp: fn(A, A) -> int) -> Vec<A> from "@std/iter";\r
extern fn sort_by_vec<A, K>(values: Vec<A>, key: fn(A) -> K) -> Vec<A> from "@std/iter";\r
extern fn sort_by_desc_vec<A, K>(values: Vec<A>, key: fn(A) -> K) -> Vec<A> from "@std/iter";\r
extern fn group_by_vec<A, K>(values: Vec<A>, key: fn(A) -> K) -> HashMap<K, Vec<A>> from "@std/iter";\r
extern fn intersperse_vec<A>(values: Vec<A>, sep: A) -> Vec<A> from "@std/iter";\r
extern fn join_vec<A, B, K>(left: Vec<A>, right: Vec<B>, left_key: fn(A) -> K, right_key: fn(B) -> K) -> Vec<Tuple<A, B>> from "@std/iter";\r
extern fn query<T>(items: Vec<T>) -> Query<T> from "@std/query";\r
extern fn where_q<T>(q: Query<T>, pred: fn(T) -> bool) -> Query<T> from "@std/query";\r
extern fn select_q<T, U>(q: Query<T>, mapper: fn(T) -> U) -> Query<U> from "@std/query";\r
extern fn order_by_q<T, K>(q: Query<T>, key: fn(T) -> K) -> Query<T> from "@std/query";\r
extern fn order_by_desc_q<T, K>(q: Query<T>, key: fn(T) -> K) -> Query<T> from "@std/query";\r
extern fn limit_q<T>(q: Query<T>, n: int) -> Query<T> from "@std/query";\r
extern fn offset_q<T>(q: Query<T>, n: int) -> Query<T> from "@std/query";\r
extern fn group_by_q<T, K>(q: Query<T>, key: fn(T) -> K) -> HashMap<K, Vec<T>> from "@std/query";\r
extern fn count_q<T>(q: Query<T>) -> int from "@std/query";\r
extern fn first_q<T>(q: Query<T>) -> Option<T> from "@std/query";\r
extern fn to_vec_q<T>(q: Query<T>) -> Vec<T> from "@std/query";\r
extern fn join_q<T, U, K>(left: Query<T>, right: Query<U>, left_key: fn(T) -> K, right_key: fn(U) -> K) -> Query<Tuple<T, U>> from "@std/query";\r
`,b=""+new URL("lumina-runtime-Dceki71v.js",import.meta.url).href,N=u(x),g=1,T=new URL(b,import.meta.url).href,v=()=>new m(N,{preludeText:h}),A=n=>{const a=n.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`).split(`
`),t=[];let e=0;for(const i of a){const o=i.replace(/[ \t]+$/g,"");if(o.length===0){e+=1,e<=g&&t.push("");continue}e=0,t.push(o)}for(;t.length>0&&t[t.length-1]==="";)t.pop();return`${t.join(`
`)}
`},I=(n,r=120)=>{const t=n.replace(/\r\n?/g,`
`).split(`
`),e=[];for(let i=0;i<t.length;i+=1){const o=t[i],l=i+1,s=o.match(/[ \t]+$/);s&&e.push({severity:"warning",message:"Trailing whitespace",line:l,column:s.index+1,code:"LINT-TRAILING-WS"});const c=o.indexOf("	");c>=0&&e.push({severity:"warning",message:"Tab indentation found; use spaces",line:l,column:c+1,code:"LINT-TAB-INDENT"}),o.length>r&&e.push({severity:"warning",message:`Line exceeds ${r} characters`,line:l,column:r+1,code:"LINT-LINE-LENGTH"})}return e},E=(n,r)=>{const a=r.map(e=>({severity:e.severity,message:e.message,line:e.location?.start?.line,column:e.location?.start?.column,code:e.code})),t=I(n);return[...a,...t]},P=n=>!!(n&&typeof n=="object"&&Array.isArray(n.body)&&n.body.some(r=>r.type==="FnDecl"&&r.name==="main")),S=n=>{try{const r=v();r.addOrUpdateDocument("main.lm",n,1);const a=E(n,r.getDiagnostics("main.lm"));if(a.some(c=>c.severity==="error"))return{ok:!1,js:"",runnableJs:"",hasMain:!1,diagnostics:a};const e=r.getDocumentAst("main.lm");if(!e)return{ok:!1,js:"",runnableJs:"",hasMain:!1,diagnostics:[{severity:"error",message:"No AST produced for main.lm"}]};const i=p(e),o=_(i),l=o?y(o).code:"// No JavaScript output generated.",s=f(e,{target:"esm",includeRuntime:!0,sourceMap:!1,sourceFile:"main.lm",sourceContent:n}).code.replace(/from\s+["']\.\/lumina-runtime\.js["']/g,`from ${JSON.stringify(T)}`);return{ok:!0,js:l,runnableJs:s,hasMain:P(e),diagnostics:a}}catch(r){return{ok:!1,js:"",runnableJs:"",hasMain:!1,diagnostics:[{severity:"error",message:r instanceof Error?r.message:String(r)}]}}},d=globalThis;d.compileLuminaSource=S;d.formatLuminaSource=A;export{S as compileLuminaSource,A as formatLuminaSource};
