import { describe, test, expect } from 'bun:test';
import { accessGrantFromScopes, isVisibleToAccessGrant } from '../src/core/access-filter.ts';
import { operations, type OperationContext } from '../src/core/operations.ts';
import { assertAllowedScopes, hasScope, oauthGrantAllowsScope } from '../src/core/scope.ts';
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
    getLinks: async (slug: string) => Object.keys(tagsBySlug).filter(s => s !== slug).map(to_slug => ({ from_slug: slug, to_slug, link_type: 'rel', context: '' })),
    getBacklinks: async (slug: string) => Object.keys(tagsBySlug).filter(s => s !== slug).map(from_slug => ({ from_slug, to_slug: slug, link_type: 'rel', context: '' })),
    traverseGraph: async (slug: string) => pages.map((p, i) => ({ slug: p.slug, title: p.title, type: p.type, depth: p.slug === slug ? 0 : i + 1, links: Object.keys(tagsBySlug).filter(s => s !== p.slug).map(to_slug => ({ to_slug, link_type: 'rel' })) })),
    traversePaths: async (slug: string) => Object.keys(tagsBySlug).filter(s => s !== slug).map(to_slug => ({ from_slug: slug, to_slug, link_type: 'rel', context: '', depth: 1 })),
    getVersions: async (slug: string) => [{ id: 1, page_id: 1, compiled_truth: `${slug} old`, frontmatter: {}, snapshot_at: new Date() }],
    getRawData: async (slug: string) => [{ source: 'fixture', data: { slug }, fetched_at: new Date() }],
    getChunks: async (slug: string) => [{ id: 1, page_id: 1, chunk_index: 0, chunk_text: `${slug} chunk`, chunk_source: 'compiled_truth', embedding: null, model: 'test', token_count: null, embedded_at: null }],
    getRecentSalience: async () => pages.map((p, i) => ({ slug: p.slug, source_id: 'host', title: p.title, type: p.type, updated_at: new Date(), emotional_weight: 0, take_count: 0, take_avg_weight: 0, score: 10 - i })),
    findAnomalies: async () => [{ cohort_kind: 'tag', cohort_value: 'mixed', count: Object.keys(tagsBySlug).length, baseline_mean: 0, baseline_stddev: 0, sigma_observed: 5, page_slugs: Object.keys(tagsBySlug) }],
    getIngestLog: async () => [{ id: 1, source_type: 'test', source_ref: 'private/source', pages_updated: Object.keys(tagsBySlug), summary: 'may contain private slugs', created_at: new Date() }],
    listTakes: async () => Object.keys(tagsBySlug).map((slug, i) => ({ id: i + 1, page_id: i + 1, page_slug: slug, row_num: i + 1, claim: `${slug} claim`, kind: 'take', holder: 'brain', weight: 0.5, source: null, active: true, created_at: new Date(), updated_at: new Date() })),
    searchTakes: async () => Object.keys(tagsBySlug).map((slug, i) => ({ take_id: i + 1, page_id: i + 1, page_slug: slug, row_num: i + 1, claim: `${slug} claim`, kind: 'take', holder: 'brain', weight: 0.5, score: 1 })),
    getScorecard: async () => ({ total: 1, correct: 1, incorrect: 0, partial: 0, unresolved: 0, accuracy: 1, brier: 0, by_holder: [] }),
    getCalibrationCurve: async () => [{ bucket: '0.5', predicted_midpoint: 0.5, total: 1, correct: 1, observed_accuracy: 1, avg_weight: 0.5 }],
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

