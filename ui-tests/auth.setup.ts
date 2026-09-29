import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE, cfg, hasCreds } from '../support/env';
import { sel } from './selectors';

setup('authenticate with email/password and save storageState', async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  if (!hasCreds()) {
    // Write an empty state so the `ui` project can still start; its specs skip themselves.
    fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, 'RHOMBUS_EMAIL / RHOMBUS_PASSWORD not set (copy .env.example to .env). UI specs will skip.');
  }

  await page.goto(sel.loginPath);
  await sel.loginEmail(page).fill(cfg.email!);
  await sel.loginPassword(page).fill(cfg.password!);
  await sel.loginSubmit(page).click();

  // Real assertion: an element only a signed-in user sees, not just "page loaded".
  await expect(sel.signedInMarker(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/login|sign-?in/i);

  await page.context().storageState({ path: STORAGE_STATE });
});
