/**
 * IRON RULE security regression guard for the v0.21 trusted-workspace
 * allow-list path on put_page.
 *
 * Covers:
 *   - matchesSlugAllowList glob semantics (ALLOW + REJECT + recursive globs)
 *   - put_page accepts when slug matches allow-list
 *   - put_page rejects when slug is outside allow-list
 *   - put_page falls back to legacy `wiki/agents/<id>/...` namespace check
 *     when allowed_slug_prefixes is unset (regression guard for v0.15
 *     anti-prompt-injection guarantee)
 *   - put_page rejects when viaSubagent=true but subagentId is missing
 *     (regression guard for FAIL-CLOSED behavior)
 *   - every routine slug-targeting OAuth write requires a registration-time
 *     write namespace, while admin and trusted local callers retain operator
 *     behavior
 */

import { describe, test, expect } from 'bun:test';
import { matchesSlugAllowList, operations, OperationError, type OperationContext } from '../src/core/operations.ts';

const STUB_LOGGER = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const STUB_CONFIG = {} as unknown as Parameters<typeof operations[number]['handler']>[0]['config'];

function findOp(name: string) {
  const op = operations.find(o => o.name === name);
  if (!op) throw new Error(`operation ${name} not found`);
  return op;
}

// Stub engine that fails loudly if put_page actually reaches importFromContent.
// We expect every test in this file to short-circuit at the namespace/allow-list
// check, so every engine method throws a recognizable error that lets us assert
// "got past the gate" if it ever happens.
function stubEngine() {
  return new Proxy({} as never, {
    get(_target, prop: string) {
      return () => { throw new Error(`engine.${prop} should not have been called — gate failed`); };
    },
  }) as Parameters<typeof operations[number]['handler']>[0]['engine'];
}

function makeCtx(overrides: Partial<OperationContext> = {}): OperationContext {
  return {
    engine: stubEngine(),
    config: STUB_CONFIG,
    logger: STUB_LOGGER,
    dryRun: false,
    remote: true,
    viaSubagent: true,
    subagentId: 42,
    jobId: 100,
    ...overrides,
  } as OperationContext;
}

describe('matchesSlugAllowList — glob semantics', () => {
  test('exact match (no glob suffix)', () => {
    expect(matchesSlugAllowList('foo/bar', ['foo/bar'])).toBe(true);
    expect(matchesSlugAllowList('foo/bar/baz', ['foo/bar'])).toBe(false);
  });

  test('shallow glob: prefix/* matches any single direct child segment', () => {
    expect(matchesSlugAllowList('wiki/personal/reflections/2026-04-25-arete-paradox-a3f8c1',
      ['wiki/personal/reflections/*'])).toBe(true);
    expect(matchesSlugAllowList('wiki/personal/reflections',
      ['wiki/personal/reflections/*'])).toBe(false);
  });

  test('recursive: prefix/* matches deep children too', () => {
    expect(matchesSlugAllowList('wiki/originals/ideas/2026-04-25-foo',
      ['wiki/originals/*'])).toBe(true);
    expect(matchesSlugAllowList('wiki/originals/ideas/foo/bar',
      ['wiki/originals/*'])).toBe(true);
  });

  test('rejects slugs outside every prefix', () => {
    const list = [
      'wiki/personal/reflections/*',
      'wiki/originals/*',
    ];
    expect(matchesSlugAllowList('wiki/finance/secret', list)).toBe(false);
    expect(matchesSlugAllowList('wiki/people/alice', list)).toBe(false);
  });

  test('empty list rejects everything', () => {
    expect(matchesSlugAllowList('wiki/anything', [])).toBe(false);
  });

  test('does NOT match prefix without trailing segment', () => {
    expect(matchesSlugAllowList('wiki/personal/reflections',
      ['wiki/personal/reflections/*'])).toBe(false);
  });
});

