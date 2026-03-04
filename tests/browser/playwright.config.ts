import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './smoke',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});
