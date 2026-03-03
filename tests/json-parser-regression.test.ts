import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('json parser regression', () => {
  it('keeps brace literals from breaking match-arm scopes', () => {
    const sourcePath = path.resolve(__dirname, '../examples/json-parser/json-parser.lm');
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);

    const unknownC = sem.diagnostics.filter(
      (diag) => diag.code === 'UNKNOWN_IDENTIFIER' && diag.message.includes("'c'")
    );
    expect(unknownC).toHaveLength(0);

    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'token_name');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;

    const matchStmt = fnDecl.body.body.find((stmt) => stmt.type === 'MatchStmt');
    expect(matchStmt?.type).toBe('MatchStmt');
    if (!matchStmt || matchStmt.type !== 'MatchStmt') return;

    const variants = matchStmt.arms
      .map((arm) => (arm.pattern.type === 'EnumPattern' ? arm.pattern.variant : null))
      .filter((variant): variant is string => variant !== null);
    expect(variants).toContain('LeftBrace');
    expect(variants).toContain('RightBrace');
  });
});
