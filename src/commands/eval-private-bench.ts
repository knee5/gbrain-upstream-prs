/**
 * gbrain eval private-bench --qrels <file> [--out receipt.json]
 *
 * Three-arm private retrieval bench: lexical (vector=false), hybrid
 * (vector+keyword, expansion off), and semantic (hybrid that must prove
 * vector_enabled=true). Fail closed on unlabeled rows, fewer than 100
 * reviewed queries, source leaks, or missing arm metadata.
 *
 * Does not manufacture qrels. Harvest stays `gbrain eval export` plus the
 * staging bootstrap_candidates.py.
 */

import { readFileSync, writeFileSync } from 'fs';
import type { BrainEngine } from '../core/engine.ts';
import { hybridSearch } from '../core/search/hybrid.ts';
import type { HybridSearchMeta } from '../core/types.ts';

interface Relevance {
  source_id: string;
  slug: string;
  grade: number;
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

interface BenchFile {
  schema_version: number;
  benchmark_id: string;
  privacy_class: string;
  split_seed: string;
  queries: BenchQuery[];
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx]!;
}

function recallAt5(got: string[], relevant: Set<string>): boolean {
  return got.slice(0, 5).some(slug => relevant.has(slug));
}

function mrrAt10(got: string[], relevant: Set<string>): number {
  const i = got.slice(0, 10).findIndex(slug => relevant.has(slug));
  return i === -1 ? 0 : 1 / (i + 1);
}

export async function runEvalPrivateBench(engine: BrainEngine, args: string[]): Promise<void> {
  const qrelsIdx = args.indexOf('--qrels');
  const outIdx = args.indexOf('--out');
  const qrelsPath = qrelsIdx >= 0 ? args[qrelsIdx + 1] : args.find(a => !a.startsWith('--'));
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
  if (!qrelsPath) {
    console.error('Usage: gbrain eval private-bench --qrels <file.json> [--out receipt.json]');
    process.exit(2);
  }

  let bench: BenchFile;
  try {
    bench = JSON.parse(readFileSync(qrelsPath, 'utf8')) as BenchFile;
  } catch (e) {
    console.error(`Cannot read qrels: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }

  if (!Array.isArray(bench.queries)) {
    console.error('qrels file must contain a queries array');
    process.exit(2);
  }
  const unlabeled = bench.queries.filter(q => q.label_status !== 'reviewed');
  if (unlabeled.length > 0) {
    console.error(`Fail closed: ${unlabeled.length} unlabeled quer${unlabeled.length === 1 ? 'y' : 'ies'}`);
    process.exit(1);
  }
  const reviewed = bench.queries.filter(q => q.label_status === 'reviewed' && q.privacy_reviewed && q.relevant.length > 0);
  if (reviewed.length < 100) {
    console.error(`Fail closed: ${reviewed.length} reviewed queries (need >= 100)`);
    process.exit(1);
  }

  const arms = [
    { name: 'lexical', opts: { vector: false as const, expansion: false } },
    { name: 'hybrid', opts: { expansion: false } },
    { name: 'semantic', opts: { expansion: false } },
  ] as const;

  const armReports: Record<string, unknown> = {};
  for (const arm of arms) {
    const recalls: boolean[] = [];
    const mrrs: number[] = [];
    const lats: number[] = [];
    let metaMissing = 0;
    let sourceLeaks = 0;
    let vectorProofFailed = 0;
    for (const q of reviewed) {
      let meta: HybridSearchMeta | null = null;
      const t0 = Date.now();
      const results = await hybridSearch(engine, q.query, {
        limit: 10,
        sourceId: q.source_id,
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
      const slugs = results.map(r => r.slug);
      const relevant = new Set(q.relevant.filter(r => r.source_id === q.source_id).map(r => r.slug));
      for (const r of results) {
        if (r.source_id && r.source_id !== q.source_id) sourceLeaks += 1;
      }
      recalls.push(recallAt5(slugs, relevant));
      mrrs.push(mrrAt10(slugs, relevant));
    }
    if (metaMissing > 0 || sourceLeaks > 0 || vectorProofFailed > 0) {
      console.error(`Fail closed on arm ${arm.name}: meta_missing=${metaMissing} source_leaks=${sourceLeaks} vector_proof_failed=${vectorProofFailed}`);
      process.exit(1);
    }
    armReports[arm.name] = {
      n: reviewed.length,
      recall_at_5: recalls.filter(Boolean).length / recalls.length,
      mrr_at_10: mrrs.reduce((a, b) => a + b, 0) / mrrs.length,
      p95_latency_ms: p95(lats),
    };
  }

  const receipt = {
    schema_version: 1,
    kind: 'gbrain-private-bench',
    benchmark_id: bench.benchmark_id,
    split_seed: bench.split_seed,
    reviewed: reviewed.length,
    arms: armReports,
  };
  const text = JSON.stringify(receipt, null, 2);
  if (outPath) writeFileSync(outPath, text + '\n');
  console.log(text);
}
