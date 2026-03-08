import { CodeAction, CodeActionKind, TextEdit, type Range, type WorkspaceEdit } from 'vscode-languageserver/node';
import { offsetAt, positionAt } from './ast-utils.js';

export interface InlineEligibility {
  eligible: boolean;
  reason?: string;
}

function isPureInitializer(initializer: string): boolean {
  const trimmed = initializer.trim();
  if (!trimmed) return false;
  if (/await\b/.test(trimmed)) return false;
  if (/[;=]/.test(trimmed)) return false;
  if (/\b(new|throw|panic)\b/.test(trimmed)) return false;
  if (/[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(trimmed)) return false;
  // Conservative purity check: literals, identifiers, and arithmetic/boolean compositions.
  return /^[A-Za-z0-9_(){}<>+\-*/%!&|.,\s"'`]+$/.test(trimmed);
}

function findBinding(text: string, name: string): { line: number; start: number; end: number; initializer: string; mutable: boolean } | null {
  const lines = text.split(/\r?\n/);
  const pattern = new RegExp(`^\\s*let\\s+(mut\\s+)?${name}\\s*=\\s*(.+);\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const m = pattern.exec(lines[i]);
    if (!m) continue;
    const lineStart = offsetAt(text, { line: i, character: 0 });
    return {
      line: i,
      start: lineStart,
      end: lineStart + lines[i].length + 1,
      initializer: m[2],
      mutable: Boolean(m[1]),
    };
  }
  return null;
}

function findWordReferences(text: string, name: string): Array<{ start: number; end: number }> {
  const refs: Array<{ start: number; end: number }> = [];
  const re = new RegExp(`\\b${name}\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    refs.push({ start: match.index, end: match.index + name.length });
  }
  return refs;
}

export function canInlineVariable(text: string, name: string): InlineEligibility {
  const binding = findBinding(text, name);
  if (!binding) return { eligible: false, reason: `No let-binding found for '${name}'.` };
  if (binding.mutable) return { eligible: false, reason: 'Mutable bindings are not eligible for inline.' };
  const refs = findWordReferences(text, name).filter((ref) => ref.start < binding.start || ref.start >= binding.end);
  if (refs.length <= 1) return { eligible: true };
  if (isPureInitializer(binding.initializer)) return { eligible: true };
  return { eligible: false, reason: 'Initializer is not pure and binding is used multiple times.' };
}

export function buildInlineVariableCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const selected = text.slice(offsetAt(text, range.start), offsetAt(text, range.end)).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(selected)) return null;
  const binding = findBinding(text, selected);
  if (!binding) return null;
  const eligibility = canInlineVariable(text, selected);
  if (!eligibility.eligible) return null;

  const refs = findWordReferences(text, selected).filter((ref) => ref.start < binding.start || ref.start >= binding.end);
  const initializerRaw = binding.initializer.trim();
  const needsParens = /[+\-*/%]|&&|\|\|/.test(initializerRaw) && !/^\(.*\)$/.test(initializerRaw);
  const replacement = needsParens ? `(${initializerRaw})` : initializerRaw;

  const edits: TextEdit[] = [];
  for (const ref of refs) {
    edits.push(
      TextEdit.replace(
        {
          start: positionAt(text, ref.start),
          end: positionAt(text, ref.end),
        },
        replacement
      )
    );
  }
  edits.push(
    TextEdit.del({
      start: positionAt(text, binding.start),
      end: positionAt(text, binding.end),
    })
  );

  const workspaceEdit: WorkspaceEdit = { changes: { [uri]: edits } };
  return {
    title: `Inline variable '${selected}'`,
    kind: CodeActionKind.RefactorInline,
    edit: workspaceEdit,
  };
}
