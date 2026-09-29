import { test as base } from '@playwright/test';
import { hasAuthState, cfg } from '../support/env';
import { ChatPanel, Canvas, Sources, Schedule, OutputNode, Project } from './pages';

type Pages = {
  chat: ChatPanel; canvas: Canvas; sources: Sources;
  schedule: Schedule; output: OutputNode; project: Project;
};

export const test = base.extend<Pages>({
  chat: async ({ page }, use) => use(new ChatPanel(page)),
  canvas: async ({ page }, use) => use(new Canvas(page)),
  sources: async ({ page }, use) => use(new Sources(page)),
  schedule: async ({ page }, use) => use(new Schedule(page)),
  output: async ({ page }, use) => use(new OutputNode(page)),
  project: async ({ page }, use) => use(new Project(page)),
});

/** Call at the top of a describe block for specs that need a logged-in session. */
export function requireLogin(): void {
  test.skip(!hasAuthState(), 'No logged-in storageState (.auth/user.json). Set RHOMBUS_EMAIL/RHOMBUS_PASSWORD in .env.');
  test.skip(!cfg.projectName, 'RHOMBUS_PROJECT_NAME not set.');
}

export { expect } from '@playwright/test';
