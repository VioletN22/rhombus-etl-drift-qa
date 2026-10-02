/**
 * Saves a signed-in session to .auth/user.json (gitignored) for the UI and API suites.
 *
 * The account uses two-step sign-in, so the suite never handles the password. The first
 * run opens a browser window and waits for a person to sign in; later runs reuse the
 * saved session and stay headless until it expires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE, hasAuthState } from '../support/env';
import { sel } from './selectors';

const saved = hasAuthState();
setup.use({ storageState: saved ? STORAGE_STATE : undefined, headless: saved });

setup('signed-in session', async ({ page }) => {
  setup.setTimeout(6 * 60_000);
  await page.goto(sel.dashboardPath);

  const projects = sel.projectCard(page).first();
  const alreadyIn = await projects.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (!alreadyIn) {
    setup.skip(!!process.env.CI, 'No saved session. Run `npm run login` locally first.');
    console.log('Sign in to Rhombus in the browser window that just opened. Waiting up to 5 minutes.');
    await expect(projects).toBeVisible({ timeout: 5 * 60_000 });
  }

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
