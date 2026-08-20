/**
 * gbrain eval private-bench --qrels <file> [--out receipt.json] [--split development|heldout]
 *
 * Two-arm private retrieval bench: lexical (vector=false, explicit_ablation)
 * and hybrid (vector+keyword, expansion off). Fail closed on unlabeled rows
 * in the selected split, fewer than 100 reviewed queries, source leaks, or
 * missing arm metadata.
 *
 * Default split is development. Pass --split heldout to score the sealed
 * split. Reuses parseQrelsFile and the metric glossary. Calls bare
 * hybridSearch (not hybridSearchCached) so a lexical arm cannot read a
 * hybrid cache row. Does not manufacture qrels.
 */

import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import type { BrainEngine } from '../core/engine.ts';
import { hybridSearch } from '../core/search/hybrid.ts';
import { mrr as mrrAtK } from '../core/search/eval.ts';
import {
  parseQrelsFile,
  computeRecallAtK,
  QrelsParseError,
  refKey,
} from '../core/bench/qrels-file.ts';
import { buildMetricGlossaryMeta, getMetricGloss } from '../core/eval/metric-glossary.ts';
import type { HybridSearchMeta } from '../core/types.ts';
import { persistRunRecord, getRepoRoot, getCommitSha, type EvalRunRecord } from './eval-run-all.ts';

export const PRIVATE_BENCH_MIN_REVIEWED = 100;
export const PRIVATE_BENCH_ARM_METRICS = ['recall@5', 'hit@5', 'mrr', 'p95_latency_ms'] as const;

interface Relevance {
  source_id: string;
  slug: string;
  grade?: number;
}

export interface PrivateBenchQuery {
  query_id: string;
  query: string;
  source_id: string;
  split: 'development' | 'heldout';
  label_status: 'unreviewed' | 'reviewed';
  privacy_reviewed: boolean;
  relevant: Relevance[];
}

export type PrivateBenchArm = 'lexical' | 'hybrid';
export type PrivateBenchSplit = 'development' | 'heldout';
export type ArmMetaVerdict = 'ok' | 'meta_missing' | 'vector_proof_failed';

export function resolvePrivateBenchSplit(args: string[]): PrivateBenchSplit {
  const idx = args.indexOf('--split');
  const raw = idx >= 0 ? args[idx + 1] : 'development';
  if (raw === 'heldout' || raw === 'development') return raw;
  throw new Error(`--split must be development or heldout (got ${raw ?? 'missing'})`);
}

export function selectSplitQueries(
  queries: PrivateBenchQuery[],
  split: PrivateBenchSplit,
): PrivateBenchQuery[] {
  return queries.filter(q => (q.split ?? 'development') === split);
}

export function evaluateArmMeta(armName: PrivateBenchArm, meta: HybridSearchMeta | null): ArmMetaVerdict {
  if (!meta) return 'meta_missing';
  if (armName === 'lexical') {
    if (meta.vector_enabled !== false || meta.vector_disabled_reason !== 'explicit_ablation') {
      return 'vector_proof_failed';
    }
    return 'ok';
  }
  if (meta.vector_enabled !== true) return 'vector_proof_failed';
  return 'ok';
}

export function receiptMetricKeysHaveGloss(keys: readonly string[]): boolean {
  return keys.every(k => Boolean(getMetricGloss(k)?.eli10));
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx]!;
}

