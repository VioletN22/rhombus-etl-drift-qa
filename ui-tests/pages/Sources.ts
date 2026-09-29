import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'unknown';

export class Sources {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await sel.sourcesNav(this.page).click();
    await expect(sel.connectionRow(this.page, /s3|gcs|google cloud/i).first()).toBeVisible();
  }

  async status(name: string | RegExp): Promise<ConnectionStatus> {
    const el = sel.connectionStatus(this.page, name);
    await expect(el).toBeVisible();
    const t = (await el.innerText()).toLowerCase();
    if (/disconnected/.test(t)) return 'disconnected';
    if (/connected/.test(t)) return 'connected';
    if (/error|failed/.test(t)) return 'error';
    return 'unknown';
  }

  s3Status(): Promise<ConnectionStatus> {
    return this.status(/s3|amazon/i); // TODO: exact connection display name
  }

  gcsStatus(): Promise<ConnectionStatus> {
    return this.status(/gcs|google cloud/i); // TODO
  }
}
