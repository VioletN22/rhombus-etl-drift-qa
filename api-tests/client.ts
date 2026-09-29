import fs from 'node:fs';
import { request, type APIRequestContext } from '@playwright/test';
import { STORAGE_STATE, cfg } from '../support/env';

interface StorageState {
  cookies: { name: string; value: string; domain: string }[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
}

function readState(): StorageState | null {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8')) as StorageState;
  } catch {
    return null;
  }
}

/**
 * Look for a bearer token in localStorage (JWT-shaped or under a token-ish key).
 * TODO discovery day: pin TOKEN_KEY to the real key if the app stores one.
 */
const TOKEN_KEY: RegExp = /token|auth|session|jwt/i;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

export function bearerFromState(state = readState()): string | null {
  for (const o of state?.origins ?? []) {
    for (const { name, value } of o.localStorage) {
      if (JWT.test(value)) return value;
      if (TOKEN_KEY.test(name)) {
        try {
          const parsed = JSON.parse(value);
          const t = parsed?.access_token ?? parsed?.accessToken ?? parsed?.token;
          if (typeof t === 'string') return t;
        } catch {
          if (value.length > 20) return value;
        }
      }
    }
  }
  return null;
}

export type AuthMode = 'auto' | 'none' | { bearer: string };

export const apiBaseURL = (): string | undefined => cfg.apiURL;

export const hasAuth = (): boolean => {
  const s = readState();
  return !!bearerFromState(s) || (s?.cookies.length ?? 0) > 0;
};

/**
 * APIRequestContext factory.
 * - 'auto': bearer from localStorage if present, plus the session cookies (both are sent;
 *   whichever the backend uses wins).
 * - 'none': no credentials at all (negative tests).
 * - { bearer }: explicit token only (tampered-token tests).
 */
export async function apiClient(auth: AuthMode = 'auto'): Promise<APIRequestContext> {
  const baseURL = apiBaseURL();
  if (!baseURL) throw new Error('RHOMBUS_API_URL not set');
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (auth === 'none') return request.newContext({ baseURL, extraHTTPHeaders: headers });

  if (typeof auth === 'object') {
    headers.Authorization = `Bearer ${auth.bearer}`;
    return request.newContext({ baseURL, extraHTTPHeaders: headers });
  }

  const token = bearerFromState();
  if (token) headers.Authorization = `Bearer ${token}`;
  const state = readState();
  return request.newContext({
    baseURL,
    extraHTTPHeaders: headers,
    storageState: state ? { cookies: state.cookies as never, origins: [] } : undefined,
  });
}

/** Flip one character in the signature part of a JWT (or the last char of an opaque token). */
export function tamper(token: string): string {
  const i = token.length - 2;
  const c = token[i] === 'A' ? 'B' : 'A';
  return token.slice(0, i) + c + token.slice(i + 1);
}
