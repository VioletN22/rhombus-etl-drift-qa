import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export class Canvas {
  constructor(private readonly page: Page) {}

  async waitReady(): Promise<void> {
    await expect(sel.canvas(this.page)).toBeVisible();
    await expect(sel.canvasNodes(this.page).first()).toBeVisible();
  }

  async nodeCount(): Promise<number> {
    return sel.canvasNodes(this.page).count();
  }

  /** Visible node titles in DOM order. */
  async nodeNames(): Promise<string[]> {
    const texts = await sel.canvasNodes(this.page).allInnerTexts();
    return texts.map((t) => t.split('\n')[0].trim()).filter(Boolean);
  }

  async edgeCount(): Promise<number> {
    return sel.canvasEdges(this.page).count();
  }

  /** Nodes that are neither Data Input nor Data Output, i.e. the AI-built transformers. */
  async transformerNames(): Promise<string[]> {
    return (await this.nodeNames()).filter(
      (n) => !sel.dataInputLabel.test(n) && !sel.dataOutputLabel.test(n),
    );
  }

  async run(): Promise<Date> {
    const startedAt = new Date();
    await sel.runPipelineButton(this.page).click();
    return startedAt;
  }

  /** Open a node's preview and return the header cells + row count of the preview grid. */
  async previewNode(name: string | RegExp): Promise<{ headers: string[]; rowCount: number }> {
    await sel.nodeByName(this.page, name).click();
    await sel.nodePreviewButton(this.page).click();
    const table = sel.previewTable(this.page);
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    const headers = (await table.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
    const rowCount = (await table.getByRole('row').count()) - 1;
    return { headers, rowCount };
  }
}
