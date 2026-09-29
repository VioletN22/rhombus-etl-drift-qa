import path from 'node:path';
import fs from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ quiet: true });

export const STORAGE_STATE = path.resolve(__dirname, '..', '.auth', 'user.json');

/** Read an env var; returns undefined for empty strings so `?? default` behaves. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export const cfg = {
  email: env('RHOMBUS_EMAIL'),
  password: env('RHOMBUS_PASSWORD'),
  baseURL: env('RHOMBUS_BASE_URL') ?? 'https://rhombusai.com',
  apiURL: env('RHOMBUS_API_URL'),
  projectName: env('RHOMBUS_PROJECT_NAME'),
  s3Bucket: env('S3_BUCKET'),
  s3Key: env('S3_KEY') ?? 'input/orders.csv',
  gcsBucket: env('GCS_BUCKET'),
  gcsPrefix: env('GCS_PREFIX') ?? '',
  scheduleCron: env('SCHEDULE_CRON'),
  scheduleTz: env('SCHEDULE_TZ') ?? 'Australia/Sydney',
};

export const hasCreds = (): boolean => !!(cfg.email && cfg.password);

/** True when auth.setup.ts produced a real (non-empty) storage state. */
export function hasAuthState(): boolean {
  try {
    const s = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8'));
    return (s.cookies?.length ?? 0) > 0 || (s.origins?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Unique, sortable name for anything the tests create: qa-<label>-20260929T101500Z-ab12 */
export function uniqueName(label: string): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `qa-${label}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
}
