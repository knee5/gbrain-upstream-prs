---
name: persona-qa
description: Founder-grade, human-shoes walkthrough of a deployed flow using realistic context and outcome-based critique — use before ship-gate approval or after a material fix.
triggers:
- persona QA
- walk the flow as a user
- does this actually work for a real user
- founder walkthrough
---

# persona-qa

## Select the persona

Choose by the product promise and cost of failure, never tester convenience.

| Signal | Primary-persona choice | Stateful variant |
|---|---|---|
| Promise | Person who most needs the promised outcome | Returning user |
| Risk | Person most harmed by quiet wrongness or loss | Conflicting deep link |
| Skill | Likely novice, not an expert operator | Interrupted/recovered user |
| Context | Real job, stakes, device, time, emotion | Paid/entitled state if relevant |

1. State the product promise, highest-risk failure, and why this persona exposes
   both. **Pass:** selection is evidence-based. **Fail:** persona was easiest to run.
2. Define entry point, device/viewport, prior state, goal, emotional/job context,
   and one stateful variant. **Pass:** another tester can replay it. **Fail:** the
   persona is only a label. Officiant calibration: first-time friend asked to lead
   a wedding, anxious about honoring the couple without embarrassing them.

## Build realistic fictional input

- Use plausible names and relationships, but make all data **FICTIONAL**. Never
  enter real PII, secrets, customer records, private correspondence, or real events.
- Include multiple concrete stories, a memorable quote/detail, tone/tradition,
  logistics, optional branches, and an off-limits topic when the flow supports it.
- Add genuine emotional texture: uncertainty, affection, tension, priorities, and
  consequences. Avoid caricature and trauma invented only to provoke the system.
- **No one-word toy answers.** Use real-length responses that create realistic
  token, grounding, persistence, and recovery pressure.
- **Pass:** input could plausibly support the promised result and remains fictional.
  **Fail:** toy input evades boundaries or any detail identifies a real person.

## Walk the flow and watch bail points

At each point capture exact visible copy, state, screenshot/output, and the user's
likely decision—not just console/network errors.

- Entry/acquisition: promise and next action are clear.
- Deep link/storage: documented URL-versus-session precedence holds.
- Setup: prior answers are respected; questions do not repeat unnecessarily.
- Interview: questions are relevant, legible, optionality honest, progress durable.
- Interrupt/recovery: refresh/back/forward/retry preserves the right state.
- Extraction: all meaningful input survives; cards are grounded and complete.
- Selection/editing: accept/edit/discard actions produce predictable state.
- Fallback: degraded behavior is disclosed and remains the correct format.
- Final result: structure, length, substance, grounding, safety, and tone fulfill
  the promise.
- Paywall/entitlement/export: access is correct; work is neither trapped nor leaked.
- Mobile/accessibility: controls, copy, errors, and recovery are understandable.

For every point ask: “Would this person know what to do, trust what happened,
recognize their material, and believe the result fulfills the promise?”
**Pass:** yes, with evidence. **Fail:** any answer is no or cannot be observed.

## Severity rubric

| Severity | Definition | Worked calibration |
|---|---|---|
| P0 | Core promise broken; quiet/mislabeled wrong output; data loss; unsafe behavior; or access/entitlement failure. Blocks exposure. | Missing story cards and a one-line output labeled “ceremony.” |
| P1 | Serious friction or contradiction, but a user can recover without losing safety, data, access, or the core outcome. | Setup questions repeated despite existing answers. |
| P2 | Localized polish, consistency, or low-impact defect that does not impair completion or trust materially. | Residual toast copy in the ceremony experience. |

When uncertain, choose the higher severity until evidence narrows impact.

## Isolate one boundary at a time

1. Preserve the exact input, state seed, deployment, and expected outcome.
2. Identify the last-correct artifact and first-wrong artifact.
3. Vary only one boundary: format, payload size/budget, parser recovery, fallback
   dispatch, safety filter, persistence, or renderer.
4. Compare artifacts, not impressions; repeat until one cause explains the symptom.
5. Reproduce the isolated case before fixing, then replay it unchanged after deploy.

**Worked officiant example:** Keep the same fictional answers and deployment.
Run toast extraction: story material survives, so generic extraction is not wholly
broken. Change only format to ceremony: the longer response exceeds the extraction
token budget, truncates, enters JSON recovery, and story cards disappear. The
last-correct artifact is the submitted answer/model response; the first-wrong
artifact is recovered extraction with zero story cards. Next force the same
insufficient-data condition in toast and ceremony. Toast receives the toast
scaffold; ceremony incorrectly receives that same one-line toast scaffold. This
localizes a second fault to format/fallback dispatch, before the renderer.
**Pass:** each claim follows a controlled comparison. **Fail:** multiple variables
changed or the diagnosis skips the last-correct/first-wrong boundary.

## Fix and replay

Fix, redeploy, replay the identical persona and isolation case on production, add
a regression assertion for the visible outcome, then test one adjacent persona or
format. **Pass:** original and adjacent cases pass on the new deployment.
**Fail:** only unit/mocks pass, input changed, or collateral behavior is untested.

## Receipt format

- Receipt path/link; timestamp; tester; `PASS`/`FAIL`.
- Commit, deployment ID, production URL, device/viewport, flag/cordon state.
- Persona rationale, fictional input summary, prior/session state, entry path.
- Step-by-step observations with exact copy and redacted screenshots/artifacts.
- Expected versus actual user outcome at every failed bail point.
- Findings: P0/P1/P2, reproduction, impact, owner/status.
- Isolation: preserved input, varied boundary, last-correct, first-wrong, cause.
- Before/after evidence, regression assertion, adjacent-case result.
- Remaining uncertainty and explicit ship-gate recommendation.

## Proof-of-fire receipt (MANDATORY — adopted 2026-07-28, wiring-audit F8)

A run of this gate that leaves no artifact did not happen. Before reporting your verdict, write a dated scorecard to `~/kb/scratch/gate-receipts/YYYY-MM-DD-<surface>-<skill-name>.md` containing: what was gated (commit/PR/deploy/copy reference), the verdict (and score where this skill scores), the specific findings/hits, and who ran it (agent/session). Commit the receipt to kb (add ONLY your file, never `git add -A`). The Friday retro counts ships against receipts; a ship without a matching receipt is a violation. This section exists because these gates showed zero recorded invocations across a period that included shipping the landing page.
