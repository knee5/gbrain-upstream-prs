import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runEvalPrivateBench } from '../src/commands/eval-private-bench.ts';

describe('eval private-bench fail-closed', () => {
  test('exits 1 when any query is unlabeled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'private-bench-'));
    const path = join(dir, 'qrels.json');
    writeFileSync(path, JSON.stringify({
      schema_version: 1,
      benchmark_id: 't',
      privacy_class: 'private_local_only',
      split_seed: 's',
      queries: [{
        query_id: 'q_aaaaaaaaaaaaaaaa',
        query: 'x',
        source_id: 'default',
        split: 'development',
        label_status: 'unreviewed',
        privacy_reviewed: false,
        relevant: [],
      }],
    }));
    const exit = process.exit;
    let code: number | undefined;
    process.exit = ((c?: number) => { code = c; throw new Error(`exit ${c}`); }) as typeof process.exit;
    try {
      await runEvalPrivateBench({} as never, ['--qrels', path]);
    } catch {
      // expected
    } finally {
      process.exit = exit;
    }
    expect(code).toBe(1);
  });
});
