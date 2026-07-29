import type { SqliteDatabase } from './sqlite-database';

import type { CategoryRepository } from '../../application/ports/category-repository';
import {
  CATEGORY_KINDS,
  CategoryKind,
  FinancialCategory,
  assertUniqueActiveCategoryName,
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
  constructor(private readonly database: SqliteDatabase) {}

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

  delete(id: string): void {
    const category = this.findById(id);

    if (!category) {
      throw new Error(`Financial category "${id}" was not found.`);
    }

    if (category.isBuiltIn) {
      throw new Error('Built-in financial categories cannot be deleted.');
    }

    const result = this.database
      .prepare('DELETE FROM financial_categories WHERE id = ?')
      .run(id);

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial category "${id}" was not found.`);
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
