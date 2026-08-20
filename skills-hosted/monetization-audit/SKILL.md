---
name: monetization-audit
description: "Run a product through a repeatable paywall, pricing, and conversion checklist and produce a scored audit with concrete prioritized changes. Use for any pricing decision or as a pre-launch gate"
triggers:
  - "monetization audit"
  - "pricing decision"
  - "as a pre-launch gate"
---

# Monetization Audit

A repeatable audit that runs ANY product through the conversion/paywall playbook and returns a scored, prioritized change list. This is the portfolio's standing answer to "are we monetizing this well?" — invoke it at every pricing decision and before every launch.

## When to invoke
- Any pricing / paywall / trial / upgrade / "how do we charge for this" decision.
- Pre-launch gate for a product (no product launches without a pass or an explicit waiver).
- Periodic review of a live product's funnel (quarterly, or when conversion is disappointing).

## Canonical source
Read the the knowledge base reference FIRST so the audit reflects the current playbook, not stale memory:
`(look this up in your connected knowledge base, if you have one)` (or `(knowledge-base tool, if connected)`).
That page is the synthesized playbook (seeded from Wasim/@WasimShips "Paywalls 101 → $10k MRR", 2026-07-15, plus portfolio doctrine). Update the page when the playbook improves; the skill always cites the live page.

## The checklist (score each 🟢 pass / 🟡 weak / 🔴 gap, with the specific evidence)

1. **Value-before-paywall.** Does the user *feel* the core value BEFORE the ask? Where exactly is the wall placed in the funnel? A wall at the entrance kills conversion; the wall belongs immediately after the first "magic moment."
2. **Value-framing beats price-point.** Is the price anchored against a credible alternative the user already believes in (e.g. "$19 vs $150 for a speechwriter")? The exact number ($9.99 vs $14.99) matters far less than the anchor + story. Are we obsessing over the number instead of the framing?
3. **Revenue-model fit.** Does the model match the USAGE pattern? One-shot usage → one-time price (forcing MRR onto a one-occasion product is a mistake). Recurring/repeated usage → subscription with trial + annual anchor. Name the mismatch if there is one.
4. **Friction to purchase.** Count the steps/fields from intent → paid. Guest checkout? Card-required trial (converts ~3× vs no-card, where a trial fits)? Every removed step is conversion. (Ties to the org's "remove as much friction as possible" doctrine.)
5. **Social proof at the delight moment.** Do we ask for the testimonial/review/referral right after the user feels value, and BEFORE any price friction — not after?
6. **Trust/positioning integrity (portfolio gate).** Does any proposed conversion tactic undercut the product's trust wedge? (e.g. Speechkin: never "AI writes it" — show WORKFLOW value, never ghost-writing.) A conversion trick that erodes the moat is a net loss. Reject those.
7. **Funnel instrumentation.** Can we actually SEE where users drop off (entry → value-moment → paywall-view → purchase)? Without instrumentation every other item is a guess. Flag missing analytics as its own gap.

## Portfolio-doctrine guardrails (apply before recommending)
- **Respect release freezes.** If the product is frozen (e.g. a live gate wave), the audit outputs PROPOSALS, not code changes.
- **Pricing = clevin's critical lane.** Never change a price or paywall unilaterally; surface the recommendation for his sign-off (payments are a critical/HITL item).
- **Paused/parked products** are out of scope — don't audit or build for them unless reactivated.
- **Not every viral playbook fits us.** Most $10k-MRR mobile-IAP tactics assume iOS subscriptions; we are web + Stripe, mostly one-shot. Keep the transferable kernel (value-first, framing, friction, proof, instrumentation); discard the model-mismatched machinery.

## Output
Produce a short scored report:
- Per-item 🟢/🟡/🔴 with the specific evidence (file/route/screen where the wall/friction/gap lives).
- A prioritized change list (highest-conversion-leverage first), each tagged `[proposal — needs clevin sign-off]` if it touches price/paywall, or `[safe]` if it's non-pricing (e.g. instrumentation, copy framing, wall placement in a non-frozen app).
- One-line verdict + the single highest-leverage move.
- Save the report to `your working notes folder/monetization-audit-<app>-<date>.md` and record a `monetization-audit: <date> / <score>` line on the product's entry (portfolio tracker / the knowledge base project page) so we can see which products have been run through it.

## Refer-back mechanism (why this skill exists)
This skill IS the "how do we remember to apply it" answer. It's routable (pricing/paywall/monetization intents), it's a pre-launch gate, and it stamps each product with its last-audit date. If a product has no `monetization-audit` stamp, it hasn't been checked — that absence is the signal.


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
