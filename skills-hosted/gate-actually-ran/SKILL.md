---
name: gate-actually-ran
description: "Proves a gate ran on the exact commit before trusting it: separate does-it-run from did-it-run-this-time from is-its-output-consumed, tell an advisory check-run from a blocking commit status, and detect fail-open configurations that report green when the check could not execute. Use before merging on a green check, when adopting or auditing any gate, job, or monitor, and whenever a capability reports healthy but you have never seen its output"
triggers:
  - "did the gate run"
  - "verify the gate"
  - "green check before merge"
  - "fail open"
  - "is this check blocking"
  - "audit a gate or monitor"
---

# Gate actually ran

A green check, a zero exit code, and a plausible aggregate are all compatible with total
failure. The costly pattern is not a gate that fails — it is a gate that reports success
without having done anything.

## The three questions, asked separately

Most gate failures come from collapsing these into one.

1. **Does it run at all?** Is there evidence of recent execution touching the gate's *core
   step*, not just a green job wrapper? A skipped step inside a passing job is the
   signature.
2. **Did it run on *this* head?** A green mark can be inherited, cached, stale, or attached
   to an earlier commit. Match the check to the exact revision you are about to merge.
3. **Is its output consumed?** A report nobody reads and a status nothing blocks on are
   both decoration. Ask what would happen differently if the gate said no.

## Advisory check-run vs blocking commit status

These look identical in a pull-request UI and are not the same thing.

- A **check-run** is a report. It renders as a check mark. On its own it blocks nothing.
- A **commit status** can be made a *required* status, which is what actually prevents a
  merge.

Two consequences worth internalizing. First, a tool posting cheerful check-runs may have
no ability to stop anything. Second, on many hosts **private repositories cannot set
required status checks without a paid plan** — so until that plan exists, *nothing can
block a merge on those repos* and every "gate" is advisory no matter how it is configured.
Know which regime you are in before you claim a repo is protected.

## Fail-open detection

A gate is fail-open when it cannot do its job and reports success anyway. Hunt for these
shapes:

- **A conditional that skips the core work and exits zero.** `if secret is empty: exit 0`
  is a lie generator. The correct behavior is to fail loudly and let the red mark be
  informational.
- **A "report status on failure" setting that defaults to false.** A reviewer that is
  rate-limited or errored then leaves a *passing* status. Read the default, do not assume
  it is the safe one.
- **A config the consumer silently rejected.** One field over a length limit, or a
  duplicate key, can make a tool discard the whole file and run on defaults while
  appearing configured. **Validate with a parser at least as strict as the consumer's** —
  a permissive parser that tolerates duplicate keys will bless a config the real consumer
  throws away.
- **A missing credential** that turns the whole job into a no-op notice.
- **A monitor shadowing a paused lane.** Shadow mode assumes a live canonical lane; if the
  thing being shadowed is not running, the shadow is not validated, it is just silent.
- **A test that cannot fail** — one asserting the implementation's own value against
  itself passes vacuously on exactly the gap it exists to catch.

## Attestation: prove value, not execution

Design every job so a broken run is distinguishable from a quiet one.

- The right discriminator is usually **items examined**, not items produced. A healthy
  quiet run still examines N candidates; a broken lane examines zero. A run that examined
  zero **fails**, even on exit code zero.
- **A failed run withholds its heartbeat** so liveness monitoring alerts on absence. A job
  that reports success unconditionally cannot be monitored.
- Track consecutive-quiet-run counts so a legitimately uneventful stretch stays legible and
  does not get mistaken for breakage.
- **Monitor for version and config drift, not just liveness.** "Up" says nothing about a
  build months stale.
- **A detector is not a control.** An external probe that alerts within thirty minutes
  blocks nothing. Say "detects" or "prevents" deliberately; the difference is what happens
  during those thirty minutes.

## The design test

For any gate, job, or monitor, ask: **what would this look like if the thing it does were
completely broken?** If the answer is "identical," the check is worthless.

Apply the same test to detectors themselves. A monitor with false positives trains its
reader to ignore the real alarm, so tighten it and then **plant a real fault to prove it
still discriminates**. Negative controls belong on detectors, not just on fixes.

## Reading evidence without fooling yourself

- **Read the artifact, not the report about it.** This applies to agent summaries and to
  your own.
- **Grepping for expected words is not reading.** Pattern-matching misses vocabulary you
  did not anticipate and strips the control flow that decides what a branch actually does.
- **Piping a command's output into a search can fail silently** in ways a purpose-built
  search does not. Absence of a match is weak evidence of absence.
- **Pull before concluding a peer did nothing.** In a shared repository, absence of
  evidence is usually staleness. Order the hypotheses: my copy is stale; they used a
  different valid channel; my instruction was impossible; my dispatch path skipped the
  discipline. "It did not comply" is last.
- **When you edit a file a program parses, verify by running the program.** Re-reading your
  own diff proves nothing about a strict parser.
- **Exit zero plus empty output is a finding, not a non-event.** Check whether the
  receiving side ever saw the request.
- **If a "proof" step is itself the dangerous action, it is not a proof, it is the
  incident.** Find a read-only way to demonstrate the block.

## Acquired is not wired

A capability that was bought, installed, or built but never switched on will report green
by default, because nothing is reporting at all. For every gate, job, and subscription,
run the periodic wiring audit: workflows versus the secrets they reference, scheduled jobs
versus the job manifest, configured integrations versus reachable ones, and entitlements
that are paid for but dark. Before buying a lane, search the disk for the free one you may
already have.

## Before you merge

State plainly, in the words of the artifact: which gate, which commit, ran at which time,
producing which output, and whether that gate can block. If you cannot fill in every slot
from evidence you looked at, you are merging unreviewed.
