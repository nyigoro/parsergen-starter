import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../../src/grammar/index.js';
import type { LuminaProgram } from '../../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar, { cache: true });

export const parseLuminaProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;
export const parseLumina = <T = unknown>(source: string): T => parser.parse(source) as T;
