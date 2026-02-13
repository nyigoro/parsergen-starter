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
  }>
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

  return actions;
}
