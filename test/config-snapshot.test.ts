import { describe, expect, test } from 'bun:test';
import { ConfigSnapshot } from '../src/core/config-snapshot.ts';

describe('ConfigSnapshot', () => {
  test('one loadAll serves many get() calls inside the TTL', async () => {
    let loads = 0;
    const snap = new ConfigSnapshot(
      async () => {
        loads += 1;
        return [{ key: 'eval.capture', value: 'true' }];
      },
      5_000,
      () => 1_000,
    );
    expect(await snap.get('eval.capture')).toBe('true');
    expect(await snap.get('eval.capture')).toBe('true');
    expect(await snap.get('missing')).toBeNull();
    expect(loads).toBe(1);
  });

  test('invalidate drops the memo so the next get reloads', async () => {
    let loads = 0;
    const snap = new ConfigSnapshot(async () => {
      loads += 1;
      return [{ key: 'k', value: String(loads) }];
    });
    expect(await snap.get('k')).toBe('1');
    snap.invalidate();
    expect(await snap.get('k')).toBe('2');
    expect(loads).toBe(2);
  });

  test('TTL expiry reloads even without invalidate', async () => {
    let now = 0;
    let loads = 0;
    const snap = new ConfigSnapshot(
      async () => {
        loads += 1;
        return [{ key: 'k', value: String(loads) }];
      },
      5_000,
      () => now,
    );
    expect(await snap.get('k')).toBe('1');
    now = 4_999;
    expect(await snap.get('k')).toBe('1');
    now = 5_000;
    expect(await snap.get('k')).toBe('2');
    expect(loads).toBe(2);
  });

  test('invalidate during inflight prevents a stale table from landing', async () => {
    let resolveLoad!: (rows: Array<{ key: string; value: string }>) => void;
    let loads = 0;
    const snap = new ConfigSnapshot(async () => {
      loads += 1;
      if (loads === 1) {
        return new Promise(resolve => { resolveLoad = resolve; });
      }
      return [{ key: 'k', value: 'fresh' }];
    });
    const first = snap.get('k');
    snap.invalidate();
    resolveLoad([{ key: 'k', value: 'stale' }]);
    expect(await first).toBe('fresh');
    expect(loads).toBe(2);
  });

  test('keysWithPrefix uses the same snapshot', async () => {
    const snap = new ConfigSnapshot(async () => [
      { key: 'search.exclude_slug_prefixes', value: 'scratch/' },
      { key: 'search.mcp_keyword_only', value: 'false' },
      { key: 'eval.capture', value: 'true' },
    ]);
    expect(await snap.keysWithPrefix('search.')).toEqual([
      'search.exclude_slug_prefixes',
      'search.mcp_keyword_only',
    ]);
  });
});
