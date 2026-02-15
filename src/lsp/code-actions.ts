import {
  CodeAction,
  CodeActionKind,
  Range,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver/node';

function extractHoleType(diagnostic: { relatedInformation?: Array<{ message: string }> }): string | null {
  const info = diagnostic.relatedInformation?.find((rel) => rel.message.startsWith('Hole type:'));
  if (!info) return null;
  const type = info.message.slice('Hole type:'.length).trim();
  if (!type) return null;
  if (/^unknown\(t\d+\)$/.test(type)) return 'any';
  return type;
}

export function getCodeActionsForDiagnostics(
  text: string,
  uri: string,
  diagnostics: Array<{
    message: string;
    code?: string | number;
    range: Range;
    relatedInformation?: Array<{ message: string; location?: { uri: string; range: Range } }>;
  }>,
  options?: { range?: Range }
): CodeAction[] {
  const lines = text.split(/\r?\n/);
  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) insertLine = i + 1;
  }

  const actions: CodeAction[] = [];

  for (const diag of diagnostics) {
    const unknownIdMatch = /Unknown identifier '([^']+)'/.exec(diag.message);
    if (unknownIdMatch) {
      const name = unknownIdMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [uri]: [TextEdit.insert({ line: insertLine, character: 0 }, `let ${name}: int = 0;\n`)],
        },
      };
      actions.push({
        title: `Declare '${name}' at top of file`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      const suggestion = diag.relatedInformation?.find((info) => info.message.startsWith('Did you mean'));
      if (suggestion) {
        const match = /'([^']+)'/.exec(suggestion.message);
        const replacement = match?.[1];
        if (replacement) {
          const replaceEdit: WorkspaceEdit = {
            changes: {
              [uri]: [TextEdit.replace(diag.range, replacement)],
            },
          };
          actions.push({
            title: `Replace with '${replacement}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diag],
            edit: replaceEdit,
          });
        }
      }
      continue;
    }

    const unknownTypeMatch = /Unknown type '([^']+)'/.exec(diag.message);
    if (unknownTypeMatch) {
      const typeName = unknownTypeMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [uri]: [TextEdit.insert({ line: insertLine, character: 0 }, `type ${typeName} = {};\n`)],
        },
      };
      actions.push({
        title: `Declare type '${typeName}' at top of file`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      const suggestion = diag.relatedInformation?.find((info) => info.message.startsWith('Did you mean'));
      if (suggestion) {
        const match = /'([^']+)'/.exec(suggestion.message);
        const replacement = match?.[1];
        if (replacement) {
          const replaceEdit: WorkspaceEdit = {
            changes: {
              [uri]: [TextEdit.replace(diag.range, replacement)],
            },
          };
          actions.push({
            title: `Replace with '${replacement}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diag],
            edit: replaceEdit,
          });
        }
      }
      continue;
    }

    const unknownFuncMatch = /Unknown function '([^']+)'/.exec(diag.message);
    if (unknownFuncMatch) {
      const suggestion = diag.relatedInformation?.find((info) => info.message.startsWith('Did you mean'));
      if (suggestion) {
        const match = /'([^']+)'/.exec(suggestion.message);
        const replacement = match?.[1];
        if (replacement) {
          const replaceEdit: WorkspaceEdit = {
            changes: {
              [uri]: [TextEdit.replace(diag.range, replacement)],
            },
          };
          actions.push({
            title: `Replace with '${replacement}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diag],
            edit: replaceEdit,
          });
        }
      }
      continue;
    }

    if (diag.code === 'MISSING_SEMICOLON' || /Missing semicolon/i.test(diag.message)) {
      const range = diag.range;
      const edit: WorkspaceEdit = {
        changes: {
          [uri]: [TextEdit.insert(range.end, ';')],
        },
      };
      actions.push({
        title: 'Insert missing semicolon',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      continue;
    }

    if (diag.code === 'LUM-010' || /Cannot infer type for hole '_'/.test(diag.message)) {
      const inferredType = extractHoleType(diag);
      if (inferredType) {
        const edit: WorkspaceEdit = {
          changes: {
            [uri]: [TextEdit.replace(diag.range, inferredType)],
          },
        };
        actions.push({
          title: `Replace '_' with '${inferredType}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit,
        });
      }
      continue;
    }

    const unusedMatch = /Unused binding '([^']+)'/.exec(diag.message);
    if (unusedMatch) {
      const name = unusedMatch[1];
      const edit: WorkspaceEdit = {
        changes: {
          [uri]: [TextEdit.replace(diag.range, `_${name}`)],
        },
      };
      actions.push({
        title: `Prefix '${name}' with '_'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit,
      });
      const line = diag.range.start.line;
      const lineText = lines[line] ?? '';
      if (/^\s*let\b/.test(lineText)) {
        let endLine = line + 1;
        if (endLine < lines.length) {
          const nextLine = lines[endLine];
          if (nextLine.trim() === '') endLine += 1;
        }
        const removeRange = {
          start: { line, character: 0 },
          end: { line: Math.min(endLine, lines.length), character: 0 },
        };
        const removeEdit: WorkspaceEdit = {
          changes: {
            [uri]: [TextEdit.del(removeRange)],
          },
        };
        actions.push({
          title: `Remove unused let '${name}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: removeEdit,
        });
      }
    }
  }

  actions.push(...getRefactorActions(text, uri, options?.range));

  return actions;
}

