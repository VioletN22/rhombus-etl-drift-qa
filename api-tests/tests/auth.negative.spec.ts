/**
 * Negative cases: no token, a made-up token, and a project that doesn't exist. Each must
 * be refused with the right status and a body that gives nothing away.
 */
import { test, expect } from '../fixtures';
import { apiClient } from '../client';
import { NotFound, Unauthorized } from '../schemas';

const PROTECTED = [
  '/api/dataset/projects/all',
  '/api/dataset/analyzer/v2/pipeline/executions/all',
  '/api/dataset/analyzer/v2/pipeline/schedules/all',
];

test.describe('access control', () => {
  for (const path of PROTECTED) {
    test(`no token: ${path} returns 401`, async ({ anon }) => {
      const res = await anon.get(path);
      expect(res.status()).toBe(401);
      expect(Unauthorized.parse(await res.json())).toEqual({ detail: 'Unauthorized' });
    });
  }

  test('a made-up token is rejected', async () => {
    const forged = await apiClient('not-a-real-token');
    const res = await forged.get('/api/dataset/projects/all');
    expect(res.status()).toBe(401);
    Unauthorized.parse(await res.json());
    await forged.dispose();
  });

  test('no token: project nodes return 401, not the pipeline', async ({ anon, projectId }) => {
    const res = await anon.get(`/api/dataset/analyzer/v2/projects/${projectId}/nodes`);
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toContain('input_node');
  });

  test('signed in: a project id that does not exist returns 404', async ({ api }) => {
    const res = await api.get('/api/dataset/analyzer/v2/projects/999999999/nodes');
    expect(res.status()).toBe(404);
    NotFound.parse(await res.json());
  });
});
