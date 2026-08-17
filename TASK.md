# Lexical-only per-call ablation

Plane: DEVELOPMENT (draft PR stand-in for a GitHub issue).
Repo: knee5/gbrain-upstream-prs (issues disabled; do not flip has_issues from this lane).
Plan: gbrain `plans/gbrain-semantic-retrieval-quality-2026-08-17`.
Baseline: 11/20 semantic, 4/20 lexical, p95 1.916 s.
Do not replay the 2026-08-17 rollout. Receipt SHA-256 `f9031891cba360a1566c0fdcc997666cbbb389cd9d1e619be5ae538eb2fd91d3`.

## Problem
The 100–200 private benchmark needs a lexical-only arm. The remote API does not expose a per-call lexical ablation. Faking the arm by breaking credentials or by toggling global config is forbidden.

## Work
Add a read-only, evaluator-safe per-call ablation that forces keyword/title/alias only.
Returned metadata must prove `vector_enabled=false` because of the explicit ablation, not because the embedding provider failed.
Ordinary production callers must not see or trigger this path without the evaluator flag.
Do not raise the six-second deadline.

## Acceptance
- [ ] Spec implemented against current gbrain 0.46.x, not this stub-only branch tip
- [ ] Tests prove the new path and prove the old path is unchanged for ordinary callers
- [ ] Independent review finds no P0/P1
- [ ] Effect is measured on the sealed 100–200 held-out set, not on the 20-query smoke suite
