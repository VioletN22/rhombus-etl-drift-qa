/**
 * Response contracts. Field names are guesses until discovery day (marked TODO);
 * adjust them to the real payload captured in endpoints.md. Keep schemas permissive
 * about extra fields (zod objects strip unknown keys by default) and strict about the
 * ones the tests rely on.
 */
import { z } from 'zod';

export const Project = z.object({
  id: z.union([z.string().min(1), z.number()]), // TODO: uuid? z.string().uuid()
  name: z.string().min(1), // TODO: maybe `title`
  createdAt: z.string().optional(), // TODO: ISO string? `created_at`?
});

/** TODO: bare array vs envelope ({ data: [...] } / { items: [...], total }). */
export const ProjectList = z.union([
  z.array(Project),
  z.object({ data: z.array(Project) }).transform((o) => o.data),
  z.object({ items: z.array(Project) }).transform((o) => o.items),
]);

export const RunStatus = z.enum(['Success', 'Failure', 'In Progress']); // TODO: API may use SUCCESS/FAILED/RUNNING

export const Run = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string(), // TODO: tighten to RunStatus once real values are known
  startedAt: z.string().optional(), // TODO: started_at?
  duration: z.number().nonnegative().nullable().optional(), // TODO: seconds? ms? durationMs?
});

export const RunHistory = z.union([
  z.array(Run),
  z.object({ data: z.array(Run) }).transform((o) => o.data),
  z.object({ runs: z.array(Run) }).transform((o) => o.runs),
]);

export const ErrorBody = z
  .object({
    message: z.string().optional(), // TODO: `error`, `detail` (FastAPI), `errors[]`?
    error: z.string().optional(),
    detail: z.unknown().optional(),
  })
  .refine((b) => b.message || b.error || b.detail, 'error body should carry a message');

export type TProject = z.infer<typeof Project>;
export type TRun = z.infer<typeof Run>;
