import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
  },
});
