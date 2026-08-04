import type { CategoryRepository } from '../../src/application/ports/category-repository';
import type { FinancialItemRepository } from '../../src/application/ports/financial-item-repository';
import type { FinancialItemCustomTypeRepository } from '../../src/application/ports/financial-item-custom-type-repository';
import type {
  TransactionPage,
  TransactionRepository,
} from '../../src/application/ports/transaction-repository';
import type { FinancialCategory } from '../../src/domain/category';
import { financialMonthFromDateTime } from '../../src/domain/financial-time';
import type { FinancialItem } from '../../src/domain/financial-item';
import type { FinancialItemCustomType } from '../../src/domain/financial-item-custom-type';
import type { FinancialTransaction } from '../../src/domain/transaction';

export class InMemoryFinanceStore {
  readonly transactions = new Map<string, FinancialTransaction>();
  readonly items = new Map<string, FinancialItem>();
  readonly categories = new Map<string, FinancialCategory>();
  readonly customTypes = new Map<string, FinancialItemCustomType>();

  runInTransaction<T>(operation: () => T): T {
    const transactions = new Map(this.transactions);
    const items = new Map(this.items);
    const categories = new Map(this.categories);
    const customTypes = new Map(this.customTypes);

    try {
      return operation();
    } catch (error) {
      replaceMap(this.transactions, transactions);
      replaceMap(this.items, items);
      replaceMap(this.categories, categories);
      replaceMap(this.customTypes, customTypes);
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

  listAllByMonth(year: number, month: number) {
    return this.listByMonth(
      year,
      month,
      0,
      Number.MAX_SAFE_INTEGER,
    ).items;
  }

  countTransactions(id: string): number {
    return [...this.transactions.values()].filter(
      (transaction) =>
        transaction.sourceAccountId === id ||
        transaction.destinationAccountId === id ||
        transaction.categoryId === id,
    ).length;
  }

}

export function transactionRepository(store: InMemoryFinanceStore) {
  return {
    runInTransaction: store.runInTransaction.bind(store),
    findById: (id: string) => store.transactions.get(id),
    listByMonth: store.listByMonth.bind(store),
    listAllByMonth: store.listAllByMonth.bind(store),
    countByCategoryId: (id: string) =>
      [...store.transactions.values()].filter(
        (transaction) => transaction.categoryId === id,
      ).length,
    countByAccountId: (id: string) =>
      [...store.transactions.values()].filter(
        (transaction) =>
          transaction.sourceAccountId === id ||
          transaction.destinationAccountId === id,
      ).length,
    reassignCategory: (id: string, replacementId: string) => {
      for (const [key, transaction] of store.transactions) {
        if (transaction.categoryId === id) {
          store.transactions.set(key, {
            ...transaction,
            categoryId: replacementId,
          });
        }
      }
    },
    create: (transaction: FinancialTransaction) =>
      store.transactions.set(transaction.id, transaction),
    update: (transaction: FinancialTransaction) =>
      store.transactions.set(transaction.id, transaction),
    delete: (id: string) => {
      store.transactions.delete(id);
      for (const [key, transaction] of store.transactions) {
        if (transaction.originalTransactionId === id) {
          store.transactions.set(key, {
            ...transaction,
            originalTransactionId: undefined,
          });
        }
      }
    },
  } satisfies TransactionRepository;
}

export function financialItemRepository(store: InMemoryFinanceStore) {
  return {
    list: () => [...store.items.values()],
    findById: (id: string) => store.items.get(id),
    countByCustomTypeId: (id: string) =>
      [...store.items.values()].filter(
        (item) => item.customTypeId === id,
      ).length,
    create: (item: FinancialItem) => store.items.set(item.id, item),
    update: (item: FinancialItem) => store.items.set(item.id, item),
    delete: (id: string) => store.items.delete(id),
  } satisfies FinancialItemRepository;
}

export function categoryRepository(store: InMemoryFinanceStore) {
  return {
    list: () => [...store.categories.values()],
    findById: (id: string) => store.categories.get(id),
    create: (category: FinancialCategory) =>
      store.categories.set(category.id, category),
    update: (category: FinancialCategory) =>
      store.categories.set(category.id, category),
    delete: (id: string) => store.categories.delete(id),
  } satisfies CategoryRepository;
}

export function customTypeRepository(store: InMemoryFinanceStore) {
  return {
    list: () => [...store.customTypes.values()],
    findById: (id: string) => store.customTypes.get(id),
    create: (type: FinancialItemCustomType) =>
      store.customTypes.set(type.id, type),
    update: (type: FinancialItemCustomType) =>
      store.customTypes.set(type.id, type),
    delete: (id: string) => store.customTypes.delete(id),
  } satisfies FinancialItemCustomTypeRepository;
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>) {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}
