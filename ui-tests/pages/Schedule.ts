import { expect, type Page } from '@playwright/test';
import { sel } from '../selectors';

export type RunStatus = 'Success' | 'Failure' | 'In Progress' | 'Unknown';

export interface RunRow {
  status: RunStatus;
  startedAt: Date | null;
  durationSec: number | null;
  trigger: string;
  raw: string[];
}

export function parseStatus(s: string): RunStatus {
  const t = s.trim().toLowerCase();
  if (/success|succeeded|completed/.test(t)) return 'Success';
  if (/fail|error/.test(t)) return 'Failure';
  if (/progress|running|queued|pending/.test(t)) return 'In Progress';
  return 'Unknown';
}

/** "1m 23s" | "83s" | "00:01:23" -> seconds. */
export function parseDuration(s: string): number | null {
  const t = s.trim();
  const hms = t.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +hms[3];
  const parts = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s|ms)\b/g)];
  if (!parts.length) return null;
  const mult: Record<string, number> = { h: 3600, m: 60, s: 1, ms: 0.001 };
  return parts.reduce((sum, [, n, u]) => sum + parseFloat(n) * mult[u], 0);
}

export class Schedule {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await sel.scheduleNav(this.page).click();
    await expect(sel.scheduleCron(this.page)).toBeVisible();
  }

  async cron(): Promise<string> {
    return (await sel.scheduleCron(this.page).inputValue()).trim(); // TODO: innerText if not an input
  }

  async timezone(): Promise<string> {
    return (await sel.scheduleTimezone(this.page).inputValue()).trim(); // TODO: innerText if combobox
  }

  async openRunHistory(): Promise<void> {
    await sel.runHistoryNav(this.page).click();
  }

  async runHistory(): Promise<RunRow[]> {
    const rows = sel.runHistoryRows(this.page);
    const out: RunRow[] = [];
    for (const row of await rows.all()) {
      const cells = (await row.getByRole('cell').allInnerTexts()).map((c) => c.trim());
      const col = (k: (typeof sel.runHistoryColumns)[number]) => cells[sel.runHistoryColumns.indexOf(k)] ?? '';
      const started = new Date(col('startedAt'));
      out.push({
        status: parseStatus(col('status')),
        startedAt: isNaN(started.getTime()) ? null : started,
        durationSec: parseDuration(col('duration')),
        trigger: col('trigger'),
        raw: cells,
      });
    }
    return out;
  }

  /** Status of the newest run (assumes newest-first ordering; TODO confirm). */
  async latestRunStatus(): Promise<RunStatus> {
    await this.page.reload(); // TODO: drop if run history live-updates
    await this.openRunHistory();
    const [latest] = await this.runHistory();
    return latest?.status ?? 'Unknown';
  }

  async runNow(): Promise<Date> {
    const startedAt = new Date();
    await sel.runNowButton(this.page).click();
    return startedAt;
  }
}
