import type { DatabaseSync } from 'node:sqlite';

import type { CategoryRepository } from '../../application/ports/category-repository';
import {
  CATEGORY_KINDS,
  CategoryKind,
  FinancialCategory,
  assertUniqueActiveCategoryName,
  getCategoryRemovalPolicy,
  validateFinancialCategory,
} from '../../domain/category';

interface CategoryRow {
  id: string;
  kind: string;
  name: string;
  is_built_in: number;
  is_active: number;
}

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(): readonly FinancialCategory[] {
    const rows = this.database
      .prepare(
        `SELECT id, kind, name, is_built_in, is_active
         FROM financial_categories
         ORDER BY kind ASC, is_active DESC, name COLLATE NOCASE ASC`,
      )
      .all() as unknown as CategoryRow[];

    return rows.map(mapRow);
  }

  findById(id: string): FinancialCategory | undefined {
    const row = this.database
      .prepare(
        `SELECT id, kind, name, is_built_in, is_active
         FROM financial_categories
         WHERE id = ?`,
      )
      .get(id) as unknown as CategoryRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  countTransactions(id: string): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM financial_transactions
         WHERE category_id = ?`,
      )
      .get(id) as { count: number };

    return Number(row.count);
  }

  create(category: FinancialCategory): void {
    validateFinancialCategory(category);
    assertUniqueActiveCategoryName(this.list(), category);

    this.database
      .prepare(
        `INSERT INTO financial_categories (
          id, kind, name, is_built_in, is_active
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        category.id,
        category.kind,
        category.name.trim(),
        category.isBuiltIn ? 1 : 0,
        category.isActive ? 1 : 0,
      );
  }

  update(category: FinancialCategory): void {
    validateFinancialCategory(category);
    assertUniqueActiveCategoryName(this.list(), category);
    const existing = this.findById(category.id);

    if (!existing) {
      throw new Error(`Financial category "${category.id}" was not found.`);
    }

    if (existing.isBuiltIn) {
      throw new Error('Built-in financial categories cannot be modified.');
    }

    if (
      existing.kind !== category.kind &&
      this.countTransactions(category.id) > 0
    ) {
      throw new Error(
        'A used financial category cannot change between income and expense.',
      );
    }

    const result = this.database
      .prepare(
        `UPDATE financial_categories
         SET kind = ?, name = ?, is_built_in = ?, is_active = ?
         WHERE id = ?`,
      )
      .run(
        category.kind,
        category.name.trim(),
        category.isBuiltIn ? 1 : 0,
        category.isActive ? 1 : 0,
        category.id,
      );

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial category "${category.id}" was not found.`);
    }
  }

  reassignAndDelete(id: string, replacementId: string): void {
    if (id === replacementId) {
      throw new Error('Replacement category must be different.');
    }

    const source = this.findById(id);
    const replacement = this.findById(replacementId);

    if (!source) {
      throw new Error(`Financial category "${id}" was not found.`);
    }

    if (source.isBuiltIn) {
      throw new Error('Built-in financial categories cannot be deleted.');
    }

    if (!replacement || !replacement.isActive) {
      throw new Error('Replacement category must be active.');
    }

    if (source.kind !== replacement.kind) {
      throw new Error('Replacement category must have the same kind.');
    }

    this.inTransaction(() => {
      this.database
        .prepare(
          `UPDATE financial_transactions
           SET category_id = ?
           WHERE category_id = ?`,
        )
        .run(replacementId, id);
      this.deleteUnused(id);
    });
  }

  delete(id: string): void {
    const category = this.findById(id);

    if (!category) {
      throw new Error(`Financial category "${id}" was not found.`);
    }

    if (category.isBuiltIn) {
      throw new Error('Built-in financial categories cannot be deleted.');
    }

    const policy = getCategoryRemovalPolicy(this.countTransactions(id));

    if (policy.action === 'reassign_required') {
      throw new Error(
        `Financial category is used by ${policy.usageCount} transaction(s).`,
      );
    }

    this.deleteUnused(id);
  }

  private deleteUnused(id: string): void {
    const result = this.database
      .prepare('DELETE FROM financial_categories WHERE id = ?')
      .run(id);

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial category "${id}" was not found.`);
    }
  }

  private inTransaction(operation: () => void): void {
    this.database.exec('BEGIN IMMEDIATE;');

    try {
      operation();
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }
}

function mapRow(row: CategoryRow): FinancialCategory {
  const kind = assertMember(row.kind, CATEGORY_KINDS, 'kind');
  const category: FinancialCategory = {
    id: row.id,
    kind: kind as CategoryKind,
    name: row.name,
    isBuiltIn: row.is_built_in === 1,
    isActive: row.is_active === 1,
  };

  validateFinancialCategory(category);
  return category;
}

function assertMember<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Stored financial category has invalid ${field}.`);
  }

  return value as T;
}
