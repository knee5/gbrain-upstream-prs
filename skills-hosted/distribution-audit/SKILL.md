---
name: distribution-audit
description: "Run a product through a repeatable acquisition checklist (idea-market fit, creator engine, paid-ads ROAS ladder, retention loop) and produce a scored plan. Use when deciding how to get users"
triggers:
  - "distribution audit"
  - "deciding how to get users"
---

# Distribution Audit

The acquisition counterpart to `monetization-audit`. Runs a product through a repeatable "how do we actually get users, and scale it without lighting money on fire" checklist. Distribution is the stated portfolio bottleneck, so this is the higher-order lever — but it is HARD-GATED (below), because pouring acquisition fuel on the wrong product or before proven pull destroys money.

## When to invoke
- Deciding how to acquire/scale users for a product that ALREADY has proven organic pull.
- Before any paid-ads budget (the ROAS ladder + pre-verification gates live here).
- Post-launch growth planning.

## HARD GATES (check before producing any spend recommendation)
1. **Demand-first.** Is there PROVEN organic pull (e.g. Speechkin's 3-user demand test passed)? If not → STOP. Do not recommend acquisition spend for an unproven product. The move is proving pull, not buying users.
2. **Moat gate.** Does the product clear the portfolio ruler (agent-reproducibility × (distribution+trust))? Distribution fuel on a moatless clone = renting revenue, not building equity. If it fails the ruler, flag it — don't recommend scaling it.
3. **Ad-spend pre-verification.** No budget without real CPCs (Keyword Planner) + a landing-page conversion baseline first (existing trigger `paid-acquisition-starts`).
4. **Pricing/spend = clevin's critical lane; freeze-respect** — outputs are proposals.

## Canonical source
Read FIRST: `(look this up in your connected knowledge base, if you have one)` (or `(knowledge-base tool, if connected)`). Seeded from kuch/@thekuchh "$30k/mo iOS" + Benji's Snag system, 2026-07-15. Keep the doctrine-tension section in mind: adopt the ENGINE, reject the clone-for-volume PRODUCT strategy.

## The checklist (score 🟢/🟡/🔴 with evidence)
1. **Marketing-first positioning.** Is there a value proposition that attracts in ~3 seconds? Is the promise designed before/independent of the feature list? (Idea greenlight → defer to `/office-hours`.)
2. **Organic pull evidence.** What proves people want this without paid push? (demand test, waitlist, unprompted signups, referral rate.) This is the gate on everything below.
3. **Referral / word-of-mouth loop.** Is there a mechanism that turns a delighted user into new users at the delight moment? (For one-shot products like Speechkin, this is the single highest-leverage organic lever — e.g. post-event testimonial + referral.)
4. **UGC creator engine.** If scaling: creator recruitment (screen ~10% for viral instinct), retainer + CPM structure, a creative-testing threshold (~50k-view videos scale), rough per-100k-view economics. Organic-ish; comes BEFORE paid.
5. **Paid-ads ROAS ladder.** Only after creatives prove out: $50/day tests → success = ROAS > 1 (or high CTR leading signal) → scale gradually $50→$100→$200→$300 → expect fatigue (~$3k/ad) → refresh creative. Never scale a sub-ROAS-1 ad.
6. **Organic / search / store discovery (ASO ↔ SEO/AEO).** The compounding, zero-CAC channel the paid-heavy indie playbooks under-weight. For MOBILE apps this is App Store Optimization (title/subtitle/keywords/screenshots/ratings velocity → store search ranking). For our WEB apps the SAME discipline is SEO + AEO (agent-readability): the store-listing analog is the landing page + `llms.txt` + blog content ranking for the buyer's actual query. Ties to existing tickets: KNE-18 (blog/SEO seed) + KNE-26 (agent-readability/AEO audit). Score whether the product is discoverable by someone searching the problem, not just by someone shown an ad.
7. **Retention + analytics.** Funnel analytics (onboarding, conversion, cancellation) + a churn re-engagement path. Without instrumentation, acquisition spend is unmeasurable.
8. **Channel-fit.** Web + one-shot vs mobile + subscription changes the channels. Don't copy an iOS-subscription ad/ASO playbook onto a one-shot web product wholesale — translate ASO→SEO/AEO, subscription-trial→one-time-value-framing.

## Output
- Per-item 🟢/🟡/🔴 + evidence.
- The HARD-GATE verdict up top (is this product even eligible for acquisition spend right now? usually the answer pre-demand-proof is NO — say so).
- Prioritized moves, `[proposal — needs sign-off]` for anything touching spend, `[safe]` for organic/instrumentation.
- Highest-leverage organic lever named explicitly (usually a referral loop before any paid channel).
- Save to `your working notes folder/distribution-audit-<app>-<date>.md`; stamp the product page `distribution-audit: <date>/<verdict>`.

## Skill-family note
`monetization-audit` (conversion) + `distribution-audit` (acquisition) + their the knowledge base playbook docs form the growth skill family. Future growth-tactic ingests EXTEND the relevant playbook doc rather than spawning a new top-level skill — that's how we avoid skill sprawl while keeping the knowledge live and applied.


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
