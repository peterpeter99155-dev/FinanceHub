import { describe, expect, it } from 'vitest';

import { CategoryService } from '../../src/application/category-service';
import { createTwdAmount } from '../../src/domain/money';
import {
  InMemoryFinanceStore,
  categoryRepository,
  transactionRepository,
} from './in-memory-finance-store';

const NOW = '2026-07-28T08:00:00.000Z';

function usedStore(): InMemoryFinanceStore {
  const store = new InMemoryFinanceStore();
  store.categories.set('source', {
    id: 'source',
    kind: 'expense',
    name: '宵夜',
    isBuiltIn: false,
    isActive: true,
  });
  store.categories.set('replacement', {
    id: 'replacement',
    kind: 'expense',
    name: '其他',
    isBuiltIn: true,
    isActive: true,
  });
  store.transactions.set('expense-1', {
    id: 'expense-1',
    kind: 'expense',
    amount: createTwdAmount(100),
    occurredAt: '2026-07-28T07:00:00.000Z',
    categoryId: 'source',
    name: '宵夜',
    note: '',
    createdAt: NOW,
    updatedAt: NOW,
  });
  return store;
}

describe('CategoryService', () => {
  it('reassigns transactions and deletes a category in one unit of work', () => {
    const store = usedStore();
    const service = new CategoryService(
      categoryRepository(store),
      transactionRepository(store),
    );

    service.reassignAndDelete('source', 'replacement');

    expect(store.categories.has('source')).toBe(false);
    expect(store.transactions.get('expense-1')?.categoryId).toBe(
      'replacement',
    );
  });

  it('rolls back reassignment when category deletion fails', () => {
    const store = usedStore();
    const categories = categoryRepository(store);
    const service = new CategoryService(
      {
        ...categories,
        delete: () => {
          throw new Error('simulated category failure');
        },
      },
      transactionRepository(store),
    );

    expect(() =>
      service.reassignAndDelete('source', 'replacement'),
    ).toThrow('simulated category failure');
    expect(store.categories.has('source')).toBe(true);
    expect(store.transactions.get('expense-1')?.categoryId).toBe(
      'source',
    );
  });

  it('keeps used-category decisions in the application layer', () => {
    const store = usedStore();
    const service = new CategoryService(
      categoryRepository(store),
      transactionRepository(store),
    );

    expect(() => service.delete('source')).toThrow(
      'used by 1 transaction',
    );
    expect(() =>
      service.update('source', {
        kind: 'income',
        name: '改為收入',
        isActive: true,
      }),
    ).toThrow('cannot change between income and expense');
  });

  it('protects built-in categories in the application layer', () => {
    const store = usedStore();
    const service = new CategoryService(
      categoryRepository(store),
      transactionRepository(store),
    );

    expect(() =>
      service.update('replacement', {
        kind: 'expense',
        name: 'renamed',
        isActive: true,
      }),
    ).toThrow('cannot be modified');
    expect(() => service.delete('replacement')).toThrow(
      'cannot be deleted',
    );
  });
});
