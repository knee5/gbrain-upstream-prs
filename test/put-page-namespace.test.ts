/**
 * Regression + namespace tests for put_page (v0.16.0 Lane 1D).
 *
 * The namespace rule confines subagent-originated writes to
 * `wiki/agents/<subagentId>/...`. This test pins:
 *  - regression: local CLI and standard MCP paths (ctx.viaSubagent != true)
 *    continue to accept ANY slug — the rule is opt-in by the dispatcher.
 *  - namespace: anchored prefix, slash boundary, wrong id, leading-slash fail,
 *    prefix-collision defeated, and fail-closed when subagentId is missing.
 */

import { describe, test, expect } from 'bun:test';
import { operations, OperationError } from '../src/core/operations.ts';
import type { OperationContext, Operation } from '../src/core/operations.ts';
import type { BrainEngine } from '../src/core/engine.ts';

const put_page = operations.find(o => o.name === 'put_page') as Operation;
if (!put_page) throw new Error('put_page op missing');
const add_tag = operations.find(o => o.name === 'add_tag') as Operation;
if (!add_tag) throw new Error('add_tag op missing');

function makeCtx(overrides: Partial<OperationContext> = {}): OperationContext {
  const engine = {} as BrainEngine; // dry_run short-circuits before touching the engine
  return {
    engine,
    config: { engine: 'postgres' } as any,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: true,
    remote: true,
    sourceId: 'default',
    ...overrides,
  };
}

describe('put_page namespace (v0.15 subagent rule)', () => {
  describe('regression: non-subagent callers unchanged', () => {
    test('local CLI write (viaSubagent undefined) accepts arbitrary slug', async () => {
      const ctx = makeCtx({ remote: false });
      const result = await put_page.handler(ctx, { slug: 'people/alice', content: 'stub' });
      expect(result).toMatchObject({ dry_run: true, action: 'put_page', slug: 'people/alice' });
    });

    test('stdio MCP write (remote=true, explicit stdio transport) accepts arbitrary slug', async () => {
      const ctx = makeCtx({ remote: true, transport: 'stdio' });
      const result = await put_page.handler(ctx, { slug: 'wiki/analysis/foo', content: 'stub' });
      expect(result).toMatchObject({ dry_run: true, action: 'put_page', slug: 'wiki/analysis/foo' });
    });

    test('stdio viaSubagent=false is the same as unset', async () => {
      const ctx = makeCtx({ remote: true, transport: 'stdio', viaSubagent: false, subagentId: 42 });
      const result = await put_page.handler(ctx, { slug: 'anything/goes', content: 'stub' });
      expect(result).toMatchObject({ dry_run: true });
    });

    test('FAILS CLOSED when a non-stdio remote transport drops ctx.auth', async () => {
      const ctx = makeCtx({ remote: true, transport: undefined, auth: undefined });
      await expect(put_page.handler(ctx, {
        slug: 'wiki/analysis/foo',
        content: 'stub',
      })).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });
  });

  describe('subagent namespace rule', () => {
    test('accepts wiki/agents/<subagentId>/ prefix', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const result = await put_page.handler(ctx, { slug: 'wiki/agents/42/notes', content: 'stub' });
      expect(result).toMatchObject({ dry_run: true, slug: 'wiki/agents/42/notes' });
    });

    test('accepts deep paths under the prefix', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const result = await put_page.handler(ctx, { slug: 'wiki/agents/42/runs/2026-04-20/summary', content: 'stub' });
      expect(result).toMatchObject({ dry_run: true });
    });

    test('rejects leading slash (slug grammar + anchor)', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const p = put_page.handler(ctx, { slug: '/wiki/agents/42/foo', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
    });

    test('rejects wrong subagentId', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const p = put_page.handler(ctx, { slug: 'wiki/agents/12/foo', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
    });

    test('rejects prefix-collision attempt (wiki/agents/12evil/* with subagentId=12)', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 12 });
      const p = put_page.handler(ctx, { slug: 'wiki/agents/12evil/foo', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
    });

    test('rejects bare prefix with no suffix (slug.length === prefix.length)', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const p = put_page.handler(ctx, { slug: 'wiki/agents/42/', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
    });

    test('FAIL-CLOSED: viaSubagent=true with undefined subagentId rejects any slug', async () => {
      const ctx = makeCtx({ viaSubagent: true });
      const p = put_page.handler(ctx, { slug: 'wiki/agents/42/foo', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
      await expect(p).rejects.toThrow(/subagentId/);
    });

    test('FAIL-CLOSED: viaSubagent=true with NaN subagentId rejects', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: Number.NaN });
      const p = put_page.handler(ctx, { slug: 'wiki/agents/NaN/foo', content: 'stub' });
      await expect(p).rejects.toBeInstanceOf(OperationError);
    });

    test('error code is permission_denied (not validation)', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      try {
        await put_page.handler(ctx, { slug: 'people/alice', content: 'stub' });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(OperationError);
        expect((e as OperationError).code).toBe('permission_denied');
      }
    });

    test('OAuth fence independently confines auth-less subagent write tools', async () => {
      const ctx = makeCtx({ viaSubagent: true, subagentId: 42 });
      const allowed = await add_tag.handler(ctx, {
        slug: 'wiki/agents/42/notes',
        tag: 'checkpoint',
      });
      expect(allowed).toMatchObject({ dry_run: true, action: 'add_tag' });

      await expect(add_tag.handler(ctx, {
        slug: 'people/alice',
        tag: 'checkpoint',
      })).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });

    test('OAuth fence rejects an auth-less subagent marker without an id', async () => {
      const ctx = makeCtx({ viaSubagent: true });
      await expect(add_tag.handler(ctx, {
        slug: 'wiki/agents/42/notes',
        tag: 'checkpoint',
      })).rejects.toMatchObject({
        code: 'permission_denied',
      });
    });
  });
});
