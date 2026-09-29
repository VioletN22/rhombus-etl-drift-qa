/**
 * Read-only, property-based checks on the AI-built graph. The agent is non-deterministic,
 * so we assert invariants (shape, connectivity, non-empty previews), never exact node names.
 */
import { test, expect, requireLogin } from '../fixtures';
import { cfg } from '../../support/env';

test.describe('pipeline graph invariants (read-only)', () => {
  requireLogin();

  test.beforeEach(async ({ project, canvas }) => {
    await project.open(cfg.projectName!);
    await canvas.waitReady();
  });

  test('exactly one Data Input and one Data Output', async ({ canvas }) => {
    const names = await canvas.nodeNames();
    expect(names.filter((n) => /data input/i.test(n))).toHaveLength(1);
    expect(names.filter((n) => /data output/i.test(n))).toHaveLength(1);
  });

  test('at least 3 transformer nodes, all distinctly named', async ({ canvas }) => {
    const t = await canvas.transformerNames();
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(new Set(t).size, `duplicate names: ${t.join(', ')}`).toBe(t.length);
  });

  test('graph is connected: edges >= nodes - 1', async ({ canvas }) => {
    const nodes = await canvas.nodeCount();
    expect(await canvas.edgeCount()).toBeGreaterThanOrEqual(nodes - 1);
  });

  test('output preview keeps a header and has rows', async ({ canvas }) => {
    const { headers, rowCount } = await canvas.previewNode(/data output/i);
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((h) => h.length > 0), 'no blank column headers').toBe(true);
    expect(rowCount).toBeGreaterThan(0);
  });
});
