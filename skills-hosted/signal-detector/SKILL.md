---
name: signal-detector
description: "Separate signal from noise in a stream of inputs: score items for durable relevance, discard the merely recent, and route what survives"
triggers:
  - "signal detector"
  - "separate signal from noise in a stream of inputs"
  - "score items for durable relevance"
  - "discard the merely recent"
  - "and route what survives"
---

# Signal Detector — Ambient Brain Capture

Lightweight capture pass applied to every substantive inbound message. It
watches for TWO things with EQUAL priority:

1. **Original thinking** — the user's ideas, observations, theses, frameworks
2. **Entity mentions** — people, companies, media references

Original thinking is AT LEAST as valuable as entity extraction. Ideas are the
intellectual capital. Entities are bookkeeping. Both compound over time.

## Contract

This skill guarantees:
- Applies on every substantive message where the harness supports ambient
  routing (skips: purely operational messages, users who turned capture off)
- Spawns as a sub-agent where the harness supports it; otherwise runs the
  detection inline before composing the reply. Never blocking the response
  is the intent, not a runtime contract
- Announces itself on first fire and honors the per-user off switch
- Captures ideas with the user's EXACT phrasing (no paraphrasing)
- Detects entity mentions and creates/enriches brain pages
- Logs a one-line summary of what was captured
- Back-links all entity mentions (Iron Law)
- Citations on every fact written

Always-on is a harness-routing convention that a well-behaved agent
follows, not a mechanical guarantee; nothing in the the knowledge base runtime blocks
a reply if the skill never loads. On harnesses without per-message ambient
routing (Claude Code, Codex), apply this skill as an agent convention or
wire it via a prompt-submit hook.

> **Convention:** See `skills/conventions/quality.md` for Iron Law back-linking.

Every time this skill creates or updates a brain page that mentions a person or company:
1. Check if that person/company has a brain page
2. If yes → add a back-link FROM their page TO the page you just created/updated
3. Format: `- **YYYY-MM-DD** | Referenced in [page title](path) — brief context`
4. An unlinked mention is a broken brain.

## First-Fire Consent

Ambient capture persists the user's words into the brain, so the user must
know it is on. The FIRST time this skill captures anything for a user,
announce it in the visible reply: ambient signal capture is on, it stores
ideas and entity mentions as brain pages, and saying "turn off signal
capture" disables it. Record that the announcement happened (a preference
note in the brain works) so it fires once, not every message. Asking once
and recording the answer is equally valid; either way the preference is
stored, never re-asked per message.

## Per-User Storage Policy

Ambient capture is a DEFAULT, not a mandate. If the user turns it off (or
asks for chat-only handling of a specific message), record the preference
and stop firing: no pages, no links, no timeline entries. Re-enable on
request. Users who turned capture off sit on the skip list alongside
purely operational messages.

## Phases

### Phase 1: Idea/Observation Detection (PRIMARY)

When the user expresses a novel thought, observation, thesis, or framework:
- If it's the user's **original thinking** (they generated it) → create/update `originals/{slug}`
- If it's a **world concept** they're referencing → create/update `concepts/{slug}`
- If it's a **product or business idea** → create/update `ideas/{slug}`

**Capture exact phrasing.** The user's language IS the insight. Don't paraphrase.

**Cross-linking (MANDATORY):** Every original MUST link to related people, companies,
meetings, and concepts. An original without cross-links is a dead original.

### Phase 2: Entity Detection (SECONDARY)

1. Extract entity mentions (people, companies, media titles)
2. For each entity:
   - `(look this up in your connected knowledge base, if you have one)` — does a page exist?
   - If NO page → check notability. If notable, create page with enrichment.
   - If page exists but THIN → trigger enrich
   - If page exists and RICH → no action
3. For new FACTS with specific dates → call `the knowledge base timeline-add <slug> <date> "<summary>"`

**Auto-link (v0.10.1):** When you write/update an originals or ideas page that
references a person or company, the auto-link post-hook on `put_page`
automatically creates the link from the new page to that entity. You don't
need to call `the knowledge base link` manually. Timeline entries still need explicit calls.

### Phase 3: Signal Logging

Always log a one-line summary:
- `Signals: 0 ideas, 0 entities, 0 facts (skipped: operational)`
- `Signals: 0 ideas, 0 entities, 0 facts (skipped: capture off)`
- `Signals: 1 idea (captured → originals/x), 2 entities (enriched → people/y, companies/z)`

This makes the ambient capture loop debuggable.

## Output Format

Runs in the background, but not fully silent at first: until the user has
seen the first-fire consent announcement, surface the one-line signal log
in the visible reply so early captures are never invisible. After that the
skill runs quietly; the output is brain pages created/updated and the
signal log line.

## Anti-Patterns

- Blocking the main response to wait for signal detection to complete
- Paraphrasing the user's original thinking instead of capturing exact phrasing
- Creating pages for non-notable entities (one-off mentions)
- Skipping back-links after creating/updating pages
- Running on purely operational messages ("ok", "thanks", "do it")
- Capturing after the user turned signal capture off (storage policy is a
  default, not a mandate)
- Staying fully silent on early captures (surface the signal log until the
  first-fire consent announcement has happened)

## Tools Used

- `search` — check if entity page exists
- `query` — semantic search for related context
- `get_page` — load existing entity pages
- `put_page` — create/update brain pages
- `add_link` — cross-reference entities
- `add_timeline_entry` — record events on entity timelines


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
