import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export class OutputNode {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await sel.nodeByName(this.page, sel.dataOutputLabel).click();
    await expect(sel.outputDestination(this.page)).toBeVisible();
  }

  /** e.g. "gs://my-bucket/prefix/" or "my-bucket" depending on how the UI renders it. */
  async destination(): Promise<string> {
    return (await sel.outputDestination(this.page).inputValue()).trim(); // TODO: innerText if read-only text
  }

  async format(): Promise<string> {
    return (await sel.outputFormat(this.page).inputValue()).trim(); // TODO
  }
}
