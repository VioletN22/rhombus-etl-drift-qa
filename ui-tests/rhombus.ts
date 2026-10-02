/**
 * Page object for the parts of Rhombus the journey touches: the project canvas, the node
 * side panel, the logs panel and the schedule tab. Specs call these methods and never
 * use selectors directly.
 */
import { expect, type Page } from '@playwright/test';
import { sel } from './selectors';

export type NodeKind = 'input' | 'output' | 'llm' | 'remove_duplicate' | string;
export interface GraphNode { id: string; kind: NodeKind }
export interface Graph { nodes: GraphNode[]; edges: [string, string][] }
export type RunOutcome = 'succeeded' | 'failed';

export class Rhombus {
  constructor(readonly page: Page) {}

  async openProject(name: string): Promise<void> {
    await this.page.goto(sel.dashboardPath);
    await sel.projectCard(this.page).filter({ has: this.page.getByText(name, { exact: true }) }).click();
    await expect(sel.canvas(this.page)).toBeVisible();
    await expect(sel.nodes(this.page).first()).toBeVisible();
  }

  /** Nodes and edges as drawn on the canvas, read from React Flow's test ids. */
  async graph(): Promise<Graph> {
    const nodes = await sel.nodeKind(this.page).evaluateAll((els) =>
      els.map((el) => ({
        id: (el.closest('[data-testid^="rf__node-"]') as HTMLElement).dataset.testid!.replace('rf__node-', ''),
        kind: el.getAttribute('data-testid')!.replace(/^node-/, '').replace(/-(un)?selected$/, ''),
      })),
    );
    const ids = nodes.map((n) => n.id);
    const edgeIds = await sel.edges(this.page).evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
    const edges = edgeIds.map((testId): [string, string] => {
      // Node ids contain underscores, so split on the known ids rather than on "-".
      const rest = testId.replace(/^rf__edge-(xy-)?/, '');
      const source = ids.find((id) => rest.startsWith(`${id}-`) && ids.includes(rest.slice(id.length + 1)));
      if (!source) throw new Error(`cannot parse edge ${testId}`);
      return [source, rest.slice(source.length + 1)];
    });
    return { nodes, edges };
  }

  /** Clicks the first node of a kind and waits for its settings panel. */
  async openNode(kind: NodeKind, panelTitle: string): Promise<void> {
    const node = sel.nodes(this.page).filter({ has: this.page.locator(`[data-testid^="node-${kind}-"]`) }).first();
    await node.click();
    await expect(sel.sidebar(this.page).getByText(panelTitle, { exact: true }).first()).toBeVisible();
  }

  /** Text of the Data Input "Third Party Data" dialog, once the named connection shows. */
  async connectionsDialog(name: string): Promise<string> {
    await this.openNode('input', 'Data Input');
    await sel.thirdPartyButton(this.page).click();
    const dialog = sel.dialog(this.page);
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    const text = await dialog.innerText();
    await this.page.keyboard.press('Escape');
    return text;
  }

  /** Whether the Data Output panel has this destination selected, and the export format. */
  async outputSettings(destination: string): Promise<{ selected: boolean; format: string }> {
    await this.openNode('output', 'Data Output');
    const option = sel.destination(this.page, destination);
    await expect(option).toBeVisible();
    return {
      selected: (await option.locator(sel.selectedDot).count()) > 0,
      format: await sel.exportFormat(this.page).inputValue(),
    };
  }

  /** How many log entries carry this exact message. Opens and closes the logs panel. */
  async countLogEntries(message: string): Promise<number> {
    await sel.logsButton(this.page).click();
    const panel = sel.logsPanel(this.page);
    await expect(panel).toBeVisible();
    const count = await panel.getByText(message, { exact: true }).count();
    // The open panel covers the Logs button, so close it with its own header button.
    await sel.logsClose(this.page).click();
    await expect(panel).toBeHidden();
    return count;
  }

  /** Clicks Run and waits for the end-of-run toast, however long the run takes. */
  async runPipeline(timeout = 180_000): Promise<RunOutcome> {
    await sel.runButton(this.page).click();
    const done = sel.runSucceededToast(this.page).or(sel.runFailedToast(this.page)).first();
    await expect(done).toBeVisible({ timeout });
    return (await sel.runSucceededToast(this.page).count()) > 0 ? 'succeeded' : 'failed';
  }

  /** The first schedule card on the Schedule tab, as plain text plus its on/off switch. */
  async schedule(): Promise<{ text: string; enabled: boolean }> {
    await sel.tab(this.page, 'Schedule').click();
    const toggle = sel.scheduleToggle(this.page);
    await expect(toggle).toBeVisible();
    return {
      text: await sel.sidebar(this.page).innerText(),
      enabled: (await toggle.getAttribute('aria-checked')) === 'true',
    };
  }
}
