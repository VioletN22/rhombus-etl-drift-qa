import { test, expect } from '@playwright/test';
import { apiClient } from '../client';
import { path } from '../endpoints';
import { parse, requireAuth, requireEndpoint } from '../helpers';
import { ProjectList, RunHistory } from '../schemas';
import { cfg } from '../../support/env';

async function findOurProject() {
  const api = await apiClient();
  const { path: p } = parse('listProjects');
  const res = await api.get(p);
  expect(res.status(), await res.text()).toBe(200);
  const list = ProjectList.parse(await res.json());
  return { list, ours: list.find((x) => x.name === cfg.projectName) };
}

test.describe('projects API (positive)', () => {
  test('GET projects -> 200, schema-valid, contains our project', async () => {
    requireEndpoint('listProjects');
    requireAuth();
    test.skip(!cfg.projectName, 'RHOMBUS_PROJECT_NAME not set');

    const api = await apiClient();
    const res = await api.get(parse('listProjects').path);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/json/);

    const parsed = ProjectList.safeParse(await res.json());
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
    const names = parsed.data!.map((p) => p.name);
    expect(names).toContain(cfg.projectName);
    expect(new Set(parsed.data!.map((p) => String(p.id))).size, 'project ids unique').toBe(parsed.data!.length);
  });

  test('GET run history -> latest run has a status and a duration', async () => {
    requireEndpoint('listProjects', 'runHistory');
    requireAuth();
    test.skip(!cfg.projectName, 'RHOMBUS_PROJECT_NAME not set');

    const { ours } = await findOurProject();
    expect(ours, `project "${cfg.projectName}" not in list`).toBeDefined();

    const api = await apiClient();
    const res = await api.get(path(parse('runHistory').path, { projectId: String(ours!.id) }));
    expect(res.status()).toBe(200);
    const runs = RunHistory.parse(await res.json());
    expect(runs.length, 'pipeline should have run at least once').toBeGreaterThan(0);

    const latest = runs[0]; // TODO: confirm newest-first; else sort by startedAt
    expect(latest.status).toMatch(/success|fail|progress|running|queued/i);
    if (!/progress|running|queued/i.test(latest.status)) {
      expect(latest.duration, 'finished run should report duration').toEqual(expect.any(Number));
    }
  });
});