export async function runEvalPrivateBench(engine: BrainEngine, args: string[]): Promise<void> {
  const startedAt = Date.now();
  const qrelsIdx = args.indexOf('--qrels');
  const outIdx = args.indexOf('--out');
  const ledgerIdx = args.indexOf('--ledger');
  const qrelsPath = qrelsIdx >= 0 ? args[qrelsIdx + 1] : args.find(a => a && !a.startsWith('--') && a !== 'private-bench');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const ledgerDir = ledgerIdx >= 0 ? args[ledgerIdx + 1] : undefined;
  if (!qrelsPath) {
    console.error('Usage: gbrain eval private-bench --qrels <file.json> [--out receipt.json] [--split development|heldout] [--ledger dir]');
    process.exit(2);
  }

  let split: PrivateBenchSplit;
  try {
    split = resolvePrivateBenchSplit(args);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }

  let content: string;
  try {
    content = readFileSync(qrelsPath, 'utf8');
  } catch (e) {
    console.error(`Cannot read qrels: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  let raw: { schema_version?: unknown; benchmark_id?: unknown; split_seed?: unknown; queries?: unknown };
  try {
    raw = JSON.parse(content) as typeof raw;
  } catch (e) {
    console.error(`Cannot parse qrels JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  if (!Array.isArray(raw.queries)) {
    console.error('qrels file must contain a queries array');
    process.exit(2);
  }
  const rawQueries = raw.queries as PrivateBenchQuery[];
  const inSplit = selectSplitQueries(rawQueries, split);
  const unlabeled = inSplit.filter(q => q.label_status !== 'reviewed');
  if (unlabeled.length > 0) {
    console.error(`Fail closed: ${unlabeled.length} unlabeled quer${unlabeled.length === 1 ? 'y' : 'ies'} in split ${split}`);
    process.exit(1);
  }
  const reviewedRaw = inSplit.filter(
    q => q.label_status === 'reviewed' && q.privacy_reviewed && Array.isArray(q.relevant) && q.relevant.length > 0,
  );
  if (reviewedRaw.length < PRIVATE_BENCH_MIN_REVIEWED) {
    console.error(`Fail closed: ${reviewedRaw.length} reviewed queries in split ${split} (need >= ${PRIVATE_BENCH_MIN_REVIEWED})`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseQrelsFile(JSON.stringify({
      schema_version: 1,
      queries: reviewedRaw.map(q => ({
        query_id: q.query_id,
        query: q.query,
        relevant: q.relevant.map(r => ({ source_id: r.source_id, slug: r.slug })),
      })),
    }));
  } catch (e) {
    const msg = e instanceof QrelsParseError ? e.message : (e instanceof Error ? e.message : String(e));
    console.error(`Fail closed: qrels parse: ${msg}`);
    process.exit(1);
  }

  const byId = new Map(reviewedRaw.map(q => [q.query_id, q]));
  const arms: ReadonlyArray<{ name: PrivateBenchArm; opts: { vector?: false; expansion: false } }> = [
    { name: 'lexical', opts: { vector: false, expansion: false } },
    { name: 'hybrid', opts: { expansion: false } },
  ];

  const armReports: Record<string, unknown> = {};
  for (const arm of arms) {
    const recalls: number[] = [];
    const hits: boolean[] = [];
    const mrrs: number[] = [];
    const lats: number[] = [];
    let metaMissing = 0;
    let sourceLeaks = 0;
    let vectorProofFailed = 0;
    for (const q of parsed.queries) {
      const rawQ = byId.get(q.query_id);
      if (!rawQ) {
        console.error(`Fail closed: parsed query_id ${q.query_id} missing from reviewed set`);
        process.exit(1);
      }
      const metaBox: { current: HybridSearchMeta | null } = { current: null };
      const t0 = Date.now();
      const results = await hybridSearch(engine, q.query, {
        limit: 10,
        sourceId: rawQ.source_id,
        ...arm.opts,
        onMeta: (m) => { metaBox.current = m; },
      });
      lats.push(Date.now() - t0);
      const verdict = evaluateArmMeta(arm.name, metaBox.current);
      if (verdict === 'meta_missing') metaMissing += 1;
      if (verdict === 'vector_proof_failed') vectorProofFailed += 1;
      const gotKeys = results.map(r => refKey({ source_id: r.source_id ?? rawQ.source_id, slug: r.slug }));
      const relevantKeys = q.relevant.map(r => refKey(r));
      const relevantSet = new Set(relevantKeys);
      for (const r of results) {
        if (r.source_id && r.source_id !== rawQ.source_id) sourceLeaks += 1;
      }
      recalls.push(computeRecallAtK(gotKeys, relevantKeys, 5));
      hits.push(gotKeys.slice(0, 5).some(k => relevantSet.has(k)));
      mrrs.push(mrrAtK(gotKeys, relevantSet));
    }
    if (metaMissing > 0 || sourceLeaks > 0 || vectorProofFailed > 0) {
      console.error(`Fail closed on arm ${arm.name}: meta_missing=${metaMissing} source_leaks=${sourceLeaks} vector_proof_failed=${vectorProofFailed}`);
      process.exit(1);
    }
    armReports[arm.name] = {
      n: parsed.queries.length,
      'recall@5': recalls.reduce((a, b) => a + b, 0) / recalls.length,
      'hit@5': hits.filter(Boolean).length / hits.length,
      mrr: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
      p95_latency_ms: p95(lats),
    };
  }

  const glossKeys = [...PRIVATE_BENCH_ARM_METRICS];
  const receipt = {
    schema_version: 1,
    kind: 'gbrain-private-bench',
    benchmark_id: raw.benchmark_id,
    split_seed: raw.split_seed,
    split,
    reviewed: parsed.queries.length,
    arms: armReports,
    _meta: {
      metric_glossary: buildMetricGlossaryMeta(glossKeys),
    },
  };
  const text = JSON.stringify(receipt, null, 2);
  if (outPath) writeFileSync(outPath, text + '\n');
  const record: EvalRunRecord = {
    schema_version: 3,
    run_id: randomUUID(),
    ran_at: new Date().toISOString(),
    suite: 'private-bench',
    mode: 'n/a',
    commit: getCommitSha(),
    seed: 0,
    limit: 10,
    params: { qrels: qrelsPath, reviewed: parsed.queries.length, split, receipt },
    status: 'completed',
    duration_ms: Date.now() - startedAt,
  };
  persistRunRecord(getRepoRoot(), record, ledgerDir);
  console.log(text);
}
