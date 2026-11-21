import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'apps/desktop/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
