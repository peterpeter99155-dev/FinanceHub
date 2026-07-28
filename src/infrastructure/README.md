# Infrastructure

此目錄提供領域與應用層介面的本機實作。

- `bootstrap-database.ts`：SQLite 連線及版本化 migration。
- `sqlite-financial-item-repository.ts`：資產與負債保存。
- `sqlite-financial-item-custom-type-repository.ts`：自訂資產與負債類型管理。
- `sqlite-category-repository.ts`：收入／支出分類管理及安全重新指派。
- `sqlite-transaction-repository.ts`：交易流水、月份分頁，以及交易與帳戶餘額的原子更新。

React renderer 不得直接使用此層；所有操作必須經過應用服務與受限制的 IPC。

此目錄實作資料庫及未來外部來源 adapter；React renderer 不得直接引用。
