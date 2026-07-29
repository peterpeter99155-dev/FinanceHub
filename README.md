# FinanceHub

FinanceHub 是一套以淨資產為核心、單一使用者、本機優先的個人財務中控台。

產品的首要任務是協助使用者回答：

1. 我現在擁有多少淨資產？
2. 我的資產為什麼增加或減少？

## 目前階段

專案目前正在執行 Sprint 03。財務資料庫已使用主密碼加密；
開發、測試與提交到 Git 的內容仍只能使用假資料。

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
- 建議使用多個不相關詞組成、容易記住但夠長的密語。

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

需要一起保存的兩個檔案是：

```text
financehub.db
financehub.db.metadata.json
```

正確備份程序：

1. **完全關閉 FinanceHub。** 不只是關閉視窗；請確認程式已結束。
   這能讓仍在 WAL 中的最新資料安全寫回資料庫。
2. 複製 `financehub.db` 與 `financehub.db.metadata.json`
   **兩個檔案**。缺少任一個都無法還原。
3. 可將兩個檔案一起保存到隨身碟或雲端硬碟。資料庫已加密，
   但仍應保護備份位置與主密碼。
4. 還原時，先完全關閉 FinanceHub，再把兩個檔案放回同一個
   `%APPDATA%\FinanceHub\` 目錄。

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
