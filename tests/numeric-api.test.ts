import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { createStdModuleRegistry } from '../src/lumina/module-registry.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Numeric API unification', () => {
  it('registers unified overloaded math functions', () => {
    const registry = createStdModuleRegistry();
    const math = registry.get('@std/math');
    expect(math?.kind).toBe('module');
    if (!math || math.kind !== 'module') return;

    const abs = math.exports.get('abs');
    const min = math.exports.get('min');
    const max = math.exports.get('max');
    const pow = math.exports.get('pow');

    expect(abs?.kind).toBe('overloaded-function');
    expect(min?.kind).toBe('overloaded-function');
    expect(max?.kind).toBe('overloaded-function');
    expect(pow?.kind).toBe('overloaded-function');

    if (abs?.kind === 'overloaded-function') {
      expect(abs.variants).toHaveLength(2);
    }
    if (pow?.kind === 'overloaded-function') {
      expect(pow.variants).toHaveLength(2);
    }
  });

  it('keeps float alias names with deprecation metadata', () => {
    const registry = createStdModuleRegistry();
    const math = registry.get('@std/math');
    expect(math?.kind).toBe('module');
    if (!math || math.kind !== 'module') return;

    const absf = math.exports.get('absf');
    const minf = math.exports.get('minf');
    const maxf = math.exports.get('maxf');
    const powf = math.exports.get('powf');

    expect(absf?.kind).toBe('function');
    expect(minf?.kind).toBe('function');
    expect(maxf?.kind).toBe('function');
    expect(powf?.kind).toBe('function');

    if (absf?.kind === 'function') expect(absf.deprecatedMessage).toBeTruthy();
    if (minf?.kind === 'function') expect(minf.deprecatedMessage).toBeTruthy();
    if (maxf?.kind === 'function') expect(maxf.deprecatedMessage).toBeTruthy();
    if (powf?.kind === 'function') expect(powf.deprecatedMessage).toBeTruthy();
  });

  it('type-checks unified abs/min/max/pow across int and float', () => {
    const source = `
      import * as math from "@std/math";

      fn ints() -> i32 {
        let a = math.abs(0 - 5);
        let b = math.min(7, 3);
        let c = math.max(7, 3);
        return math.pow(a + b, 2) + c;
      }

      fn floats() -> f64 {
        let a = math.abs(0.0 - 2.5);
        let b = math.min(7.5, 3.5);
        let c = math.max(7.5, 3.5);
        return math.pow(a + b, 2.0) + c;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);
  });

  it('runtime math methods are unified and aliases still execute', async () => {
    jest.resetModules();
    const { math } = await import('../src/lumina-runtime.js');

    expect(math.abs(-5)).toBe(5);
    expect(math.abs(-2.5)).toBe(2.5);
    expect(math.min(1.5, 2.5)).toBe(1.5);
    expect(math.max(1.5, 2.5)).toBe(2.5);
    expect(math.pow(2, 3)).toBe(8);
    expect(math.powf(2.5, 2)).toBeCloseTo(6.25, 10);
    expect(math.absf(-2.5)).toBe(2.5);
  });
});
