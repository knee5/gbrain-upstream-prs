---
name: copy-humanizer
description: "Run before shipping any user-facing prose (landing pages, blog posts, emails, social posts, README and docs). Scores the draft against a 24-pattern AI-slop detector and rewrites what fails"
triggers:
  - "copy humanizer"
---

# Copy Humanizer — the ship-gate for public prose

**Trigger (positive):** any draft of user-facing copy is about to be committed, published, or handed to clevin as "ready" — Speechkin landing/blog/emails, X posts, public README/PR descriptions.
**Trigger (negative):** do NOT run on code comments, internal docs, agent-to-agent messages, or Speechkin's *product output* (the user's own speech drafts — those have their own grounding/safety pipeline; never "humanize" a user's words).
**Owner:** CC. **Fixture:** `fixture.md` in this directory — run the checklist against it; it must score <70 (it's deliberately slop). If it scores ≥90, the skill is broken.

## Pass 1 — Positive writing system (write TOWARD this, not just away from slop)

- Simple declarative sentences. Short paragraphs (1–3 sentences).
- Say what something IS. Never define by negation ("This isn't X, it's Y" = the #1 tell).
- Real numbers or no numbers. Never fabricate metrics.
- Speechkin brand: warm, human, a little witty — "sweet without syrup." The buyer is anxious; reassure. The words are already theirs.
- **Hard guardrail:** never describe Speechkin output as AI-generated/AI-written in user-facing copy. "It sounds like you because it is you."
- Blog/site links are RELATIVE (`/blog/<slug>`), never absolute speechkin.com.

## Pass 2 — The 24-pattern detector (rewrite any section that hits)

Banned vocabulary: delve, tapestry, landscape (abstract), leverage, multifaceted, nuanced, pivotal, realm, robust, seamless, testament, transformative, underscore (v), utilize, whilst, keen, embark, comprehensive, intricate, commendable, meticulous, paramount, groundbreaking, innovative, cutting-edge, synergy, holistic, paradigm, ecosystem, Additionally, crucial, enduring, enhance, fostering, garner, highlight (v), interplay, intricacies, showcase, vibrant, valuable, profound, renowned, breathtaking, nestled, stunning.

1. No significance inflation ("pivotal moment", "stands as", "is a testament")
2. No undue notability claims
3. No superficial -ing phrases ("highlighting", "showcasing", "underscoring")
4. No promotional language ("boasts", "vibrant", "commitment to")
5. No vague attributions ("Experts believe", "Industry reports suggest")
6. No "despite challenges... continues to" structures
7. No AI-vocabulary clustering (2+ banned words in one paragraph)
8. No copula avoidance ("serves as" → "is")
9. No negative parallelisms ("It's not just X, it's Y")
10. No rule-of-three forcing (triple adjectives/clauses)
11. No synonym cycling for the same thing
12. No false ranges ("from X to Y" on no real scale)
13. Em dashes: max 1 per 200 words
14. No mechanical boldface emphasis
15. No bolded-label-colon vertical lists in prose
16. No Title Case In Every Heading
17. No emoji on headings/bullets
18. No curly quotes
19. No collaborative artifacts ("Hope this helps", "Let me know")
20. No knowledge-cutoff disclaimers
21. No sycophancy ("Great question!")
22. No filler ("In order to", "It is important to note")
23. No hedging stacks ("could potentially", "might have some effect")
24. No generic positive endings ("The future looks bright", "Exciting times ahead")

## Scoring

Start at 100; deduct ~5 per pattern hit (major clustering: 10). **90–100 ship · 70–89 quick fixes · 50–69 rewrite sections · <50 full rewrite.** Report the score + the specific hits when handing copy to clevin.

Source: adapted from `ericosiu/ai-marketing-skills` (assessment: the knowledge base `tech/wiki/analysis/ericosiu-marketing-skills-assessment`). Their python/telemetry not adopted — checklist only.

## Proof-of-fire receipt (MANDATORY — adopted 2026-07-28, wiring-audit F8)

A run of this gate that leaves no artifact did not happen. Before reporting your verdict, write a dated scorecard to `your working notes folder/gate-receipts/YYYY-MM-DD-<surface>-<skill-name>.md` containing: what was gated (commit/PR/deploy/copy reference), the verdict (and score where this skill scores), the specific findings/hits, and who ran it (agent/session). Commit the receipt to kb (add ONLY your file, never `git add -A`). The Friday retro counts ships against receipts; a ship without a matching receipt is a violation. This section exists because these gates showed zero recorded invocations across a period that included shipping the landing page.


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
