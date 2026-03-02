import { runLumina } from '../src/bin/lumina-core.js';

describe('lumina explain command', () => {
  test('prints diagnostic explanation for known code', async () => {
    const writes: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      writes.push(args.map((v) => String(v)).join(' '));
    };

    try {
      await runLumina(['explain', 'LUM-001']);
    } finally {
      console.log = original;
    }

    expect(writes.join('\n')).toContain('LUM-001');
    expect(writes.join('\n')).toContain('How to fix');
  });
});

