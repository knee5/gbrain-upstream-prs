---
name: sole-mutator-fencing
description: "Guarantees exactly one writer to shared state before mutating it: fence the other writers first, make the fence independent of the thing being fenced, treat marker and lock files as claims that need liveness proof, and arm a rollback deadline someone else can trigger. Use before a migration, cutover, repair, or any change to state that concurrent agents, jobs, or accounts also write"
triggers:
  - "sole mutator"
  - "fence the other writers"
  - "concurrent writes to shared state"
  - "stale lock file"
  - "cutover or migration plan"
  - "rollback deadline"
---

# Sole-mutator fencing

Most corrupted shared state is not a bad write. It is two correct writers. Before you
mutate anything several processes touch, establish that you are the only one who can.

## Fence before you mutate, not after

The sequence is: **fence, prove the fence, mutate, verify, then unfence.** Fencing after
the first write has already begun is not fencing, it is a race you are narrating.

A fence is only real if it survives the death of your own session. If your process is what
holds the other writers back, then anything that kills your process opens the gate — and
the most likely thing to kill your process is the very failure you are guarding against.

**Prefer a fence executed by something more durable than an agent session:** a firmware or
platform-scheduled action, a supervisor-level stop, or a power state. Power state is
especially clean because it needs no running process, no network, and no cooperation at
fence time.

**Verify the fence from an independent host.** If everything that confirms the fence runs
on the machine being fenced, you have no confirmation — you have a machine that stopped
answering. Post-fence checks must run somewhere that is unaffected by the fence.

## Prefer stopping over deleting

A good fence is reversible by construction. Change the power state, unload the job, stop
the supervisor. Do not disable-by-deletion, unlink, or destroy configuration to achieve
quiet. The difference shows up when you need to roll back at 3am.

The same applies to damaged state you are replacing: **retain the bad artifact.** Service
restoration can outrank an open-ended forensic carve, but nothing is served by destroying
the evidence while you do it. Move it aside with a timestamped name and record where it
went.

## Marker and lock files are claims, not proof

A lock file asserts that a process holds the resource. It does not establish that the
process exists. A stale zero-byte lock left by a crashed run will block every future
attempt, or worse, convince you a repair is in flight when nothing is running.

Rules that make markers trustworthy:

- **A lock must carry the identity of its holder** — process id, host, and start time —
  so staleness is checkable rather than guessable.
- **Always check liveness before honoring a lock.** No live holder means a stale lock, and
  stale locks get cleared deliberately and noisily, never silently.
- **Write the marker only after the thing it claims is confirmed.** A record that says
  "already did X" written before X succeeds will suppress the retry that would have fixed
  it. Leave the failure path explicitly unmarked, with a comment saying why, and test the
  whole sequence — fail, retry succeeds, third attempt deduped — so it breaks against the
  wrong ordering instead of passing by timing.
- **When a sanctioned wrapper exists, use it.** Wrappers around raw dispatch usually exist
  because someone already lost work to the raw call. The wrapper that writes the payload
  first, then verifies the receiver actually recorded it, is the one that catches silent
  drops.

## Make the change atomic, with a pre-made backup

- Take the backup **before** the install, and keep it after.
- Install atomically: build the replacement fully, then swap it into place in one step.
- Run the full check battery afterward and receipt the results.
- **Any check failure means roll back, not repair forward.** Repair-forward on a
  half-installed state is how a bounded incident becomes an unbounded one.

## Arm a rollback deadline someone else can trigger

A rollback plan that depends on your judgment at the moment of failure is not armed. State
it as a deadline with an objective trigger and an owner who is not you:

> First evidence obligation is the 07:30 digest. Absence by 08:00 triggers rollback.

Name the trigger, the deadline, the owner, and the ordered list of steps to reverse. Write
it somewhere that survives the fence — if your coordination file lives on the machine
being powered off, the durable copy is the one on the other host.

## Concurrent agents are concurrent writers

The same discipline applies to agents, not just processes.

- **Parallel lanes cannot see each other's reversals.** One lane can spend hours building
  a plan a sibling lane already cancelled, and neither is wrong given what it knew. Put a
  barrier before any lane whose premise another lane can invalidate, or brief them as
  strictly sequential.
- **Timestamp the mandate in every brief.** State the decision and when it was made, so a
  lane reasoning inside an older snapshot can recognize it is stale.
- **A ruling may overrule another ruling. It may never overrule the principal.** When an
  agent's conclusion contradicts a user instruction, take its technical work, discard its
  authority claim, and say plainly in the report that you did.
- **Patch the standing prompts in the same pass as the decision.** A stale loop text is the
  same failure with a longer fuse: it will keep asserting a reversed mandate as fact, and
  fresh lanes will inherit it.
- **Consolidate, do not add.** Creating a second coordination channel because you could not
  find the first one guarantees two partial views of the truth. Search for the existing
  channel first, and pull before concluding it is empty.

## Do not deadlock against your own fence

If the surrounding harness already takes a lock on the resource your command mentions, a
second lock acquired inside that command waits on a lock you are already holding. When the
guard covers the call, write directly and let it serialize. Wrappers are for writers the
guard does not cover.

## Pre-flight checklist

- Who else writes this state? Enumerate agents, scheduled jobs, other accounts, and remote
  services — not just the obvious process.
- What stops each of them, and does that stop survive my session dying?
- How do I *prove* each is stopped, from somewhere independent?
- What is my backup, and have I taken it?
- What is the rollback trigger, its deadline, and its owner?
- Where does the durable copy of this plan live?
