/**
 * Stdio MCP identity regression.
 *
 * The installed pre-fix server could execute read/write tools but `whoami`
 * returned unknown_transport because its stdio entrypoint did not preserve a
 * transport marker in OperationContext. Pin the actual server-side dispatch
 * options, not only the whoami handler in isolation.
 */

import { describe, expect, test } from 'bun:test';
import { operations } from '../src/core/operations.ts';
import { buildOperationContext } from '../src/mcp/dispatch.ts';
import { buildStdioDispatchOpts } from '../src/mcp/server.ts';

const whoami = operations.find(op => op.name === 'whoami')!;

describe('stdio MCP identity context', () => {
  test('entrypoint marks stdio while remaining remote/untrusted', async () => {
    const opts = buildStdioDispatchOpts('default', ['default', 'shared']);
    const ctx = buildOperationContext({} as any, {}, opts);

    expect(ctx.remote).toBe(true);
    expect(ctx.transport).toBe('stdio');
    expect(ctx.auth).toBeUndefined();
    expect(ctx.sourceId).toBe('default');
    expect(ctx.localFederatedSourceIds).toEqual(['default', 'shared']);

    const result = await whoami.handler(ctx, {}) as {
      transport: string;
      scopes: string[];
    };
    expect(result).toEqual({ transport: 'stdio', scopes: [] });
  });

  test('stdio options do not grant OAuth scopes or local trust', () => {
    const opts = buildStdioDispatchOpts('notes');
    expect(opts).toMatchObject({
      remote: true,
      transport: 'stdio',
      sourceId: 'notes',
      takesHoldersAllowList: ['world'],
    });
    expect(opts.auth).toBeUndefined();
  });
});
