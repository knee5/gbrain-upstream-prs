/**
 * put_page write-through tests (v0.38).
 *
 * Verifies that put_page writes the markdown file to disk alongside the
 * DB row when sync.repo_path is configured. Trust gating: all remote
 * writes stay DB-only with skipped=remote; trusted local CLI writes retain
 * the atomic mirror; dry-run and missing-repo paths stay DB-only.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PGLiteEngine } from '../../src/core/pglite-engine.ts';
import { resetPgliteState } from '../helpers/reset-pglite.ts';
import { withEnv } from '../helpers/with-env.ts';
import { operations } from '../../src/core/operations.ts';
import type { OperationContext } from '../../src/core/operations.ts';
import { resetGateway } from '../../src/core/ai/gateway.ts';

let engine: PGLiteEngine;
let tmpRoot: string;
let brainDir: string;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
  // Don't leak the reset-state to sibling files in the same bun shard
  // (the v0.40.4.1 gateway state-leak class). beforeEach already reset
  // for our own tests; this is defense for the next file's siblings.
  resetGateway();
});

beforeEach(async () => {
  await resetPgliteState(engine);
  // CI fix: put_page's handler at src/core/operations.ts:622 computes
  // `noEmbed = !isAvailable('embedding')`. When the gateway has been
  // configured by a sibling test (or by the cli.ts module-load path
  // reading .env.testing) with a fake/stale ZEROENTROPY_API_KEY,
  // isAvailable returns true → put_page tries to embed → the real
  // ZeroEntropy API returns 401 in CI. This test exercises write-through
  // behavior, not embedding. Reset the gateway so isAvailable returns
  // false → noEmbed=true → no network call.
  resetGateway();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gbrain-wt-'));
  brainDir = path.join(tmpRoot, 'brain');
  fs.mkdirSync(brainDir, { recursive: true });
  // Wire sync.repo_path so write-through can find the repo.
  await engine.setConfig('sync.repo_path', brainDir);
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const captureLogger = () => {
  const messages: Array<{ level: string; msg: string }> = [];
  return {
    logger: {
      info: (msg: string) => messages.push({ level: 'info', msg }),
      warn: (msg: string) => messages.push({ level: 'warn', msg }),
      error: (msg: string) => messages.push({ level: 'error', msg }),
    },
    messages,
  };
};

function makeCtx(overrides: Partial<OperationContext> = {}): OperationContext {
  const { logger } = captureLogger();
  return {
    engine,
    config: { engine: 'pglite' as const },
    logger,
    dryRun: false,
    remote: false,
    sourceId: 'default',
    ...overrides,
  };
}

const putPage = operations.find((o) => o.name === 'put_page')!;

describe('put_page write-through — happy path', () => {
  test('writes the markdown file to disk at brainDir/<slug>.md', async () => {
    const ctx = makeCtx();
    const content = '---\ntitle: Test\n---\n\n# WT body';
    const result = (await putPage.handler(ctx, { slug: 'inbox/test-wt-1', content })) as {
      slug: string;
      write_through?: { written: boolean; path?: string };
    };
    expect(result.write_through?.written).toBe(true);
    const expectedPath = path.join(brainDir, 'inbox/test-wt-1.md');
    expect(result.write_through?.path).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
    const onDisk = fs.readFileSync(expectedPath, 'utf8');
    expect(onDisk).toContain('WT body');
  });

  test('mirrors the DB row provenance instead of replacing trusted-local values', async () => {
    const ctx = makeCtx({ remote: false });
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/provenance',
      content: '---\ntitle: P\n---\n\nbody',
      source_kind: 'capture-cli',
      source_uri: 'file:///tmp/example-note.md',
      ingested_via: 'capture-cli',
    })) as { write_through?: { written: boolean; path?: string } };
    expect(result.write_through?.written).toBe(true);
    const onDisk = fs.readFileSync(result.write_through!.path!, 'utf8');
    expect(onDisk).toMatch(/source_kind:\s*capture-cli/);
    expect(onDisk).toMatch(/ingested_via:\s*capture-cli/);
    expect(onDisk).toContain('file:///tmp/example-note.md');
    expect(onDisk).toMatch(/ingested_at:/);
    const page = await engine.getPage('inbox/provenance');
    expect(page?.source_kind).toBe('capture-cli');
    expect(page?.ingested_via).toBe('capture-cli');
    expect(page?.source_uri).toBe('file:///tmp/example-note.md');
  });

  test('OAuth/remote callers stay DB-only: no fact side writes or filesystem write-through', async () => {
    const ctx = makeCtx({
      remote: true,
      auth: {
        token: 'test-token',
        clientId: 'remote-write-client',
        scopes: ['read', 'write'],
        sourceId: 'default',
        writeSlugPrefixes: ['inbox/mcp-prov/*'],
      },
    });
    const factsBefore = await engine.executeRaw<{ n: number }>('SELECT COUNT(*) AS n FROM facts');
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/mcp-prov/page',
      content: `---\ntitle: Q\n---\n\n${'This substantive remote page names people/arbitrary-target and contains facts. '.repeat(12)}`,
    })) as {
      facts_backstop?: { queued?: boolean; skipped?: string };
      write_through?: { written: boolean; path?: string; skipped?: string };
    };
    expect(result.facts_backstop).toEqual({ skipped: 'remote' });
    expect(result.write_through).toEqual({ written: false, skipped: 'remote' });
    expect(fs.existsSync(path.join(brainDir, 'inbox/mcp-prov/page.md'))).toBe(false);

    const factsAfter = await engine.executeRaw<{ n: number }>('SELECT COUNT(*) AS n FROM facts');
    expect(Number(factsAfter[0]?.n ?? 0)).toBe(Number(factsBefore[0]?.n ?? 0));

    const page = await engine.getPage('inbox/mcp-prov/page');
    expect(page).not.toBeNull();
    expect(page?.source_kind).toBe('mcp:put_page');
    expect(page?.ingested_via).toBe('mcp:put_page');
  });

  test('OAuth lint stays source-scoped and DB-only when lint_on_put_page is enabled', async () => {
    await engine.executeRaw(
      "INSERT INTO sources (id, name) VALUES ('remote-lint-source', 'remote-lint-source')",
    );
    await engine.setConfig('writer.lint_on_put_page', 'true');
    // A same-slug default page is grandfathered. If post-write lint drops the
    // OAuth source scope, it will inspect this row and report "skipped"
    // instead of validating the newly written non-default page.
    await engine.putPage('remote-lint/page', {
      type: 'person',
      title: 'Default',
      compiled_truth: 'Default source control row.',
      frontmatter: { validate: false },
    });

    const result = await withEnv({ GBRAIN_HOME: tmpRoot }, async () => (
      await putPage.handler(makeCtx({
        remote: true,
        sourceId: 'remote-lint-source',
        auth: {
          token: 'test-token',
          clientId: 'remote-lint-client',
          scopes: ['read', 'write'],
          sourceId: 'remote-lint-source',
          writeSlugPrefixes: ['remote-lint/*'],
        },
      }), {
        slug: 'remote-lint/page',
        content: '---\ntitle: Remote lint\n---\n\nRemote raised $5M in Series A from Sequoia without citation.',
      })
    )) as {
      writer_lint?: { error_count?: number; warning_count?: number; skipped?: string };
      write_through?: { written: boolean; skipped?: string };
    };

    expect(result.writer_lint?.skipped).toBeUndefined();
    expect((result.writer_lint?.error_count ?? 0) + (result.writer_lint?.warning_count ?? 0))
      .toBeGreaterThan(0);
    expect(result.write_through).toEqual({ written: false, skipped: 'remote' });
    expect(fs.existsSync(path.join(tmpRoot, '.gbrain', 'validator-lint.jsonl'))).toBe(false);

    const audits = await engine.executeRaw<{ source_id: string }>(
      `SELECT source_id
       FROM ingest_log
       WHERE source_type = 'writer_lint' AND source_ref = 'remote-lint/page'`,
    );
    expect(audits).toEqual([{ source_id: 'remote-lint-source' }]);
    expect(await engine.getPage('remote-lint/page', { sourceId: 'remote-lint-source' })).not.toBeNull();
  });
});

describe('put_page write-through — trust gating', () => {
  test('remote subagent sandbox write stays DB-only with the remote reason', async () => {
    const ctx = makeCtx({
      remote: true,
      viaSubagent: true,
      subagentId: 42,
      // No allowedSlugPrefixes — sandbox writes only.
    });
    const result = (await putPage.handler(ctx, {
      slug: 'wiki/agents/42/scratch',
      content: '---\ntitle: S\n---\n\nbody',
    })) as { write_through?: { written: boolean; skipped?: string } };
    expect(result.write_through?.written).toBe(false);
    expect(result.write_through?.skipped).toBe('remote');
    expect(fs.existsSync(path.join(brainDir, 'wiki/agents/42/scratch.md'))).toBe(false);
    expect(await engine.getPage('wiki/agents/42/scratch')).not.toBeNull();
  });

  test('local slug-bounded subagent remains sandboxed without protected-cycle provenance', async () => {
    const ctx = makeCtx({
      remote: false,
      viaSubagent: true,
      subagentId: 6,
      allowedSlugPrefixes: ['wiki/personal/reflections/*'],
    });
    const result = (await putPage.handler(ctx, {
      slug: 'wiki/personal/reflections/local-sandbox',
      content: '---\ntitle: Local sandbox\n---\n\nreflection',
    })) as { write_through?: { written: boolean; skipped?: string } };

    expect(result.write_through).toEqual({ written: false, skipped: 'subagent_sandbox' });
    expect(fs.existsSync(path.join(brainDir, 'wiki/personal/reflections/local-sandbox.md'))).toBe(false);
    expect(await engine.getPage('wiki/personal/reflections/local-sandbox')).not.toBeNull();
  });

  test('slug-bounded remote subagent remains untrusted for secondary writes', async () => {
    const ctx = makeCtx({
      remote: true,
      viaSubagent: true,
      subagentId: 7,
      allowedSlugPrefixes: ['wiki/personal/reflections/*'],
    });
    const result = (await putPage.handler(ctx, {
      slug: 'wiki/personal/reflections/note',
      content: '---\ntitle: R\n---\n\nreflection',
    })) as {
      auto_links?: { skipped?: string };
      auto_timeline?: { skipped?: string };
      facts_backstop?: { skipped?: string };
      chronicle_backstop?: { skipped?: string };
      write_through?: { written: boolean; path?: string; skipped?: string };
    };
    expect(result.write_through).toEqual({ written: false, skipped: 'remote' });
    expect(result.auto_links).toEqual({ skipped: 'remote' });
    expect(result.auto_timeline).toEqual({ skipped: 'remote' });
    expect(result.facts_backstop).toEqual({ skipped: 'remote' });
    expect(result.chronicle_backstop).toEqual({ skipped: 'remote' });
    expect(fs.existsSync(path.join(brainDir, 'wiki/personal/reflections/note.md'))).toBe(false);
    expect(await engine.getPage('wiki/personal/reflections/note')).not.toBeNull();
  });

  test('protected-cycle provenance, not slug scope, enables trusted secondary processing', async () => {
    const ctx = makeCtx({
      remote: true,
      viaSubagent: true,
      subagentId: 8,
      allowedSlugPrefixes: ['wiki/personal/reflections/*'],
      trustedWorkspace: true,
    });
    const result = (await putPage.handler(ctx, {
      slug: 'wiki/personal/reflections/protected-cycle-note',
      content: '---\ntitle: Protected cycle\n---\n\nreflection',
    })) as {
      auto_links?: { skipped?: string };
      auto_timeline?: { skipped?: string };
      facts_backstop?: { skipped?: string };
      chronicle_backstop?: { skipped?: string };
    };

    expect(result.auto_links?.skipped).not.toBe('remote');
    expect(result.auto_timeline?.skipped).not.toBe('remote');
    expect(result.facts_backstop?.skipped).not.toBe('remote');
    expect(result.chronicle_backstop?.skipped).not.toBe('remote');
  });

  test('missing transport identity fails closed before DB or filesystem writes', async () => {
    const ctx = makeCtx({ remote: undefined as any });
    await expect(putPage.handler(ctx, {
      slug: 'inbox/fail-closed-remote',
      content: '---\ntitle: U\n---\n\nbody',
    })).rejects.toMatchObject({
      code: 'permission_denied',
    });
    expect(fs.existsSync(path.join(brainDir, 'inbox/fail-closed-remote.md'))).toBe(false);
    expect(await engine.getPage('inbox/fail-closed-remote')).toBeNull();
  });

  test('dry-run stays DB-only (early-return before importFromContent)', async () => {
    const ctx = makeCtx({ dryRun: true });
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/dryrun',
      content: '---\ntitle: D\n---\n\nbody',
    })) as { dry_run?: boolean; write_through?: { skipped?: string } };
    // put_page's existing handler short-circuits on dry-run BEFORE
    // importFromContent, so write_through never fires. The legacy dry_run
    // contract is what callers see.
    expect(result.dry_run).toBe(true);
    expect(fs.existsSync(path.join(brainDir, 'inbox/dryrun.md'))).toBe(false);
  });
});

describe('put_page write-through — config edge cases', () => {
  test('repo not configured → skipped no_repo_configured', async () => {
    // No deleteConfig helper; remove via raw SQL.
    await engine.executeRaw("DELETE FROM config WHERE key = 'sync.repo_path'");
    const ctx = makeCtx();
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/no-repo',
      content: '---\ntitle: N\n---\n\nbody',
    })) as { write_through?: { skipped?: string } };
    expect(result.write_through?.skipped).toBe('no_repo_configured');
  });

  test('repo path points at a missing directory → skipped repo_not_found', async () => {
    await engine.setConfig('sync.repo_path', path.join(tmpRoot, 'does-not-exist'));
    const ctx = makeCtx();
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/missing-repo',
      content: '---\ntitle: M\n---\n\nbody',
    })) as { write_through?: { skipped?: string } };
    expect(result.write_through?.skipped).toBe('repo_not_found');
  });
});

describe('put_page write-through — multi-source filing', () => {
  test('non-default source lands at brainDir/.sources/<id>/<slug>.md', async () => {
    // Create a non-default source row first. Schema fields: id (PK),
    // name (UNIQUE), plus the v0.26.5 archive columns with defaults.
    await engine.executeRaw(
      "INSERT INTO sources (id, name) VALUES ('team-x', 'team-x')",
    );
    const ctx = makeCtx({ sourceId: 'team-x' });
    const result = (await putPage.handler(ctx, {
      slug: 'shared/page',
      content: '---\ntitle: X\n---\n\nbody',
    })) as { write_through?: { written: boolean; path?: string } };
    expect(result.write_through?.written).toBe(true);
    expect(result.write_through?.path).toBe(path.join(brainDir, '.sources/team-x/shared/page.md'));
    expect(fs.existsSync(result.write_through!.path!)).toBe(true);
  });
});

describe('put_page write-through — failure isolation', () => {
  test('disk-write failure does not roll back DB', async () => {
    // Point the config at a path that exists but isn't writable so the
    // write fails. Best portable trick: a regular file (writeFileSync to
    // a path inside a regular file fails with ENOTDIR).
    const blockFile = path.join(tmpRoot, 'block');
    fs.writeFileSync(blockFile, 'i am a file, not a dir');
    await engine.setConfig('sync.repo_path', blockFile);

    const ctx = makeCtx();
    const result = (await putPage.handler(ctx, {
      slug: 'inbox/fail-isolated',
      content: '---\ntitle: F\n---\n\nbody',
    })) as { write_through?: { skipped?: string; error?: string } };
    // Either skipped (existsSync sees a file, not a dir) or error during write.
    expect(
      result.write_through?.skipped === 'repo_not_found' ||
        typeof result.write_through?.error === 'string',
    ).toBe(true);

    // DB write succeeded.
    const page = await engine.getPage('inbox/fail-isolated');
    expect(page).not.toBeNull();
  });
});
