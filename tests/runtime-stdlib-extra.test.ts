import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('Runtime stdlib extra modules', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('fs exposes directory and metadata helpers', async () => {
    const { fs: luminaFs } = await loadRuntime();
    const root = path.join(os.tmpdir(), `lumina-fs-extra-${Date.now()}-${Math.trunc(Math.random() * 100000)}`);
    const filePath = path.join(root, 'sample.txt');

    const mkdirResult = await luminaFs.mkdir(root, true);
    expect(getTag(mkdirResult)).toBe('Ok');

    const writeResult = await luminaFs.writeFile(filePath, 'hello');
    expect(getTag(writeResult)).toBe('Ok');

    expect(await luminaFs.exists(filePath)).toBe(true);

    const readDirResult = await luminaFs.readDir(root);
    expect(getTag(readDirResult)).toBe('Ok');
    expect(getPayload<string[]>(readDirResult)).toContain('sample.txt');

    const metadataResult = await luminaFs.metadata(filePath);
    expect(getTag(metadataResult)).toBe('Ok');
    const metadata = getPayload<{ isFile: boolean; isDirectory: boolean; size: number; modifiedMs: number }>(metadataResult);
    expect(metadata.isFile).toBe(true);
    expect(metadata.isDirectory).toBe(false);
    expect(metadata.size).toBe(5);
    expect(metadata.modifiedMs).toBeGreaterThan(0);

    const removeResult = await luminaFs.removeFile(filePath);
    expect(getTag(removeResult)).toBe('Ok');
    expect(await luminaFs.exists(filePath)).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test('time exposes clock and sleep helpers', async () => {
    const { time } = await loadRuntime();

    const unixNow = time.nowMs();
    expect(unixNow).toBeGreaterThan(0);

    const iso = time.nowIso();
    expect(Number.isNaN(Date.parse(iso))).toBe(false);

    const start = time.instantNow();
    await time.sleep(8);
    const elapsed = time.elapsedMs(start);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  test('regex exposes validation, matching, and replacement', async () => {
    const { regex } = await loadRuntime();

    expect(regex.isValid('^a+$')).toBe(true);
    expect(regex.isValid('(')).toBe(false);

    const testResult = regex.test('^a+$', 'aaa');
    expect(getTag(testResult)).toBe('Ok');
    expect(getPayload<boolean>(testResult)).toBe(true);

    const findResult = regex.find('\\d+', 'abc123def');
    expect(getTag(findResult)).toBe('Some');
    expect(getPayload<string>(findResult)).toBe('123');

    const findAllResult = regex.findAll('\\d+', 'a1 b22 c333');
    expect(getTag(findAllResult)).toBe('Ok');
    expect(getPayload<string[]>(findAllResult)).toEqual(['1', '22', '333']);

    const replaceResult = regex.replace('\\s+', 'a   b', '-', 'g');
    expect(getTag(replaceResult)).toBe('Ok');
    expect(getPayload<string>(replaceResult)).toBe('a-b');
  });

  test('crypto exposes hashing, random, and AES-GCM helpers', async () => {
    const { crypto: luminaCrypto } = await loadRuntime();
    const available = await luminaCrypto.isAvailable();
    if (!available) return;

    const sha = await luminaCrypto.sha256('lumina');
    expect(getTag(sha)).toBe('Ok');
    expect(getPayload<string>(sha)).toBe('631ca15fff506df1f01e4c520cceea6a14f43feaa765a25e7eb453501fb411bf');

    const hmac = await luminaCrypto.hmacSha256('key', 'value');
    expect(getTag(hmac)).toBe('Ok');
    expect(getPayload<string>(hmac)).toBe('90fbfcf15e74a36b89dbdb2a721d9aecffdfdddc5c83e27f7592594f71932481');

    const bytes = await luminaCrypto.randomBytes(16);
    expect(getTag(bytes)).toBe('Ok');
    const payload = getPayload<number[]>(bytes);
    expect(payload.length).toBe(16);
    expect(payload.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)).toBe(true);

    const rand = await luminaCrypto.randomInt(10, 12);
    expect(getTag(rand)).toBe('Ok');
    const value = getPayload<number>(rand);
    expect(value).toBeGreaterThanOrEqual(10);
    expect(value).toBeLessThanOrEqual(12);

    const encrypted = await luminaCrypto.aesGcmEncrypt('secret-key', 'hello lumina');
    expect(getTag(encrypted)).toBe('Ok');
    const cipherText = getPayload<string>(encrypted);
    expect(typeof cipherText).toBe('string');
    expect(cipherText.length).toBeGreaterThan(0);

    const decrypted = await luminaCrypto.aesGcmDecrypt('secret-key', cipherText);
    expect(getTag(decrypted)).toBe('Ok');
    expect(getPayload<string>(decrypted)).toBe('hello lumina');
  });
});
