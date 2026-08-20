---
name: kb-query
description: "Answer a question from a knowledge base using layered search, synthesis across pages, and citation propagation. Use for lookups and research questions where the answer must be traceable to sources"
triggers:
  - "kb query"
  - "research questions where the answer must be traceable to sources"
---

# Query Skill

Answer questions using the brain's knowledge with 3-layer search and synthesis.

> **Memory verbs (MEMORY_VERBS v1, the knowledge base ≥ 0.43).** When connected to a brain
> over MCP, prefer the seven frozen memory verbs for memory work — they carry
> provenance, evidence, and a server-enforced token budget:
> - **`recall(query | entity, budget_tokens)`** — the budget-packed memory read.
>   Use it instead of bare `search` for "what do we know that we SAVED about X".
> - **`entity(name)`** — a zero-LLM person/company/project card (aliases,
>   last-touched, open threads, top edges). Use it instead of `get_page` +
>   `get_backlinks` when you just need the card.
> - **`synthesize(question)`** — the explicitly-expensive cross-page answer; the
>   heavy version of `query`. Reach for it only when the answer must combine
>   evidence across pages.
> Fall back to `search`/`query`/`get_page` when the verbs aren't on the surface
> (pre-0.43 servers; `--surface full` includes the verbs alongside every other
> op). See `docs/protocol/MEMORY_VERBS_v1.md`.

## Contract

This skill guarantees:
- Every answer is grounded in brain content (no hallucination)
- Every claim has a citation tracing back to a specific page slug
- Gaps are flagged explicitly ("the brain doesn't have information on X")
- Source precedence is respected (user statements > compiled truth > timeline > external)
- Conflicting sources are noted with both citations

## Phases

1. **Decompose the question** into search strategies:
   - Keyword search for specific names, dates, terms
   - Semantic query for conceptual questions
   - Structured queries (list by type, backlinks) for relational questions
2. **Execute searches:**
   - Cheap-hybrid search the knowledge base for exact tokens / known names (search)
   - Full-hybrid search the knowledge base with multi-query expansion for concept questions (query)
   - List pages in the knowledge base by type or check backlinks for structural queries
3. **Read top results.** Read the top 3-5 pages from the knowledge base to get full context.
4. **Synthesize answer** with citations. Every claim traces back to a specific page slug.
5. **Flag gaps.** If the brain doesn't have info, say "the brain doesn't have information on X" rather than hallucinating.

## Anti-Patterns

- Answering from general knowledge when the brain has relevant content
- Hallucinating facts not in the brain
- Silently picking one source when sources conflict
- Loading full pages when search chunks are sufficient
- Ignoring source precedence (user statements are highest authority)

## Output Format

Answers should include:
- Direct response to the question
- Citations: "According to [Source: people/jane-doe, compiled truth]..."
- Gap flags: "The brain doesn't have information on X"
- Conflict notes when sources disagree

## Quality Rules

- Never hallucinate. Only answer from brain content.
- Cite sources: "According to concepts/do-things-that-dont-scale..."
- Flag stale results: if a search result shows [STALE], note that the info may be outdated
- For "who" questions, use backlinks and typed links to find connections
- For "what happened" questions, use timeline entries
- For "what do we know" questions, read compiled_truth directly

## Token-Budget Awareness

Search returns **chunks**, not full pages. Read the excerpts first before deciding
whether to load a full page.

- `(look this up in your connected knowledge base, if you have one)` / `(look this up in your connected knowledge base, if you have one)` return ranked chunks with context snippets.
  These are often enough to answer the question directly.
- Only use `(look this up in your connected knowledge base, if you have one)` to load the full page when a chunk confirms the
  page is relevant and you need more context (e.g., compiled truth, timeline).
- **"Tell me about X"** -- get the full page (the user wants the complete picture).
- **"Did anyone mention Y?"** -- search results are enough (the user wants a yes/no with evidence).

### Source precedence

When multiple sources provide conflicting information, follow this precedence:

1. **User's direct statements** (highest authority -- what the user told you directly)
2. **Compiled truth** (the brain's synthesized, cited understanding)
3. **Timeline entries** (raw evidence, reverse-chronological)
4. **External sources** (web search, API enrichment -- lowest authority)

When sources conflict, note the contradiction with both citations. Don't silently
pick one.

## Citation in Answers

When referencing brain pages in your answer, propagate inline citations:
- Cite the page: "According to [Source: people/jane-doe, compiled truth]..."
- When brain pages have inline `[Source: ...]` citations, propagate them so
  the user can trace facts to their origin
- When you synthesize across multiple pages, cite all sources

## Graph Traversal (v0.10.1+)

For relationship questions ("who knows who at X?", "connections between A and B",
"who works at Acme?", "who attended the standup?"), use the graph layer instead
of full-text search:

- `the knowledge base graph-query <slug> --type <link_type> --depth N --direction in|out|both`
- Available link types: `attended`, `works_at`, `invested_in`, `founded`, `advises`, `mentions`, `source`
- `--direction in` answers "who points to X?" (e.g., who works at company X)
- `--direction out` answers "what does X point to?" (default)
- `--depth N` controls multi-hop traversal (default 5)

Examples:
- "Who works at Acme?" → `the knowledge base graph-query companies/acme --type works_at --direction in`
- "Who attended Demo Day W26?" → `the knowledge base graph-query meetings/demo-day-w26 --type attended --direction out`
- "What companies has Emily advised?" → `the knowledge base graph-query people/emily --type advises --direction out`
- "Who has Alice met (via meetings)?" → `the knowledge base graph-query people/alice --type attended --depth 2`

Combine with `(look this up in your connected knowledge base, if you have one)` for queries that need BOTH semantic similarity AND
graph structure. Search results are ranked with a small backlink boost so well-
connected entities surface higher.

## Search Quality Awareness

If search results seem off (wrong results, missing known pages, irrelevant hits):
- Run `the knowledge base's health check --json` to check index health
- Check embedding coverage -- partial embeddings degrade hybrid search
- Compare keyword search (`(look this up in your connected knowledge base, if you have one)`) vs hybrid search (`(look this up in your connected knowledge base, if you have one)`)
  for the same query to isolate whether the issue is embedding-related
- Report search quality issues in the maintain workflow (see maintain skill)

## Tools Used

- Keyword search the knowledge base (search)
- Hybrid search the knowledge base (query)
- Read a page from the knowledge base (get_page)
- List pages in the knowledge base with filters (list_pages)
- Check backlinks in the knowledge base (get_backlinks)
- Traverse the link graph in the knowledge base (traverse_graph)
- View timeline entries in the knowledge base (get_timeline)


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
