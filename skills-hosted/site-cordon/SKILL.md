---
name: site-cordon
description: "Safely cordon off a broken or half-finished part of a live site instead of shipping it or reverting everything: what to hide, what to redirect, and what to tell users"
triggers:
  - "site cordon"
  - "what to hide"
  - "what to redirect"
  - "and what to tell users"
---

# site-cordon

## Security and behavior contract

- Read `SITE_CORDON` only in server middleware. When `SITE_CORDON=on`, default
  every non-exempt application request to the holding page.
- Treat unset/off as normal access only by deliberate release configuration;
  verification errors while on must fail closed to holding, never open.
- Keep the holding page and middleware independent of the broken feature.
- **Pass:** one switch cordons all intended routes. **Fail:** a client flag,
  preview-only behavior, or route omission can expose the application.

## Middleware decision order

Implement this server-side order and test every branch:

1. Allow only required static assets and the holding page itself.
2. Allow narrowly enumerated health routes.
3. Allow required auth initiation/callback routes.
4. Allow required billing/webhook/callback routes.
5. Allow a server-verified valid QA bypass cookie.
6. Allow a server-authenticated user with server-verified paid entitlement.
7. Rewrite/redirect everything else—including deep links—to the holding page.

For every exemption, use an exact route/method allowlist and minimum surface. Never
trust client state, unsigned claims, query parameters, or local storage. On cookie,
auth, entitlement, or dependency verification failure, serve
holding. **Pass:** exemptions are narrow, server-verified, and fail closed.
**Fail:** prefixes are broad, verification is client-side, or failure opens access.

## QA bypass

- Generate a high-entropy, rotatable random value; keep it in a server secret/env store.
- Issue it only through a restricted authenticated operator/server path.
- Set a `Secure`, `HttpOnly`, `SameSite=Strict` (or justified `Lax`) cookie with
  bounded expiry; revoke/rotate after QA.
- Never place it in source, Git, URLs, client code, screenshots, chat, logs,
  analytics, error reports, or fixtures.
- **Pass:** unauthorized users cannot obtain/read/replay it beyond expiry.
- **Fail:** it is static in code, observable client-side, unbounded, or leaked.

## Paid-user exemption

Verify session and entitlement using authoritative server data. Bind entitlement
to the authenticated user; never accept a request email/customer ID as proof.
**Pass:** an entitled user enters and an unpaid/unknown user sees holding.
**Fail:** verification outage, stale state, or malformed identity grants access.

## Holding-page copy

- For planned pre-release work, say “not publicly available yet”; do not imply outage.
- Do not disclose defects, security details, bypass mechanics, internal codenames,
  or speculative dates.
- Give a legitimate support/contact or status path that is itself exempt and works.
- Keep title, status, next step, and accessibility clear on mobile and desktop.
- **Pass:** copy is honest, calm, non-leaky, and actionable. **Fail:** it misleads,
  overshares, dead-ends, or promises an unsupported launch time.

## Production test matrix

Run against the exact production deployment, never only a preview.

| Case | Required result |
|---|---|
| Anonymous/new user | Holding page; no app data or shell leak |
| Valid QA cookie | Application allowed |
| Authenticated + entitled paid user | Application allowed |
| Invalid/expired/revoked cookie | Holding page |
| Direct application deep links | Cannot bypass; holding page |
| Static/health/auth/billing callbacks | Required assets/routes still work |

Also test refresh, nested routes, query strings, alternate hosts, and dependency failure.
**Pass:** every row matches, no loop. **Fail:** a path leaks/breaks or failure opens access.

## ENABLE sequence

1. Record reason, owner, candidate, exit criteria, exemptions, and bypass owner.
2. Set production `SITE_CORDON=on` in Vercel; do not treat env save as deployment.
3. Redeploy production deliberately and record the new deployment ID/URL.
4. Confirm the deployment consumed `on` through observed behavior/server receipt.
5. Run the full production matrix: holding, bypass, paid access, deep links,
   invalid/expired cookie, assets, health, auth, and billing callbacks.
6. Save a redacted receipt with results and defects.

**ENABLE pass:** the new production deployment passes every matrix row and public
access is blocked. **ENABLE fail:** env/deployment identity is uncertain, any
exemption is broken, or any unauthorized route enters; keep/reinstate the cordon.

## LIFT sequence

1. Obtain a clean `ship-gate` receipt for the **exact production deployment**
   currently reachable through the cordon; zero P0/P1 findings.
2. Record approver, ship-gate receipt path/link, deployment ID, and lift time.
3. Set production `SITE_CORDON=off` and redeploy deliberately.
4. Verify production anonymous/new and paid paths; recheck deep links, auth,
   billing callbacks, and assets.
5. Rotate/revoke the QA bypass and verify the old cookie no longer grants access.
6. Retain the cordon code and tests for reuse; retain the redacted lift receipt.

**LIFT pass:** the new deployment serves intended anonymous and paid paths, the
old bypass is dead, and callbacks/assets remain healthy. **LIFT fail:** any check
fails or deployment differs from the ship-gated build; turn cordon on, redeploy,
and do not announce availability.

## Receipt fields

- Action `ENABLE`/`LIFT`, reason, owner/approver, timestamp.
- Commit, production deployment ID/URL, env value, redeploy confirmation.
- Exact exemptions and server-verification evidence; matrix results.
- Bypass expiry/rotation owner and redacted revoke confirmation.
- Ship-gate receipt link for lift; defects, decision, rollback/re-cordon result.


---

## Portability note

This skill was adapted from a local agent setup for use in a hosted assistant. Machine-specific machinery (shell preambles, local CLIs, scheduled-job wiring, file paths on a personal laptop) has been removed; the methodology is intact. Where a step refers to a connected knowledge base or a repository, use whatever equivalent you have in this conversation — uploaded files, project memory, or what the user pastes in. If a step is impossible here, say so and continue with the rest rather than inventing output.
