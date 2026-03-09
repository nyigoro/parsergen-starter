import { createHash } from 'node:crypto';
import { integrityStatus, parseIntegrity, verifyIntegrity } from '../src/lumina/lockfile.js';

describe('lockfile integrity helpers', () => {
  it('returns missing for empty and sentinel hashes', () => {
    const payload = Buffer.from('hello world');
    expect(integrityStatus(payload, '')).toBe('missing');
    expect(integrityStatus(payload, 'sha256:')).toBe('missing');
  });

  it('returns mismatch for incorrect hash', () => {
    expect(integrityStatus(Buffer.from('hello world'), 'sha256:deadbeef')).toBe('mismatch');
  });

  it('returns ok for correct hash', () => {
    const payload = Buffer.from('hello world');
    const hash = createHash('sha256').update(payload).digest('hex');
    expect(integrityStatus(payload, `sha256:${hash}`)).toBe('ok');
  });

  it('parseIntegrity warns on missing values and does not throw', () => {
    const warnings: string[] = [];
    expect(() => parseIntegrity(undefined, 'json-utils@1.2.3', { write: (chunk: string) => warnings.push(chunk) })).not.toThrow();
    expect(warnings.join('')).toMatch(/missing integrity/i);
    expect(parseIntegrity(undefined, 'json-utils@1.2.3', { write: () => {} })).toBe('sha256:');
  });

  it('verifyIntegrity returns false for sentinel hashes', () => {
    expect(verifyIntegrity(Buffer.from('hello world'), 'sha256:')).toBe(false);
  });
});
