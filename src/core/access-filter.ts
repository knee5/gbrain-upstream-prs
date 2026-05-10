/**
 * Tier/scope read filtering for brain pages.
 *
 * This is intentionally an operation-layer guard: the current BrainEngine
 * contract returns page/search/list rows without tag metadata, so SQL-level
 * filtering would require a broader engine interface migration. The guard is
 * fail-closed for remote callers without explicit tier scopes.
 */

export type AccessTier = 'full' | 'family' | 'work' | 'work_scoped' | 'none';

export interface AccessGrant {
  tiers: AccessTier[];
  scopes: string[]; // normalized scope slugs, e.g. "jaci-bela"
}

export const NONE_GRANT: AccessGrant = Object.freeze({ tiers: ['none' as AccessTier], scopes: [] as string[] });
export const FULL_GRANT: AccessGrant = Object.freeze({ tiers: ['full' as AccessTier], scopes: [] as string[] });

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeTier(raw: string): AccessTier | null {
  const s = raw.trim().toLowerCase().replace(/^tier:/, '').replace(/-/g, '_');
  if (s === 'full' || s === 'family' || s === 'work' || s === 'work_scoped' || s === 'none') return s;
  return null;
}

function normalizeScope(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s.startsWith('scope:')) return null;
  const scope = s.slice('scope:'.length);
  return scope ? scope : null;
}

/**
 * Resolve an operation caller's tier grants from OAuth/API-key scopes.
 * Accepted forms: `tier:family`, `tier:work_scoped`, `tier:work-scoped`,
 * plus overlay scopes such as `scope:jaci-bela`.
 */
export function accessGrantFromScopes(scopes: readonly string[] | undefined): AccessGrant {
  if (!scopes || scopes.length === 0) return NONE_GRANT;

  const tiers = uniq(scopes.map(normalizeTier).filter((t): t is AccessTier => Boolean(t)));
  const overlayScopes = uniq(scopes.map(normalizeScope).filter((s): s is string => Boolean(s)));

  if (tiers.includes('full')) return { tiers: ['full'], scopes: overlayScopes };
  if (tiers.includes('none') && tiers.length === 1) return { tiers: ['none'], scopes: overlayScopes };
  const effective = tiers.filter(t => t !== 'none');
  return effective.length > 0 ? { tiers: effective, scopes: overlayScopes } : { tiers: ['none'], scopes: overlayScopes };
}

function has(tags: Set<string>, tag: string): boolean {
  return tags.has(tag);
}

function tagValues(tags: Set<string>, prefix: string): string[] {
  const out: string[] = [];
  for (const t of tags) {
    if (t.startsWith(prefix)) out.push(t.slice(prefix.length));
  }
  return out;
}

function visibleToFamily(tags: Set<string>): boolean {
  if (has(tags, 'domain:family') || has(tags, 'domain:personal')) return true;
  if (has(tags, 'scope:dads-house-sale')) return true;
  return false;
}

function visibleToWork(tags: Set<string>): boolean {
  return has(tags, 'domain:work') || has(tags, 'domain:tech');
}

function visibleToWorkScoped(tags: Set<string>, grant: AccessGrant): boolean {
  if (grant.scopes.length === 0) return false;
  const pageScopes = tagValues(tags, 'scope:');
  return pageScopes.some(s => grant.scopes.includes(s));
}

/**
 * Decide whether a page with the given tags is visible to the grant.
 * Untagged pages default-deny for every tier except full.
 */
export function isVisibleToAccessGrant(tags: readonly string[] | undefined, grant: AccessGrant): boolean {
  const set = new Set((tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean));

  if (grant.tiers.includes('full')) return true;
  if (has(set, 'sensitivity:public')) return true;
  if (set.size === 0) return false;
  if (has(set, 'sensitivity:owner-only')) return false;
  if (grant.tiers.includes('none')) return false;

  for (const tier of grant.tiers) {
    if (tier === 'family' && visibleToFamily(set)) return true;
    if (tier === 'work' && visibleToWork(set)) return true;
    if (tier === 'work_scoped' && visibleToWorkScoped(set, grant)) return true;
  }
  return false;
}

export async function filterByAccessGrant<T extends { slug: string }>(
  rows: readonly T[],
  grant: AccessGrant,
  getTags: (slug: string) => Promise<readonly string[]>,
): Promise<T[]> {
  if (grant.tiers.includes('full')) return [...rows];
  const out: T[] = [];
  for (const row of rows) {
    if (isVisibleToAccessGrant(await getTags(row.slug), grant)) out.push(row);
  }
  return out;
}
