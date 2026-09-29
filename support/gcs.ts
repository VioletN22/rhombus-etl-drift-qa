/**
 * Minimal GCS check used after a pipeline run. @google-cloud/storage is an optional
 * dependency and is imported lazily, so the suite works without it or without creds.
 */
import fs from 'node:fs';

export interface GcsObject { name: string; created: Date; size: number }

export function gcsAvailable(): { ok: boolean; reason: string } {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!process.env.GCS_BUCKET) return { ok: false, reason: 'GCS_BUCKET not set' };
  if (!key || !fs.existsSync(key)) return { ok: false, reason: 'GOOGLE_APPLICATION_CREDENTIALS missing or file not found' };
  try {
    require.resolve('@google-cloud/storage');
  } catch {
    return { ok: false, reason: '@google-cloud/storage not installed (optional dependency)' };
  }
  return { ok: true, reason: '' };
}

export async function listObjectsSince(bucket: string, prefix: string, since: Date): Promise<GcsObject[]> {
  const { Storage } = await import('@google-cloud/storage');
  const [files] = await new Storage().bucket(bucket).getFiles({ prefix });
  return files
    .map((f) => ({
      name: f.name,
      created: new Date(String(f.metadata.timeCreated)),
      size: Number(f.metadata.size ?? 0),
    }))
    .filter((o) => o.created.getTime() >= since.getTime());
}
