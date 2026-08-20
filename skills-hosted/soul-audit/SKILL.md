---
name: soul-audit
description: "Check whether a system, product, or process still serves its original purpose, or has drifted into serving its own machinery. Use at review points and before adding more"
triggers:
  - "soul audit"
  - "review points"
  - "before adding more"
---

# Soul Audit — Agent Identity Builder (re-run / deepen surface)

Update the agent's identity through an interactive interview, any time after
bootstrap. This skill does NOT generate files from scratch and does NOT write
identity prose itself: it records the user's answers into the shared answer
bank, then lets the bootstrap render engine produce the files. That keeps one
source of truth — `state/interview.json` — no matter which surface (first-boot
bootstrap, this skill, a future re-audit) collected the answers.

**IMPORTANT:** Content comes from the USER'S OWN ANSWERS, recorded verbatim.
NEVER invent, embellish, or default an identity answer. The render gate
structurally refuses until required answers exist and were read back and
confirmed by the human.

## Contract

This skill guarantees:
- Answers land in the shared bank via `the knowledge base bootstrap interview --set KEY "value"`
  (verbatim, one key per answer; `--skip KEY` records an explicit decline).
- The read-back ritual runs before any render: `--show` the full answer set,
  mirror it to the user, then `--confirm <hash>` with the hash `--status`
  printed. Confirming a set the user never saw fails by design.
- Files re-render through the ONE render path:
  `the knowledge base bootstrap render --only SOUL.md --force` (repeat per file). `--force`
  backs the old file up under `.the knowledge base-bootstrap-backups/<ts>/` first — nothing
  is clobbered without a recoverable copy.
- Each phase is independent and re-runnable; updating one answer and
  re-rendering one file is a complete, valid run.

## The command loop

```
the knowledge base bootstrap interview --show            # what the bank holds now (start here)
the knowledge base bootstrap interview --set KEY "..."   # record one updated answer, verbatim
the knowledge base bootstrap interview --skip KEY        # explicit decline for an optional key
the knowledge base bootstrap interview --status          # gate + read-back hash
the knowledge base bootstrap interview --confirm <hash>  # after reading answers back to the user
the knowledge base bootstrap render --only SOUL.md --force
```

Render targets: `SOUL.md`, `USER.md`, `ACCESS_POLICY.md`, `HEARTBEAT.md`,
`AGENTS.md` (re-render whichever files the changed keys feed).

## Phases (each independent, each re-runnable)

### Phase 1: Identity Interview
Ask: "What is this agent to you? Research partner? Executive assistant? Thinking
partner? All of the above?"
Keys: `AGENT_NAME`, `AGENT_PURPOSE`, `SOUL_RELATIONSHIP`. Renders: SOUL.md.

### Phase 2: Vibe Calibration
Show 3-4 communication style examples:
- **Formal:** "I've prepared a comprehensive analysis of the situation..."
- **Direct:** "Here's what's happening. Three things matter."
- **Technical:** "The root cause is in the connection pooling. Here's the fix."
- **Casual:** "Yeah so basically the thing is broken because X. Easy fix."
Ask which feels right; also ask for a reply that made them wince and why.
Keys: `VOICE_REGISTER`, `SOUL_WINCE`, `SOUL_MODE_DEFAULT`. Renders: SOUL.md.

### Phase 3: Mission Mapping
Ask: "What are your top 3-5 goals? What are you trying to accomplish?"
Keys: `AGENT_TOP_JOBS`, `SOUL_GOOD_OUTPUT`, `SOUL_WORLDVIEW`. Renders: SOUL.md,
AGENTS.md.

### Phase 4: User Profile
Ask: "Tell me about yourself. What do you do? What are you working on? Who are
the key people in your world?"
Keys: `PRINCIPAL_NAME`, `PRINCIPAL_CONTEXT`, `PRINCIPAL_TIMEZONE`. Renders:
USER.md.

### Phase 5: Boundaries
Ask: "Who should have access to your brain? Are there people who should see some
but not all? Anyone to keep out entirely?"
Key: `ACCESS_TIERS` (and review the standing-disclosure sections). Renders:
ACCESS_POLICY.md.

### Phase 6: Operational Cadence
Ask: "How often should the agent check in? Morning briefing? End of day summary?
What recurring jobs do you want?"
Keys: `HEARTBEAT_CADENCE`, `QUIET_HOURS`. Renders: HEARTBEAT.md. Jobs ship
disabled — enable one at a time after a manual dry run (the ritual is in the
rendered file).

Run `the knowledge base bootstrap interview --init` first if the bank does not exist yet
(a workspace that never ran bootstrap); it prints the full question list.

## Output Format

Report exactly what changed: which keys were updated, which files re-rendered,
and where the backups landed. Example: "Soul audit: updated VOICE_REGISTER +
SOUL_WINCE, re-rendered SOUL.md (backup in .the knowledge base-bootstrap-backups/...).
Re-run any phase anytime."

## Anti-Patterns

- Writing identity prose yourself instead of recording the user's words into
  the bank (the render engine is the only author of these files)
- Hand-editing SOUL.md/USER.md directly — the next render overwrites it; edit
  the ANSWER, then re-render
- Confirming a read-back hash for answers the user never saw
- Making the audit mandatory or asking all 6 phases in one go (overwhelming;
  each is independent — momentum beats completeness)
- Shipping pre-filled identity content (privacy violation)
- Not offering to re-run individual phases


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
