/** Offline checks for the client helpers. Runs with no network or creds. */
import { test, expect } from '@playwright/test';
import { bearerFromState, tamper } from '../client';
import { path } from '../endpoints';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

test('bearerFromState finds a raw JWT and a JSON-wrapped token', () => {
  expect(bearerFromState({ cookies: [], origins: [{ origin: 'x', localStorage: [{ name: 'foo', value: jwt }] }] })).toBe(jwt);
  expect(
    bearerFromState({ cookies: [], origins: [{ origin: 'x', localStorage: [{ name: 'auth', value: JSON.stringify({ access_token: 'abc' }) }] }] }),
  ).toBe('abc');
  expect(bearerFromState({ cookies: [], origins: [] })).toBeNull();
});

test('tamper changes exactly one character', () => {
  const t = tamper(jwt);
  expect(t).not.toBe(jwt);
  expect(t).toHaveLength(jwt.length);
  expect([...t].filter((c, i) => c !== jwt[i])).toHaveLength(1);
});

test('path substitutes and encodes params, rejects missing ones', () => {
  expect(path('/p/:projectId/runs', { projectId: 'a b' })).toBe('/p/a%20b/runs');
  expect(() => path('/p/:projectId', {})).toThrow(/projectId/);
});
