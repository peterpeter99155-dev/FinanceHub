import { describe, expect, it } from 'vitest';

import {
  addTwdAmounts,
  createTwdAmount,
} from '../../src/domain/money';

describe('TWD amount', () => {
  it('accepts zero and safe integer amounts', () => {
    expect(createTwdAmount(0)).toBe(0);
    expect(createTwdAmount(9_000_000)).toBe(9_000_000);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid value %s',
    (value) => {
      expect(() => createTwdAmount(value)).toThrow();
    },
  );

  it('rejects totals outside the safe integer range', () => {
    expect(() =>
      addTwdAmounts(
        createTwdAmount(Number.MAX_SAFE_INTEGER),
        createTwdAmount(1),
      ),
    ).toThrow('supported range');
  });
});
