import { test as base } from '@playwright/test';
import { Rhombus } from './rhombus';

export const test = base.extend<{ rhombus: Rhombus }>({
  rhombus: async ({ page }, use) => {
    // Rhombus shows "Ad Blocker Detected" in a clean automated browser that has no ad
    // blocker. It can appear at any point and blocks clicks, so dismiss it whenever it does.
    await page.addLocatorHandler(page.getByRole('heading', { name: 'Ad Blocker Detected' }), async () => {
      await page.getByRole('button', { name: 'Continue Anyway' }).click();
    });
    await use(new Rhombus(page));
  },
});

export { expect } from '@playwright/test';
