import type {
  Dispatch,
  FormEvent,
  RefObject,
  SetStateAction,
} from 'react';
import { useLayoutEffect } from 'react';

import {
  DATA_STATUSES,
  type DataStatus,
  MAX_FINANCIAL_ITEM_AMOUNT_TWD,
} from '../../domain/financial-item';
import type { FinancialItemCustomType } from '../../domain/financial-item-custom-type';
import type { FinancialItemDraft } from '../../shared/financial-items';
import {
  FINANCIAL_ITEM_TYPE_OPTIONS,
  STATUS_LABELS,
} from '../labels';
import type { ManagementSection } from './ManagementDialog';
import { IconButton } from './IconButton';

export type FinancialItemFormDraft = Omit<
  FinancialItemDraft,
  'amount'
> & { readonly amount: string };

export function FinancialItemForm({
  actionError,
  customTypes,
  draft,
  editingId,
  formPanelRef,
  isSaving,
  nameInputRef,
  onAmountChange,
  onDirectionChange,
  onItemTypeChange,
  onOpenManagement,
  onReset,
  onSubmit,
  setDraft,
}: {
  actionError: string | null;
  customTypes: readonly FinancialItemCustomType[];
  draft: FinancialItemFormDraft;
  editingId: string | null;
  formPanelRef: RefObject<HTMLElement | null>;
  isSaving: boolean;
  nameInputRef: RefObject<HTMLInputElement | null>;
  onAmountChange: (value: string) => void;
  onDirectionChange: (direction: 'asset' | 'liability') => void;
  onItemTypeChange: (value: string) => void;
  onOpenManagement: (section: ManagementSection) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDraft: Dispatch<SetStateAction<FinancialItemFormDraft>>;
}) {
  useLayoutEffect(() => {
    if (editingId) {
      formPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
    window.focus();
    nameInputRef.current?.focus();
  }, [editingId, formPanelRef, nameInputRef]);

  return (
    <section
      className={`panel form-panel ${editingId ? 'editing' : ''}`}
      ref={formPanelRef}
    >
      <div className="section-heading">
        <div>
          <p className="label">
            {editingId ? '編輯模式' : '手動新增'}
          </p>
          <h2>
            {editingId ? `正在編輯：${draft.name}` : '新增項目'}
          </h2>
        </div>
        {editingId && (
          <IconButton
            icon="close"
            label="取消編輯"
            type="button"
            onClick={onReset}
          />
        )}
      </div>

      <form onSubmit={onSubmit}>
        <fieldset className="segmented-control">
          <legend>方向</legend>
          <button
            className={draft.direction === 'asset' ? 'selected' : ''}
            type="button"
            onClick={() => onDirectionChange('asset')}
          >
            資產
          </button>
          <button
            className={
              draft.direction === 'liability' ? 'selected' : ''
            }
            type="button"
            onClick={() => onDirectionChange('liability')}
          >
            負債
          </button>
        </fieldset>

        <label>
          名稱（選填）
          <input
            data-testid="item-name"
            ref={nameInputRef}
            maxLength={100}
            value={draft.name}
            placeholder="例如：示範銀行存款"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <small>留空時會使用類型名稱，名稱可以重複。</small>
        </label>

        <label>
          <span className="field-heading">
            類型
            <button
              className="inline-action"
              type="button"
              onClick={() =>
                onOpenManagement(
                  draft.direction === 'asset'
                    ? 'asset_type'
                    : 'liability_type',
                )
              }
            >
              ＋新增類型
            </button>
          </span>
          <select
            data-testid="item-type"
            value={
              draft.customTypeId
                ? `custom:${draft.customTypeId}`
                : draft.type
            }
            onChange={(event) => onItemTypeChange(event.target.value)}
          >
            {draft.type === 'credit_card' && (
              <option value="credit_card">信用卡（既有）</option>
            )}
            {FINANCIAL_ITEM_TYPE_OPTIONS[draft.direction].map(
              (option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ),
            )}
            {customTypes
              .filter(
                (type) =>
                  type.direction === draft.direction && type.isActive,
              )
              .map((type) => (
                <option key={type.id} value={`custom:${type.id}`}>
                  {type.name}
                </option>
              ))}
          </select>
        </label>

        <label>
          目前金額（TWD）
          <input
            data-testid="item-amount"
            required
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            type="text"
            value={draft.amount}
            onChange={(event) => onAmountChange(event.target.value)}
          />
          <small>
            單筆最高 {formatTwd(MAX_FINANCIAL_ITEM_AMOUNT_TWD)}
          </small>
        </label>
        {draft.amount === '0' && (
          <p className="form-error" role="alert">
            金額必須大於 0。
          </p>
        )}

        <details
          className="advanced-settings"
          data-testid="advanced-settings"
        >
          <summary>更多設定</summary>
          <div className="advanced-content">
            <label>
              這筆金額的可信程度
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as DataStatus,
                  }))
                }
              >
                {DATA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <small>
                一般手動輸入維持「我已確認金額正確」即可。
              </small>
            </label>

            <label className="checkbox-label">
              <input
                checked={draft.includeInNetWorth}
                type="checkbox"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includeInNetWorth: event.target.checked,
                  }))
                }
              />
              {draft.direction === 'asset'
                ? '列入我的資產'
                : '列入我的負債'}
            </label>
            <p className="field-help">
              關閉後只保留資料，不列入首頁總額。
            </p>

            {draft.status === 'pending_confirmation' && (
              <p className="form-notice">
                尚未確認的項目會保留，但不影響正式淨資產。
              </p>
            )}
          </div>
        </details>
        {actionError && (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        )}

        <button
          className="primary-button"
          data-testid="save-item"
          disabled={isSaving || draft.amount === '0'}
          type="submit"
        >
          {isSaving
            ? '儲存中…'
            : editingId
              ? '儲存修改'
              : '新增項目'}
        </button>
      </form>
    </section>
  );
}

function formatTwd(value: number): string {
  return `TWD ${new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}
