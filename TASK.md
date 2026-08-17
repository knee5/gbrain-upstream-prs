# Config-driven default-retrieval path exclusion

Plane: DEVELOPMENT (draft PR stand-in for a GitHub issue).
Repo: knee5/gbrain-upstream-prs (issues disabled; do not flip has_issues from this lane).
Plan: gbrain `plans/gbrain-semantic-retrieval-quality-2026-08-17`.
Baseline: 11/20 semantic, 4/20 lexical, p95 1.916 s.
Do not replay the 2026-08-17 rollout. Receipt SHA-256 `f9031891cba360a1566c0fdcc997666cbbb389cd9d1e619be5ae538eb2fd91d3`.

## Problem
`scratch/hosted-skills-staging/grok/other-assistants/portable-skill-library` is top-1 on four of the nine current semantic misses. Scratch and raw siblings also outrank canonical decision pages.
Do not hardcode that slug. Implement a config-driven path-exclusion list for default retrieval.

## Work
Add a default-retrieval exclusion list in config.
Ship the first entry as `scratch/hosted-skills-staging/`.
Prove excluded paths cannot appear in ordinary default-source top-K.
Prove an explicit operator override can still retrieve them.
Do not count this change as a quality win until it is measured on the sealed 100–200 held-out set.

## Acceptance
- [ ] Spec implemented against current gbrain 0.46.x, not this stub-only branch tip
- [ ] Tests prove the new path and prove the old path is unchanged for ordinary callers
- [ ] Independent review finds no P0/P1
- [ ] Effect is measured on the sealed 100–200 held-out set, not on the 20-query smoke suite