describe('put_page — trusted-workspace allow-list', () => {
  const put_page = findOp('put_page');

  test('REJECTS when slug is outside the allow-list', async () => {
    const ctx = makeCtx({
      allowedSlugPrefixes: ['wiki/personal/reflections/*', 'wiki/originals/*'],
    });
    await expect(put_page.handler(ctx, {
      slug: 'wiki/finance/secret',
      content: '---\ntitle: x\n---\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('REJECTS path-traversal-like slug (slug regex catches it earlier in the import path; allow-list also catches via no-match)', async () => {
    const ctx = makeCtx({
      allowedSlugPrefixes: ['wiki/personal/reflections/*'],
    });
    // The slug regex in validatePageSlug rejects `..`; here we test the
    // allow-list layer specifically with a slug that LOOKS legal but isn't on the list.
    await expect(put_page.handler(ctx, {
      slug: 'wiki/people/garry-tan',
      content: '---\ntitle: x\n---\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });
});

describe('put_page — legacy namespace check (regression guard)', () => {
  const put_page = findOp('put_page');

  test('REJECTS write outside wiki/agents/<id>/ when allow-list is unset', async () => {
    // The v0.15 anti-prompt-injection guarantee: subagent without explicit
    // allow-list MUST be confined to its own agent namespace. This test
    // ensures v0.21 doesn't regress that boundary.
    const ctx = makeCtx({ allowedSlugPrefixes: undefined });
    await expect(put_page.handler(ctx, {
      slug: 'wiki/personal/reflections/2026-04-25-foo',
      content: '---\ntitle: x\n---\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('REJECTS write outside wiki/agents/<id>/ when allow-list is empty array', async () => {
    const ctx = makeCtx({ allowedSlugPrefixes: [] });
    await expect(put_page.handler(ctx, {
      slug: 'wiki/personal/reflections/2026-04-25-foo',
      content: '---\ntitle: x\n---\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('REJECTS when viaSubagent=true but subagentId is missing (FAIL-CLOSED)', async () => {
    const ctx = makeCtx({ subagentId: undefined as unknown as number, allowedSlugPrefixes: undefined });
    await expect(put_page.handler(ctx, {
      slug: 'wiki/agents/42/foo',
      content: '---\ntitle: x\n---\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });
});

describe('put_page — OAuth write namespace', () => {
  const put_page = findOp('put_page');
  const oauthCtx = (
    writeSlugPrefixes: string[] | undefined,
    scopes = ['read', 'write'],
  ) => makeCtx({
    dryRun: true,
    viaSubagent: false,
    subagentId: undefined,
    auth: {
      token: 'test-token',
      clientId: 'gbrain_cl_chatgpt',
      scopes,
      writeSlugPrefixes,
    },
  });

  test('ALLOWS create/update beneath a registered prefix', async () => {
    const result = await put_page.handler(
      oauthCtx(['inbox/chatgpt/*']),
      {
        slug: 'inbox/chatgpt/session-1',
        content: '---\ntitle: x\n---\nbody',
      },
    ) as { dry_run?: boolean };
    expect(result.dry_run).toBe(true);
  });

  test('REJECTS routine OAuth writes when the namespace binding is absent', async () => {
    await expect(put_page.handler(
      oauthCtx(undefined),
      {
        slug: 'inbox/chatgpt/session-1',
        content: '---\ntitle: x\n---\nbody',
      },
    )).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('REJECTS an unknown remote transport that failed to thread auth', async () => {
    await expect(put_page.handler(
      makeCtx({
        dryRun: true,
        remote: true,
        auth: undefined,
        transport: undefined,
      }),
      {
        slug: 'inbox/chatgpt/page-1',
        content: '---\ntitle: x\n---\nbody',
      },
    )).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('REJECTS routine OAuth writes outside the registered prefix', async () => {
    await expect(put_page.handler(
      oauthCtx(['inbox/chatgpt/*']),
      {
        slug: 'people/alice-example',
        content: '---\ntitle: x\n---\nbody',
      },
    )).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  test('ALLOWS an explicit admin OAuth token without a write prefix', async () => {
    const result = await put_page.handler(
      oauthCtx(undefined, ['admin']),
      {
        slug: 'people/alice-example',
        content: '---\ntitle: x\n---\nbody',
      },
    ) as { dry_run?: boolean };
    expect(result.dry_run).toBe(true);
  });

  test('trusted local callers retain unrestricted page-write behavior', async () => {
    const result = await put_page.handler(
      makeCtx({
        remote: false,
        dryRun: true,
        viaSubagent: false,
        subagentId: undefined,
        auth: undefined,
      }),
      {
        slug: 'people/alice-example',
        content: '---\ntitle: x\n---\nbody',
      },
    ) as { dry_run?: boolean };
    expect(result.dry_run).toBe(true);
  });
});

describe('routine OAuth writes — namespace-bound invocation matrix', () => {
  const oauthCtx = (
    writeSlugPrefixes: string[] | undefined,
    scopes = ['read', 'write'],
  ) => makeCtx({
    dryRun: true,
    viaSubagent: false,
    subagentId: undefined,
    auth: {
      token: 'test-token',
      clientId: 'gbrain_cl_chatgpt',
      scopes,
      writeSlugPrefixes,
    },
  });

  const cases: Array<{
    name: string;
    allowed: Record<string, unknown>;
    outside: Record<string, unknown>;
  }> = [
    {
      name: 'add_tag',
      allowed: { slug: 'inbox/chatgpt/page-1', tag: 'captured' },
      outside: { slug: 'people/alice-example', tag: 'captured' },
    },
    {
      name: 'add_link',
      allowed: {
        from: 'inbox/chatgpt/page-1',
        to: 'inbox/chatgpt/page-2',
      },
      // The target is deliberately outside: both endpoints must be owned.
      outside: {
        from: 'inbox/chatgpt/page-1',
        to: 'people/alice-example',
      },
    },
    {
      name: 'add_timeline_entry',
      allowed: {
        slug: 'inbox/chatgpt/page-1',
        date: '2026-07-30',
        summary: 'Captured from ChatGPT',
      },
      outside: {
        slug: 'people/alice-example',
        date: '2026-07-30',
        summary: 'Must not land',
      },
    },
    {
      name: 'put_raw_data',
      allowed: {
        slug: 'inbox/chatgpt/page-1',
        source: 'test',
        data: { ok: true },
      },
      outside: {
        slug: 'people/alice-example',
        source: 'test',
        data: { ok: false },
      },
    },
    {
      name: 'log_ingest',
      allowed: {
        source_type: 'chatgpt',
        source_ref: 'conversation-1',
        pages_updated: ['inbox/chatgpt/page-1', 'inbox/chatgpt/page-2'],
        summary: 'Captured two pages',
      },
      // Proves the handler checks every member, not only the first.
      outside: {
        source_type: 'chatgpt',
        source_ref: 'conversation-1',
        pages_updated: ['inbox/chatgpt/page-1', 'people/alice-example'],
        summary: 'Must not claim a foreign page',
      },
    },
    {
      name: 'ontology_propose',
      allowed: {
        entity: 'inbox/chatgpt/page-1',
        dimension: 'status',
        value: 'captured',
      },
      outside: {
        entity: 'people/alice-example',
        dimension: 'status',
        value: 'must-not-land',
      },
    },
  ];

  test('the matrix accounts for every routine write operation with slug side effects', () => {
    const reviewed = new Set(['put_page', 'think', ...cases.map(c => c.name)]);
    const writeOps = operations
      .filter(op => op.scope === 'write')
      .map(op => op.name)
      .sort();
    expect(writeOps).toEqual([...reviewed].sort());
  });

  for (const c of cases) {
    test(`${c.name} ALLOWS an invocation fully inside the registered prefix`, async () => {
      const result = await findOp(c.name).handler(
        oauthCtx(['inbox/chatgpt/*']),
        c.allowed,
      ) as { dry_run?: boolean };
      expect(result.dry_run).toBe(true);
    });

    test(`${c.name} REJECTS an invocation outside the registered prefix`, async () => {
      await expect(findOp(c.name).handler(
        oauthCtx(['inbox/chatgpt/*']),
        c.outside,
      )).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });

    test(`${c.name} FAILS CLOSED when bound_slug_prefixes is absent`, async () => {
      await expect(findOp(c.name).handler(
        oauthCtx(undefined),
        c.allowed,
      )).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });
  }

  test('add_link also rejects an outside-prefix origin when the target is allowed', async () => {
    await expect(findOp('add_link').handler(
      oauthCtx(['inbox/chatgpt/*']),
      {
        from: 'people/alice-example',
        to: 'inbox/chatgpt/page-2',
      },
    )).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });
});
