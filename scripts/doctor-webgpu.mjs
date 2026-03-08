#!/usr/bin/env node
/* global console, process */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const results = [];
let allPassed = true;

function compareNodeVersion(version, minMajor, minMinor = 0) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== minMajor) return major > minMajor;
  return minor >= minMinor;
}

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  if (!ok) allPassed = false;
}

function check(label, fn) {
  try {
    const detail = fn();
    record(label, true, detail);
  } catch (error) {
    record(label, false, error instanceof Error ? error.message : String(error));
  }
}

async function checkAsync(label, fn) {
  try {
    const detail = await fn();
    record(label, true, detail);
  } catch (error) {
    record(label, false, error instanceof Error ? error.message : String(error));
  }
}

function run(command) {
  return execSync(command, {
    stdio: 'pipe',
    encoding: 'utf-8',
    shell: true,
  }).trim();
}

check('Node.js >= 22.17', () => {
  if (!compareNodeVersion(process.version, 22, 17)) {
    throw new Error(`found ${process.version}; need >= v22.17.0`);
  }
  return process.version;
});

check('Playwright CLI installed', () => {
  const version = run('npx playwright --version');
  if (!version) throw new Error('npx playwright returned no version');
  return version;
});

await checkAsync('Playwright Chromium installed', async () => {
  const playwright = await import('@playwright/test');
  const executablePath = playwright.chromium.executablePath();
  if (!executablePath || !existsSync(executablePath)) {
    throw new Error('run `npx playwright install chromium`');
  }
  return executablePath;
});

check('LUMINA_BROWSER_SMOKE set', () => {
  if (process.env.LUMINA_BROWSER_SMOKE !== '1') {
    throw new Error('set LUMINA_BROWSER_SMOKE=1');
  }
  return '1';
});

check('LUMINA_WEBGPU_SMOKE set', () => {
  if (process.env.LUMINA_WEBGPU_SMOKE !== '1') {
    throw new Error('set LUMINA_WEBGPU_SMOKE=1');
  }
  return '1';
});

check('wat2wasm available (optional for full browser smoke)', () => {
  try {
    return run('wat2wasm --version');
  } catch {
    return 'not found; only required for wasm-load/full browser smoke';
  }
});

await checkAsync('WebGPU adapter available in Chromium', async () => {
  const playwright = await import('@playwright/test');
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async () => {
      if (!('gpu' in globalThis.navigator)) {
        return { ok: false, reason: 'navigator.gpu is unavailable in this browser context' };
      }
      const adapter = await globalThis.navigator.gpu.requestAdapter();
      if (!adapter) {
        return { ok: false, reason: 'navigator.gpu exists but no usable WebGPU adapter was returned' };
      }
      return { ok: true, reason: 'adapter acquired' };
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.reason;
  } finally {
    await browser.close();
  }
});

console.log('\nLumina WebGPU Doctor');
console.log('========================================');
for (const result of results) {
  console.log(`[${result.ok ? 'ok' : 'fail'}] ${result.label} - ${result.detail}`);
}
console.log('========================================');

if (allPassed) {
  console.log('All required checks passed. Run: npm run test:webgpu');
} else {
  console.log('Some required checks failed. Fix the items above before running WebGPU smoke.');
  process.exit(1);
}
