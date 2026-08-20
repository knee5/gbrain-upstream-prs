---
name: ship-gate
description: "The checklist that must pass before anything goes live: what evidence counts as verified, what a green check must actually prove, and what blocks a ship"
triggers:
  - "ship gate"
  - "the checklist that must pass before anything goes live"
  - "what evidence counts as verified"
  - "what a green check must actually prove"
  - "and what blocks a ship"
---

# ship-gate

Treat merge/deploy and public exposure as separate gates. Depend on
the `persona-qa` skill for the live journey receipt and
the `site-cordon` skill to preserve production QA access.

## Release rule

- Keep the flag off or cordon on until this checklist passes against the exact
  production deployment to expose.
- **P0 BLOCK RULE: any open P0 means the flag/cordon stays off. No exceptions,
  waivers, partial rollout, or “monitor it live.”**
- Require zero open P0 or P1 findings for approval. Re-run affected and adjacent
  cases after every material fix.

## Ordered gate

1. **Pin the candidate.** Record commit SHA, deployment ID, production URL,
   environment, timestamp, and current flag/cordon state. Prove the URL serves
   that commit/deployment.
   - **Pass:** response/build metadata ties the production URL to the candidate.
   - **Fail:** candidate identity is inferred, stale, preview-only, or ambiguous.

2. **Cordon public access.** Apply `site-cordon`; use its restricted QA bypass.
   Never substitute localhost, preview, mocks, or a rendering entry card.
   - **Pass:** production matrix shows anonymous users blocked and authorized QA
     allowed on the pinned deployment.
   - **Fail:** the candidate is public, QA is not on production, or bypass leaks.

3. **Run the primary persona.** Execute `persona-qa` from real acquisition/deep
   link through the final visible outcome using fresh state and realistic input.
   For officiant, require grounded story cards and a substantive multi-section
   ceremony.
   - **Pass:** the receipt proves the promise end to end on the pinned URL.
   - **Fail:** any boundary is mocked/skipped or only intermediate UI is proven.

4. **Trace integration boundaries.** Capture redacted submitted answers,
   extraction output, selected cards, draft/fallback identity, safety-filter
   output, and rendered/exported result.
   - **Pass:** each input-to-output transition is attributable and complete.
   - **Fail:** a boundary is opaque, data disappears, or evidence exposes PII.

5. **Inventory silent fallbacks.** Search and trace every parser repair,
   truncation handler, empty/insufficient-data branch, retry exhaustion,
   quarantine, safety/off-limits fallback, and template/scaffold selector.
   Force every reachable path on the real boundary where safe.
   - **Pass:** inventory maps trigger → branch → visible outcome for every path.
   - **Fail:** a recovery path is unlisted, unforced, or asserted only “no throw.”

6. **Assert outcomes.** For normal and degraded results verify correct
   product/format, required sections, meaningful minimum substance, grounding,
   forbidden-content exclusion, and honest fallback labeling.
   - **Pass:** exact visible-output assertions hold for every inventoried path.
   - **Fail:** output is quietly wrong, mislabeled complete, empty, or generic.

7. **Sweep user copy.** Inspect authored and generated copy for spec notes,
   codebase/developer language, placeholders, internal role names, and
   unsupported legal/product claims.
   - **Pass:** every visible string is intentional, user-legible, and supportable.
   - **Fail:** internal prose or an unsupported promise crosses the UI boundary.

8. **Run the deep-link matrix.** Test every supported role/format with fresh
   storage, matching stored state, conflicting stored state, refresh, and
   back/forward navigation. Apply the documented URL/storage precedence.
   - **Pass:** each cell resolves predictably and explicit URL intent obeys policy.
   - **Fail:** session state silently overrides intent or navigation changes mode.

9. **Triage and repair.** List defects with severity, reproduction, owner/status,
   affected matrix cells/fallbacks, and evidence. Fix P0/P1, redeploy, then replay
   identical and adjacent cases.
   - **Pass:** no P0/P1 remains and retests point to the same candidate deployment.
   - **Fail:** a blocker remains, evidence predates a fix, or only code tests reran.

10. **Issue the decision receipt.** Save it in the repository's designated
    release-evidence directory or the governing ticket/PR; record the exact
    durable path/link. Then lift via `site-cordon`.
    - **Pass:** receipt is reviewable, redacted, durable, and decision is `PASS`.
    - **Fail:** evidence lives only in chat/temp files or the deployment changed.

## Required receipt

- Candidate commit, deployment ID, production URL/environment, time, flag/cordon.
- Persona identity and `persona-qa` evidence: steps, screenshots/output, outcome.
- Redacted integration-boundary artifacts and complete fallback inventory.
- Deep-link matrix results for every supported role/format and state condition.
- Copy-sweep result and defect list with P0/P1/P2, status, owner, evidence.
- Final `PASS`/`FAIL`, approver, durable receipt path/link, and lift deployment ID.

## Why these gates exist

- Flag-on is separate from merge/deploy; mocks never clear live integrations.
- Silent fallbacks require visible-outcome assertions, not return/no-throw checks.
- User copy is a product boundary; internal implementation prose must not cross it.
- URL intent and session state need an explicit, tested precedence contract.

## Review-gate + bot-triage protocol (updated 2026-07-28 — CodeRabbit cancelled)

The PR merge gate is the **`codex-review` commit status** (launchd `com.clevin.codex-review`, 15-min poll, fail-closed; becomes a required check 2026-08-11). CodeRabbit was cancelled 2026-07-28: it was fail-open — posted `success` with a NULL target_url while saying "Review rate limited" — so never wait on its status or merge because of it. Before merging on ANY review gate, verify it actually RAN: real review text / a real target_url, not just a green status. Verify the thing, not the status.

Whatever bot posts findings, authoring agents must TRIAGE, never blindly apply (evidence: arxiv 2607.03316 — 36.4% comment acceptance):
1. For every critical/major finding: verify against source/contracts/tests BEFORE changing code.
2. Fix verified findings; reply to false positives with concrete evidence.
3. Cap the review/fix loop at 2 passes; unresolved disagreement → escalate to orchestrator, don't loop.
4. Never resolve a thread without either a code change or a recorded reason.

## Proof-of-fire receipt (MANDATORY — adopted 2026-07-28, wiring-audit F8)

A run of this gate that leaves no artifact did not happen. Before reporting your verdict, write a dated scorecard to `your working notes folder/gate-receipts/YYYY-MM-DD-<surface>-<skill-name>.md` containing: what was gated (commit/PR/deploy/copy reference), the verdict (and score where this skill scores), the specific findings/hits, and who ran it (agent/session). Commit the receipt to kb (add ONLY your file, never `git add -A`). The Friday retro counts ships against receipts; a ship without a matching receipt is a violation. This section exists because these gates showed zero recorded invocations across a period that included shipping the landing page.


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
