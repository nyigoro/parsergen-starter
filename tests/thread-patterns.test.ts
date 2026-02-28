import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('thread patterns', () => {
  it('supports parallel fibonacci pattern', () => {
    const source = `
      import { thread, Result } from "@std";

      fn fib(n: i32) -> i32 {
        if (n <= 1) {
          n
        } else {
          fib(n - 1) + fib(n - 2)
        }
      }

      async fn main() -> i32 {
        let n0 = 10;
        let n1 = 11;
        let n2 = 12;
        let n3 = 13;

        let h0 = thread.spawn(move || fib(n0));
        let h1 = thread.spawn(move || fib(n1));
        let h2 = thread.spawn(move || fib(n2));
        let h3 = thread.spawn(move || fib(n3));

        let r0 = await h0.join();
        let r1 = await h1.join();
        let r2 = await h2.join();
        let r3 = await h3.join();

        let v0: i32 = Result.unwrap_or(0, r0);
        let v1: i32 = Result.unwrap_or(0, r1);
        let v2: i32 = Result.unwrap_or(0, r2);
        let v3: i32 = Result.unwrap_or(0, r3);
        v0 + v1 + v2 + v3
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('supports worker pool style fan-out/fan-in pattern', () => {
    const source = `
      import { thread, Result } from "@std";

      fn worker(a: i32, b: i32, c: i32, d: i32) -> i32 {
        (a * a) + (b * b) + (c * c) + (d * d)
      }

      async fn main() -> i32 {
        let h0 = thread.spawn(|| worker(1, 3, 5, 7));
        let h1 = thread.spawn(|| worker(2, 4, 6, 8));

        let r0 = await h0.join();
        let r1 = await h1.join();

        let total0: i32 = Result.unwrap_or(0, r0);
        let total1: i32 = Result.unwrap_or(0, r1);
        total0 + total1
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('supports thread error handling pattern', () => {
    const source = `
      import { thread, Result } from "@std";

      async fn main() -> i32 {
        let spawned = await thread.spawn_worker("./missing-worker.mjs");
        if (Result.is_err(spawned)) {
          1
        } else {
          0
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('supports producer/consumer integration with thread + channel', () => {
    const source = `
      import { thread, channel, Option, Result } from "@std";

      fn produce(tx: Sender<i32>, start: i32, end: i32) -> i32 {
        let mut i = start;
        while (i < end) {
          let _ok = tx.try_send(i);
          i = i + 1;
        }
        tx.close();
        0
      }

      async fn consume(rx: Receiver<i32>, expected: i32) -> i32 {
        let mut total = 0;
        let mut count = 0;
        while (count < expected) {
          let next = await rx.recv();
          let value: i32 = Option.unwrap_or(0, next);
          total = total + value;
          count = count + 1;
        }
        rx.close();
        total
      }

      async fn main() -> i32 {
        let ch = channel.bounded<i32>(4);
        let tx = ch.sender;
        let rx = ch.receiver;

        let tx1 = tx.clone();
        let tx2 = tx.clone();
        tx.close();

        let p1 = thread.spawn(move || produce(tx1, 0, 5));
        let p2 = thread.spawn(move || produce(tx2, 5, 10));

        let total = await consume(rx, 10);
        let _j1: i32 = Result.unwrap_or(0, await p1.join());
        let _j2: i32 = Result.unwrap_or(0, await p2.join());
        total
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });
});
