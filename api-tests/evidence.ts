import { test } from '@playwright/test';

/** Attaches a response body to the current test, so the report shows what the API returned. */
export async function attachJson(label: string, body: unknown): Promise<void> {
  await test.info().attach(`api: ${label}`, { body: JSON.stringify(body, null, 2), contentType: 'application/json' });
}
