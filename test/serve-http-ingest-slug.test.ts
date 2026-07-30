import { describe, expect, test } from 'bun:test';
import { resolveOAuthIngestSlug } from '../src/commands/serve-http.ts';
import type { AuthInfo } from '../src/core/operations.ts';

const HASH = 'abcdef0123456789';
const NOW = new Date('2026-07-30T12:34:56Z');

function auth(overrides: Partial<AuthInfo> = {}): AuthInfo {
  return {
    token: 'test-token',
    clientId: 'gbrain_cl_test',
    clientName: 'test-client',
    scopes: ['read', 'write'],
    writeSlugPrefixes: ['inbox/test-client/*'],
    ...overrides,
  };
}

describe('resolveOAuthIngestSlug', () => {
  test('derives the default beneath a routine writer wildcard namespace', () => {
    expect(resolveOAuthIngestSlug(auth(), undefined, HASH, NOW)).toBe(
      'inbox/test-client/2026-07-30-abcdef',
    );
  });

  test('uses the first wildcard when a client has multiple grants', () => {
    expect(resolveOAuthIngestSlug(
      auth({ writeSlugPrefixes: ['exact/page', 'captures/client/*', 'inbox/test-client/*'] }),
      undefined,
      HASH,
      NOW,
    )).toBe('captures/client/2026-07-30-abcdef');
  });

  test('accepts an explicit slug inside the client namespace', () => {
    expect(resolveOAuthIngestSlug(
      auth(),
      'inbox/test-client/imports/article',
      HASH,
      NOW,
    )).toBe('inbox/test-client/imports/article');
  });

  test('rejects an explicit slug outside the client namespace', () => {
    expect(() => resolveOAuthIngestSlug(
      auth(),
      'inbox/another-client/article',
      HASH,
      NOW,
    )).toThrow(/outside this OAuth client's write namespace/);
  });

  test('fails closed when a routine writer has no loaded namespace', () => {
    expect(() => resolveOAuthIngestSlug(
      auth({ writeSlugPrefixes: undefined }),
      undefined,
      HASH,
      NOW,
    )).toThrow(/has no bound_slug_prefixes/);
  });

  test('requires X-Gbrain-Slug when every grant is exact-only', () => {
    expect(() => resolveOAuthIngestSlug(
      auth({ writeSlugPrefixes: ['inbox/test-client/fixed'] }),
      undefined,
      HASH,
      NOW,
    )).toThrow(/cannot derive a slug from an exact-only/);

    expect(resolveOAuthIngestSlug(
      auth({ writeSlugPrefixes: ['inbox/test-client/fixed'] }),
      'inbox/test-client/fixed',
      HASH,
      NOW,
    )).toBe('inbox/test-client/fixed');
  });

  test('rejects malformed caller-provided slugs before queue submission', () => {
    expect(() => resolveOAuthIngestSlug(
      auth(),
      'inbox/test-client/../escape',
      HASH,
      NOW,
    )).toThrow(/Invalid page_slug/);
  });

  test('admin keeps the legacy global-inbox default', () => {
    expect(resolveOAuthIngestSlug(
      auth({ scopes: ['read', 'write', 'admin'], writeSlugPrefixes: undefined }),
      undefined,
      HASH,
      NOW,
    )).toBe('inbox/2026-07-30-abcdef');
  });
});
