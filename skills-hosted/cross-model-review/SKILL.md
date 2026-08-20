---
name: cross-model-review
description: "Use a second, different model as a quality gate before committing to work: what to hand over, how to frame the review, and how to weigh a dissent"
triggers:
  - "cross model review"
  - "what to hand over"
  - "how to frame the review"
  - "and how to weigh a dissent"
---

# Cross-Modal Review

> **Convention:** see conventions/cross-modal.yaml
> for the review pairs and refusal routing chain.

> **Relationship to `the knowledge base eval cross-modal`:** This skill is the manual
> mid-flow gate (one model reviews work product before commit, with refusal
> routing). The `the knowledge base eval cross-modal` command (v0.27.x) is a sibling
> surface: 3 different-provider frontier models score-and-iterate on a
> documented dimension list *before* tests cement behavior. Use this skill
> for ad-hoc second opinions; use `the knowledge base eval cross-modal` for the
> skillify Phase 3 quality gate. The two are complementary, not redundant.

## Contract

This skill guarantees:

- Work product is reviewed by a different model before finalizing.
- The review is graded against the originating skill's Contract section
  (what was promised), not vibes.
- Agreement and disagreement are reported transparently.
- Refusal from one model triggers a silent switch to the next in chain.
- The user always makes the final decision (user sovereignty).

## When to invoke (v0.25.1 gating)

Invoke this skill when:

- **Significant code changes** — any commit touching 5+ files or 100+
  lines. Architecture decisions, refactors, API changes.
- **Security-sensitive changes** — auth flows, brain-write trust boundaries,
  webhook transforms, cross-skill data passing.
- **Stuck or churning** — 2+ iterations on the same problem without
  progress.
- **Pre-bulk-operation** — before running batch enrichment, migrations,
  or bulk writes (see the `test-before-bulk` skill).
- **Skill creation / modification** — new or rewritten skills that
  affect operational behavior.
- **Brain-page quality concerns** — when brain writes need validation
  against the originating skill's Contract.

Do NOT invoke for:

- Simple memory writes or brain-page updates
- Single-file typo fixes
- Routine cron output or heartbeat operations
- Git commit / push of already-reviewed work

## Phases

1. **Capture the work product.** The brain page, analysis, code diff,
   or decision to be reviewed.
2. **Load the Contract.** Read the originating skill's Contract section
   (what was promised).
3. **Spawn review model.** Send the work + Contract to a different
   model. Use the `model-routing` skill
   for model selection.
4. **Grade.** Model evaluates: did the output follow the Contract?
   Pass / fail with specific citations.
5. **Report.** Present agreement / disagreement to the user. Never
   auto-apply the reviewer's suggestions.

## Code-review handoff (v0.25.1 extension)

For diff review specifically, gstack ships a `/codex` skill that wraps
the OpenAI Codex CLI. Two modes:

### Codex Review

Independent diff review from a different AI system. The user invokes
`/codex review` (gstack-shipped); cross-modal-review's job is to
RECOGNIZE when this is the right tool and recommend it explicitly.

**When to recommend `/codex review`:**
- After a substantive diff lands and before merge
- When the user wants a second opinion that's NOT another Claude

**Output framing (when cross-modal-review surfaces Codex output):**

```
CODEX REVIEW (independent second opinion):
══════════════════════════════════════════
<full codex output, verbatim>
══════════════════════════════════════════

CROSS-MODEL ANALYSIS:
  Both found:    [overlapping findings]
  Only Codex:    [findings unique to Codex]
  Only Claude:   [findings unique to my analysis]
  Agreement:     X% (N/M findings overlap)
```

User decides what to act on. Cross-model agreement is signal, not
permission.

### Adversarial Challenge

Same shape, different prompt. Used on security-sensitive changes:
the reviewer is asked to find injection vectors, race conditions,
auth bypasses, data leaks, privilege escalation paths.

Output adds an exploitability rating (CRITICAL / HIGH / MEDIUM / LOW)
and recommended mitigations.

## Refusal routing

If the primary review model refuses:

1. Switch silently to the next model in the chain (see
   `conventions/cross-modal.yaml`).
2. Don't show the refusal to the user.
3. Don't announce the switch.
4. If ALL models in the chain refuse, escalate to the user.

## Output format

### Standard review

```
Cross-Modal Review
==================
Reviewer:  {model name}
Contract:  {originating skill}
Verdict:   PASS | ISSUES FOUND

Findings:
- {finding with evidence}

Agreement with primary: {X}%
```

### Code review

```
Cross-Modal Review (code)
==========================
Mode:           Codex Review | Adversarial Challenge
Files changed:  N
Lines changed:  +N / -N

{mode-specific output above}
```

## User-sovereignty rule (Iron Law)

Reviewer findings are INFORMATIONAL until the user explicitly approves
each one. Do NOT incorporate reviewer recommendations into the work
product without presenting each finding and getting explicit approval.
This applies even when the reviewer is correct. Cross-model consensus
is a strong signal — present it as such — but the user makes the
decision.

## Anti-Patterns

- ❌ Auto-applying reviewer suggestions without user approval
- ❌ Showing model refusals to the user
- ❌ Using the same model for review and generation
- ❌ Skipping the Contract reference (reviewing vibes, not guarantees)
- ❌ Code-reviewing trivial changes (typos, formatting)
- ❌ Running code review without git-diff context

## Related skills

- gstack `/codex` — the actual Codex CLI wrapper this skill hands off
  to for diff-review mode. Cross-modal-review knows WHEN to invoke;
  /codex knows HOW.
- `skills/testing/SKILL.md` — runs the project test suite; complementary
  signal for "is this commit safe to land"
- `skills/conventions/cross-modal.yaml` — review pairs + refusal routing


## Output Format

The skill's output shape is documented inline in the body sections above (see "Output", "Brain page format", or equivalent). The literal section header here exists for the conformance test (`test/skills-conformance.test.ts`).


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
