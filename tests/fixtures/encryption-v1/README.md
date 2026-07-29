# 加密資料庫 v1 相容性 fixture

此目錄的 `financehub-v1.db` 與
`financehub-v1.db.metadata.json` 是一組不可分割的固定測試基準。
內容只有假帳戶「加密相容性測試銀行」，不含任何真實財務資料。

固定測試密碼只定義在
`tests/infrastructure/encrypted-database-compatibility.test.ts`，
不得由 production 程式引用。

升級 `better-sqlite3-multiple-ciphers`、SQLite3MultipleCiphers、
cipher 或 migration 前，必須確認新版程式仍能開啟這組既有 fixture。
測試會先把兩個檔案複製到暫存目錄，避免修改提交到 Git 的基準檔。
