import { test, expect } from '@playwright/test';
import { apiClient, bearerFromState, tamper } from '../client';
import { parse, requireAuth, requireEndpoint } from '../helpers';
import { cfg } from '../../support/env';

/** A 401/403 body must not echo any tenant data. */
function assertNoLeak(body: string): void {
  if (cfg.projectName) expect(body).not.toContain(cfg.projectName);
  if (cfg.email) expect(body).not.toContain(cfg.email);
  if (cfg.gcsBucket) expect(body).not.toContain(cfg.gcsBucket);
  if (cfg.s3Bucket) expect(body).not.toContain(cfg.s3Bucket);
  expect(body).not.toMatch(/"(data|items|projects)"\s*:\s*\[\s*\{/); // no populated collection
}

test.describe('auth (negative)', () => {
  test('no credentials -> 401/403 and body leaks nothing', async () => {
    requireEndpoint('listProjects');
    const api = await apiClient('none');
    const res = await api.get(parse('listProjects').path, { maxRedirects: 0 });
    // A 3xx to a login page is also a correct refusal for a browser-oriented API; record it.
    if (res.status() >= 300 && res.status() < 400) {
      test.info().annotations.push({ type: 'note', description: `redirected to ${res.headers().location}` });
      expect(res.headers().location ?? '').toMatch(/login|sign-?in|auth/i);
      return;
    }
    expect([401, 403]).toContain(res.status());
    assertNoLeak(await res.text());
  });

  test('tampered bearer token -> 401', async () => {
    requireEndpoint('listProjects');
    requireAuth();
    const token = bearerFromState();
    test.skip(!token, 'session is cookie-based (no bearer in storageState); tampered-cookie variant TODO');
    const api = await apiClient({ bearer: tamper(token!) });
    const res = await api.get(parse('listProjects').path, { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    assertNoLeak(await res.text());
  });

  test('garbage bearer token -> 401', async () => {
    requireEndpoint('listProjects');
    const api = await apiClient({ bearer: 'not-a-real-token' });
    const res = await api.get(parse('listProjects').path, { maxRedirects: 0 });
    expect([401, 403]).toContain(res.status());
    assertNoLeak(await res.text());
  });
});
