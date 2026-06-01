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

  test('release workflow uses npm trusted publishing and creates the release after publish steps', () => {
    const workflow = readWorkflow('release.yml');
    const job = extractJob(workflow, 'release');

    expect(job).toContain('id-token: write');
    expect(job).toContain("node-version: '22.17.0'");
    expect(job).toContain('package-manager-cache: false');
    expect(job).not.toContain("registry-url: 'https://registry.npmjs.org'");
    expect(job).toContain('npm install -g npm@11.9.0');
    expect(job.indexOf('npm run build')).toBeLessThan(job.indexOf('Publish lumina-lang'));
    expect(job.indexOf('npm run build:verify')).toBeLessThan(job.indexOf('Publish lumina-lang'));
    expect(job).toContain('Verify OIDC environment');
    expect(job).toContain('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
    expect(job).toContain('ACTIONS_ID_TOKEN_REQUEST_URL');
    expect(job).toContain('npm publish --provenance --access public');
    expect(job).not.toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(job).toContain('tag_name: ${{ steps.release_tag.outputs.TAG }}');
    expect(job).toContain('target_commitish: ${{ github.sha }}');
    expect(job.indexOf('Publish lumina-language-client')).toBeLessThan(job.indexOf('Create GitHub Release'));
  });
});
