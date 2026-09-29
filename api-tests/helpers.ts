import { test } from '@playwright/test';
import { ep, isTodo, type EndpointKey } from './endpoints';
import { apiBaseURL, hasAuth } from './client';

/** Split "GET /api/x" into method + path. */
export function parse(key: EndpointKey): { method: string; path: string } {
  const [method, p] = ep[key].replace(/^TODO\s+/, '').split(/\s+/);
  return { method, path: p };
}

export function requireEndpoint(...keys: EndpointKey[]): void {
  const todo = keys.filter(isTodo);
  test.skip(todo.length > 0, `endpoint still TODO in api-tests/endpoints.ts: ${todo.join(', ')}`);
  test.skip(!apiBaseURL(), 'RHOMBUS_API_URL not set');
}

export function requireAuth(): void {
  test.skip(!hasAuth(), 'no cookies/token in .auth/user.json; run the ui setup project with creds first');
}
