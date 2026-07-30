/**
 * v0.31 Phase 6 — MCP scope correctness on facts ops.
 *
 * Pins:
 *   - extract_facts → admin scope (its model-selected entity slugs cannot yet
 *     be namespace-fenced at the request boundary)
 *   - recall → read scope
 *   - forget_fact → admin + localOnly (its durable path rewrites a local
 *     Markdown mirror)
 *   - All three present in operations[]
 *   - param shapes match the documented contract
 *
 * Serial test (mutates module-scoped engine state via dispatchToolCall +
 * subsequent reads).
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { operations } from '../src/core/operations.ts';
import { dispatchToolCall } from '../src/mcp/dispatch.ts';

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

describe('facts MCP ops registration + scope', () => {
  test('extract_facts is registered with admin scope', () => {
    const op = operations.find(o => o.name === 'extract_facts');
    expect(op).toBeDefined();
    expect(op!.scope).toBe('admin');
    expect(op!.mutating).toBe(true);
    expect(op!.params.turn_text?.required).toBe(true);
    expect(op!.params.session_id).toBeDefined();
  });

  test('recall is registered with read scope', () => {
    const op = operations.find(o => o.name === 'recall');
    expect(op).toBeDefined();
    expect(op!.scope).toBe('read');
    // recall should not be mutating.
    expect(op!.mutating).toBeFalsy();
    expect(op!.params.entity).toBeDefined();
    expect(op!.params.since).toBeDefined();
    expect(op!.params.session_id).toBeDefined();
  });

  test('forget_fact is registered as local admin-only', () => {
    const op = operations.find(o => o.name === 'forget_fact');
    expect(op).toBeDefined();
    expect(op!.scope).toBe('admin');
    expect(op!.localOnly).toBe(true);
    expect(op!.mutating).toBe(true);
    expect(op!.params.id?.required).toBe(true);
  });
});

describe('forget_fact dispatch', () => {
  test('forget_fact errors with fact_not_found on unknown id', async () => {
    const r = await dispatchToolCall(engine, 'forget_fact', { id: 99999 }, {
      remote: false, sourceId: 'default',
    });
    expect(r.isError).toBe(true);
    const payload = JSON.parse(r.content[0].text);
    expect(payload.error).toBe('fact_not_found');
  });

  test('forget_fact succeeds on valid id, then becomes idempotent-as-error', async () => {
    const inserted = await engine.insertFact(
      { fact: 'will be forgotten', kind: 'fact', source: 'test' },
      { source_id: 'default' },
    );
    const r1 = await dispatchToolCall(engine, 'forget_fact', { id: inserted.id }, {
      remote: false, sourceId: 'default',
    });
    expect(r1.isError).toBeFalsy();

    const r2 = await dispatchToolCall(engine, 'forget_fact', { id: inserted.id }, {
      remote: false, sourceId: 'default',
    });
    expect(r2.isError).toBe(true);
    const payload = JSON.parse(r2.content[0].text);
    // v0.32.2: more precise discriminator. The first call expires the fact;
    // the second call sees expired_at IS NOT NULL and surfaces
    // `fact_already_expired` instead of the older opaque `fact_not_found`.
    expect(payload.error).toBe('fact_already_expired');
  });
});

describe('extract_facts dispatch (no API key)', () => {
  test('returns inserted=0 / duplicate=0 / superseded=0 when chat gateway unavailable', async () => {
    const r = await dispatchToolCall(engine, 'extract_facts', {
      turn_text: 'I am flying to Tokyo Tuesday.',
    }, { remote: false, sourceId: 'default' });
    expect(r.isError).toBeFalsy();
    const payload = JSON.parse(r.content[0].text);
    expect(payload.inserted).toBe(0);
    expect(payload.duplicate).toBe(0);
    expect(payload.superseded).toBe(0);
    expect(Array.isArray(payload.fact_ids)).toBe(true);
  });
});
