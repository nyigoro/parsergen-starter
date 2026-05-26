import fs from 'node:fs';
import path from 'node:path';

const workflowPath = (...parts: string[]): string => path.resolve(__dirname, '../.github/workflows', ...parts);

const readWorkflow = (name: string): string => fs.readFileSync(workflowPath(name), 'utf-8');

const extractJob = (workflow: string, jobName: string): string => {
  const match = new RegExp(`\\n  ${jobName}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n?$)`).exec(workflow);
  if (!match) throw new Error(`Job '${jobName}' not found`);
  return match[1];
};

describe('GitHub workflow configuration', () => {
  test('CI test job installs WABT before running the Jest suite', () => {
    const workflow = readWorkflow('ci.yml');
    const job = extractJob(workflow, 'test');

    expect(job).toContain("node-version: '22.17.0'");
    expect(job).toContain('npm run typecheck');
    expect(job).toContain('npm run build:verify');
    expect(job).toContain('npm run pack:check');
    expect(job).toContain('apt-get install -y wabt');
    expect(job).toContain('wat2wasm --version');
    expect(job.indexOf('apt-get install -y wabt')).toBeLessThan(job.indexOf('npm test'));
  });

  test('ecosystem package publish workflow is path-scoped per package', () => {
    const workflow = readWorkflow('publish-packages.yml');
    const packages = [
      { key: 'http', path: 'packages/http', job: 'publish-http' },
      { key: 'github_client', path: 'packages/github-client', job: 'publish-github-client' },
      { key: 'json_parser', path: 'packages/json-parser', job: 'publish-json-parser' },
    ];

    expect(workflow).toContain('branches: [main]');
    for (const pkg of packages) {
      expect(workflow).toContain(`- '${pkg.path}/**'`);
      expect(workflow).toContain(`grep -q '^${pkg.path}/'`);
      expect(workflow).toContain(`${pkg.key}: \${{ steps.detect.outputs.${pkg.key} }}`);

      const job = extractJob(workflow, pkg.job);
      expect(job).toContain(`needs.changes.outputs.${pkg.key} == 'true'`);
      expect(job).toContain("node-version: '22.17.0'");
      expect(job).toContain("registry-url: 'https://registry.npmjs.org'");
      expect(job).toContain(`working-directory: ${pkg.path}`);
      expect(job).toContain('npm view "$name@$version" version');
      expect(job).toContain('npm publish --access public');
      expect(job).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    }
  });
});
