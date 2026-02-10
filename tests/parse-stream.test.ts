import { compileGrammar, parseStream } from '../src/index';
import { ReadableStream } from 'node:stream/web';

const grammar = `
Start
  = [a-zA-Z0-9 ]+ { return { type: "Line", value: text() }; }
`;

const parser = compileGrammar(grammar);

const collectResults = async (
  stream: ReadableStream<string | Uint8Array>,
  delimiter: string,
  options: Record<string, unknown> = {}
) => {
  const results: Array<{ success: true; result: { type: string; value: string } } | { success: false }> = [];
  for await (const res of parseStream(parser, stream, { streamDelimiter: delimiter, ...options })) {
    results.push(res as { success: true; result: { type: string; value: string } } | { success: false });
  }
  return results;
};

describe('parseStream', () => {
  test('parses records with delimiter split across chunks (string + Uint8Array)', async () => {
    const encoder = new TextEncoder();
    const chunks: Array<string | Uint8Array> = [
      'first\n',
      encoder.encode('\nsecond\n'),
      '\nthird'
    ];

    const stream = new ReadableStream<string | Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const results = await collectResults(stream, '\n\n');
    expect(results).toHaveLength(3);

    const values = results.map((r) => {
      if (!r.success) {
        throw new Error('Expected parse success');
      }
      return r.result.value;
    });

    expect(values).toEqual(['first', 'second', 'third']);
  });

  test('flushes remainder when stream ends without trailing delimiter', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('alpha\n\nbeta');
        controller.close();
      },
    });

    const results = await collectResults(stream, '\n\n');
    expect(results).toHaveLength(2);

    const values = results.map((r) => {
      if (!r.success) {
        throw new Error('Expected parse success');
      }
      return r.result.value;
    });

    expect(values).toEqual(['alpha', 'beta']);
  });

  test('supports trimming and skipping empty records', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('  first  \n\n\n\n  second  ');
        controller.close();
      },
    });

    const results = await collectResults(stream, '\n\n', { streamTrim: true, streamSkipEmpty: true });
    expect(results).toHaveLength(2);

    const values = results.map((r) => {
      if (!r.success) {
        throw new Error('Expected parse success');
      }
      return r.result.value;
    });

    expect(values).toEqual(['first', 'second']);
  });

  test('throws when a record exceeds max byte size', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('this-record-is-too-long');
        controller.close();
      },
    });

    await expect(async () => {
      for await (const _result of parseStream(parser, stream, {
        streamDelimiter: '\n',
        streamMaxRecordBytes: 5,
      })) {
        void _result;
      }
    }).rejects.toThrow(/max of 5 bytes/);
  });
});
