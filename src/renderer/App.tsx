import { financialTone } from './formatters';
import { TransactionsView } from './TransactionsView';
import { FinancialItemForm } from './components/FinancialItemForm';
import {
  FinancialItemGroup,
  SummaryCard,
} from './components/FinancialItemSummary';
import { ManagementDialog } from './components/ManagementDialog';
import { DeleteFinancialItemDialog } from './components/DeleteFinancialItemDialog';
import { BackupSettingsView } from './components/BackupSettingsView';
import { useAppController } from './hooks/useAppController';
import { ImportView } from './ImportView';

export function App() {
  const {
    actionError,
    activeView,
    assetItems,
    categories,
    changeAmount,
    changeDirection,
    changeItemType,
    confirmDeleteItem,
    customTypes,
    draft,
    editingId,
    focusNameInput,
    formPanelRef,
    handleSubmit,
    isDeleting,
    isManagementOpen,
    isSaving,
    itemTypeLabel,
    liabilityItems,
    loadItems,
    managementError,
    managementSection,
    nameInputRef,
    notification,
    openManagement,
    pendingDeleteItem,
    prepareNewAsset,
    prepareNewCreditCard,
    resetForm,
    setActiveView,
    setCategories,
    setCustomTypes,
    setDraft,
    setIsManagementOpen,
    setManagementError,
    setManagementSection,
    setPendingDeleteItem,
    setTypeManagementVersion,
    showNotification,
    startEditing,
    typeManagementVersion,
    viewState,
  } = useAppController();

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本機財務管理</p>
          <h1>FinanceHub</h1>
        </div>
        <span className="environment-badge">本機加密儲存</span>
      </header>

      {viewState.status === 'loading' && (
        <section className="panel state-panel">正在載入財務資料…</section>
      )}

      {viewState.status === 'error' && (
        <section className="panel state-panel error-state">
          <h2>資料載入失敗</h2>
          <p>{viewState.message}</p>
          <button type="button" onClick={() => void loadItems()}>
            重新載入
          </button>
        </section>
      )}

      {viewState.status === 'ready' && (
        <>
          <nav className="primary-tabs" aria-label="主要功能">
            <button
              className={activeView === 'assets' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('assets')}
            >
              資產與負債
            </button>
            <button
              className={activeView === 'transactions' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('transactions')}
            >
              收支紀錄
            </button>
            <button
              className={activeView === 'imports' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('imports')}
            >
              帳單匯入
            </button>
            <button
              className={activeView === 'backups' ? 'selected' : ''}
              type="button"
              onClick={() => setActiveView('backups')}
            >
              資料與備份
            </button>
          </nav>

          {activeView === 'assets' ? (
            <>
          <section
            className="summary-equation"
            aria-label="淨資產等於總資產減去總負債"
            data-testid="summary-equation"
          >
            <SummaryCard
              label="淨資產"
              value={viewState.snapshot.summary.netWorth}
              featured
              tone={financialTone(viewState.snapshot.summary.netWorth)}
              testId="net-worth"
            />
            <span aria-hidden="true" className="equation-symbol">
              =
            </span>
            <SummaryCard
              label="總資產"
              value={viewState.snapshot.summary.totalAssets}
              tone={
                viewState.snapshot.summary.totalAssets > 0
                  ? 'positive'
                  : 'neutral'
              }
              testId="total-assets"
            />
            <span aria-hidden="true" className="equation-symbol">
              −
            </span>
            <SummaryCard
              label="總負債"
              value={viewState.snapshot.summary.totalLiabilities}
              tone={
                viewState.snapshot.summary.totalLiabilities > 0
                  ? 'negative'
                  : 'neutral'
              }
              testId="total-liabilities"
            />
          </section>

          <div className="workspace-grid">
            <section className="panel items-panel">
              <div className="section-heading">
                <div>
                  <p className="label">財務總覽</p>
                  <h2>資產與負債</h2>
                </div>
              </div>

              <div className="financial-groups">
                <FinancialItemGroup
                  direction="asset"
                  editingId={editingId}
                  emptyMessage="尚未建立資產"
                  items={assetItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  typeLabel={itemTypeLabel}
                  title="資產"
                  total={viewState.snapshot.summary.totalAssets}
                />
                <FinancialItemGroup
                  direction="liability"
                  editingId={editingId}
                  emptyMessage="尚未建立負債"
                  items={liabilityItems}
                  onDelete={setPendingDeleteItem}
                  onEdit={startEditing}
                  typeLabel={itemTypeLabel}
                  title="負債"
                  total={viewState.snapshot.summary.totalLiabilities}
                />
              </div>
            </section>

            <FinancialItemForm
              actionError={actionError}
              customTypes={customTypes}
              draft={draft}
              editingId={editingId}
              formPanelRef={formPanelRef}
              isSaving={isSaving}
              nameInputRef={nameInputRef}
              onAmountChange={changeAmount}
              onDirectionChange={changeDirection}
              onItemTypeChange={changeItemType}
              onOpenManagement={(section) =>
                void openManagement(section)
              }
              onReset={() => resetForm()}
              onSubmit={(event) => void handleSubmit(event)}
              setDraft={setDraft}
            />
          </div>
            </>
          ) : activeView === 'transactions' ? (
            <TransactionsView
              accounts={viewState.snapshot.items}
              onBalancesChanged={loadItems}
              onCreateAccount={prepareNewAsset}
              onOpenTypeManagement={(section) =>
                void openManagement(section)
              }
              typeManagementVersion={typeManagementVersion}
            />
          ) : activeView === 'imports' ? (
            <ImportView
              accounts={viewState.snapshot.items}
              onBalancesChanged={loadItems}
              onCreateCreditCard={prepareNewCreditCard}
            />
          ) : (
            <BackupSettingsView />
          )}
        </>
      )}

      {pendingDeleteItem && (
        <DeleteFinancialItemDialog
          isDeleting={isDeleting}
          item={pendingDeleteItem}
          onCancel={() => {
            setPendingDeleteItem(null);
            focusNameInput();
          }}
          onConfirm={() => void confirmDeleteItem()}
        />
      )}

      {isManagementOpen && (
        <ManagementDialog
          categories={categories}
          customTypes={customTypes}
          error={managementError}
          section={managementSection}
          onCategoriesChange={setCategories}
          onClose={() => {
            setIsManagementOpen(false);
            setManagementError(null);
            setTypeManagementVersion((current) => current + 1);
          }}
          onCustomTypesChange={setCustomTypes}
          onError={setManagementError}
          onSaved={() =>
            showNotification(
              managementSection === 'asset_type' ||
                managementSection === 'liability_type'
                ? '✓ 類型名稱已儲存'
                : '✓ 分類名稱已儲存',
            )
          }
          onSectionChange={setManagementSection}
        />
      )}

      {notification && (
        <div
          className={`toast-notification ${
            isManagementOpen ? 'near-dialog' : ''
          }`}
          role="status"
        >
          {notification}
        </div>
      )}
    </main>
  );
}
