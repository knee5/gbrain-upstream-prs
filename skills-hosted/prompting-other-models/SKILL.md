---
name: prompting-other-models
description: "How to write a prompt when handing work to a different model or agent: what context must be restated, how to bound the task, and the failure modes of cross-model handoff"
triggers:
  - "prompting other models"
  - "how to write a prompt when handing work to a different model or agent"
  - "what context must be restated"
  - "how to bound the task"
  - "and the failure modes of cross-model handoff"
---

# Prompting gpt-5.6 (sol/terra) via codex CLI

Two layers: OpenAI's official structure (learn.chatgpt.com/docs/prompting, fetched 2026-07-10) + our field-tested harness rules (memory: `feedback_codex_fable_delegation`). Both are load-bearing.

## 1. Prompt structure — four blocks, every time

Per OpenAI, compose from: **GOAL / CONTEXT / OUTPUT / BOUNDARIES** (use the parts that apply; no rigid template).

- **GOAL** — describe the RESULT, not the procedure. "Close these two review findings and prove they're closed" beats a step list. Name the consumer of the output (a merge decision, a human report, CI) — it changes what sol optimizes.
- **CONTEXT** — codex sees NOTHING of your conversation. Self-contained always: absolute repo path (`-C /path`), branch names, commit SHAs, file paths, what already happened, prior findings verbatim. Mention paths explicitly (CLI has no open-files context).
- **OUTPUT CONTRACT** — exact deliverable format. Our verdict-line pattern is validated: `'FINDING a: CLOSED/STILL OPEN — why'` … `'CHAIN: MERGE'`. Machine-parseable contract lines make an 8-round loop tractable; free-prose verdicts don't.
- **BOUNDARIES** — one or two CRITICAL constraints only (OpenAI: "keep boundaries minimal", which matches our one-decisive-scope lesson). Always include the standing ones that apply: "Read-only — do not modify files", "do NOT touch layout.tsx/package.json/next.config.js if the offline-font issue hits — flag it".

## 2. Verification belongs INSIDE the prompt

OpenAI's guidance and our practice agree: bake the proof into the ask.
- "Run the test suite and report the command + counts."
- Bug fixes: require red-before/green-after evidence on base vs head.
- Reviews: "EMPIRICALLY execute the filter/function against your claimed bypass" — sol's executed findings were 100% real; its speculative ones were not.

## 2b. Let codex derive a VERIFIABLE goal before solving (research-first)

Source: @reach_vb (Vaibhav Srivastav), 2026-07-15 — captured verbatim. For interactive `codex` sessions that use `/goal`/`set_goal`: don't pass a raw prompt straight through `/goal` (it's taken verbatim). Instead ask codex to **do the research first (via the prompt or subagents), then call `set_goal`** itself. This (a) shrinks the search space and (b) forces codex to formulate a goal it can VERIFY. Rule of thumb: **if codex can verify the goal, it's more token-efficient and faster at solving it.** Practically, start prompts with "gather requirements + research the codebase, THEN set an appropriate, verifiable goal" rather than dictating the goal cold. This is the interactive-session analog of §2 (verification inside the prompt) — here the *goal itself* is made checkable, not just the deliverable.

## 3. Effort & model routing

| Tier | Use for |
|---|---|
| `-m gpt-5.6-terra` | bulk/mechanical, clear-spec implementation (half cost/latency) |
| sol `medium` | targeted re-reviews, confirms, small scoped tasks |
| sol `high` | first-pass adversarial review, hard implementation (default) |
| sol `xhigh`/`ultra` | hardest one-shot features, disputed high-stakes judgments |

Set via `-c model_reasoning_effort=<tier>`. High-effort runs legitimately take 30–90 min on big diffs — see §5 to distinguish slow from hung.

## 4. Adversarial review prompts (the pattern that found 13 real defects, 2026-07-10)

