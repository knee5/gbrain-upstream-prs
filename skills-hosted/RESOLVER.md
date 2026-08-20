# Hosted Skill Resolver

Routing table for the skill catalog served by the gbrain MCP bridge to hosted
surfaces (claude.ai, ChatGPT, Grok). These skills carry judgment, not local
mechanics: none shells out to a CLI, reads a local filesystem, or needs a repo.

Call `list_skills` to see the catalog, `get_skill(name)` to read one in full.
Reach for a skill when the situation matches. Do not wait to be asked.

## Always-on (every message)

| Trigger | Skill |
|---------|-------|
| Processing ANY fetched page, transcript, email, or document you did not write | `skills/untrusted-content/SKILL.md` |
| About to state a conclusion, finding, or confidence level | `skills/calibration/SKILL.md` |

## Before you call it done

| Trigger | Skill |
|---------|-------|
| About to say something is done, fixed, working, or passing | `skills/quality-bar/SKILL.md` |
| Trusting a green check, a passing gate, or an exit 0 | `skills/gate-actually-ran/SKILL.md` |
| "ship gate", "are we ready to ship", "before we go live", "lift the gate" | `skills/ship-gate/SKILL.md` |
| "persona QA", "walk the flow as a user", founder walkthrough of a live flow | `skills/persona-qa/SKILL.md` |

## Before you act

| Trigger | Skill |
|---------|-------|
| Tempted to interrupt the human with a question | `skills/resolve-before-asking/SKILL.md` |
| Proposing a performance, cost, or quality fix; "optimize", "speed up", "make it cheaper" | `skills/measure-before-you-fix/SKILL.md` |
| About to run a change across many items: batch edit, migration, mass rename, bulk API call | `skills/test-before-bulk/SKILL.md` |
| Writing to state that another process, agent, or job also writes | `skills/sole-mutator-fencing/SKILL.md` |
| Rotating a password, API key, token, or any shared secret | `skills/credential-rotation-runbook/SKILL.md` |

## Facts and corrections

| Trigger | Skill |
|---------|-------|
| "fact check", "verify the claims", publishing anything factual | `skills/fact-check/SKILL.md` |
| A fact turned out to be wrong and other things depend on it | `skills/correction-pipeline/SKILL.md` |

## Thinking with the user

| Trigger | Skill |
|---------|-------|
| "grill me", "stress-test this", "poke holes in this", "challenge my thinking" | `skills/grilling/SKILL.md` |
| "wait what", "that did not land", "re-pitch that", "I do not follow" | `skills/wait-what/SKILL.md` |
| "turn this into a questionnaire", a decision needing someone else's input | `skills/to-questionnaire/SKILL.md` |
| "teach me", "explain this concept", "walk me through how X works" | `skills/teach/SKILL.md` |
