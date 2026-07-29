import type { FinancialItem } from '../domain/financial-item';
import { AccountBalanceStrip } from './components/TransactionAccounts';
import { TransactionForm } from './components/TransactionForm';
import { TransactionList } from './components/TransactionList';
import { TransactionSummaryCard } from './components/TransactionSummary';
import { useTransactionMonth } from './hooks/useTransactionMonth';

export function TransactionsView({
  accounts,
  onBalancesChanged,
  onCreateAccount,
  onOpenTypeManagement,
  typeManagementVersion,
}: {
  accounts: readonly FinancialItem[];
  onBalancesChanged: () => Promise<void>;
  onCreateAccount: () => void;
  onOpenTypeManagement: (section: 'income' | 'expense') => void;
  typeManagementVersion: number;
}) {
  const {
    accountById,
    assetAccounts,
    changeKind,
    changeMonth,
    confirmDelete,
    currentMonth,
    draft,
    editingId,
    error,
    formPanelRef,
    groupedTransactions,
    hasInsufficientBalance,
    isSaving,
    loadMore,
    month,
    pendingDelete,
    relevantCategories,
    resetForm,
    setDraft,
    setError,
    setPendingDelete,
    snapshot,
    startEditing,
    submit,
    year,
  } = useTransactionMonth({
    accounts,
    onBalancesChanged,
    typeManagementVersion,
  });
  const isCurrentMonth =
    year === currentMonth.year && month === currentMonth.month;

  return (
    <section className="transactions-workspace">
      <div className="transaction-summary-row">
        <TransactionSummaryCard
          label="本月收入"
          value={snapshot?.summary.totalIncome ?? 0}
          tone="income"
        />
        <TransactionSummaryCard
          label="本月支出"
          value={snapshot?.summary.totalExpense ?? 0}
          tone="expense"
        />
        <TransactionSummaryCard
          label="收支差額"
          value={snapshot?.summary.balance ?? 0}
          tone="balance"
        />
      </div>

      <AccountBalanceStrip
        assetAccounts={assetAccounts}
        onCreateAccount={onCreateAccount}
      />

      <div className="transaction-grid">
        <TransactionList
          accountById={accountById}
          editingId={editingId}
          groupedTransactions={groupedTransactions}
          isCurrentMonth={isCurrentMonth}
          month={month}
          onChangeMonth={changeMonth}
          onDelete={setPendingDelete}
          onEdit={startEditing}
          onLoadMore={() => void loadMore()}
          snapshot={snapshot}
          year={year}
        />
        <TransactionForm
          assetAccounts={assetAccounts}
          draft={draft}
          editingId={editingId}
          error={error}
          formPanelRef={formPanelRef}
          hasInsufficientBalance={hasInsufficientBalance}
          isSaving={isSaving}
          onKindChange={changeKind}
          onOpenTypeManagement={onOpenTypeManagement}
          onReset={() => resetForm()}
          onSubmit={(event) => void submit(event)}
          relevantCategories={relevantCategories}
          setDraft={setDraft}
          setError={setError}
        />
      </div>

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-modal="true"
            className="confirm-dialog"
            role="alertdialog"
          >
            <p className="label">確認刪除</p>
            <h2>刪除「{pendingDelete.name}」？</h2>
            <p>帳戶餘額及本月統計會自動還原。</p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                className="delete-button"
                type="button"
                onClick={() => void confirmDelete()}
              >
                刪除交易
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
