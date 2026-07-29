import { describe, expect, it } from 'vitest';

import {
  financialDateKey,
  financialMonthFromDateTime,
  viewedMonthLocalDateTime,
} from '../../src/domain/financial-time';

describe('financial time in Asia/Taipei', () => {
  it('places 00:30 and 23:30 on the correct financial date', () => {
    expect(
      financialMonthFromDateTime('2026-07-31T16:30:00.000Z'),
    ).toBe('2026-08');
    expect(financialDateKey('2026-07-31T15:30:00.000Z')).toBe(
      '2026-07-31',
    );
  });

  it('uses the injected current time for a viewed month draft', () => {
    expect(
      viewedMonthLocalDateTime(
        2026,
        2,
        '2026-07-28T16:30:00.000Z',
      ),
    ).toBe('2026-02-28T00:30');
  });
});
