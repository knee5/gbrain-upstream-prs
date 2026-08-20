import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runEvalPrivateBench,
  evaluateArmMeta,
  resolvePrivateBenchSplit,
  selectSplitQueries,
  receiptMetricKeysHaveGloss,
  PRIVATE_BENCH_ARM_METRICS,
  type PrivateBenchQuery,
} from '../src/commands/eval-private-bench.ts';
import type { HybridSearchMeta } from '../src/core/types.ts';

async function exitRun(args: string[]): Promise<number | undefined> {
  const exit = process.exit;
  let code: number | undefined;
  process.exit = ((c?: number) => { code = c; throw new Error(`exit ${c}`); }) as typeof process.exit;
  try {
    await runEvalPrivateBench({} as never, args);
    return code;
  } catch {
    return code;
  } finally {
    process.exit = exit;
  }
}

function qrelsFile(queries: PrivateBenchQuery[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'private-bench-'));
  const path = join(dir, 'qrels.json');
  writeFileSync(path, JSON.stringify({
    schema_version: 1,
    benchmark_id: 't',
    privacy_class: 'private_local_only',
    split_seed: 's',
    queries,
  }));
  return path;
}

const reviewedDev: PrivateBenchQuery = {
  query_id: 'q_dev______________',
  query: 'x',
  source_id: 'default',
  split: 'development',
  label_status: 'reviewed',
  privacy_reviewed: true,
  relevant: [{ source_id: 'default', slug: 'ops/decisions' }],
};

describe('evaluateArmMeta', () => {
  const ablation: HybridSearchMeta = {
    vector_enabled: false,
    vector_disabled_reason: 'explicit_ablation',
    detail_resolved: null,
    expansion_applied: false,
    intent: 'general',
    mode: 'balanced',
  };
  const noProvider: HybridSearchMeta = {
    ...ablation,
    vector_disabled_reason: 'no_provider',
  };
  const embedFailed: HybridSearchMeta = {
    ...ablation,
    vector_disabled_reason: 'embed_failed',
  };
  const hybridOn: HybridSearchMeta = {
    vector_enabled: true,
    detail_resolved: null,
    expansion_applied: false,
    intent: 'general',
    mode: 'balanced',
  };

  test('lexical passes only explicit_ablation', () => {
    expect(evaluateArmMeta('lexical', ablation)).toBe('ok');
    expect(evaluateArmMeta('lexical', noProvider)).toBe('vector_proof_failed');
    expect(evaluateArmMeta('lexical', embedFailed)).toBe('vector_proof_failed');
    expect(evaluateArmMeta('lexical', hybridOn)).toBe('vector_proof_failed');
    expect(evaluateArmMeta('lexical', null)).toBe('meta_missing');
  });

  test('hybrid passes only vector_enabled true', () => {
    expect(evaluateArmMeta('hybrid', hybridOn)).toBe('ok');
    expect(evaluateArmMeta('hybrid', ablation)).toBe('vector_proof_failed');
    expect(evaluateArmMeta('hybrid', noProvider)).toBe('vector_proof_failed');
    expect(evaluateArmMeta('hybrid', null)).toBe('meta_missing');
  });
});

describe('split defaulting', () => {
  test('resolvePrivateBenchSplit defaults to development', () => {
    expect(resolvePrivateBenchSplit([])).toBe('development');
    expect(resolvePrivateBenchSplit(['--split', 'heldout'])).toBe('heldout');
  });

  test('selectSplitQueries scores only the named split', () => {
    const mixed: PrivateBenchQuery[] = [
      reviewedDev,
      { ...reviewedDev, query_id: 'q_hold_____________', split: 'heldout' },
    ];
    expect(selectSplitQueries(mixed, 'development').map(q => q.query_id)).toEqual(['q_dev______________']);
    expect(selectSplitQueries(mixed, 'heldout')).toHaveLength(1);
  });
});

describe('glossary coverage', () => {
  test('every private-bench receipt metric has a gloss', () => {
    expect(receiptMetricKeysHaveGloss(PRIVATE_BENCH_ARM_METRICS)).toBe(true);
  });
});

describe('eval private-bench fail-closed', () => {
  test('exits 2 when --qrels is missing', async () => {
    expect(await exitRun([])).toBe(2);
  });

  test('exits 2 when the qrels file is unreadable', async () => {
    expect(await exitRun(['--qrels', '/no/such/qrels.json'])).toBe(2);
  });

  test('exits 1 when any query in the selected split is unlabeled', async () => {
    const path = qrelsFile([{ ...reviewedDev, label_status: 'unreviewed', relevant: [] }]);
    expect(await exitRun(['--qrels', path])).toBe(1);
  });

  test('exits 1 when reviewed count in the selected split is below 100', async () => {
    const path = qrelsFile([reviewedDev]);
    expect(await exitRun(['--qrels', path])).toBe(1);
  });

  test('default split ignores heldout rows so a heldout-only file fails the 100 gate', async () => {
    const heldout = Array.from({ length: 100 }, (_, i) => ({
      ...reviewedDev,
      query_id: `q_hold_${String(i).padStart(12, '0')}`,
      split: 'heldout' as const,
    }));
    const path = qrelsFile(heldout);
    expect(await exitRun(['--qrels', path])).toBe(1);
  });
});