describe('OAuth access-policy scope validation', () => {
  test('tier and overlay scopes are valid OAuth scopes but do not satisfy operation capability scopes', () => {
    expect(() => assertAllowedScopes(['read', 'tier:full', 'tier:family', 'tier:work', 'tier:work_scoped', 'tier:none', 'scope:jaci-bela'])).not.toThrow();
    expect(() => assertAllowedScopes(['scope:', 'tier:finance'])).toThrow(/Unknown scope/);
    expect(hasScope(['tier:full'], 'read')).toBe(false);
    expect(oauthGrantAllowsScope(['read', 'tier:family', 'scope:jaci-bela'], 'tier:family')).toBe(true);
    expect(oauthGrantAllowsScope(['read', 'tier:family'], 'tier:full')).toBe(false);
    expect(oauthGrantAllowsScope(['admin'], 'sources_admin')).toBe(true);
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

  test('single-slug read surfaces deny unauthorized slug before returning data', async () => {
    const ctx = makeCtx(tags, ['read', 'tier:family']);
    for (const name of ['get_tags', 'get_versions', 'get_raw_data', 'get_chunks']) {
      await expect(op(name).handler(ctx, { slug: 'finance/portfolio' }))
        .rejects.toMatchObject({ code: 'page_not_found' });
    }
  });

  test('graph link surfaces require readable anchor and filter unreadable endpoints', async () => {
    const ctx = makeCtx(tags, ['read', 'tier:work_scoped', 'scope:jaci-bela']);
    await expect(op('get_links').handler(ctx, { slug: 'finance/portfolio' }))
      .rejects.toMatchObject({ code: 'page_not_found' });

    const links = await op('get_links').handler(ctx, { slug: 'projects/jaci-bela/brief' }) as Array<{ to_slug: string }>;
    expect(links.map(l => l.to_slug)).toEqual([]);

    const backlinks = await op('get_backlinks').handler(ctx, { slug: 'projects/jaci-bela/brief' }) as Array<{ from_slug: string }>;
    expect(backlinks.map(l => l.from_slug)).toEqual([]);

    const graph = await op('traverse_graph').handler(ctx, { slug: 'projects/jaci-bela/brief' }) as Array<{ slug: string; links: Array<{ to_slug: string }> }>;
    expect(graph.map(n => n.slug)).toEqual(['projects/jaci-bela/brief']);
    expect(graph[0].links).toEqual([]);

    const paths = await op('traverse_graph').handler(ctx, { slug: 'projects/jaci-bela/brief', direction: 'out' }) as Array<{ to_slug: string }>;
    expect(paths).toEqual([]);
  });

  test('resolve_slugs, salience, and anomalies filter hidden slugs', async () => {
    const ctx = makeCtx(tags, ['read', 'tier:family'], {
      resolveSlugs: async () => ['personal/day', 'finance/portfolio', 'family/event'],
    });

    const resolved = await op('resolve_slugs').handler(ctx, { partial: 'x' }) as string[];
    expect(resolved).toEqual(['personal/day', 'family/event']);

    const salience = await op('get_recent_salience').handler(ctx, {}) as Array<{ slug: string }>;
    expect(salience.map(r => r.slug).sort()).toEqual(['family/event', 'personal/day']);

    const anomalies = await op('find_anomalies').handler(ctx, {}) as Array<{ page_slugs: string[]; count: number }>;
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].page_slugs.sort()).toEqual(['family/event', 'personal/day']);
    expect(anomalies[0].count).toBe(2);
  });

  test('takes read surfaces filter page slugs or deny aggregate leaks', async () => {
    const familyCtx = makeCtx(tags, ['read', 'tier:family']);
    const listed = await op('takes_list').handler(familyCtx, {}) as Array<{ page_slug: string }>;
    expect(listed.map(r => r.page_slug).sort()).toEqual(['family/event', 'personal/day']);
    await expect(op('takes_list').handler(familyCtx, { page_slug: 'finance/portfolio' }))
      .rejects.toMatchObject({ code: 'page_not_found' });

    const searched = await op('takes_search').handler(familyCtx, { query: 'claim' }) as Array<{ page_slug: string }>;
    expect(searched.map(r => r.page_slug).sort()).toEqual(['family/event', 'personal/day']);

    for (const name of ['takes_scorecard', 'takes_calibration']) {
      await expect(op(name).handler(familyCtx, {}))
        .rejects.toMatchObject({ code: 'permission_denied' });
    }
  });

  test('unstructured source/ingest read surfaces are explicitly full-only', async () => {
    for (const name of ['get_ingest_log', 'sources_list', 'sources_status']) {
      await expect(op(name).handler(makeCtx(tags, ['read', 'tier:family']), { id: 'private-source' }))
        .rejects.toMatchObject({ code: 'permission_denied' });
    }
    const full = await op('get_ingest_log').handler(makeCtx(tags, ['read', 'tier:full']), {}) as Array<{ source_ref: string }>;
    expect(full[0].source_ref).toBe('private/source');
  });
});
