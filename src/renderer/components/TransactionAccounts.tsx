import type { FinancialItem } from '../../domain/financial-item';
import type { TransactionFormDraft } from '../transactionViewModel';
import { formatTwd } from '../transactionViewModel';
import { MoneyAmount } from './MoneyAmount';

export function TransactionAccountFields({
  assetAccounts,
  draft,
  onChange,
}: {
  assetAccounts: readonly FinancialItem[];
  draft: TransactionFormDraft;
  onChange: (
    updater: (current: TransactionFormDraft) => TransactionFormDraft,
  ) => void;
}) {
  if (draft.kind === 'income') {
    return (
      <label>
        入帳帳戶（選填）
        <AccountSelect
          accounts={assetAccounts}
          value={draft.destinationAccountId}
          onChange={(value) =>
            onChange((current) => ({
              ...current,
              destinationAccountId: value,
            }))
          }
        />
      </label>
    );
  }

  return (
    <label>
      扣款帳戶（選填）
      <AccountSelect
        accounts={assetAccounts}
        value={draft.sourceAccountId}
        onChange={(value) =>
          onChange((current) => ({
            ...current,
            kind: 'expense',
            sourceAccountId: value,
            destinationAccountId: '',
          }))
        }
      />
    </label>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly FinancialItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">不指定帳戶</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}（{formatTwd(account.amount)}）
        </option>
      ))}
    </select>
  );
}

export function AccountBalanceStrip({
  assetAccounts,
  onCreateAccount,
}: {
  assetAccounts: readonly FinancialItem[];
  onCreateAccount: () => void;
}) {
  return (
    <section className="account-overview" aria-label="帳戶概況">
      <header>
        <h3>可用餘額</h3>
      </header>
      {assetAccounts.length === 0 ? (
        <div className="account-overview-empty">
          <div>
            <strong>尚未建立可收付款的帳戶</strong>
            <span>請先新增銀行帳戶或現金。</span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={onCreateAccount}
          >
            新增帳戶
          </button>
        </div>
      ) : (
        <div className="account-overview-list">
          {assetAccounts.map((account) => (
            <article key={account.id}>
              <span>{account.name}</span>
              <strong
                className={
                  account.amount > 0
                    ? 'financial-positive'
                    : 'financial-neutral'
                }
              >
                <MoneyAmount
                  value={account.amount}
                  tone={account.amount > 0 ? 'positive' : 'neutral'}
                />
              </strong>
              <small>帳面餘額</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
