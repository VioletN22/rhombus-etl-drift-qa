/**
 * Authenticated reads of the endpoints the canvas loads, checked for status, shape and
 * content. Endpoints were taken from the browser's network tab (see api-tests/endpoints.md).
 */
import { test, expect } from '../fixtures';
import { Executions, ProjectList, ProjectNodes } from '../schemas';
import { cfg } from '../../support/env';
import { reachable, type Edge } from '../../support/graph';

test.describe('project and pipeline', () => {
  test('project list includes the test project', async ({ api }) => {
    const res = await api.get('/api/dataset/projects/all');
    expect(res.status()).toBe(200);
    const body = ProjectList.parse(await res.json());
    expect(body.items.map((p) => p.name)).toContain(cfg.projectName);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
  });

  test('pipeline nodes form one path from input to output', async ({ api, projectId }) => {
    const res = await api.get(`/api/dataset/analyzer/v2/projects/${projectId}/nodes`);
    expect(res.status()).toBe(200);
    const nodes = ProjectNodes.parse(await res.json());

    // Node ids say what each node is: input_node_1, llm_node_2, output_node_1, ...
    const ids = nodes.map((n) => n.metadata.node.id);
    const inputs = ids.filter((id) => id.startsWith('input_'));
    const outputs = ids.filter((id) => id.startsWith('output_'));
    expect(inputs).toHaveLength(1);
    expect(outputs).toHaveLength(1);
    expect(ids.length - 2, 'cleaning steps').toBeGreaterThanOrEqual(3);

    const edges: Edge[] = nodes.flatMap((n) => n.metadata.edges.map((e): Edge => [e.source, e.target]));
    const fromInput = reachable(edges, inputs[0]);
    expect(fromInput.has(outputs[0]), 'output reachable from input').toBe(true);
    expect([...fromInput].sort()).toEqual([...ids].sort());
  });

  test('every failed run records the failing node and an error', async ({ api, projectId }) => {
    const res = await api.get('/api/dataset/analyzer/v2/pipeline/executions/all');
    expect(res.status()).toBe(200);
    const runs = Executions.parse(await res.json()).executions.filter((r) => r.project_id === projectId);
    expect(runs.length, 'runs for this project').toBeGreaterThan(0);

    for (const run of runs.filter((r) => !r.success)) {
      expect(run.failed_node, `failed run at ${run.started_at} names a node`).not.toBeNull();
      expect(run.error_message, `failed run at ${run.started_at} has an error`).toBeTruthy();
    }
  });
});
