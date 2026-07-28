import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  testMatch: '**/*.electron.ts',
  outputDir: './test-results/electron',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
  },
});
