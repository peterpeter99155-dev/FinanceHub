import {
  useEffect,
  useState,
} from 'react';

import type {
  CategoryKind,
  FinancialCategory,
} from '../../domain/category';
import type { FinancialItemCustomType } from '../../domain/financial-item-custom-type';
import type { FinancialItemDirection } from '../../domain/financial-item';
import { MANAGEMENT_TABS } from '../labels';
import { managementErrorMessage } from '../messages';
import { ManagementRow } from './ManagementRow';

export type ManagementSection =
  | 'asset_type'
  | 'liability_type'
  | 'income'
  | 'expense';

export function ManagementDialog({
  categories,
  customTypes,
  error,
  section,
  onCategoriesChange,
  onClose,
  onCustomTypesChange,
  onError,
  onSaved,
  onSectionChange,
}: {
  categories: readonly FinancialCategory[];
  customTypes: readonly FinancialItemCustomType[];
  error: string | null;
  section: ManagementSection;
  onCategoriesChange: (
    categories: readonly FinancialCategory[],
  ) => void;
  onClose: () => void;
  onCustomTypesChange: (
    types: readonly FinancialItemCustomType[],
  ) => void;
  onError: (message: string | null) => void;
  onSaved: () => void;
  onSectionChange: (section: ManagementSection) => void;
}) {
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isTypeSection =
    section === 'asset_type' || section === 'liability_type';
  const direction: FinancialItemDirection =
    section === 'liability_type' ? 'liability' : 'asset';
  const categoryKind: CategoryKind =
    section === 'income' ? 'income' : 'expense';
  const entries = isTypeSection
    ? customTypes.filter((type) => type.direction === direction)
    : categories.filter(
        (category) =>
          category.kind === categoryKind && !category.isBuiltIn,
      );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function createEntry() {
    const name = newName.trim();
    if (!name) {
      onError('請輸入名稱。');
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.create({
            direction,
            name,
            isActive: true,
          }),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.create({
            kind: categoryKind,
            name,
            isActive: true,
          }),
        );
      }
      setNewName('');
    } catch (caughtError) {
      onError(
        managementErrorMessage(
          caughtError,
          isTypeSection ? '類型' : '分類',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateEntry(
    entry: FinancialItemCustomType | FinancialCategory,
    name: string,
    isActive: boolean,
  ): Promise<boolean> {
    onError(null);
    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.update(
            entry.id,
            { direction, name, isActive },
          ),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.update(entry.id, {
            kind: categoryKind,
            name,
            isActive,
          }),
        );
      }
      return true;
    } catch (caughtError) {
      onError(
        managementErrorMessage(
          caughtError,
          isTypeSection ? '類型' : '分類',
        ),
      );
      return false;
    }
  }

  async function deleteEntry(
    entry: FinancialItemCustomType | FinancialCategory,
  ) {
    onError(null);
    try {
      if (isTypeSection) {
        onCustomTypesChange(
          await window.financeHub.financialItemCustomTypes.delete(
            entry.id,
          ),
        );
      } else {
        onCategoriesChange(
          await window.financeHub.categories.delete(entry.id),
        );
      }
    } catch {
      onError(
        isTypeSection
          ? '這個類型已有資產或負債使用，不能停用或刪除。'
          : '這個分類已被交易使用，請先將交易移至其他分類。',
      );
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="management-dialog-title"
        aria-modal="true"
        className="management-dialog"
        role="dialog"
      >
        <div className="section-heading">
          <div>
            <p className="label">自訂設定</p>
            <h2 id="management-dialog-title">管理類型與分類</h2>
          </div>
          <button
            aria-label="關閉"
            className="dialog-close-button"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="management-tabs" role="tablist">
          {MANAGEMENT_TABS.map(([value, label]) => (
            <button
              aria-selected={section === value}
              className={section === value ? 'selected' : ''}
              key={value}
              role="tab"
              type="button"
              onClick={() => {
                setNewName('');
                onError(null);
                onSectionChange(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="management-create">
          <input
            aria-label="新名稱"
            maxLength={20}
            placeholder={
              isTypeSection ? '輸入新的類型名稱' : '輸入新的分類名稱'
            }
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void createEntry();
              }
            }}
          />
          <button
            className="primary-button"
            disabled={isSaving}
            type="button"
            onClick={() => void createEntry()}
          >
            新增
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="management-list">
          {entries.length === 0 ? (
            <p className="management-empty">目前沒有自訂項目。</p>
          ) : (
            entries.map((entry) => (
              <ManagementRow
                entry={entry}
                key={entry.id}
                onDelete={() => void deleteEntry(entry)}
                onSaved={onSaved}
                onUpdate={(name, isActive) =>
                  updateEntry(entry, name, isActive)
                }
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
