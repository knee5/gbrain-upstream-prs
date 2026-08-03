/**
 * Real-Postgres regression for salience write amplification.
 *
 * The old UPDATE matched and rewrote every input row even when the stored
 * emotional_weight was identical. RETURNING therefore reported false work and
 * repeated salience cycles churned page tuples. This suite contains no vector
 * fixture so it isolates the exact SQL contract.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { BrainEngine } from '../../src/core/engine.ts';
import { hasDatabase, setupDB, teardownDB } from './helpers.ts';

const describePostgres = hasDatabase() ? describe : describe.skip;

describePostgres('Postgres setEmotionalWeightBatch no-op guard', () => {
  let engine: BrainEngine;

  beforeAll(async () => {
    engine = await setupDB();
    await engine.putPage('notes/emotional-noop-a', {
      type: 'note',
      title: 'Emotional no-op A',
      compiled_truth: 'Postgres no-op write fixture A.',
    });
    await engine.putPage('notes/emotional-noop-b', {
      type: 'note',
      title: 'Emotional no-op B',
      compiled_truth: 'Postgres no-op write fixture B.',
    });
  }, 90_000);

  afterAll(async () => {
    await teardownDB();
  });

  test('empty and missing tuples return zero', async () => {
    expect(await engine.setEmotionalWeightBatch([])).toBe(0);
    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-missing', source_id: 'default', weight: 0.99 },
    ])).toBe(0);
  });

  test('identical batches return zero and mixed batches count only changed rows', async () => {
    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.41 },
    ])).toBe(2);

    await engine.executeRaw(
      `UPDATE pages
          SET salience_touched_at = '2000-01-01T00:00:00Z'::timestamptz
        WHERE slug IN ('notes/emotional-noop-a', 'notes/emotional-noop-b')
          AND source_id = 'default'`,
    );

    const before = await engine.executeRaw<{
      slug: string;
      salience_touched_at: string;
    }>(
      `SELECT slug, salience_touched_at::text AS salience_touched_at
         FROM pages
        WHERE slug IN ('notes/emotional-noop-a', 'notes/emotional-noop-b')
        ORDER BY slug`,
    );

    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.51 },
    ])).toBe(1);

    const afterMixed = await engine.executeRaw<{
      slug: string;
      emotional_weight: number;
      salience_touched_at: string;
    }>(
      `SELECT slug, emotional_weight, salience_touched_at::text AS salience_touched_at
         FROM pages
        WHERE slug IN ('notes/emotional-noop-a', 'notes/emotional-noop-b')
        ORDER BY slug`,
    );
    expect(afterMixed[0].slug).toBe('notes/emotional-noop-a');
    expect(afterMixed[0].salience_touched_at).toBe(before[0].salience_touched_at);
    expect(Number(afterMixed[1].emotional_weight)).toBeCloseTo(0.51, 5);
    expect(new Date(afterMixed[1].salience_touched_at).getTime())
      .toBeGreaterThan(new Date(before[1].salience_touched_at).getTime());

    const generationBeforeNoOp = await engine.executeRaw<{ value: string }>(
      `SELECT last_value::text AS value FROM page_generation_clock_seq`,
    );
    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.51 },
    ])).toBe(0);
    const generationAfterNoOp = await engine.executeRaw<{ value: string }>(
      `SELECT last_value::text AS value FROM page_generation_clock_seq`,
    );
    expect(generationAfterNoOp[0].value).toBe(generationBeforeNoOp[0].value);
  });

  test('same-slug rows remain scoped to their source', async () => {
    await engine.putPage('notes/emotional-noop-scoped', {
      type: 'note',
      title: 'Default-source scoped fixture',
      compiled_truth: 'Default-source fixture.',
    });
    await engine.executeRaw(
      `INSERT INTO sources (id, name)
       VALUES ('salience-noop-alt', 'Salience no-op alternate source')`,
    );
    await engine.executeRaw(
      `INSERT INTO pages (source_id, slug, type, title, compiled_truth)
       VALUES ('salience-noop-alt', 'notes/emotional-noop-scoped', 'note',
               'Alternate-source scoped fixture', 'Alternate-source fixture.')`,
    );

    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-scoped', source_id: 'default', weight: 0.61 },
    ])).toBe(1);
    const scopedRows = await engine.executeRaw<{
      source_id: string;
      emotional_weight: number;
    }>(
      `SELECT source_id, emotional_weight
         FROM pages
        WHERE slug = 'notes/emotional-noop-scoped'
        ORDER BY source_id`,
    );
    expect(scopedRows.map(row => row.source_id)).toEqual(['default', 'salience-noop-alt']);
    expect(Number(scopedRows[0].emotional_weight)).toBeCloseTo(0.61, 5);
    expect(Number(scopedRows[1].emotional_weight)).toBe(0);
  });

  test('exact duplicate keys collapse and conflicting duplicates fail closed', async () => {
    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.71 },
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.71 },
    ])).toBe(1);

    const beforeConflict = await engine.executeRaw<{ emotional_weight: number }>(
      `SELECT emotional_weight
         FROM pages
        WHERE slug = 'notes/emotional-noop-a' AND source_id = 'default'`,
    );
    await expect(engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.81 },
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.91 },
    ])).rejects.toThrow('Conflicting emotional-weight rows');
    const afterConflict = await engine.executeRaw<{ emotional_weight: number }>(
      `SELECT emotional_weight
         FROM pages
        WHERE slug = 'notes/emotional-noop-a' AND source_id = 'default'`,
    );
    expect(Number(afterConflict[0].emotional_weight))
      .toBeCloseTo(Number(beforeConflict[0].emotional_weight), 5);
  });

  test('overlapping reversed batches lock deterministically and complete without deadlock', async () => {
    const forward = [
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.21 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.22 },
    ];
    const reverse = [
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.32 },
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
    ];

    const counts = await Promise.all([
      engine.setEmotionalWeightBatch(forward),
      engine.setEmotionalWeightBatch(reverse),
    ]);
    expect(counts).toEqual([2, 2]);

    const after = await engine.executeRaw<{ emotional_weight: number }>(
      `SELECT emotional_weight
         FROM pages
        WHERE slug IN ('notes/emotional-noop-a', 'notes/emotional-noop-b')
          AND source_id = 'default'
        ORDER BY slug`,
    );
    const weights = after.map(row => Number(row.emotional_weight));
    expect(weights).toHaveLength(2);
    expect(
      (Math.abs(weights[0] - 0.21) < 0.00001 && Math.abs(weights[1] - 0.22) < 0.00001)
      || (Math.abs(weights[0] - 0.31) < 0.00001 && Math.abs(weights[1] - 0.32) < 0.00001),
    ).toBe(true);
  });

  test('complementary batches cannot commit a mixed result', async () => {
    await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.11 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.12 },
    ]);

    // Widen the interval between preflight and row mutation so the broken
    // changed-row-only lock deterministically lets both preflights finish.
    await engine.executeRaw(`
      CREATE OR REPLACE FUNCTION salience_overlap_pause_fn() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.2);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER salience_overlap_pause_trg
        BEFORE UPDATE ON pages
        FOR EACH STATEMENT
        EXECUTE FUNCTION salience_overlap_pause_fn()
    `);

    const left = [
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.11 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.22 },
    ];
    const right = [
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.21 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.12 },
    ];

    try {
      await Promise.all([
        engine.setEmotionalWeightBatch(left),
        engine.setEmotionalWeightBatch(right),
      ]);
    } finally {
      await engine.executeRaw(`DROP TRIGGER IF EXISTS salience_overlap_pause_trg ON pages`);
      await engine.executeRaw(`DROP FUNCTION IF EXISTS salience_overlap_pause_fn()`);
    }

    const after = await engine.executeRaw<{ emotional_weight: number }>(
      `SELECT emotional_weight
         FROM pages
        WHERE slug IN ('notes/emotional-noop-a', 'notes/emotional-noop-b')
          AND source_id = 'default'
        ORDER BY slug`,
    );
    const weights = after.map(row => Number(row.emotional_weight));
    expect(weights).toHaveLength(2);
    expect(
      (Math.abs(weights[0] - 0.11) < 0.00001 && Math.abs(weights[1] - 0.22) < 0.00001)
      || (Math.abs(weights[0] - 0.21) < 0.00001 && Math.abs(weights[1] - 0.12) < 0.00001),
    ).toBe(true);
  });
});
