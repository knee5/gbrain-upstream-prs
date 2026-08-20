---
name: search-modes
description: "Choose the right retrieval mode for a question: exact keyword lookup, semantic similarity, or structured filter, and know when each one misleads you. Use before searching a corpus"
triggers:
  - "search modes"
  - "searching a corpus"
  - "choose the right retrieval mode for a question"
  - "exact keyword lookup"
  - "semantic similarity"
  - "or structured filter"
---

# Convention: Search Modes (v0.32.3)

> **Convention:** every brain has one active search mode. The mode bundles the
> search-lite knobs from PR #897 (semantic cache, token budget, intent
> weighting, LLM expansion, result limit) into a single config key:
> `search.mode = conservative | balanced | tokenmax`.

## When this fires

Any agent doing search-adjacent work in a the knowledge base brain consults this convention:

- `brain-ops` / `query` / `signal-detector` skills: respect the active mode at
  search time. Per-call `SearchOpts` overrides win when set; mode is the default.
- Skills that recommend tuning ("the cache hit rate is high — raise threshold?"):
  route operators to `(look this up in your connected knowledge base, if you have one)` rather than rolling their own logic.
- New skills that add per-call retrieval overrides: name them explicitly so
  the resolved-knob attribution dashboard (`(look this up in your connected knowledge base, if you have one)`) reads cleanly.

## Mode bundle (read-only constants)

The 3 bundles live in `src/core/search/mode.ts` as `MODE_BUNDLES` (frozen).
Don't redefine them per-install; that breaks the public methodology numbers.
The canonical knob table (with cost anchors) lives in
`docs/guides/search-modes.md` — update that first if the bundles change.

| Knob                          | `conservative` | `balanced` | `tokenmax`     |
|-------------------------------|----------------|------------|----------------|
| `cache.enabled`               | true           | true       | true           |
| `cache.similarity_threshold`  | 0.92           | 0.92       | 0.92           |
| `cache.ttl_seconds`           | 3600           | 3600       | 3600           |
| `intentWeighting`             | true           | true       | true           |
| `tokenBudget`                 | **4000**       | **12000**  | **off**        |
| `expansion` (LLM multi-query) | false          | false      | **true**       |
| `relationalRetrieval`         | false          | **true**   | **true**       |
| `searchLimit` default         | 10             | 25         | 50             |

**Cache, intent weighting, and similarity threshold are constant across modes**
— they're free wins (no API cost). Modes scale the three cost levers:
`tokenBudget`, `expansion`, `searchLimit`.

## Resolution chain (matches v0.31.12 model-tier shape)

    per-call SearchOpts.tokenBudget / expansion / etc.
      ↓ (when undefined)
    per-key config: search.cache.enabled, search.tokenBudget, …
      ↓ (when unset)
    MODE_BUNDLES[search.mode]
      ↓ (when search.mode is unset)
    MODE_BUNDLES.balanced (safety fallback)

## Tools for agents

Agents tuning a brain's retrieval should call these directly:

    the knowledge base search modes              # dashboard + per-knob source attribution
    the knowledge base search modes --reset      # clear search.* overrides (mode is canonical)
    the knowledge base search stats [--days N]   # hit rate, intent mix, budget drops
    the knowledge base search tune [--apply]     # data-driven recommendations

`(look this up in your connected knowledge base, if you have one)` reads the `search_telemetry` rollup (sums + counts of
last 7 days) + brain size + configured `models.tier.subagent` to suggest
mode + per-key changes. With `--apply`, it mutates config via `setConfig`
and prints a paste-ready revert command.

## Cache contamination guard

Migration v56 added `query_cache.knobs_hash`. A tokenmax write
(expansion=on, limit=50) is keyed by a different hash than a conservative
read (no expansion, limit=10), so cross-mode contamination is structurally
impossible. The cache lookup filter is:

    WHERE source_id = $ AND knobs_hash = $ AND embedding similarity < $

Legacy NULL-knobs_hash rows from pre-v0.32.3 are silently excluded
(treated as misses, re-populated with the right hash on first hit).

## Trigger phrases

If an operator or agent asks any of these, route to `(look this up in your connected knowledge base, if you have one)`:

- "what search mode is active?" → `(look this up in your connected knowledge base, if you have one)`
- "is my cache hot?" → `(look this up in your connected knowledge base, if you have one)`
- "tune my retrieval" → `(look this up in your connected knowledge base, if you have one)`
- "clear search overrides" → `(look this up in your connected knowledge base, if you have one)`
- "compare modes" → `the knowledge base eval compare`

## Don't

- Don't redefine `MODE_BUNDLES` per-install. The methodology numbers in
  `docs/eval/SEARCH_MODE_METHODOLOGY.md` cite these as canonical.
- Don't mutate `search.mode` config from inside a subagent loop without
  operator approval. Mutation is a trust-boundary crossing
  (`tune --apply` stays CLI-only in v0.32.3 per `[CDX-21]`).
- Don't add per-call `tokenBudget` overrides on the production `query` op
  without naming them in `(look this up in your connected knowledge base, if you have one)` output.

## See also

- `docs/eval/SEARCH_MODE_METHODOLOGY.md` — full eval methodology
- `docs/eval/METRIC_GLOSSARY.md` — plain-English definitions
- `src/core/search/mode.ts` — module source


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
