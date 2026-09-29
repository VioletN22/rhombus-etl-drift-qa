import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { STORAGE_STATE } from './support/env';

loadEnv({ quiet: true });

const runSlow = process.env.SLOW === '1';

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // @slow tests (real scheduled/triggered runs, up to 15 min) only run with SLOW=1.
  grepInvert: runSlow ? undefined : /@slow/,
  use: {
    baseURL: process.env.RHOMBUS_BASE_URL || 'https://rhombusai.com',
    channel: 'chromium', // NEVER 'chrome': real Chrome leaks code_sign_clone dirs on macOS.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'setup',
      testDir: './ui-tests',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'ui',
      testDir: './ui-tests/tests',
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE },
      timeout: runSlow ? 20 * 60_000 : 120_000,
    },
    {
      name: 'api',
      testDir: './api-tests/tests',
    },
  ],
});
