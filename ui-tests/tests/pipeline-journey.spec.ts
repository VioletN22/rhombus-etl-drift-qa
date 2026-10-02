/**
 * The pipeline journey from the brief: S3 connection, AI-built pipeline, GCS destination,
 * a run, and the schedule. Runs against the real drift-qa project with the baseline file
 * in S3. The AI builder names nodes differently each time, so the graph checks look at
 * node kinds and connections, never at names.
 */
import { test, expect } from '../fixtures';
import { cfg } from '../../support/env';
import type { Graph } from '../rhombus';

/** Node ids reachable from `start` by following edges forward. */
function reachable(graph: Graph, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const from = queue.shift()!;
    for (const [src, dst] of graph.edges) {
      if (src === from && !seen.has(dst)) {
        seen.add(dst);
        queue.push(dst);
      }
    }
  }
  return seen;
}

test.describe('S3 -> AI-built cleaning -> GCS', () => {
  test.beforeEach(async ({ rhombus }) => {
    await rhombus.openProject(cfg.projectName);
  });

  test('S3 source is connected to the input bucket', async ({ rhombus }) => {
    const dialog = await rhombus.connectionsDialog(cfg.s3Connection);
    expect(dialog).toContain('Amazon S3');
    expect(dialog).toContain('Connected');
    expect(dialog).toContain(`s3://${cfg.s3Bucket}/${cfg.s3Prefix}`);
  });

  test('AI-built graph runs from one input to one output through 3+ steps', async ({ rhombus }) => {
    const graph = await rhombus.graph();
    const inputs = graph.nodes.filter((n) => n.kind === 'input');
    const outputs = graph.nodes.filter((n) => n.kind === 'output');
    const steps = graph.nodes.filter((n) => n.kind !== 'input' && n.kind !== 'output');

    expect(inputs, 'input nodes').toHaveLength(1);
    expect(outputs, 'output nodes').toHaveLength(1);
    expect(steps.length, 'cleaning steps').toBeGreaterThanOrEqual(3);

    // Every node must sit on the path from input to output. A missing edge into the output
    // is exactly how the chatbot broke the pipeline in the all-combined case.
    const fromInput = reachable(graph, inputs[0].id);
    expect(fromInput.has(outputs[0].id), 'output reachable from input').toBe(true);
    expect([...fromInput].sort(), 'nodes off the input-to-output path').toEqual(graph.nodes.map((n) => n.id).sort());
  });

  test('Data Output writes CSV to the GCS bucket', async ({ rhombus }) => {
    const output = await rhombus.outputSettings(cfg.gcsBucket);
    expect(output.selected, `${cfg.gcsBucket} selected as destination`).toBe(true);
    expect(output.format).toBe('csv');
  });

  test('a manual run of the baseline file succeeds and is logged', async ({ rhombus }) => {
    test.setTimeout(5 * 60_000);
    const started = 'Pipeline execution started.';
    const before = await rhombus.countLogEntries(started);

    expect(await rhombus.runPipeline()).toBe('succeeded');
    await expect.poll(() => rhombus.countLogEntries(started), { message: 'new log entry for this run' }).toBe(before + 1);
  });

  test('a schedule exists and is switched on', async ({ rhombus }) => {
    const schedule = await rhombus.schedule();
    expect(schedule.enabled, 'schedule switch').toBe(true);
    expect(schedule.text).toContain('Active');
  });

  test('the active schedule shows when it will run next', async ({ rhombus }) => {
    // Known bug: scheduled runs never fired on this account, even after Rhombus enabled
    // scheduling, and "Next run" goes blank. Marked as an expected failure so the suite
    // stays green while the bug exists and turns red once Rhombus fixes it.
    test.fail(true, 'Scheduled runs do not fire; see observations/FINDINGS.md');
    const schedule = await rhombus.schedule();
    expect(schedule.text).toMatch(/Next run:[ \t]*\S/);
  });
});
