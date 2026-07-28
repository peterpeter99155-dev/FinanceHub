# Domain

此目錄保存不依賴 React、Electron 或 SQLite 的財務規則。

- `money.ts`：TWD 安全整數金額。
- `financial-item.ts`：資產與負債項目。
- `financial-item-custom-type.ts`：自訂資產與負債類型。
- `net-worth.ts`：淨資產計算。
- `category.ts`：收入／支出分類與安全刪除規則。
- `transaction.ts`：收入、支出、轉帳、信用卡消費與繳款的帳戶影響及月度統計。

此目錄只放財務領域模型與規則，不得依賴 Electron、React 或特定資料庫。
