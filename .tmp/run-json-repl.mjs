const target = process.argv[2];
if (!target) throw new Error('target path required');
globalThis.__luminaStdin = ['{"test":123}', 'exit'];
await import(target);
