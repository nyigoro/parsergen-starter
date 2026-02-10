import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { type SymbolTable } from '../lumina/semantic.js';

const keywordCompletions: CompletionItem[] = [
  'import', 'from', 'type', 'struct', 'enum', 'fn', 'let', 'return', 'if', 'else', 'for', 'while',
  'match', 'true', 'false',
].map((label) => ({ label, kind: CompletionItemKind.Keyword }));

const typeCompletions: CompletionItem[] = ['int', 'string', 'bool', 'void'].map((label) => ({
  label,
  kind: CompletionItemKind.TypeParameter,
}));

function getMemberChain(doc: TextDocument, line: number, character: number): string[] | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  if (offset <= 0) return null;
  const head = text.slice(0, offset);
  const match = /([A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\))?(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\))?)*)\s*\.$/m.exec(head);
  if (!match) return null;
  return match[1].split('.').map((part) => part.trim()).filter(Boolean);
}

function locationContains(location: { start: { line: number; column: number }; end: { line: number; column: number } }, pos: { line: number; column: number }): boolean {
  if (pos.line < location.start.line || pos.line > location.end.line) return false;
  if (pos.line === location.start.line && pos.column < location.start.column) return false;
  if (pos.line === location.end.line && pos.column > location.end.column) return false;
  return true;
}

function locationStartsBefore(location: { start: { line: number; column: number } }, pos: { line: number; column: number }): boolean {
  if (location.start.line < pos.line) return true;
  if (location.start.line === pos.line && location.start.column <= pos.column) return true;
  return false;
}

function findLocalBindingType(
  program: unknown,
  pos: { line: number; character: number },
  target: string
): string | null {
  if (!program || typeof program !== 'object' || (program as { type?: string }).type !== 'Program') return null;
  const locPos = { line: pos.line + 1, column: pos.character + 1 };
  const body = (program as { body?: unknown[] }).body;
  if (!Array.isArray(body)) return null;
  for (const stmt of body) {
    const fn = stmt as { type?: string; params?: Array<{ name: string; typeName: string; location?: { start: { line: number; column: number }; end: { line: number; column: number } } }>; body?: { body?: unknown[]; location?: { start: { line: number; column: number }; end: { line: number; column: number } } } };
    if (fn.type !== 'FnDecl' || !fn.body?.location) continue;
    if (!locationContains(fn.body.location, locPos)) continue;
    if (fn.params) {
      for (const param of fn.params) {
        if (param.name !== target || !param.location) continue;
        if (locationContains(param.location, locPos)) return param.typeName;
      }
    }
    let found: string | null = null;
    const walkStmt = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const stmtNode = node as {
        type?: string;
        name?: string;
        typeName?: string;
        location?: { start: { line: number; column: number }; end: { line: number; column: number } };
        body?: unknown[];
        thenBlock?: { body?: unknown[] };
        elseBlock?: { body?: unknown[] };
      };
      if (stmtNode.type === 'Let' && stmtNode.name === target && stmtNode.typeName && stmtNode.location) {
        if (locationStartsBefore(stmtNode.location, locPos)) {
          found = stmtNode.typeName;
        }
      }
      if (stmtNode.type === 'Block' && Array.isArray(stmtNode.body)) {
        stmtNode.body.forEach(walkStmt);
      }
      if (stmtNode.type === 'If') {
        stmtNode.thenBlock?.body?.forEach(walkStmt);
        stmtNode.elseBlock?.body?.forEach(walkStmt);
      }
      if (stmtNode.type === 'While') {
        const whileNode = stmtNode as { body?: { body?: unknown[] } };
        whileNode.body?.body?.forEach(walkStmt);
      }
      if (stmtNode.type === 'MatchStmt') {
        const matchNode = stmtNode as { arms?: Array<{ body?: { body?: unknown[] } }> };
        matchNode.arms?.forEach((arm) => arm.body?.body?.forEach(walkStmt));
      }
    };
    fn.body.body?.forEach(walkStmt);
    return found;
  }
  return null;
}

export function buildCompletionItems(options: {
  doc: TextDocument;
  position: { line: number; character: number };
  symbols?: SymbolTable;
  ast?: unknown;
}): CompletionItem[] {
  const { doc, position, symbols, ast } = options;
  if (symbols) {
    const chain = getMemberChain(doc, position.line, position.character);
    if (chain && chain.length > 0) {
      const stripCall = (segment: string) => segment.replace(/\(\s*\)$/, '');
      const isCall = (segment: string) => /\(\s*\)$/.test(segment);
      let typeName = symbols.get(stripCall(chain[0]))?.type ?? null;
      if (!typeName && ast) {
        typeName = findLocalBindingType(ast, position, stripCall(chain[0]));
      }
      for (let i = 1; i < chain.length && typeName; i++) {
        const segment = chain[i];
        const name = stripCall(segment);
        if (isCall(segment)) {
          const fnSym = symbols.get(name);
          if (fnSym?.kind === 'function' && fnSym.type) {
            typeName = fnSym.type;
            continue;
          }
          const baseType = typeName.split('<')[0]?.trim() ?? typeName;
          const methodSym = symbols.get(`${baseType}_${name}`);
          if (methodSym?.kind === 'function' && methodSym.type) {
            typeName = methodSym.type;
            continue;
          }
          typeName = null;
          break;
        }
        const baseType = typeName.split('<')[0]?.trim() ?? typeName;
        const structSym = symbols.get(baseType);
        const fields = structSym?.structFields;
        if (!fields) {
          typeName = null;
          break;
        }
        const nextType = fields.get(name);
        typeName = nextType ?? null;
      }
      if (typeName) {
        const baseType = typeName.split('<')[0]?.trim() ?? typeName;
        const structSym = symbols.get(baseType);
        const fields = structSym?.structFields;
        if (fields && fields.size > 0) {
          return Array.from(fields.keys()).map((label) => ({
            label,
            kind: CompletionItemKind.Field,
          }));
        }
      }
    }
  }

  const items: CompletionItem[] = [...keywordCompletions, ...typeCompletions];
  const list = symbols?.list() ?? [];
  for (const sym of list) {
    let kind: CompletionItemKind = CompletionItemKind.Variable;
    if (sym.kind === 'function') kind = CompletionItemKind.Function;
    if (sym.kind === 'type') kind = CompletionItemKind.Class;
    items.push({ label: sym.name, kind });
  }
  return items;
}
