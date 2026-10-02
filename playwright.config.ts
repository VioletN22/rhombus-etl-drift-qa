import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { STORAGE_STATE } from './support/env';

loadEnv({ quiet: true });

export default defineConfig({
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.RHOMBUS_BASE_URL || 'https://rhombusai.com',
    // Bundled Chromium, never the installed Chrome (real Chrome leaves temp copies on macOS).
    channel: 'chromium',
    // Small suite against a live app, so keep full evidence for every test.
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'setup', testDir: './ui-tests', testMatch: /auth\.setup\.ts/ },
    {
      name: 'ui',
      testDir: './ui-tests/tests',
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE, viewport: { width: 1512, height: 900 } },
    },
    { name: 'api', testDir: './api-tests/tests', dependencies: ['setup'] },
  ],
});
