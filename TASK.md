# Private 100–200 retrieval benchmark harness

Plane: DEVELOPMENT (draft PR stand-in for a GitHub issue).
Repo: knee5/gbrain-upstream-prs (issues disabled; do not flip has_issues from this lane).
Plan: gbrain `plans/gbrain-semantic-retrieval-quality-2026-08-17`.
Baseline: 11/20 semantic, 4/20 lexical, p95 1.916 s.
Do not replay the 2026-08-17 rollout. Receipt SHA-256 `f9031891cba360a1566c0fdcc997666cbbb389cd9d1e619be5ae538eb2fd91d3`.

## Problem
The live 20-query suite is a smoke test. Product quality needs 100–200 human-reviewed real queries, a sealed 70/30 split, and semantic-only, lexical-only, and hybrid receipts (Recall@5, MRR@10, p95).
Fly exported 0 eval_candidates on 2026-08-17. Do not manufacture qrels from retrieved slugs.

## Work
Add a private harness that:
1. Harvests real default-source queries from the approved capture / gateway-log path.
2. Feeds `benchmark/bootstrap_candidates.py` (unlabeled, 70/30, mode 0600).
3. Runs the three arms with identical source, limit, and expansion settings.
4. Persists per-query top-10, latency, and full retrieval-arm metadata.
5. Fails closed on unlabeled rows, source leaks, missing metadata, or fewer than 100 reviewed queries.
Tune only on the development split. Opening held-out more than once requires a new benchmark version.

## Acceptance
- [ ] Spec implemented against current gbrain 0.46.x, not this stub-only branch tip
- [ ] Tests prove the new path and prove the old path is unchanged for ordinary callers
- [ ] Independent review finds no P0/P1
- [ ] Effect is measured on the sealed 100–200 held-out set, not on the 20-query smoke suite
