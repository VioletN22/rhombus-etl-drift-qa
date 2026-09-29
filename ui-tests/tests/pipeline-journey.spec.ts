import { test, expect, requireLogin } from '../fixtures';
import { cfg } from '../../support/env';
import { gcsAvailable, listObjectsSince } from '../../support/gcs';

test.describe('S3 -> AI cleaning -> GCS scheduled pipeline', () => {
  requireLogin();

  test('journey: connections, graph, output, schedule', async ({ project, sources, canvas, output, schedule }) => {
    await test.step('open project', async () => {
      await project.open(cfg.projectName!);
      await canvas.waitReady();
    });

    await test.step('S3 and GCS connections show connected', async () => {
      await sources.open();
      expect(await sources.s3Status()).toBe('connected');
      expect(await sources.gcsStatus()).toBe('connected');
      await project.open(cfg.projectName!);
    });

    await test.step('canvas: Data Input -> >= 3 transformers -> Data Output', async () => {
      await canvas.waitReady();
      const names = await canvas.nodeNames();
      expect(names.filter((n) => /data input/i.test(n)), `nodes: ${names.join(', ')}`).toHaveLength(1);
      expect(names.filter((n) => /data output/i.test(n)), `nodes: ${names.join(', ')}`).toHaveLength(1);
      expect((await canvas.transformerNames()).length).toBeGreaterThanOrEqual(3);
    });

    await test.step('output node targets GCS_BUCKET', async () => {
      test.skip(!cfg.gcsBucket, 'GCS_BUCKET not set');
      await output.open();
      expect(await output.destination()).toContain(cfg.gcsBucket!);
      expect((await output.format()).toLowerCase()).toContain('csv');
    });

    await test.step(`schedule shows expected cron and ${cfg.scheduleTz}`, async () => {
      await schedule.open();
      if (cfg.scheduleCron) expect(await schedule.cron()).toBe(cfg.scheduleCron);
      else expect(await schedule.cron()).toMatch(/^(\S+\s+){4}\S+$/); // at least a valid 5-field cron
      expect(await schedule.timezone()).toContain(cfg.scheduleTz);
    });
  });

  test('triggered run succeeds and lands a new CSV in GCS @slow', async ({ project, canvas, schedule }) => {
    test.setTimeout(20 * 60_000);
    let runStart!: Date;

    await test.step('open project and trigger a run', async () => {
      await project.open(cfg.projectName!);
      await canvas.waitReady();
      runStart = await canvas.run();
    });

    await test.step('run reaches Success (polled, no sleeps)', async () => {
      await expect
        .poll(() => schedule.latestRunStatus(), {
          message: 'latest run status',
          timeout: 15 * 60_000,
          intervals: [5_000, 10_000, 15_000, 30_000],
        })
        .toBe('Success');
      const [latest] = await schedule.runHistory();
      expect(latest.durationSec, 'successful run should report a duration').not.toBeNull();
    });

    await test.step('a new object appeared in GCS after the run started', async () => {
      const gcs = gcsAvailable();
      test.skip(!gcs.ok, `GCS check skipped: ${gcs.reason}`);
      const fresh = await listObjectsSince(cfg.gcsBucket!, cfg.gcsPrefix, runStart);
      expect(fresh.map((o) => o.name), 'objects created after run start').not.toHaveLength(0);
      expect(fresh.some((o) => o.name.endsWith('.csv') && o.size > 0)).toBe(true);
    });
  });
});
