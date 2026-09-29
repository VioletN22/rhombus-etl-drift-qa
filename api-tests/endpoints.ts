/**
 * Every API path the suite touches. Discovery day: fill these from api-tests/endpoints.md.
 * A value starting with 'TODO' makes the dependent test skip with a clear reason.
 * Use :param placeholders; fill them with `path(ep.x, { projectId })`.
 */
export const ep = {
  listProjects: 'TODO GET /api/projects',
  getProject: 'TODO GET /api/projects/:projectId',
  runHistory: 'TODO GET /api/projects/:projectId/runs',
  createConnection: 'TODO POST /api/connections',
} as const;

export type EndpointKey = keyof typeof ep;

export const isTodo = (key: EndpointKey): boolean => ep[key].startsWith('TODO');

/** Substitute :params. Throws if one is missing so a bad call never hits the server. */
export function path(tpl: string, params: Record<string, string> = {}): string {
  return tpl.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    if (!(k in params)) throw new Error(`missing path param :${k} for ${tpl}`);
    return encodeURIComponent(params[k]);
  });
}