function getRefactorActions(text: string, uri: string, range?: Range): CodeAction[] {
  if (!range) return [];
  const actions: CodeAction[] = [];
  const selected = getTextInRange(text, range);
  const trimmed = selected.trim();
  if (!trimmed) return actions;

  const extract = buildExtractVariableAction(text, uri, range, selected);
  if (extract) actions.push(extract);

  const rewrites = buildCollectionRewriteActions(uri, range, trimmed);
  actions.push(...rewrites);

  return actions;
}

function getTextInRange(text: string, range: Range): string {
  const lines = text.split(/\r?\n/);
  if (range.start.line > range.end.line) return '';
  if (range.start.line === range.end.line) {
    const line = lines[range.start.line] ?? '';
    return line.slice(range.start.character, range.end.character);
  }
  const chunks: string[] = [];
  for (let i = range.start.line; i <= range.end.line; i++) {
    const line = lines[i] ?? '';
    if (i === range.start.line) {
      chunks.push(line.slice(range.start.character));
    } else if (i === range.end.line) {
      chunks.push(line.slice(0, range.end.character));
    } else {
      chunks.push(line);
    }
  }
  return chunks.join('\n');
}

function findUniqueName(text: string, base: string): string {
  const hasName = (name: string) => new RegExp(`\\b${name}\\b`).test(text);
  if (!hasName(base)) return base;
  let idx = 1;
  while (hasName(`${base}${idx}`)) idx += 1;
  return `${base}${idx}`;
}

function buildExtractVariableAction(
  text: string,
  uri: string,
  range: Range,
  selected: string
): CodeAction | null {
  const trimmed = selected.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\n')) return null;
  if (/^\s*(let|fn|struct|enum|type|import)\b/.test(trimmed)) return null;

  const lines = text.split(/\r?\n/);
  const lineText = lines[range.start.line] ?? '';
  const indent = (/^\s*/.exec(lineText)?.[0]) ?? '';
  const varName = findUniqueName(text, 'extracted');
  const declaration = `${indent}let ${varName} = ${trimmed};\n`;

  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [
        TextEdit.insert({ line: range.start.line, character: 0 }, declaration),
        TextEdit.replace(range, varName),
      ],
    },
  };

  return {
    title: `Extract to local '${varName}'`,
    kind: CodeActionKind.RefactorExtract,
    edit,
  };
}

function buildCollectionRewriteActions(uri: string, range: Range, snippet: string): CodeAction[] {
  const actions: CodeAction[] = [];

  // function-style -> method-style: vec.push(v, x) => v.push(x)
  const fnToMethod = /^(vec|hashmap|hashset)\.([a-zA-Z_][\w]*)\(\s*([a-zA-Z_][\w]*)\s*(?:,\s*([\s\S]*))?\)$/.exec(
    snippet
  );
  if (fnToMethod) {
    const methodArgs = (fnToMethod[4] ?? '').trim();
    const replacement = `${fnToMethod[3]}.${fnToMethod[2]}(${methodArgs})`;
    actions.push({
      title: 'Convert to method call syntax',
      kind: CodeActionKind.RefactorRewrite,
      edit: { changes: { [uri]: [TextEdit.replace(range, replacement)] } },
    });
  }

  // method-style -> function-style: v.push(x) => vec.push(v, x)
  const methodToFn = /^([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\(([\s\S]*)\)$/.exec(snippet);
  if (methodToFn) {
    const receiver = methodToFn[1];
    const method = methodToFn[2];
    const args = methodToFn[3].trim();
    const moduleCandidates = methodModules(method);
    for (const moduleName of moduleCandidates) {
      const replacement = `${moduleName}.${method}(${receiver}${args ? `, ${args}` : ''})`;
      actions.push({
        title: `Convert to function call syntax (${moduleName})`,
        kind: CodeActionKind.RefactorRewrite,
        edit: { changes: { [uri]: [TextEdit.replace(range, replacement)] } },
      });
    }
  }

  return actions;
}

function methodModules(method: string): string[] {
  const modules = new Set<string>();
  if (['push', 'get', 'len', 'pop', 'clear', 'map', 'filter', 'fold', 'for_each'].includes(method)) {
    modules.add('vec');
  }
  if (['insert', 'get', 'remove', 'contains_key', 'len', 'clear', 'keys', 'values'].includes(method)) {
    modules.add('hashmap');
  }
  if (['insert', 'contains', 'remove', 'len', 'clear', 'values'].includes(method)) {
    modules.add('hashset');
  }
  if (modules.size > 0) {
    return Array.from(modules);
  }
  return [];
}
