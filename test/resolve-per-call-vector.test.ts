import { describe, expect, test } from 'bun:test';
import { resolvePerCallVector } from '../src/core/ops/context.ts';
import type { OperationContext } from '../src/core/ops/contract.ts';

function ctx(remote: boolean): OperationContext {
  return { remote } as OperationContext;
}

describe('resolvePerCallVector', () => {
  test('local false returns false (lexical ablation)', () => {
    expect(resolvePerCallVector(ctx(false), false)).toBe(false);
  });

  test('local true returns true', () => {
    expect(resolvePerCallVector(ctx(false), true)).toBe(true);
  });

  test('remote false is ignored', () => {
    expect(resolvePerCallVector(ctx(true), false)).toBeUndefined();
  });

  test('non-boolean is ignored', () => {
    expect(resolvePerCallVector(ctx(false), 'false')).toBeUndefined();
    expect(resolvePerCallVector(ctx(false), undefined)).toBeUndefined();
  });
});
