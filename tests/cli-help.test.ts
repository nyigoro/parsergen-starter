import { runLumina } from '../src/bin/lumina-core.js';

async function captureHelp(): Promise<string> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  try {
    await runLumina(['--help']);
  } finally {
    console.log = originalLog;
  }
  return logs.join('\n');
}

describe('CLI help', () => {
  it('uses current package-manager wording and hides legacy compile switches', async () => {
    const help = await captureHelp();

    expect(help).toContain('Require lumina.lock to match the manifest');
    expect(help).toContain('init             Initialize a Lumina browser app starter');
    expect(help).toContain('install          Install packages from lumina.lock');
    expect(help).toContain('remove <pkg...>  Remove package(s) from lumina.toml and lockfiles');
    expect((help.match(/Commands:/g) ?? []).length).toBe(1);
    expect(help).not.toContain('Use npm ci if lockfile is present');
    expect(help).not.toContain('package.json + src');
    expect(help).not.toContain('--bundled-compile');
    expect(help).not.toContain('--topo-compile');
  });
});
