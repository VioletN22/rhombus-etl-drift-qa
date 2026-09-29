import { test, expect } from '@playwright/test';
import { apiClient } from '../client';
import { path } from '../endpoints';
import { parse, requireAuth, requireEndpoint } from '../helpers';
import { ErrorBody } from '../schemas';
import { cfg, env, uniqueName } from '../../support/env';

test.describe('input validation & tenancy (negative)', () => {
  test('create connection with invalid input -> 4xx with a message', async () => {
    requireEndpoint('createConnection');
    requireAuth();
    const api = await apiClient();
    // TODO discovery day: mirror the real payload shape, keeping it invalid
    // (missing bucket, malformed region). Unique name so a wrongly-accepted row is traceable.
    const res = await api.post(parse('createConnection').path, {
      data: { name: uniqueName('bad-conn'), type: 's3', bucket: '', region: 'not-a-region' },
    });
    expect(res.status(), 'invalid input must not be accepted').toBeGreaterThanOrEqual(400);
    expect(res.status(), 'invalid input should be a client error, not a crash').toBeLessThan(500);
    const body = ErrorBody.safeParse(await res.json().catch(() => ({})));
    expect(body.success, 'error body should explain what is wrong').toBe(true);
  });

  test("another project's id -> 403/404, never 200", async () => {
    requireEndpoint('getProject');
    requireAuth();
    // RHOMBUS_FOREIGN_PROJECT_ID: a project owned by a different account (true cross-tenant check).
    // Without it we probe a well-formed id that should not exist, which only proves "not found".
    const foreign = env('RHOMBUS_FOREIGN_PROJECT_ID');
    const id = foreign ?? '00000000-0000-4000-8000-000000000000'; // TODO: match real id format
    test.info().annotations.push({
      type: 'scope',
      description: foreign
        ? 'cross-tenant: id belongs to another account'
        : 'weak: nonexistent id only; set RHOMBUS_FOREIGN_PROJECT_ID for a real cross-tenant check',
    });

    const api = await apiClient();
    const res = await api.get(path(parse('getProject').path, { projectId: id }));
    expect([403, 404]).toContain(res.status());
    const text = await res.text();
    if (cfg.projectName) expect(text).not.toContain(cfg.projectName);
    // 403 vs 404 is itself a finding: 403 confirms the id exists (enumeration); report, don't fail.
    if (res.status() === 403 && foreign) {
      test.info().annotations.push({ type: 'finding', description: '403 (not 404) reveals the foreign project exists' });
    }
  });
});
