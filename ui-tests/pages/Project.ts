import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export class Project {
  constructor(private readonly page: Page) {}

  async open(name: string): Promise<void> {
    await this.page.goto(sel.projectsPath);
    const link = sel.projectLink(this.page, name);
    await expect(link).toBeVisible();
    await link.click();
    await expect(sel.canvas(this.page)).toBeVisible();
  }
}
