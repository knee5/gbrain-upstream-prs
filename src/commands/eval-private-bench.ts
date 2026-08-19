/**
 * gbrain eval private-bench --qrels <file> [--out receipt.json]
 *
 * Three-arm private retrieval bench: lexical (vector=false), hybrid
 * (vector+keyword, expansion off), and semantic (hybrid that must prove
 * vector_enabled=true). Fail closed on unlabeled rows, fewer than 100
 * reviewed queries, source leaks, or missing arm metadata.
 *
 * Reuses parseQrelsFile for the query/relevant shape and metric-glossary
 * for recall@5 + mrr. Calls bare hybridSearch (not hybridSearchCached) so
 * a lexical arm cannot read a hybrid cache row. Does not manufacture
 * qrels. Harvest stays `gbrain eval export` plus the staging
 * bootstrap_candidates.py.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { BrainEngine } from '../core/engine.ts';
import { hybridSearch } from '../core/search/hybrid.ts';
import { mrr as mrrAtK } from '../core/search/eval.ts';
import {
  parseQrelsFile,
  computeRecallAtK,
  QrelsParseError,
  refKey,
} from '../core/bench/qrels-file.ts';
import { buildMetricGlossaryMeta } from '../core/eval/metric-glossary.ts';
import type { HybridSearchMeta } from '../core/types.ts';

interface Relevance {
  source_id: string;
  slug: string;
  grade?: number;
}

interface BenchQuery {
  query_id: string;
  query: string;
  source_id: string;
  split: 'development' | 'heldout';
  label_status: 'unreviewed' | 'reviewed';
  privacy_reviewed: boolean;
  relevant: Relevance[];
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx]!;
}

function repoRoot(): string {
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return process.cwd();
  }
}

function appendLedger(record: Record<string, unknown>, ledgerPath?: string): void {
  const path = ledgerPath ?? join(repoRoot(), '.gbrain-evals', 'eval-results.jsonl');
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8');
}

export async function runEvalPrivateBench(engine: BrainEngine, args: string[]): Promise<void> {
  const qrelsIdx = args.indexOf('--qrels');
  const outIdx = args.indexOf('--out');
  const ledgerIdx = args.indexOf('--ledger');
  const qrelsPath = qrelsIdx >= 0 ? args[qrelsIdx + 1] : args.find(a => !a.startsWith('--'));
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  const ledgerPath = ledgerIdx >= 0 ? args[ledgerIdx + 1] : undefined;
  if (!qrelsPath) {
    console.error('Usage: gbrain eval private-bench --qrels <file.json> [--out receipt.json] [--ledger eval-results.jsonl]');
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
  const rawQueries = raw.queries as BenchQuery[];
  const unlabeled = rawQueries.filter(q => q.label_status !== 'reviewed');
  if (unlabeled.length > 0) {
    console.error(`Fail closed: ${unlabeled.length} unlabeled quer${unlabeled.length === 1 ? 'y' : 'ies'}`);
    process.exit(1);
  }
  const reviewedRaw = rawQueries.filter(
    q => q.label_status === 'reviewed' && q.privacy_reviewed && Array.isArray(q.relevant) && q.relevant.length > 0,
  );
  if (reviewedRaw.length < 100) {
    console.error(`Fail closed: ${reviewedRaw.length} reviewed queries (need >= 100)`);
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
  const arms = [
    { name: 'lexical', opts: { vector: false as const, expansion: false } },
    { name: 'hybrid', opts: { expansion: false } },
    { name: 'semantic', opts: { expansion: false } },
  ] as const;

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
      let meta: HybridSearchMeta | null = null;
      const t0 = Date.now();
      const results = await hybridSearch(engine, q.query, {
        limit: 10,
        sourceId: rawQ.source_id,
        ...arm.opts,
        onMeta: (m) => { meta = m; },
      });
      lats.push(Date.now() - t0);
      if (!meta) metaMissing += 1;
      if (arm.name === 'lexical') {
        if (!meta || meta.vector_enabled !== false || meta.vector_disabled_reason !== 'explicit_ablation') {
          vectorProofFailed += 1;
        }
      } else if (arm.name === 'semantic' || arm.name === 'hybrid') {
        if (!meta || meta.vector_enabled !== true) vectorProofFailed += 1;
      }
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
      hit_at_5: hits.filter(Boolean).length / hits.length,
      mrr: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
      p95_latency_ms: p95(lats),
    };
  }

  const receipt = {
    schema_version: 1,
    kind: 'gbrain-private-bench',
    benchmark_id: raw.benchmark_id,
    split_seed: raw.split_seed,
    reviewed: parsed.queries.length,
    arms: armReports,
    _meta: {
      metric_glossary: buildMetricGlossaryMeta(['recall@5', 'mrr']),
    },
  };
  const text = JSON.stringify(receipt, null, 2);
  if (outPath) writeFileSync(outPath, text + '\n');
  appendLedger({
    schema_version: 3,
    suite: 'private-bench',
    mode: 'n/a',
    ran_at: new Date().toISOString(),
    status: 'completed',
    params: { qrels: qrelsPath, reviewed: parsed.queries.length },
    receipt,
  }, ledgerPath);
  console.log(text);
}
