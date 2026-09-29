import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export type SlashCommand = '/pipeline' | '/analysis' | '/agent' | '/plan';

export class ChatPanel {
  constructor(private readonly page: Page) {}

  /**
   * Send a slash command and wait for the agent's reply.
   * Waits are event-driven only: the network response (when the endpoint is known)
   * plus web-first assertions on a new agent message and the busy indicator clearing.
   */
  async sendSlash(command: SlashCommand, text: string, opts: { timeout?: number } = {}): Promise<string> {
    const timeout = opts.timeout ?? 180_000;
    const agentMsgs = sel.chatAgentMessages(this.page);
    const before = await agentMsgs.count();

    const responseKnown = !String(sel.chatResponseUrl).includes('TODO');
    const replyResponse = responseKnown
      ? this.page.waitForResponse((r) => sel.chatResponseUrl.test(r.url()) && r.request().method() === 'POST', { timeout })
      : null;

    await sel.chatInput(this.page).fill(`${command} ${text}`);
    await sel.chatSend(this.page).click();

    if (replyResponse) expect((await replyResponse).ok(), 'chat endpoint returned non-2xx').toBeTruthy();
    await expect(agentMsgs).toHaveCount(before + 1, { timeout });
    await expect(sel.chatBusyIndicator(this.page)).toBeHidden({ timeout });

    const reply = (await agentMsgs.last().innerText()).trim();
    expect(reply.length, 'agent reply should not be empty').toBeGreaterThan(0);
    return reply;
  }
}
