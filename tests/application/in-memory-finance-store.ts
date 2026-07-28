import type { CategoryRepository } from '../../src/application/ports/category-repository';
import type { FinancialItemRepository } from '../../src/application/ports/financial-item-repository';
import type {
  TransactionPage,
  TransactionRepository,
} from '../../src/application/ports/transaction-repository';
import type { FinancialCategory } from '../../src/domain/category';
import { financialMonthFromDateTime } from '../../src/domain/financial-time';
import type { FinancialItem } from '../../src/domain/financial-item';
import {
  FinancialTransaction,
  calculateMonthlyTransactionSummary,
} from '../../src/domain/transaction';

export class InMemoryFinanceStore {
  readonly transactions = new Map<string, FinancialTransaction>();
  readonly items = new Map<string, FinancialItem>();
  readonly categories = new Map<string, FinancialCategory>();

  runInTransaction<T>(operation: () => T): T {
    const transactions = new Map(this.transactions);
    const items = new Map(this.items);
    const categories = new Map(this.categories);

    try {
      return operation();
    } catch (error) {
      replaceMap(this.transactions, transactions);
      replaceMap(this.items, items);
      replaceMap(this.categories, categories);
      throw error;
    }
  }

  listByMonth(
    year: number,
    month: number,
    offset = 0,
    limit = 50,
  ): TransactionPage {
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    const all = [...this.transactions.values()]
      .filter(
        (transaction) =>
          financialMonthFromDateTime(transaction.occurredAt) === key,
      )
      .sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt),
      );
    return {
      items: all.slice(offset, offset + limit),
      totalCount: all.length,
    };
  }

  summarizeMonth(year: number, month: number) {
    return calculateMonthlyTransactionSummary(
      [...this.transactions.values()],
      year,
      month,
    );
  }

  countTransactions(id: string): number {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.sourceAccountId === id ||
        transaction.destinationAccountId === id ||
        transaction.categoryId === id,
    ).length;
  }

  reassignAndDelete(id: string, replacementId: string): void {
    for (const [key, transaction] of this.transactions) {
      if (transaction.categoryId === id) {
        this.transactions.set(key, {
          ...transaction,
          categoryId: replacementId,
        });
      }
    }
    this.categories.delete(id);
  }
}

export function transactionRepository(store: InMemoryFinanceStore) {
  return {
    runInTransaction: store.runInTransaction.bind(store),
    findById: (id: string) => store.transactions.get(id),
    listByMonth: store.listByMonth.bind(store),
    summarizeMonth: store.summarizeMonth.bind(store),
    create: (transaction: FinancialTransaction) =>
      store.transactions.set(transaction.id, transaction),
    update: (transaction: FinancialTransaction) =>
      store.transactions.set(transaction.id, transaction),
    delete: (id: string) => store.transactions.delete(id),
  } satisfies TransactionRepository;
}

export function financialItemRepository(store: InMemoryFinanceStore) {
  return {
    list: () => [...store.items.values()],
    findById: (id: string) => store.items.get(id),
    countTransactions: store.countTransactions.bind(store),
    create: (item: FinancialItem) => store.items.set(item.id, item),
    update: (item: FinancialItem) => store.items.set(item.id, item),
    delete: (id: string) => store.items.delete(id),
  } satisfies FinancialItemRepository;
}

export function categoryRepository(store: InMemoryFinanceStore) {
  return {
    list: () => [...store.categories.values()],
    findById: (id: string) => store.categories.get(id),
    countTransactions: store.countTransactions.bind(store),
    create: (category: FinancialCategory) =>
      store.categories.set(category.id, category),
    update: (category: FinancialCategory) =>
      store.categories.set(category.id, category),
    delete: (id: string) => store.categories.delete(id),
    reassignAndDelete: store.reassignAndDelete.bind(store),
  } satisfies CategoryRepository;
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>) {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}
