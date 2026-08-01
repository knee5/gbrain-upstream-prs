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

  test('identical batches return zero and mixed batches count only changed rows', async () => {
    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.41 },
    ])).toBe(2);

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

    expect(await engine.setEmotionalWeightBatch([
      { slug: 'notes/emotional-noop-a', source_id: 'default', weight: 0.31 },
      { slug: 'notes/emotional-noop-b', source_id: 'default', weight: 0.51 },
    ])).toBe(0);
  });
});
