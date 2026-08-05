import { describe, expect, it } from 'vitest';

import { hasImportDuplicateSignal } from '../../src/domain/import';

describe('hasImportDuplicateSignal', () => {
  it('requires an explicit decision for either observation or transaction matches', () => {
    expect(hasImportDuplicateSignal(0, 0)).toBe(false);
    expect(hasImportDuplicateSignal(1, 0)).toBe(true);
    expect(hasImportDuplicateSignal(0, 1)).toBe(true);
  });
});
