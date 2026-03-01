import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('method syntax', () => {
  it('supports Vec method calls', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('supports rich Vec iterator method calls', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = [1, 2, 3, 4, 5];
        let _any = v.any(|x| x > 3);
        let _all = v.all(|x| x > 0);
        let _find = v.find(|x| x % 2 == 0);
        let _pos = v.position(|x| x == 3);
        let _zip = v.zip([10, 20, 30]);
        let _enum = v.enumerate();
        let _take = v.take(3);
        let _skip = v.skip(2);
        v.fold(0, |acc, x| acc + x)
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

  it('supports HashMap method calls', () => {
    const source = `
      import { hashmap } from "@std";

      fn main() -> i32 {
        let m: HashMap<string, i32> = hashmap.new();
        m.insert("alice", 30);
        m.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('infers receiver method call types in HM', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const inferred = inferProgram(ast);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('emits receiver call syntax in AST JS codegen', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('v.push(4);');
    expect(js).toContain('v.len();');
  });

  it('supports thread.spawn task handles and join method', () => {
    const source = `
      import { thread } from "@std";

      fn worker(id: i32) -> i32 {
        return id * 2;
      }

      async fn main() -> i32 {
        let handle = thread.spawn(|| worker(42));
        let _joined = await handle.join();
        0
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

  it('supports multiple thread handles with Vec method syntax', () => {
    const source = `
      import { thread } from "@std";

      fn worker(id: i32) -> i32 {
        return id * 2;
      }

      async fn main() -> i32 {
        let h0 = thread.spawn(|| worker(0));
        let h1 = thread.spawn(|| worker(1));
        let h2 = thread.spawn(|| worker(2));
        let h3 = thread.spawn(|| worker(3));

        let _r0 = await h0.join();
        let _r1 = await h1.join();
        let _r2 = await h2.join();
        let _r3 = await h3.join();
        4
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

  it('supports Sender/Receiver method syntax for MPSC channels', () => {
    const source = `
      import { channel } from "@std";

      async fn main() -> i32 {
        let ch = channel.new<i32>();
        let tx = ch.sender;
        let rx = ch.receiver;
        let tx2 = tx.clone();

        let _ok0 = await tx.send(1);
        let _ok1 = await tx2.send(2);
        tx.close();
        tx2.close();

        let _a = await rx.recv();
        let _b = await rx.recv();
        0
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

  it('supports deque/btreemap/btreeset/priority_queue method syntax', () => {
    const source = `
      import { deque, btreemap, btreeset, priority_queue } from "@std";

      fn main() -> i32 {
        let d: Deque<i32> = deque.new();
        d.push_front(1);
        d.push_back(2);
        let _pf = d.pop_front();
        let _pb = d.pop_back();

        let m: BTreeMap<i32, string> = btreemap.new();
        m.insert(3, "c");
        m.insert(1, "a");
        m.insert(2, "b");
        let _mv = m.get(2);
        let _me = m.entries();

        let s: BTreeSet<i32> = btreeset.new();
        s.insert(3);
        s.insert(1);
        s.insert(2);
        let _sv = s.values();

        let q: PriorityQueue<i32> = priority_queue.new();
        q.push(5);
        q.push(1);
        q.push(3);
        let _qp = q.peek();
        let _qv = q.pop();

        0
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

  it('supports channel closing and result-oriented sender/receiver methods', () => {
    const source = `
      import { channel } from "@std";

      async fn main() -> i32 {
        let ch = channel.new<i32>();
        let tx = ch.sender;
        let rx = ch.receiver;
        let _send = tx.send_result(1);
        tx.drop();
        let _closed = tx.is_closed();
        let _recv = await rx.recv_result();
        rx.close();
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
