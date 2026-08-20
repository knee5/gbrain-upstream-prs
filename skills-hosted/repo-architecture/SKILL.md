---
name: repo-architecture
description: "Decide where a new note or document belongs in a knowledge base: file by primary SUBJECT, not by format or source. Use when creating a page and unsure of its home, or when auditing a messy folder structure"
triggers:
  - "repo architecture"
  - "creating a page"
  - "unsure of its home"
  - "when auditing a messy folder structure"
  - "decide where a new note or document belongs in a knowledge base"
  - "file by primary subject"
---

# Repo Architecture — Filing Rules

> **Full filing rules:** See the `filing-rules` skill

## Contract

This skill guarantees:
- Every new page is filed by primary subject (not format, not source)
- The decision protocol is followed for ambiguous cases
- Common misfiling patterns are caught

## Phases

1. **Identify the primary subject.** What would you search for to find this page?
2. **Walk the decision tree:**
   - About a person → `people/{name-slug}.md`
   - About a company → `companies/{name-slug}.md`
   - A reusable concept/framework → `concepts/{slug}.md`
   - An original idea → `originals/{slug}.md`
   - A meeting → `meetings/{slug}.md`
   - Media content → `media/{type}/{slug}.md`
   - Raw data import → `sources/{slug}.md`
3. **Cross-link.** Link from related directories.
4. **Check notability.** See `skills/conventions/quality.md` notability gate.

## Output Format

Advisory: "File this at `{type}/{slug}.md` because the primary subject is {reason}."

## Anti-Patterns

- Filing by format ("it's a PDF so it goes in sources/")
- Filing by source ("it came from email so it goes in sources/")
- Creating pages without checking if one already exists
- Using `sources/` for anything except raw data dumps


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
