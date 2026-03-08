import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import {
  applyChangeReturnType,
  buildChangeReturnTypeCodeAction,
  previewChangeReturnType,
} from '../src/lsp/refactor-change-return-type.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-change-return-type', name)).toString();
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

describe('LSP change return type refactor', () => {
  test('builds a code action for function return type changes', () => {
    const source = 'pub fn compute() -> int { return 1; }\n';
    const program = parseProgram(source);
    const pos = positionAt(source, 'compute');
    const action = buildChangeReturnTypeCodeAction(source, makeUri('utils.lm'), { start: pos, end: pos }, program);
    expect(action).toBeTruthy();
    expect(action?.title).toContain("Change return type of 'compute'");
    expect(action?.kind).toBe('refactor.rewrite');
  });

  test('previews and applies Result propagation conservatively with try insertion', () => {
    const utilsUri = makeUri('result-utils.lm');
    const mainUri = makeUri('result-main.lm');
    const utils = 'pub fn compute() -> int { return 1; }\n';
    const main = 'import { compute } from "./result-utils.lm";\nfn main() -> Result<int,string> { let value = compute(); return Result.Ok(value); }\n';
    const allFiles = new Map([
      [utilsUri, utils],
      [mainUri, main],
    ]);
    const allPrograms = new Map<string, LuminaProgram>([
      [utilsUri, parseProgram(utils)],
      [mainUri, parseProgram(main)],
    ]);

    const preview = previewChangeReturnType(
      {
        text: utils,
        uri: utilsUri,
        position: positionAt(utils, 'compute'),
        allFiles,
        allPrograms,
      },
      'Result<int,string>'
    );

    expect('error' in preview).toBe(false);
    if ('error' in preview) return;
    expect(preview.callSiteCount).toBe(1);
    expect(preview.fileCount).toBe(1);

    const result = applyChangeReturnType(
      {
        text: utils,
        uri: utilsUri,
        position: positionAt(utils, 'compute'),
        allFiles,
        allPrograms,
      },
      'Result<int,string>'
    );

    expect(result.ok).toBe(true);
    expect(result.edit?.changes?.[utilsUri]?.some((edit) => edit.newText === 'Result<int,string>')).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText === 'compute()?')).toBe(true);
  });

  test('rewrites callers for non-value-preserving return type changes', () => {
    const utilsUri = makeUri('void-utils.lm');
    const mainUri = makeUri('void-main.lm');
    const utils = 'pub fn compute() -> int { return 1; }\n';
    const main = 'import { compute } from "./void-utils.lm";\nfn main() -> int { let value = compute(); return value; }\n';
    const voidResult = applyChangeReturnType(
      {
        text: utils,
        uri: utilsUri,
        position: positionAt(utils, 'compute'),
        allFiles: new Map([
          [utilsUri, utils],
          [mainUri, main],
        ]),
        allPrograms: new Map<string, LuminaProgram>([
          [utilsUri, parseProgram(utils)],
          [mainUri, parseProgram(main)],
        ]),
      },
      'void'
    );
    expect(voidResult.ok).toBe(true);
    expect(voidResult.edit?.changes?.[utilsUri]?.some((edit) => edit.newText === 'void')).toBe(true);
    expect(voidResult.edit?.changes?.[mainUri]?.some((edit) => edit.newText === 'compute();')).toBe(true);

    const voidSourceUri = makeUri('from-void-utils.lm');
    const voidCallerUri = makeUri('from-void-main.lm');
    const fromVoid = 'pub fn compute() { io.print("ok"); }\n';
    const caller = 'import { compute } from "./from-void-utils.lm";\nfn main() { compute(); }\n';
    const valueResult = applyChangeReturnType(
      {
        text: fromVoid,
        uri: voidSourceUri,
        position: positionAt(fromVoid, 'compute'),
        allFiles: new Map([
          [voidSourceUri, fromVoid],
          [voidCallerUri, caller],
        ]),
        allPrograms: new Map<string, LuminaProgram>([
          [voidSourceUri, parseProgram(fromVoid)],
          [voidCallerUri, parseProgram(caller)],
        ]),
      },
      'int'
    );
    expect(valueResult.ok).toBe(true);
    expect(valueResult.edit?.changes?.[voidCallerUri]?.some((edit) => edit.newText === 'let _ = compute();')).toBe(true);
  });
});
