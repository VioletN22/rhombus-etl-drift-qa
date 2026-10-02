/**
 * Response shapes for the endpoints under test, written from real responses captured in
 * the browser's network tab. Only the fields the tests rely on are declared; extra fields
 * are allowed so harmless additions on Rhombus's side don't break the suite.
 */
import { z } from 'zod';

export const ProjectList = z.object({
  total: z.number(),
  items: z.array(z.object({ id: z.number(), name: z.string(), created: z.string() })),
});

const Edge = z.object({ source: z.string(), target: z.string() });
export const ProjectNodes = z.array(
  z.object({
    name: z.string(),
    outputs: z.array(z.string()),
    metadata: z.object({ node: z.object({ id: z.string() }), edges: z.array(Edge) }),
  }),
);

export const Executions = z.object({
  total: z.number(),
  executions: z.array(
    z.object({
      project_id: z.number(),
      trigger: z.string(),
      started_at: z.string(),
      completed_at: z.string().nullable(),
      success: z.boolean(),
      failed_node: z.string().nullable(),
      error_message: z.string().nullable(),
    }),
  ),
});

export const Schedules = z.object({
  total: z.number(),
  schedules: z.array(
    z.object({
      project_id: z.number(),
      cron_expression: z.string(),
      enabled: z.boolean(),
      next_run_at: z.string().nullable(),
      last_run_at: z.string().nullable(),
      skipped_runs_count: z.number(),
    }),
  ),
});

export const Unauthorized = z.object({ detail: z.literal('Unauthorized') });
export const NotFound = z.object({ detail: z.literal('Not Found') });
