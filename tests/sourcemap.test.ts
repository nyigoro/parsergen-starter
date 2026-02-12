import { SourceMapConsumer } from 'source-map';
import { generateJS } from '../src/lumina/codegen.js';
import type { IRProgram, IRNode } from '../src/lumina/ir.js';

type Location = {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

const loc = (line: number, column: number): Location => ({
  start: { line, column, offset: 0 },
  end: { line, column, offset: 0 },
});

const program = (body: IRNode[]): IRProgram => ({ kind: 'Program', body, location: loc(1, 1) });

describe('IR source maps (column-accurate)', () => {
  it('emits multiple mappings on the same line for chained calls', async () => {
    const ir = program([
      {
        kind: 'ExprStmt',
        location: loc(1, 1),
        expr: {
          kind: 'Call',
          callee: 'g',
          args: [
            {
              kind: 'Call',
              callee: 'f',
              args: [{ kind: 'Identifier', name: 'x', location: loc(1, 5) }],
              location: loc(1, 3),
            },
            { kind: 'Identifier', name: 'y', location: loc(1, 10) },
          ],
          location: loc(1, 1),
        },
      },
    ]);

    const { code, map } = generateJS(ir, { sourceMap: true, sourceFile: 'test.lm' });
    expect(map).toBeDefined();

    const columnsByLine = new Map<number, Set<number>>();
    await SourceMapConsumer.with(map!, null, (consumer) => {
      consumer.eachMapping((m) => {
        if (m.source !== 'test.lm' || m.originalLine !== 1) return;
        const set = columnsByLine.get(m.generatedLine) ?? new Set<number>();
        set.add(m.generatedColumn);
        columnsByLine.set(m.generatedLine, set);
      });
    });

    const hasMultiColumnLine = Array.from(columnsByLine.values()).some((cols) => cols.size >= 2);
    expect(code.length).toBeGreaterThan(0);
    expect(hasMultiColumnLine).toBe(true);
  });

  it('maps nested expressions to the correct generated column', async () => {
    const ir = program([
      {
        kind: 'ExprStmt',
        location: loc(2, 1),
        expr: {
          kind: 'Binary',
          op: '+',
          left: { kind: 'Identifier', name: 'a', location: loc(2, 1) },
          right: {
            kind: 'Binary',
            op: '*',
            left: { kind: 'Identifier', name: 'b', location: loc(2, 5) },
            right: { kind: 'Identifier', name: 'c', location: loc(2, 9) },
            location: loc(2, 5),
          },
          location: loc(2, 1),
        },
      },
    ]);

    const { code, map } = generateJS(ir, { sourceMap: true, sourceFile: 'test.lm' });
    expect(map).toBeDefined();

    const lines = code.split('\n');
    const lineIndex = lines.findIndex((line) => line.includes('(b * c)'));
    expect(lineIndex).toBeGreaterThanOrEqual(0);
    const expectedColumn = lines[lineIndex].indexOf('(b * c)');
    expect(expectedColumn).toBeGreaterThanOrEqual(0);

    await SourceMapConsumer.with(map!, null, (consumer) => {
      const pos = consumer.generatedPositionFor({
        source: 'test.lm',
        line: 2,
        column: 4,
        bias: SourceMapConsumer.GREATEST_LOWER_BOUND,
      });
      expect(pos.line).toBe(lineIndex + 1);
      expect(pos.column).toBe(expectedColumn);
    });
  });

  it('does not desync line numbers when strings contain escapes', async () => {
    const ir = program([
      {
        kind: 'Let',
        name: 's',
        value: { kind: 'String', value: 'a\nb', location: loc(1, 9) },
        location: loc(1, 1),
      },
      {
        kind: 'Let',
        name: 'n',
        value: { kind: 'Number', value: 1, location: loc(2, 9) },
        location: loc(2, 1),
      },
    ]);

    const { code, map } = generateJS(ir, { sourceMap: true, sourceFile: 'test.lm' });
    expect(map).toBeDefined();

    const lines = code.split('\n');
    const lineIndex = lines.findIndex((line) => line.includes('let n ='));
    expect(lineIndex).toBeGreaterThanOrEqual(0);

    await SourceMapConsumer.with(map!, null, (consumer) => {
      const pos = consumer.generatedPositionFor({
        source: 'test.lm',
        line: 2,
        column: 0,
        bias: SourceMapConsumer.GREATEST_LOWER_BOUND,
      });
      expect(pos.line).toBe(lineIndex + 1);
      expect(pos.column).toBe(lines[lineIndex].indexOf('let n ='));
    });
  });
});
