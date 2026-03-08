import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import {
  applyChangeTraitSignature,
  buildChangeTraitSignatureCodeAction,
  previewChangeTraitSignature,
} from '../src/lsp/refactor-change-trait-signature.js';
import type { ParamChange } from '../src/lsp/refactor-change-signature.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-change-trait-signature', name)).toString();
}

function parseProgram(source: string): LuminaProgram {
  return parser.parse(source) as LuminaProgram;
}

function positionAt(text: string, needle: string): { line: number; character: number } {
  const offset = text.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const prefix = text.slice(0, offset);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: offset - lineStart + 1 };
}

describe('LSP change trait signature refactor', () => {
  test('builds a change-signature action for trait methods', () => {
    const source = 'trait Shape {\n  fn area(scale: int) -> int {\n    return scale;\n  }\n}\n';
    const program = parseProgram(source);
    const pos = positionAt(source, 'area(scale');
    const action = buildChangeTraitSignatureCodeAction(source, makeUri('shape.lm'), { start: pos, end: pos }, program);
    expect(action).toBeTruthy();
    expect(action?.title).toContain("Change trait method signature of 'area'");
    expect(action?.kind).toBe('refactor.rewrite');
  });

  test('updates trait declarations, impl methods, and method calls across files', () => {
    const traitUri = makeUri('shape.lm');
    const implUri = makeUri('user.lm');
    const mainUri = makeUri('main.lm');
    const trait = 'trait Shape {\n  fn area(scale: int, factor: int) -> int {\n    return scale + factor;\n  }\n}\n';
    const impl = 'struct User {}\nimpl Shape for User {\n  fn area(scale: int, factor: int) -> int {\n    return scale + factor;\n  }\n}\n';
    const main = 'import { User } from "./user.lm";\nfn main() -> int {\n  let user = User {};\n  return user.area(1, 2);\n}\n';
    const allFiles = new Map([
      [traitUri, trait],
      [implUri, impl],
      [mainUri, main],
    ]);
    const allPrograms = new Map<string, LuminaProgram>([
      [traitUri, parseProgram(trait)],
      [implUri, parseProgram(impl)],
      [mainUri, parseProgram(main)],
    ]);
    const changes: ParamChange[] = [
      { kind: 'rename', index: 0, oldName: 'scale', newName: 'size' },
      { kind: 'reorder', fromIndex: 0, toIndex: 1 },
    ];

    const preview = previewChangeTraitSignature(
      {
        text: trait,
        uri: traitUri,
        position: positionAt(trait, 'area(scale'),
        allFiles,
        allPrograms,
      },
      changes,
      'Result<int,string>'
    );
    expect('error' in preview).toBe(false);
    if ('error' in preview) return;
    expect(preview.callSiteCount).toBe(1);
    expect(preview.fileCount).toBe(1);

    const result = applyChangeTraitSignature(
      {
        text: trait,
        uri: traitUri,
        position: positionAt(trait, 'area(scale'),
        allFiles,
        allPrograms,
      },
      changes,
      'Result<int,string>'
    );

    expect(result.ok).toBe(true);
    expect(result.edit?.changes?.[traitUri]?.some((edit) => edit.newText.includes('factor: int, size: int'))).toBe(true);
    expect(result.edit?.changes?.[traitUri]?.some((edit) => edit.newText === 'Result<int,string>')).toBe(true);
    expect(result.edit?.changes?.[implUri]?.some((edit) => edit.newText.includes('factor: int, size: int'))).toBe(true);
    expect(result.edit?.changes?.[implUri]?.some((edit) => edit.newText === 'size')).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText === '2, 1')).toBe(true);
  });
});
