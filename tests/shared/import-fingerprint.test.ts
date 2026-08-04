import { describe, expect, it } from 'vitest';

import { observationFingerprintInput } from '../../src/shared/import-fingerprint';

describe('observation fingerprint input', () => {
  it('is stable across time-of-day and harmless summary spacing changes', () => {
    expect(observationFingerprintInput({
      occurredAt: '2026-07-10T04:00:00.000Z', statementEffect: 100,
      summary: '虛構  商店', creditCardAccountId: 'card-1',
    })).toBe(observationFingerprintInput({
      occurredAt: '2026-07-10T16:30:00.000Z', statementEffect: 100,
      summary: ' 虛構 商店 ', creditCardAccountId: 'card-1',
    }));
  });

  it('keeps different amounts, cards and calendar dates distinct', () => {
    const base = { occurredAt: '2026-07-10T04:00:00.000Z',
      statementEffect: 100, summary: '虛構商店', creditCardAccountId: 'card-1' };
    expect(new Set([
      observationFingerprintInput(base),
      observationFingerprintInput({ ...base, statementEffect: 101 }),
      observationFingerprintInput({ ...base, creditCardAccountId: 'card-2' }),
      observationFingerprintInput({ ...base, occurredAt: '2026-07-11T04:00:00.000Z' }),
    ]).size).toBe(4);
  });
});
