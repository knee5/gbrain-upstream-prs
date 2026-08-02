import type { EmotionalWeightWriteRow } from './types.ts';

/**
 * Collapse exact duplicate composite keys and reject conflicting duplicates.
 *
 * PostgreSQL does not define which source row wins when an UPDATE joins more
 * than one input row to the same target. Rejecting conflicts keeps both engines
 * deterministic and prevents repeated calls from oscillating stored weights.
 */
export function normalizeEmotionalWeightBatch(
  rows: EmotionalWeightWriteRow[],
): EmotionalWeightWriteRow[] {
  const unique = new Map<string, EmotionalWeightWriteRow>();

  for (const row of rows) {
    const key = JSON.stringify([row.source_id, row.slug]);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, row);
      continue;
    }
    if (existing.weight !== row.weight) {
      throw new Error(
        'Conflicting emotional-weight rows for the same (slug, source_id)',
      );
    }
  }

  return [...unique.values()];
}
