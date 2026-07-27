import type { DatabaseSync } from 'node:sqlite';

import type { FinancialItemRepository } from '../../application/ports/financial-item-repository';
import {
  DATA_STATUSES,
  FINANCIAL_ITEM_DIRECTIONS,
  FINANCIAL_ITEM_TYPES,
  DataStatus,
  FinancialItem,
  FinancialItemDirection,
  FinancialItemType,
  validateFinancialItem,
} from '../../domain/financial-item';
import { createTwdAmount } from '../../domain/money';

interface FinancialItemRow {
  id: string;
  name: string;
  direction: string;
  type: string;
  amount: number;
  status: string;
  updated_at: string;
  is_active: number;
  include_in_net_worth: number;
}

export class SqliteFinancialItemRepository
  implements FinancialItemRepository
{
  constructor(private readonly database: DatabaseSync) {}

  list(): readonly FinancialItem[] {
    const rows = this.database
      .prepare(
        `SELECT id, name, direction, type, amount, status, updated_at,
                is_active, include_in_net_worth
         FROM financial_items
         ORDER BY updated_at DESC, id ASC`,
      )
      .all() as unknown as FinancialItemRow[];

    return rows.map(mapRow);
  }

  findById(id: string): FinancialItem | undefined {
    const row = this.database
      .prepare(
        `SELECT id, name, direction, type, amount, status, updated_at,
                is_active, include_in_net_worth
         FROM financial_items
         WHERE id = ?`,
      )
      .get(id) as unknown as FinancialItemRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  create(item: FinancialItem): void {
    validateFinancialItem(item);

    this.database
      .prepare(
        `INSERT INTO financial_items (
          id, name, direction, type, amount, status, updated_at,
          is_active, include_in_net_worth
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.name.trim(),
        item.direction,
        item.type,
        item.amount,
        item.status,
        item.updatedAt,
        item.isActive ? 1 : 0,
        item.includeInNetWorth ? 1 : 0,
      );
  }

  update(item: FinancialItem): void {
    validateFinancialItem(item);

    const result = this.database
      .prepare(
        `UPDATE financial_items
         SET name = ?, direction = ?, type = ?, amount = ?, status = ?,
             updated_at = ?, is_active = ?, include_in_net_worth = ?
         WHERE id = ?`,
      )
      .run(
        item.name.trim(),
        item.direction,
        item.type,
        item.amount,
        item.status,
        item.updatedAt,
        item.isActive ? 1 : 0,
        item.includeInNetWorth ? 1 : 0,
        item.id,
      );

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial item "${item.id}" was not found.`);
    }
  }

  delete(id: string): void {
    const result = this.database
      .prepare('DELETE FROM financial_items WHERE id = ?')
      .run(id);

    if (Number(result.changes) !== 1) {
      throw new Error(`Financial item "${id}" was not found.`);
    }
  }
}

function mapRow(row: FinancialItemRow): FinancialItem {
  const direction = assertMember(
    row.direction,
    FINANCIAL_ITEM_DIRECTIONS,
    'direction',
  );
  const type = assertMember(row.type, FINANCIAL_ITEM_TYPES, 'type');
  const status = assertMember(row.status, DATA_STATUSES, 'status');

  const item: FinancialItem = {
    id: row.id,
    name: row.name,
    direction: direction as FinancialItemDirection,
    type: type as FinancialItemType,
    amount: createTwdAmount(row.amount),
    status: status as DataStatus,
    updatedAt: row.updated_at,
    isActive: row.is_active === 1,
    includeInNetWorth: row.include_in_net_worth === 1,
  };

  validateFinancialItem(item);
  return item;
}

function assertMember<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Stored financial item has invalid ${field}.`);
  }

  return value as T;
}
