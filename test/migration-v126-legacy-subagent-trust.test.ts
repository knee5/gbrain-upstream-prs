import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { MinionQueue } from '../src/core/minions/queue.ts';
import { runMigrations } from '../src/core/migrate.ts';
import { resetPgliteState } from './helpers/reset-pglite.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  await resetPgliteState(engine);
  // resetPgliteState intentionally resets config rows, including the schema
  // version. The physical schema remains at head, so restore the version stamp
  // before MinionQueue's fail-closed schema check.
  await engine.setConfig('version', '126');
});

describe('migration v126 — queued cycle subagent trust compatibility', () => {
  test('marks only live non-OAuth legacy namespace jobs as trusted workspace', async () => {
    const queue = new MinionQueue(engine);
    const legacy = await queue.add(
      'subagent',
      { prompt: 'legacy cycle', allowed_slug_prefixes: ['wiki/personal/reflections/*'] },
      {},
      { allowProtectedSubmit: true },
    );
    const remoteOwned = await queue.add(
      'subagent',
      {
        prompt: 'remote agent',
        allowed_slug_prefixes: ['inbox/client/*'],
        __owner_client_id: 'oauth-client',
      },
      {},
      { allowProtectedSubmit: true },
    );
    const exactOnly = await queue.add(
      'subagent',
      { prompt: 'exact only', allowed_slug_prefixes: [] },
      {},
      { allowProtectedSubmit: true },
    );
    const terminal = await queue.add(
      'subagent',
      { prompt: 'already done', allowed_slug_prefixes: ['wiki/personal/reflections/*'] },
      {},
      { allowProtectedSubmit: true },
    );
    await engine.executeRaw(
      `UPDATE minion_jobs SET status = 'completed', finished_at = now() WHERE id = $1`,
      [terminal.id],
    );

    await engine.setConfig('version', '125');
    const result = await runMigrations(engine);
    expect(result.current).toBeGreaterThanOrEqual(126);

    const rows = await engine.executeRaw<{ id: number; data: Record<string, unknown> }>(
      `SELECT id, data FROM minion_jobs WHERE id = ANY($1::int[]) ORDER BY id`,
      [[legacy.id, remoteOwned.id, exactOnly.id, terminal.id]],
    );
    const dataById = new Map(rows.map(row => [Number(row.id), row.data]));

    expect(dataById.get(legacy.id)?.trusted_workspace).toBe(true);
    expect(dataById.get(remoteOwned.id)?.trusted_workspace).toBeUndefined();
    expect(dataById.get(exactOnly.id)?.trusted_workspace).toBeUndefined();
    expect(dataById.get(terminal.id)?.trusted_workspace).toBeUndefined();
  });
});
