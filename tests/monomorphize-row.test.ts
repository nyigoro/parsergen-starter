import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { normalizeTypeName, type Type } from '../src/lumina/types.js';
import type { LuminaProgram, LuminaStatement } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeWithRows = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never, { useRowPolymorphism: true });
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  return monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
};

const collectFnNames = (program: LuminaProgram): string[] =>
  program.body
    .filter((stmt): stmt is LuminaStatement & { type: 'FnDecl' } => stmt.type === 'FnDecl')
    .map((fn) => fn.name);

describe('Row-aware monomorphization', () => {
  it('handles recursive row shapes in canonical normalization', () => {
    const recA = { kind: 'row', fields: new Map<string, Type>(), tail: null as Type | null } as Type;
    if (recA.kind === 'row') {
      recA.fields.set('name', { kind: 'primitive', name: 'string' });
      recA.fields.set('next', recA);
      recA.tail = recA;
    }

    const recB = { kind: 'row', fields: new Map<string, Type>(), tail: null as Type | null } as Type;
    if (recB.kind === 'row') {
      recB.fields.set('next', recB);
      recB.fields.set('name', { kind: 'primitive', name: 'string' });
      recB.tail = recB;
    }

    expect(() => normalizeTypeName(recA)).not.toThrow();
    expect(normalizeTypeName(recA)).toBe(normalizeTypeName(recB));
  });

  it('normalizes row field order canonically for specialization keys', () => {
    const rowA: Type = {
      kind: 'row',
      fields: new Map<string, Type>([
        ['name', { kind: 'primitive', name: 'string' }],
        ['age', { kind: 'primitive', name: 'i32' }],
      ]),
      tail: null,
    };
    const rowB: Type = {
      kind: 'row',
      fields: new Map<string, Type>([
        ['age', { kind: 'primitive', name: 'i32' }],
        ['name', { kind: 'primitive', name: 'string' }],
      ]),
      tail: null,
    };

    expect(normalizeTypeName(rowA)).toBe(normalizeTypeName(rowB));
  });

  it('emits distinct specializations for different row shapes', () => {
    const source = `
      fn id<T>(x: T) -> T { return x; }
      fn main() -> i32 {
        let by_name = id(|u| u.name);
        let by_title = id(|p| p.title);
        return 0;
      }
    `.trim() + '\n';

    const mono = monomorphizeWithRows(source);
    const idSpecializations = collectFnNames(mono).filter((name) => name.startsWith('id_'));

    expect(idSpecializations).toHaveLength(2);
    expect(idSpecializations.every((name) => !/any/i.test(name))).toBe(true);
  });

  it('deduplicates specializations for equivalent row shapes', () => {
    const source = `
      fn id<T>(x: T) -> T { return x; }
      fn main() -> i32 {
        let by_name_1 = id(|u| u.name);
        let by_name_2 = id(|x| x.name);
        return 0;
      }
    `.trim() + '\n';

    const mono = monomorphizeWithRows(source);
    const idSpecializations = collectFnNames(mono).filter((name) => name.startsWith('id_'));

    expect(idSpecializations).toHaveLength(1);
    expect(idSpecializations[0]).not.toMatch(/any/i);
  });

  it('keeps row types out of any-bucket in wasm monomorphized output', () => {
    const source = `
      import { vec } from "@std";

      struct User { name: string, age: i32 }

      fn keep_mapper<T>(f: T) -> T { return f; }

      fn pluck_names<T>(items: Vec<T>) -> Vec<string> {
        return vec.map(items, keep_mapper(|item| item.name));
      }

      fn main() -> i32 {
        let users = vec.new();
        vec.push(users, User { name: "Ada", age: 37 });
        let names = pluck_names(users);
        return vec.len(names);
      }
    `.trim() + '\n';

    const mono = monomorphizeWithRows(source);
    const wasmReady: LuminaProgram = {
      ...mono,
      body: mono.body.filter((stmt) => !(stmt.type === 'FnDecl' && (stmt.typeParams?.length ?? 0) > 0)),
    };
    const result = generateWATFromAst(wasmReady, { exportMain: true });
    expect(result.wat).toMatch(/\(func \$keep_mapper_/);
    expect(result.wat).not.toMatch(/\(func \$keep_mapper_[^\s)]*any/i);
  });
});
