import fs from 'node:fs';
import path from 'node:path';
import { runLumina } from '../src/bin/lumina-core.js';
const formsStoreResourceExamplePath = path.resolve(
  __dirname,
  '../examples/forms-store-resource/main.lm'
);
const formsStoreResourceSource = fs.readFileSync(formsStoreResourceExamplePath, 'utf-8');
const formsStoreResourceIndexPath = path.resolve(
  __dirname,
  '../examples/forms-store-resource/index.html'
);
const formsStoreResourceIndexSource = fs.readFileSync(formsStoreResourceIndexPath, 'utf-8');
const webComponentsExamplePath = path.resolve(__dirname, '../examples/web-components/main.lm');
const webComponentsSource = fs.readFileSync(webComponentsExamplePath, 'utf-8');
const webComponentsIndexPath = path.resolve(__dirname, '../examples/web-components/index.html');
const webComponentsIndexSource = fs.readFileSync(webComponentsIndexPath, 'utf-8');
const ssgExamplePath = path.resolve(__dirname, '../examples/ssg-page/main.lm');
const ssgExampleSource = fs.readFileSync(ssgExamplePath, 'utf-8');
const ssgExampleIndexPath = path.resolve(__dirname, '../examples/ssg-page/index.html');
const ssgExampleIndexSource = fs.readFileSync(ssgExampleIndexPath, 'utf-8');
const examplesIndexPath = path.resolve(__dirname, '../examples/index.html');
const examplesIndexSource = fs.readFileSync(examplesIndexPath, 'utf-8');
const benchmarkIndexPath = path.resolve(__dirname, '../examples/benchmark.html');
const benchmarkIndexSource = fs.readFileSync(benchmarkIndexPath, 'utf-8');

async function runCommand(argv: string[]) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  let exitCode: number | null = null;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT:${exitCode}`);
  }) as typeof process.exit;

  try {
    await runLumina(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith('EXIT:')) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return {
    exitCode: exitCode ?? 0,
    stdout: logs.join('\n'),
    stderr: errors.join('\n'),
  };
}

describe('app-layer examples', () => {
  test('forms/store/resource example documents the app-layer authoring surface', () => {
    expect(formsStoreResourceSource).toContain('@std/forms');
    expect(formsStoreResourceSource).toContain('@std/store');
    expect(formsStoreResourceSource).toContain('@std/resource');
    expect(formsStoreResourceSource).toContain('component ProfileWorkspace');
    expect(formsStoreResourceSource).toContain('render.suspense');
    expect(formsStoreResourceSource).toContain('render.errorBoundary');
    expect(formsStoreResourceSource).toContain('for (item, index in queue key item)');
    expect(formsStoreResourceSource).toContain('aria-live');
    expect(formsStoreResourceSource).toContain('mount_reactive');
  });

  test('forms/store/resource live page is wired for the browser', () => {
    expect(formsStoreResourceIndexSource).toContain('main.js');
    expect(formsStoreResourceIndexSource).toContain('id="app"');
    expect(formsStoreResourceIndexSource).toContain('Lumina Forms + Resource');
  });

  test('forms/store/resource example passes the CLI checker', async () => {
    const result = await runCommand(['check', formsStoreResourceExamplePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Lumina check passed');
  }, 15000);

  test('web-components example documents the custom-element authoring surface', () => {
    expect(webComponentsSource).toContain('@std/web_components');
    expect(webComponentsSource).toContain('component ProfileBadge');
    expect(webComponentsSource).toContain('defineCustomElement');
    expect(webComponentsSource).toContain('mountCustomElement');
    expect(webComponentsSource).toContain('lumina-profile-badge');
  });

  test('web-components live page is wired for the browser', () => {
    expect(webComponentsIndexSource).toContain('main.js');
    expect(webComponentsIndexSource).toContain('lumina-profile-badge');
    expect(webComponentsIndexSource).toContain('Swap labels');
  });

  test('web-components example passes the CLI checker', async () => {
    const result = await runCommand(['check', webComponentsExamplePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Lumina check passed');
  }, 15000);

  test('ssg example documents the static app workflow', () => {
    expect(ssgExampleSource).toContain('@std/ssg');
    expect(ssgExampleSource).toContain('component MarketingPage');
    expect(ssgExampleSource).toContain('renderApp(');
    expect(ssgExampleSource).toContain('pub fn main() -> VNode');
  });

  test('ssg example passes the CLI checker and ships a live page', async () => {
    const result = await runCommand(['check', ssgExamplePath]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Lumina check passed');
    expect(ssgExampleIndexSource).toContain('<!DOCTYPE html>');
    expect(ssgExampleIndexSource).toContain('Ship Lumina UI');
    expect(ssgExampleIndexSource).toContain('Lumina SSG');
    expect(ssgExampleIndexSource).toContain('Lumina SSG Example');
  }, 15000);

  test('examples landing page links to the live demos and benchmark', () => {
    expect(examplesIndexSource).toContain('./forms-store-resource/index.html');
    expect(examplesIndexSource).toContain('./web-components/index.html');
    expect(examplesIndexSource).toContain('./benchmark.html');
    expect(benchmarkIndexSource).toContain('./dom-render/benchmark.html');
  });
});
