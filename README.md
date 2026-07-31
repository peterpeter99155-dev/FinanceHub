# FinanceHub

FinanceHub 是一套以淨資產為核心、單一使用者、本機優先的個人財務中控台。

產品的首要任務是協助使用者回答：

1. 我現在擁有多少淨資產？
2. 我的資產為什麼增加或減少？

## 目前階段

專案目前正在執行 Sprint 04。財務資料庫已使用主密碼加密，正式版
可在自己擁有並管理的電腦上保存真實資料；開發、測試、範例與提交到
Git 的內容仍只能使用假資料。

## 核心方向

- 以淨資產與重要財務變化為核心。
- 抓大放小，不要求完整記錄每筆小額消費。
- 先建立可手動操作的財務底座，再逐步加入自動化。
- 所有自動結果都必須能由使用者修正。
- 初期採 Windows、單一使用者、本機優先。
- 真實財務資料、密碼與授權憑證不得提交至 Git。

## 主密碼

FinanceHub 第一次啟動時會要求設定主密碼，之後每次啟動都必須
先解鎖，才能讀取財務資料。

- FinanceHub 沒有主密碼重設機制，也沒有客服或後門可以代為解鎖。
- 忘記主密碼，資料將永久無法復原。
- `financehub.db.metadata.json` 保存導出金鑰所需的 salt。遺失或
  損壞這個 metadata 檔案，即使記得正確主密碼也無法復原資料。
- 新設定的主密碼為 8 至 64 個，僅接受半形英文、數字與半形特殊
  符號；不接受中文、全形文字、空白或換行。

## 資料存放原則

加密保護的是資料檔案落到別人手上的情境，例如筆電遭竊、
備份外洩或雲端硬碟同步內容被取得。沒有主密碼時，取得檔案的人
無法直接讀取財務內容。

加密不保護「電腦本身屬於別人」的情境。公司配發或他人所有的
電腦，其系統管理者可能直接存取檔案、透過備份複製資料，或使用
監控軟體記錄主密碼輸入。

因此：

- 真實財務資料只應存放在自己擁有並管理的電腦上。
- 在公司、學校、公用或他人所有的電腦試用時，只能使用假資料。
- 開發、自動化測試、範例與提交到 Git 的 fixture 一律使用假資料。

## 資料位置與備份

Windows 正式版的資料位於：

```text
%APPDATA%\FinanceHub\
```

FinanceHub 解鎖後會依設定自動建立本機加密備份，也可在
「資料與備份」頁面選擇「立即備份」。預設備份位置是：

```text
%APPDATA%\FinanceHub\backups\
```

每個 `FinanceHub-backup-<日期時間>-<識別碼>` 目錄都是一個獨立版本。
舊版建立的 `backup-<識別碼>` 目錄仍可使用。每份備份必須同時包含：

```text
financehub.db
financehub.db.metadata.json
manifest.json
```

缺少資料庫或 metadata、使用不相符的 metadata，或忘記建立該備份
時使用的主密碼，都無法還原。不要把缺檔、曾被修改，或未通過
`manifest.json` 檔案大小與 SHA-256 驗證的目錄當成還原來源。

### 手動還原

Sprint 04 尚未提供一鍵還原。需要手動還原時：

1. **完全關閉 FinanceHub。** 請確認程式已完全結束。
2. 選擇一個完整的 `FinanceHub-backup-<日期時間>-<識別碼>` 目錄
   （或舊版的 `backup-<識別碼>` 目錄）。確認 manifest 所列的
   `financehub.db` 與 `financehub.db.metadata.json` 檔名、大小及
   SHA-256 都與實際檔案相同。Windows 可使用
   `Get-FileHash <檔案路徑> -Algorithm SHA256` 比對雜湊。
3. 在另一個安全目錄建立暫存資料夾，將目前資料目錄中的下列檔案
   移入暫存資料夾；不要直接覆寫：

   ```text
   financehub.db
   financehub.db.metadata.json
   financehub.db-wal（若存在）
   financehub.db-shm（若存在）
   financehub.db-journal（若存在）
   ```

4. 將選定備份中的 `financehub.db` 與
   `financehub.db.metadata.json` 一起複製到
   `%APPDATA%\FinanceHub\`。不要混用不同備份版本的兩個檔案。
5. 重新開啟 FinanceHub，使用建立該備份時的原主密碼解鎖。
6. 確認最新財務項目、交易、統計與淨資產正確後，才算還原成功。
   確認前請保留步驟 3 的原始檔案。

舊版開發用的 `financehub.dev.db` 只有假資料，FinanceHub 不會讀取
或轉換它。確認不再需要後，可以在程式完全關閉時手動刪除。

## 正式文件

- [產品願景](docs/01_Product_Vision.md)
- [功能需求](docs/02_Requirements.md)
- [商業規則](docs/03_Business_Rules.md)
- [決策紀錄](docs/04_Decision_Log.md)
- [Sprint 01 規劃草案](docs/05_Sprint_01_Plan.md)
- [Sprint 01 Review](docs/06_Sprint_01_Review.md)

## 預定技術方向

- Electron
- React
- TypeScript
- Electron Forge

實際函式庫會在對應 Sprint 開始前確認，避免過早加入不必要的相依套件。

## 本機開發

需求：

- Node.js 24
- npm 11
- Windows 10 或 11

安裝與啟動：

```powershell
npm.cmd install
npm.cmd start
```

驗證：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run package
npm.cmd run test:e2e
npm.cmd run test:electron
```

`test:electron` 會先重新 package，再啟動 Electron，確保測試的是
目前原始碼產生的最新封裝內容。
