/**
 * API access the way the Rhombus web app does it: the app's own session endpoint
 * (rhombusai.com/api/auth/session) returns a bearer token, which every call to
 * api.rhombusai.com sends. The session cookie comes from the UI suite's saved login.
 */
import { request, type APIRequestContext } from '@playwright/test';
import { STORAGE_STATE, cfg } from '../support/env';

export const API_URL = cfg.apiURL ?? 'https://api.rhombusai.com';

export async function sessionToken(): Promise<string> {
  const web = await request.newContext({ baseURL: cfg.baseURL, storageState: STORAGE_STATE });
  try {
    const res = await web.get('/api/auth/session');
    if (!res.ok()) throw new Error(`session endpoint returned ${res.status()}`);
    const token = (await res.json()).accessToken;
    if (!token) throw new Error('no accessToken in the session; run `npm run login`');
    return token;
  } finally {
    await web.dispose();
  }
}

/** A request context for api.rhombusai.com. Pass no token for an unauthenticated client. */
export function apiClient(token?: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
