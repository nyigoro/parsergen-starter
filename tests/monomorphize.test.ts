import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram, LuminaStatement } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeSource = (source: string) => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never);
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  const mono = monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
  return { ast, mono };
};

const collectFnNames = (program: LuminaProgram): string[] =>
  program.body.filter((stmt): stmt is LuminaStatement & { type: 'FnDecl' } => stmt.type === 'FnDecl').map((fn) => fn.name);

type CallInfo = { callee: string; enumName?: string | null };

const collectCalls = (node: unknown, acc: CallInfo[] = []): CallInfo[] => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => collectCalls(child, acc));
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Call') {
    const callee = (obj.callee as { name?: string } | undefined)?.name ?? '';
    const enumName = obj.enumName as string | null | undefined;
    acc.push({ callee, enumName });
  }
  for (const value of Object.values(obj)) {
    collectCalls(value, acc);
  }
  return acc;
};

const extractFunction = (program: LuminaProgram, name: string) =>
  program.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === name) as
    | (LuminaStatement & { type: 'FnDecl' })
    | undefined;

describe('Monomorphization', () => {
  describe('Basic specialization', () => {
    it('specializes generic identity function', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() {
          let a = identity(42);
          let b = identity("hello");
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toEqual(expect.arrayContaining(['identity', 'identity_int', 'identity_string']));
    });

    it('handles multiple type parameters', () => {
      const source = `
        struct Pair<A, B> { first: A, second: B }
        fn pair<A, B>(a: A, b: B) -> Pair<A, B> { return Pair { first: a, second: b }; }
        fn main() {
          let p = pair(1, "x");
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('pair_int_string');
    });

    it('preserves original generic function', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() { return identity(1); }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('identity');
      expect(names).toContain('identity_int');
    });
  });

  describe('Call site rewriting', () => {
    it('rewrites call sites to specialized names', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() {
          let a = identity(42);
          return a;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const calls = collectCalls(mono).filter((call) => !call.enumName).map((call) => call.callee);
      expect(calls).toContain('identity_int');
      expect(calls).not.toContain('identity');
    });

    it('handles multiple calls with different type args', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() {
          let a = identity(42);
          let b = identity("hello");
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const calls = collectCalls(mono).filter((call) => !call.enumName).map((call) => call.callee);
      expect(calls).toContain('identity_int');
      expect(calls).toContain('identity_string');
    });

    it('does not rewrite qualified calls (enum/module)', () => {
      const source = `
        enum Option<T> { Some(T), None }
        fn wrap<T>(x: T) -> Option<T> { return Option.Some(x); }
        fn main() {
          let o = Option.Some(1);
          let w = wrap(Option.Some(2));
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const calls = collectCalls(mono).filter((call) => call.enumName === 'Option');
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.callee).toBe('Some');
      }
    });
  });

  describe('Complex types', () => {
    it('works with nested generics (Option<Option<int>>)', () => {
      const source = `
        enum Option<T> { Some(T), None }
        fn wrap<T>(x: T) -> Option<T> { return Option.Some(x); }
        fn main() {
          let o = wrap(Option.Some(42));
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('wrap_Option_int');
    });

    it('works with ADT type arguments', () => {
      const source = `
        enum Result<T, E> { Ok(T), Err(E) }
        fn ok<T, E>(x: T) -> Result<T, E> { return Result.Ok(x); }
        fn main() {
          let r = ok(1);
          return 0;
        }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names.some((name) => name.startsWith('ok_int'))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles recursive generic functions', () => {
      const source = `
        fn loop<T>(x: T) -> T { return loop(x); }
        fn main() { return loop(1); }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('loop_int');
      const calls = collectCalls(mono).filter((call) => !call.enumName).map((call) => call.callee);
      expect(calls).toContain('loop_int');
    });

    it('handles unused type parameters', () => {
      const source = `
        fn id2<T, U>(x: T) -> T { return x; }
        fn main() { return id2(1); }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('id2_int');
    });

    it('handles generic functions with no calls (no specialization)', () => {
      const source = `
        fn unused<T>(x: T) -> T { return x; }
        fn main() { return 1; }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const names = collectFnNames(mono);
      expect(names).toContain('unused');
      expect(names.some((name) => name.startsWith('unused_'))).toBe(false);
    });
  });

  describe('Integration', () => {
    it('monomorphized code compiles and runs correctly', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() { return identity(41) + 1; }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const { code } = generateJSFromAst(mono, { includeRuntime: false, target: 'cjs' });
      const module = { exports: {} as Record<string, unknown> };
      const result = new Function('module', `${code}; return typeof main === "function" ? main() : null;`)(module);
      expect(result).toBe(42);
    });

    it('generated specialized functions have correct types', () => {
      const source = `
        fn identity<T>(x: T) -> T { return x; }
        fn main() { return identity(42); }
      `.trim() + '\n';

      const { mono } = monomorphizeSource(source);
      const specialized = extractFunction(mono, 'identity_int');
      expect(specialized).toBeDefined();
      if (!specialized) return;
      const paramType = specialized.params[0]?.typeName;
      expect(paramType).toBe('int');
      expect(specialized.returnType).toBe('int');
    });
  });
});
