import type { SqliteDatabase } from './sqlite-database';
import {
  ERROR_CODES,
  FinanceHubError,
} from '../../shared/errors';

import type { FinancialItemCustomTypeRepository } from '../../application/ports/financial-item-custom-type-repository';
import {
  FinancialItemCustomType,
  validateFinancialItemCustomType,
} from '../../domain/financial-item-custom-type';
import {
  FINANCIAL_ITEM_DIRECTIONS,
  FinancialItemDirection,
} from '../../domain/financial-item';

interface CustomTypeRow {
  id: string;
  direction: string;
  name: string;
  is_active: number;
}

export class SqliteFinancialItemCustomTypeRepository
  implements FinancialItemCustomTypeRepository
{
  constructor(private readonly database: SqliteDatabase) {}

  list(): readonly FinancialItemCustomType[] {
    const rows = this.database
      .prepare(
        `SELECT id, direction, name, is_active
         FROM financial_item_custom_types
         ORDER BY direction ASC, is_active DESC, name COLLATE NOCASE ASC`,
      )
      .all() as unknown as CustomTypeRow[];

    return rows.map(mapRow);
  }

  findById(id: string): FinancialItemCustomType | undefined {
    const row = this.database
      .prepare(
        `SELECT id, direction, name, is_active
         FROM financial_item_custom_types
         WHERE id = ?`,
      )
      .get(id) as unknown as CustomTypeRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  create(type: FinancialItemCustomType): void {
    validateFinancialItemCustomType(type);
    this.assertUniqueActiveName(type);

    this.database
      .prepare(
        `INSERT INTO financial_item_custom_types (
          id, direction, name, is_active
        ) VALUES (?, ?, ?, ?)`,
      )
      .run(
        type.id,
        type.direction,
        type.name.trim(),
        type.isActive ? 1 : 0,
      );
  }

  update(type: FinancialItemCustomType): void {
    validateFinancialItemCustomType(type);
    const existing = this.findById(type.id);

    if (!existing) {
      throw new Error(
        `Financial item custom type "${type.id}" was not found.`,
      );
    }

    this.assertUniqueActiveName(type);
    this.database
      .prepare(
        `UPDATE financial_item_custom_types
         SET direction = ?, name = ?, is_active = ?
         WHERE id = ?`,
      )
      .run(
        type.direction,
        type.name.trim(),
        type.isActive ? 1 : 0,
        type.id,
      );
  }

  delete(id: string): void {
    const result = this.database
      .prepare(
        'DELETE FROM financial_item_custom_types WHERE id = ?',
      )
      .run(id);

    if (Number(result.changes) !== 1) {
      throw new Error(
        `Financial item custom type "${id}" was not found.`,
      );
    }
  }

  private assertUniqueActiveName(
    candidate: FinancialItemCustomType,
  ): void {
    if (!candidate.isActive) {
      return;
    }

    const normalizedName = candidate.name.trim().toLocaleLowerCase('zh-TW');
    const duplicate = this.list().some(
      (type) =>
        type.id !== candidate.id &&
        type.isActive &&
        type.direction === candidate.direction &&
        type.name.trim().toLocaleLowerCase('zh-TW') === normalizedName,
    );

    if (duplicate) {
      throw new FinanceHubError(
        ERROR_CODES.duplicateName,
        'An active custom type with the same name and direction already exists.',
      );
    }
  }
}

function mapRow(row: CustomTypeRow): FinancialItemCustomType {
  const direction = assertMember(
    row.direction,
    FINANCIAL_ITEM_DIRECTIONS,
    'direction',
  );
  const type: FinancialItemCustomType = {
    id: row.id,
    direction: direction as FinancialItemDirection,
    name: row.name,
    isActive: row.is_active === 1,
  };

  validateFinancialItemCustomType(type);
  return type;
}

function assertMember<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Stored custom type has invalid ${field}.`);
  }

  return value as T;
}
