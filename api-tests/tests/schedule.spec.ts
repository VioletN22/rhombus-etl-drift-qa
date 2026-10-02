/**
 * The schedule as the backend sees it. The UI only shows "Active" and a blank "Next run";
 * the API shows why: next_run_at stays at the first slot after it has passed, last_run_at
 * stays null, and every recorded run was started by hand.
 */
import { test, expect } from '../fixtures';
import { Executions, Schedules } from '../schemas';

test.describe('schedule', () => {
  test('the project has an enabled schedule with a cron expression', async ({ api, projectId }) => {
    const res = await api.get('/api/dataset/analyzer/v2/pipeline/schedules/all');
    expect(res.status()).toBe(200);
    const mine = Schedules.parse(await res.json()).schedules.filter((s) => s.project_id === projectId);
    expect(mine).toHaveLength(1);
    expect(mine[0].enabled).toBe(true);
    expect(mine[0].cron_expression).toMatch(/^(\S+\s+){4}\S+$/);
  });

  test('scheduled runs actually happen', async ({ api, projectId }) => {
    // Known bug, reported to Rhombus: marked as an expected failure so it flags the day it
    // starts passing.
    test.fail(true, 'Scheduled runs never fire on this account; see observations/FINDINGS.md');

    const schedules = Schedules.parse(await (await api.get('/api/dataset/analyzer/v2/pipeline/schedules/all')).json());
    const schedule = schedules.schedules.find((s) => s.project_id === projectId)!;
    const runs = Executions.parse(await (await api.get('/api/dataset/analyzer/v2/pipeline/executions/all')).json())
      .executions.filter((r) => r.project_id === projectId);

    expect(new Date(schedule.next_run_at!).getTime(), 'next_run_at is in the future').toBeGreaterThan(Date.now());
    expect(schedule.last_run_at, 'last_run_at is set').not.toBeNull();
    expect(runs.some((r) => r.trigger !== 'manual'), 'at least one run not started by hand').toBe(true);
  });
});
