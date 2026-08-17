# Honor eval.capture=true in the running op context

Plane: DEVELOPMENT (draft PR stand-in).
Plan: gbrain `plans/gbrain-semantic-retrieval-quality-2026-08-17`.
Capture receipt: `evals/retrieval-quality/qrel-capture-2026-08-17`.

## Problem
On 2026-08-17 `gbrain config set eval.capture true` wrote the db-plane key and read back `true`. Ordinary `gbrain search` / `gbrain query` and this MCP session still inserted 0 `eval_candidates` rows. `GBRAIN_CONTRIBUTOR_MODE=1 gbrain search` inserted row id=1. `isEvalCaptureEnabled` only turns on when `config.eval.capture === true` or that env is `1`. The db key is set, but `ctx.config.eval.capture` is not true in the running op.

This blocks the 100–200-query harvest. Do not work around it by setting CONTRIBUTOR_MODE on Fly.

## Work
Make `eval.capture=true` from the db plane reach `ctx.config.eval.capture` on CLI and remote MCP.
Keep `eval.scrub_pii=true` as the default.
Prove: after config set, a normal search (no CONTRIBUTOR_MODE) inserts one scrubbed row, and `gbrain eval export --since 1h` returns it.
Prove: `eval.capture=false` writes zero rows even with CONTRIBUTOR_MODE unset.
Do not recycle Fly to "fix" a stale process config. The load path itself must see the db key.

## Acceptance
- [ ] Ordinary CLI search after `eval.capture=true` inserts a row
- [ ] MCP search on a new session does the same
- [ ] PII scrubber still runs
- [ ] Independent review finds no P0/P1
- [ ] No Fly recycle, no manufactured qrels