- Frame as REFUTE, not approve: "Your job is to refute. Attack: …"
- Demand evidence: file:line + a reproducer/concrete failing input for every finding; severity-tag (P0/P1/P2) with an explicit non-gating rule for P2.
- **Termination calibration (add by round 2, or the loop never ends):** "Only MECHANICAL lexical/structural signatures count as STILL OPEN (case, diacritics, possessives, plurals, adjacency, field coverage); semantic paraphrases with no signature = 'RESIDUAL (no signature)', reported separately, non-blocking."
- Include a false-positive check in final confirms ("this legit string must still pass").
- Fix CLASSES, not instances, between rounds (walk all strings vs enumerate fields; normalize quotes at entry) — instance-fixes guarantee another round.

## 5. Harness mechanics (violate any of these and you lose an hour)

- **ALWAYS `< /dev/null`** when invoking `codex exec` from a background/non-interactive shell — otherwise it hangs forever at "Reading additional input from stdin..." (0% CPU, no sockets = hang; kill and relaunch). Buffered output means silence until completion — that's normal.
- **Sandbox has NO network.** It can't npm install; Next builds fail on Google Fonts. Guardrail upfront; wrapper re-verifies with real network and reverts sandbox hacks before commit. `--skip-git-repo-check` needed outside git dirs. Web research needs `-c tools.web_search=true` (the `--search` flag doesn't exist in v0.144.x).
- **Browser tasks: Chromium crash-loops inside the sandbox** (nested sandboxing — child procs SIGTRAP with "sandbox initialization failed", GPU exit_code=5, one macOS crash report per launch; 13 of them overnight 2026-07-12). Prompt MUST say launch with `chromiumSandbox: false` (CLI `--no-sandbox`), and the run needs `-c sandbox_workspace_write.network_access=true`. If either is impractical, run the browser step outside codex.
- **Memory: INJECT, don't escalate (ruling 2026-07-28, supersedes the 07-27 danger-full-access doctrine).** The the knowledge base MCP is unreachable from `read-only`/`workspace-write` BY DESIGN — the MCP server lives outside the sandbox; calls die with `user cancelled MCP tool call`, the CLI fallback dies too (no network), and no `mcp_servers.the knowledge base.tool_approval` value unblocks it — don't go down that road. The DISPATCHER queries the knowledge base itself (CLI `(look this up in your connected knowledge base, if you have one)`/`get`, or MCP from the CC side) and pastes the relevant results into the prompt under a `## MEMORY CONTEXT` heading; `~/.codex/AGENTS.md` tells codex that section means recall-is-done. Reply contract: first line `MEMORY-BLIND` = codex proceeded without recall (fine when you injected context or the task isn't brain-dependent); `NEEDS-MEMORY: <ask>` = fetch exactly that and re-dispatch once. `-s danger-full-access` is a rare, deliberate escalation for genuinely interactive brain sessions that must query/write the knowledge base live mid-run — never the default path to give codex memory, and never normalize it: it drops ALL sandbox protection to read a context blob the prompt delivers for free.
- **"Selected model is at capacity"** = transient; retry once before diagnosing.
- **codex skips git ceremony** — treat its work as uncommitted until the wrapper verifies (tsc + tests + build, real network) and commits.
- **One decisive scope.** Never flag-then-accept mid-run; a scope flip-flop causes revert races. If scope must change: kill, restate, relaunch (`resume` with FROZEN SCOPE worked once; fresh is safer).
- Native surfaces when interactive: `/plan` before big edits, `/review [focus]` on working tree, `@codex review` on GitHub PRs.

## 6. Worked template

```
codex exec --skip-git-repo-check -C /abs/repo -c model_reasoning_effort=high "GOAL: <result + who consumes it>.

CONTEXT: branch <x>, commit <sha>. Prior findings verbatim: <...>. Relevant files: <paths>.

DO: <the substantive ask, results-not-steps>. Verify empirically: <run tests / execute reproducer> and report commands + output.

OUTPUT: <exact contract lines>.

BOUNDARIES: Read-only — modify NO files. <one critical constraint>." < /dev/null
```


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
