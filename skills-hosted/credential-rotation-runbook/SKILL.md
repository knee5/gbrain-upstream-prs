---
name: credential-rotation-runbook
description: "Rotates a shared credential without orphaning a consumer or tripping a pooler circuit breaker: enumerate every layer that holds the secret, stage the new value first, update all configs before testing anything, then verify once per consumer. Use when rotating a database password, API key, or any secret more than one process reads, and when auditing whether a past rotation actually finished"
triggers:
  - "credential rotation"
  - "rotate the database password"
  - "rotate a shared secret"
  - "rotate an API key"
  - "circuit breaker after rotation"
  - "did the rotation finish"
---

# Credential rotation runbook

A rotation is not "change the password and update the config." It is an enumeration
problem wrapped in a rate-limit hazard. The two ways it goes wrong are that a consumer
nobody listed keeps presenting the dead secret, and that the retries triggered by that
consumer lock everyone out.

## Rule 0 — enumerate before you rotate

Write the consumer list down before touching anything. For each consumer record where the
secret lives, and whether you have verified that location with your own eyes or are
assuming it. Assumptions on this list are the whole risk.

Credentials hide in more layers than a repo grep reaches. Check all of these:

- Config files for each tool, on **every account** on the machine, not just yours.
- A `.env` in any working directory a job `cd`s into. **A working-directory `.env` beats
  the tool's own config file.** This is the single most common cause of a rotation that
  will not finish: every scheduled run spawns a fresh process holding the dead secret.
- Environment variables set at the OS user level, which every GUI-launched process
  inherits — including your own shell. These appear in no profile file and are close to
  untraceable if you do not think to look.
- Service-supervisor job definitions with their own embedded environment blocks. Children
  respawn and re-inherit; stopping the child is not enough, you must stop the supervisor.
- **Off-box deployments whose secret is a platform secret, not a file.** These are
  invisible to every local search, which makes them the consumer a rotation silently
  orphans. Worse, the endpoint usually keeps answering its health check with dead
  credentials, so nothing looks broken.
- Long-running processes holding the old value in memory.
- Hardcoded copies inside helper scripts.

Distinguish credential *types* before scoping. A database password and an API key are
different secrets; rotating one does not touch consumers of the other, so do not turn a
narrow rotation into a repo-wide sweep.

The diagnostic that finds stragglers: take the *current* value, search the filesystem for
files mentioning the service host, and flag every file whose contents do **not** contain
the current value. Those are your stale feeders.

## The circuit-breaker hazard

Many managed database poolers open a project-wide circuit breaker after repeated auth
failures. Once open it blocks **all** new connections regardless of whether the password
is correct, and recovery needs roughly ten to fifteen minutes of **zero** connection
attempts. Every attempt, including your own test, resets the cooldown.

**Therefore: fix all the configs, then STOP. Never test-loop.** If a connection fails
after rotation, do not re-run the command to see whether it works now. Fix the config,
wait, then make exactly one attempt.

If the breaker will not clear, something is still poking it — usually scheduled jobs
running with the stale config. You need a genuinely zero-connector window, which means
unloading every job that connects, confirming, then reloading cleanly.

A read-only or transaction-mode endpoint on a different port, using the same credentials,
is often a usable escape hatch for confirming the password itself is right while the main
pooler is angry.

## Order of operations

1. **Pre-flight.** Resolve every unverified row on the consumer list. Confirm no scheduled
   job or long-running lane is mid-run. Do not rotate inside a freeze window or while a
   soak depends on stable behavior.
2. **Stage the new value in the password manager first**, before it exists in the service.
   If a later step fails you must not be reconstructing the secret from terminal
   scrollback.
3. **Rotate at the service.**
4. **Update every local config in one pass, before testing anything.** Partial updates
   produce exactly the repeated-auth-failure pattern that trips the breaker. If a tool
   reads two variables that both carry the connection string, update both together.
5. **Verify once.** One probe. Not a loop.
6. **Then the remote and off-box consumers**, one at a time. A platform secret change
   usually triggers a redeploy — wait for it to finish before judging the result.
7. **Then the remaining accounts and applications.**
8. **Final verification: one probe per consumer, spaced out.**
9. **Record the new value's fingerprint in the access map** so the next audit can tell
   current from stale without handling the secret.

## Handling the secret safely

- The clipboard is unreliable for passwords. It can change between commands and can hold a
  shell command where you expected a secret, which corrupts the config in a way that is
  hard to read. Prefer reading from the password manager or the config file directly.
- Validate piped input. Anything containing spaces, an `@`, or quotes is probably a
  command, not a password. Reject it and rebuild the connection string from a known
  template.
- After a service-side reset, allow propagation time. One clean auth failure immediately
  after a reset does not mean the password is wrong.
- Note that a service-side upgrade or maintenance action can reset a password on its own.

## Verifying a rotation actually finished

A rotation is done when every consumer on the list has been probed and passed, not when
the configs look right. Until then, assume an unlisted consumer exists. Pair the rotation
with the [gate-actually-ran](../gate-actually-ran/SKILL.md) question: does each consumer
*run*, and did it run *since* the rotation?

## Worth doing alongside

- Rotation retires old secrets, which is often the cheapest way to close an exposure in
  logs and transcripts you do not want to delete. Once the master is rotated, the copies
  in history become harmless.
- Move plaintext secrets that services can refresh themselves into the password manager
  and shred the file copies. They buy nothing.
- Rotation alone just resets the clock on a shared master key. The durable fix is moving
  each consumer onto a scoped, least-privilege role, so the next rotation has a blast
  radius of one lane instead of everything.
