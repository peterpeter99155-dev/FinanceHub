import type {
  Dispatch,
  FormEvent,
  RefObject,
  SetStateAction,
} from 'react';
import { useLayoutEffect } from 'react';

import type { FinancialCategory } from '../../domain/category';
import type { FinancialItem } from '../../domain/financial-item';
import { financialLocalDateTimeInput } from '../../domain/financial-time';
import {
  MAX_TRANSACTION_AMOUNT_TWD,
  type TransactionKind,
} from '../../domain/transaction';
import { systemClock } from '../../application/ports/clock';
import { TRANSACTION_KIND_LABELS } from '../labels';
import {
  formatTwd,
  type TransactionFormDraft,
} from '../transactionViewModel';
import { IconButton } from './IconButton';
import { TransactionAccountFields } from './TransactionAccounts';

export function TransactionForm({
  assetAccounts,
  draft,
  editingId,
  error,
  formPanelRef,
  hasInsufficientBalance,
  isSaving,
  onKindChange,
  onOpenTypeManagement,
  onReset,
  onSubmit,
  relevantCategories,
  setDraft,
  setError,
}: {
  assetAccounts: readonly FinancialItem[];
  draft: TransactionFormDraft;
  editingId: string | null;
  error: string | null;
  formPanelRef: RefObject<HTMLElement | null>;
  hasInsufficientBalance: boolean;
  isSaving: boolean;
  onKindChange: (kind: TransactionKind) => void;
  onOpenTypeManagement: (section: 'income' | 'expense') => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  relevantCategories: readonly FinancialCategory[];
  setDraft: Dispatch<SetStateAction<TransactionFormDraft>>;
  setError: (message: string | null) => void;
}) {
  useLayoutEffect(() => {
    if (!editingId) {
      return;
    }
    formPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    formPanelRef.current
      ?.querySelector<HTMLInputElement>('input, select')
      ?.focus();
  }, [editingId, formPanelRef]);

  return (
    <section
      className={`panel transaction-form-panel ${
        editingId ? 'editing' : ''
      }`}
      ref={formPanelRef}
    >
      <div className="section-heading">
        <div>
          <p className="label">
            {editingId ? '編輯模式' : '手動記錄'}
          </p>
          <h2>
            {editingId
              ? `正在編輯：${
                  draft.name || TRANSACTION_KIND_LABELS[draft.kind]
                }`
              : '新增交易'}
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
        <label>
          交易類型
          <select
            data-testid="transaction-kind"
            value={draft.kind === 'income' ? 'income' : 'expense'}
            onChange={(event) =>
              onKindChange(event.target.value as TransactionKind)
            }
          >
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
        </label>

        <TransactionAccountFields
          assetAccounts={assetAccounts}
          draft={draft}
          onChange={setDraft}
        />

        {hasInsufficientBalance && (
          <div className="account-required-notice">
            <strong>所選帳戶的帳面餘額不足</strong>
            <span>您仍可記錄這筆支出，請改成不指定扣款帳戶。</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  sourceAccountId: '',
                }))
              }
            >
              改成不指定帳戶
            </button>
          </div>
        )}

        {(draft.kind === 'income' ||
          draft.kind === 'expense' ||
          draft.kind === 'credit_card_purchase') && (
          <label>
            <span className="field-heading">
              分類
              <button
                className="inline-action"
                type="button"
                onClick={() =>
                  onOpenTypeManagement(
                    draft.kind === 'income' ? 'income' : 'expense',
                  )
                }
              >
                ＋新增分類
              </button>
            </span>
            <select
              data-testid="transaction-category"
              required
              value={draft.categoryId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
            >
              <option value="">請選擇分類</option>
              {relevantCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          金額（TWD）
          <input
            data-testid="transaction-amount"
            inputMode="numeric"
            maxLength={12}
            pattern="[0-9]*"
            placeholder="0"
            required
            type="text"
            value={draft.amount}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '');
              if (
                digits &&
                Number(digits) > MAX_TRANSACTION_AMOUNT_TWD
              ) {
                setError(
                  `單筆金額上限為 ${formatTwd(
                    MAX_TRANSACTION_AMOUNT_TWD,
                  )}。`,
                );
                return;
              }
              setDraft((current) => ({ ...current, amount: digits }));
            }}
          />
        </label>

        <label>
          交易時間
          <input
            max={financialLocalDateTimeInput(systemClock.now())}
            required
            type="datetime-local"
            value={draft.occurredAt}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                occurredAt: event.target.value,
              }))
            }
          />
        </label>

        <label>
          名稱（選填）
          <input
            maxLength={50}
            placeholder="留空時使用分類名稱"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>

        <label>
          備註（選填）
          <textarea
            maxLength={200}
            rows={3}
            value={draft.note}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="primary-button"
          data-testid="save-transaction"
          disabled={
            isSaving || draft.amount === '0' || hasInsufficientBalance
          }
          type="submit"
        >
          {isSaving
            ? '儲存中…'
            : editingId
              ? '儲存修改'
              : '新增交易'}
        </button>
      </form>
    </section>
  );
}
