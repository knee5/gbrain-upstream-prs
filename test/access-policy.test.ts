import { describe, test, expect } from 'bun:test';
import { accessGrantFromScopes, isVisibleToAccessGrant } from '../src/core/access-filter.ts';
import { operations, type OperationContext } from '../src/core/operations.ts';
import type { BrainEngine } from '../src/core/engine.ts';

const STUB_LOGGER = { info() {}, warn() {}, error() {} };
const STUB_CONFIG = {} as OperationContext['config'];

function op(name: string) {
  const found = operations.find(o => o.name === name);
  if (!found) throw new Error(`missing op ${name}`);
  return found;
}

function makeSearchResult(slug: string) {
  return {
    slug,
    page_id: Math.floor(Math.random() * 10000),
    title: slug,
    type: slug.split('/')[0] as any,
    chunk_text: `unique access-policy fixture content for ${slug} with non-overlapping words ${slug.replace(/[^a-z0-9]/gi, '-')}`,
    chunk_source: 'compiled_truth',
    chunk_id: Math.floor(Math.random() * 10000),
    chunk_index: 0,
    score: 1,
    stale: false,
  };
}

function makePage(slug: string) {
  return {
    id: Math.floor(Math.random() * 10000),
    slug,
    type: slug.split('/')[0] as any,
    title: slug,
    compiled_truth: `${slug} body`,
    timeline: '',
    frontmatter: {},
    content_hash: 'hash',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function makeCtx(tagsBySlug: Record<string, string[]>, scopes: string[], overrides: Partial<BrainEngine> = {}): OperationContext {
  const pages = Object.keys(tagsBySlug).map(makePage);
  const engine = {
    getTags: async (slug: string) => tagsBySlug[slug] ?? [],
    getPage: async (slug: string) => pages.find(p => p.slug === slug) ?? null,
    resolveSlugs: async () => [],
    listPages: async () => pages,
    searchKeyword: async () => pages.map(p => makeSearchResult(p.slug)),
    getTimeline: async (slug: string) => [{ id: 1, page_id: 1, date: '2026-01-01', source: '', summary: `${slug} event`, detail: '', created_at: new Date() }],
    ...overrides,
  } as unknown as BrainEngine;
  return {
    engine,
    config: STUB_CONFIG,
    logger: STUB_LOGGER,
    dryRun: false,
    remote: true,
    auth: { token: 't', clientId: 'c', scopes },
  } as OperationContext;
}

describe('access-filter tier matrix', () => {
  test('remote callers with no tier scopes are None by default', () => {
    const grant = accessGrantFromScopes(['read']);
    expect(grant.tiers).toEqual(['none']);
    expect(isVisibleToAccessGrant(['domain:personal'], grant)).toBe(false);
  });

  test('family sees family/personal/dads-house-sale but not finance/work/health/identity', () => {
    const grant = accessGrantFromScopes(['read', 'tier:family']);
    expect(isVisibleToAccessGrant(['domain:family'], grant)).toBe(true);
    expect(isVisibleToAccessGrant(['domain:personal'], grant)).toBe(true);
    expect(isVisibleToAccessGrant(['scope:dads-house-sale'], grant)).toBe(true);
    expect(isVisibleToAccessGrant(['domain:finance'], grant)).toBe(false);
    expect(isVisibleToAccessGrant(['domain:work'], grant)).toBe(false);
    expect(isVisibleToAccessGrant(['domain:health'], grant)).toBe(false);
    expect(isVisibleToAccessGrant(['domain:identity'], grant)).toBe(false);
  });

  test('work-scoped overlay sees only matching token scopes', () => {
    const grant = accessGrantFromScopes(['tier:work_scoped', 'scope:jaci-bela']);
    expect(isVisibleToAccessGrant(['scope:jaci-bela'], grant)).toBe(true);
    expect(isVisibleToAccessGrant(['scope:landscaping-saas'], grant)).toBe(false);
  });

  test('public is visible to None; untagged defaults deny except full', () => {
    expect(isVisibleToAccessGrant(['sensitivity:public'], accessGrantFromScopes([]))).toBe(true);
    expect(isVisibleToAccessGrant([], accessGrantFromScopes(['tier:family']))).toBe(false);
    expect(isVisibleToAccessGrant([], accessGrantFromScopes(['tier:full']))).toBe(true);
  });
});

describe('operations read-path access policy', () => {
  const tags = {
    'personal/day': ['domain:personal'],
    'family/event': ['domain:family'],
    'finance/portfolio': ['domain:finance'],
    'projects/jaci-bela/brief': ['scope:jaci-bela'],
    'projects/landscaping-saas/brief': ['scope:landscaping-saas'],
    'untagged/page': [],
  };

  test('search filters result rows by caller tier/scope', async () => {
    const result = await op('search').handler(makeCtx(tags, ['read', 'tier:family']), { query: 'brief' }) as Array<{ slug: string }>;
    expect(result.map(r => r.slug).sort()).toEqual(['family/event', 'personal/day']);
  });

  test('internal subagent read calls retain full owner-scoped access', async () => {
    const result = await op('search').handler({ ...makeCtx(tags, ['read']), viaSubagent: true }, { query: 'brief' }) as Array<{ slug: string }>;
    expect(result.map(r => r.slug).sort()).toEqual(Object.keys(tags).sort());
  });

  test('get_page returns not found for unauthorized pages instead of leaking existence', async () => {
    await expect(op('get_page').handler(makeCtx(tags, ['read', 'tier:family']), { slug: 'finance/portfolio' }))
      .rejects.toMatchObject({ code: 'page_not_found' });
  });

  test('list_pages filters by access policy', async () => {
    const result = await op('list_pages').handler(makeCtx(tags, ['read', 'tier:work_scoped', 'scope:jaci-bela']), {}) as Array<{ slug: string }>;
    expect(result.map(r => r.slug)).toEqual(['projects/jaci-bela/brief']);
  });

  test('get_timeline checks page visibility before returning entries', async () => {
    await expect(op('get_timeline').handler(makeCtx(tags, ['read', 'tier:family']), { slug: 'projects/jaci-bela/brief' }))
      .rejects.toMatchObject({ code: 'page_not_found' });
    const allowed = await op('get_timeline').handler(makeCtx(tags, ['read', 'tier:work_scoped', 'scope:jaci-bela']), { slug: 'projects/jaci-bela/brief' }) as Array<{ summary: string }>;
    expect(allowed[0].summary).toContain('jaci-bela');
  });
});
