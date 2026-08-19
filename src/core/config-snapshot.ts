/**
 * Per-engine memo of `SELECT key, value FROM config`.
 *
 * `loadConfigWithEngine` reads ~30 keys sequentially via `getConfig`.
 * Hybrid search does that twice per call. A 5s snapshot turns those into
 * one round-trip plus Map lookups. `setConfig` / `unsetConfig` bump a
 * generation so an in-flight load cannot land a stale table.
 *
 * Per-engine, not process-global: tests and dual-engine processes must
 * not share rows.
 */

export const CONFIG_SNAPSHOT_TTL_MS = 5_000;

export interface ConfigRow {
  key: string;
  value: string;
}

export class ConfigSnapshot {
  private map: Map<string, string> | null = null;
  private loadedAt = 0;
  private gen = 0;
  private inflight: Promise<Map<string, string>> | null = null;

  constructor(
    private readonly loadAll: () => Promise<ConfigRow[]>,
    private readonly ttlMs: number = CONFIG_SNAPSHOT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.gen += 1;
    this.map = null;
    this.loadedAt = 0;
  }

  async get(key: string): Promise<string | null> {
    const snap = await this.ensure();
    return snap.get(key) ?? null;
  }

  async keysWithPrefix(prefix: string): Promise<string[]> {
    const snap = await this.ensure();
    return [...snap.keys()].filter(k => k.startsWith(prefix)).sort();
  }

  private async ensure(): Promise<Map<string, string>> {
    const now = this.now();
    if (this.map && now - this.loadedAt < this.ttlMs) return this.map;
    if (this.inflight) return this.inflight;
    const gen = this.gen;
    this.inflight = this.loadAll()
      .then((rows) => {
        const next = new Map<string, string>();
        for (const r of rows) next.set(r.key, r.value);
        this.inflight = null;
        if (gen !== this.gen) return this.ensure();
        this.map = next;
        this.loadedAt = this.now();
        return next;
      })
      .catch((err) => {
        this.inflight = null;
        throw err;
      });
    return this.inflight;
  }
}
