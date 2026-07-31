# Sprint 2.5 Review：架構整理與測試防線

## 文件資訊

- 日期：2026-07-29
- Sprint：Sprint 2.5
- 分支：`codex/sprint-02-5`
- 結果：實作完成，等待確認後合併至 `main`
- 計畫版本：`docs/09_Sprint_02_5_Plan.md` v1.3

> 歷史狀態註記（2026-07-30）：本 Review 記錄 G-01、G-04、G-05、
> G-06「已移至 Sprint 03」是 Sprint 2.5 結束時的真實決議；
> Sprint 03 最終未實作這些項目。目前狀態以 `00_Glossary.md` 與
> `12_Sprint_03_Review.md` 為準。

## Sprint Goal 回顧

本 Sprint 未新增產品功能，主要目標是補齊 Sprint 01、Sprint 02 的端到端驗收，將財務判斷與 use case 編排移回正確分層，建立穩定的 IPC 錯誤契約，並拆分過大的 renderer 元件。

除 T-05 的資料狀態文案與 T-25 的錯誤訊息外，使用者可見的行為、版面、樣式、焦點及鍵盤操作均維持不變。T-40 的瀏覽器 E2E、package smoke 與 production package 均通過。T-40 當時由 Electron 整合測試抓到一項負債編輯後淨資產未更新的失敗；後續確認為 Sprint 01 起即存在的延遲焦點資料錯誤，已在本 Sprint 修正並補上回歸防線。

## 完成範圍

| 任務 | 結果 | Commit |
|---|---|---|
| T-00 | 固定文字檔換行規則，避免 Windows 換行造成整個檔案被誤判為修改。 | `7381914` |
| T-05 | 更新 G-07 對應的資料狀態文案。 | `7381914` |
| T-01 | 完成 Sprint 02 Review，明確記錄未完成項目與結構問題。 | `7381914` |
| T-02 | 修正需求與商業規則文件的現況描述。 | `7381914` |
| T-03 | 補入 DEC-025 至 DEC-031。 | `7381914` |
| T-10 | 建立瀏覽器 E2E，實際驗證測試可先紅後綠，並覆蓋 Sprint 01、Sprint 02 核心流程。 | `aed7f1c`、`2b850fe` |
| T-11 | 分離瀏覽器 E2E、Electron 整合測試與 package smoke；mock 只模擬儲存，財務規則使用正式 domain 函式。 | `aed7f1c` |
| T-21 | 移除 `allowInactive` 與偽造狀態的反轉流程，改由 application 明確編排。 | `e25acba` |
| T-22 | 將目前時間與 `Asia/Taipei` 財務日期集中管理，不再以 `updatedAt` 代替現在時間。 | `e25acba` |
| T-20 | 將交易寫入、帳戶影響與反轉交易的 use case 編排移至 application，Repository 專注持久化與原子交易。 | `e25acba` |
| T-23 | 將餘額不足、可收付款帳戶及相關財務判斷移出 renderer。 | `8dba9f0` |
| T-24 | 移除 renderer 的重複財務計算；純視覺的綠增紅減與圖示映射保留在 renderer。 | `8dba9f0` |
| T-25 | 建立結構化錯誤代碼與 `IpcResult`，明確跨越 Electron IPC 邊界，renderer 不再比對英文或資料庫錯誤字串。 | `3cd823d` |
| T-26 | 以 SHA-256 測試固定既有 migration 區塊；說明註解放在 migration 結構外，既有 migration 內容未修改。 | `8dba9f0` |
| T-30 | 拆分 renderer 元件與狀態 hook，共用元件移至 `src/renderer/components`，共用標籤與錯誤訊息集中管理。 | `9d859bf` |

## 預期的對外行為變更

1. T-05：依 G-07 更新資料狀態文案，使使用者較容易理解該項目是否納入個人資產／負債。
2. T-25：錯誤訊息改由穩定的結構化錯誤代碼映射，不再將 SQLite 或英文錯誤內容暴露給 renderer。

除此之外，本 Sprint 未刻意改變功能、樣式、版面、焦點或鍵盤操作。瀏覽器 E2E 的五項流程在拆分前後均通過。

## 過程中發現並修正的既有問題

1. **E2E selector 失效**：Sprint 02 的 selector 已無法對應現有畫面，且當時未真正執行完整 E2E。本 Sprint 重建可執行的瀏覽器驗收。
2. **Sprint 01 起存在的延遲焦點資料錯誤**：編輯財務項目時，脫離 React 渲染週期的 `setTimeout` 會在使用者開始輸入金額後把焦點搶回名稱欄位。實際失敗案例把 `4900000` 附加到名稱成為「示範房貸4900000」，IPC、回傳 snapshot 與 SQLite 則都保存舊金額 `5000000`，造成淨資產靜默錯誤。這段焦點處理在 T-30 前已存在，T-30 只讓它較容易重現；本 Sprint 建立的 Electron 安全網才首次抓到。修正方式是移除脫離渲染週期的焦點排程，改由表單元件以 `useLayoutEffect` 綁定 `editingId`，並清除同類的 `focusNameInput` 與交易編輯延遲焦點。
3. **Sprint 02 端到端驗收未實際執行**：原本的短時間 smoke test 只能證明應用程式啟動，不能證明收支流程。本 Sprint 明確分開瀏覽器 E2E、Electron 整合測試與 package smoke。
4. **測試 mock 手抄財務規則**：原 mock 曾自行計算交易影響、月度統計與可用帳戶。本 Sprint 改為呼叫正式 domain／application 邏輯，mock 只負責假儲存。

## 本 Sprint 建立的機械化防線

1. **Migration SHA-256 固定測試**：測試直接固定 `MIGRATIONS` 區塊內容；既有 migration 若被修改會立即失敗。
2. **Renderer 禁用字串守門測試**：禁止 renderer 出現 `UNIQUE constraint`、`SQLITE` 與已淘汰的錯誤訊息內容比對。
3. **IPC 邊界測試**：證明錯誤代碼經 main 序列化與 preload 解包後仍能正確到達 renderer，不依賴自訂 `Error` 屬性。
4. **瀏覽器 E2E 財務驗收**：覆蓋交易新增、編輯、刪除，以及資產／負債新增、編輯、刪除後的總資產、總負債與淨資產。

## 已移至 Sprint 03

1. G-01：電子錢包型別。
2. G-04：資料狀態選單調整。
3. G-05：手續費與父交易關聯。
4. G-06：交易篩選與分類重新指派 UI。

## 未修正的已知項目

1. **Electron 與 package smoke 仍使用 `--disable-gpu`**：先前 Windows Electron GPU subprocess 曾發生 crash；此參數只處理測試環境啟動，不改變財務規則。
2. **Electron 測試依賴已建置的 `.webpack` 輸出**：若執行前未重新 package，可能測到舊程式。T-40 已先執行 `npm run package`，但測試腳本尚未自動保證建置新鮮度。
3. **文案集中採較窄範圍**：共用標籤、交易類型文字及錯誤訊息已移至 `labels/messages`；只出現一次且緊貼版面結構的標題、按鈕及 ARIA 文案仍留在元件。這是 T-30 實作時認為可讀性較佳的設計選擇，但若計畫中的「文案集中」意指所有字面文字，則目前並未完全符合，需由後續確認是否全面搬移。
4. **帳戶餘額模型仍是 MVP 模型**：尚未改為「期初 + 交易 + 調整」，依計畫留待 Sprint 03 以後先討論。
5. **Mutation 後仍回傳完整列表**：MVP 規模可接受，暫不進行效能優化。

## T-40 完整驗證

執行日期：2026-07-29。

| 驗證 | 結果 | 摘要 |
|---|---|---|
| `npm run typecheck` | 通過 | `tsc --noEmit`，exit code 0。 |
| `npm run lint` | 通過 | `eslint .`，0 error、0 warning。 |
| `npm test` | 通過 | 15 個測試檔、99 項測試全部通過，426ms。 |
| `npm run test:e2e` | 通過 | 5 項瀏覽器 E2E 全部通過，3.5s。 |
| `npm run test:package-smoke` | 通過 | production package 啟動、標題與暫存資料庫初始化均通過。 |
| `npm run test:electron` | 失敗，狀態記錄 | 1 項失敗：編輯負債後淨資產未更新；其餘步驟已執行。 |
| `npm run make` | 通過 | 成功產出 Squirrel 安裝檔、NuGet 套件及 ZIP。 |

產物：

- `out/make/squirrel.windows/x64/FinanceHub-0.1.0 Setup.exe`
- `out/make/squirrel.windows/x64/financehub-0.1.0-full.nupkg`
- `out/make/squirrel.windows/x64/RELEASES`
- `out/make/zip/win32/x64/FinanceHub-win32-x64-0.1.0.zip`

`npm run make` 僅出現 Node.js `DEP0147` 的 `fs.rmdir` 棄用警告，不影響本次產出。

### T-40 後續資料正確性修復驗證

T-40 的 Electron 紅燈經 bisect 與低干擾觀測確認為 Sprint 01 起既有的焦點競速，不是 T-25 IPC 回歸。修正後：

- typecheck、lint 通過。
- 瀏覽器 E2E 5 項全部通過，並驗證編輯後的焦點、名稱與金額；瀏覽器 mock 環境無法穩定重現舊競速，因此主要阻擋防線仍是 Electron。
- fresh package 後以單一 worker 連續執行 Electron 測試 15 次，15 次全部通過。
- 每次 Electron 測試都驗證名稱維持「示範房貸」、金額為 `4,900,000`、淨資產為 `4,100,000`，並在重新開啟應用程式後再次確認持久化結果。

## T-41 自我審查

### 1. 是否有為了測試通過或繞過設計而加入變通做法

沒有修改正式財務結果來迎合測試，也沒有保留 `allowInactive`、以 `updatedAt` 代替現在時間，或依錯誤訊息內容判斷等做法。

完整列出的測試／環境性選擇如下：

1. Electron 與 package smoke 啟動時保留 `--disable-gpu`，用來避開曾發生的 Windows GPU subprocess crash。
2. 瀏覽器 E2E 使用記憶體 mock 取代 Electron IPC 與 SQLite；mock 只模擬持久化，財務判斷呼叫正式 domain／application 函式。
3. package smoke 以輪詢及 timeout 等待視窗與資料庫初始化，屬跨程序測試的同步機制。
4. migration SHA-256 測試刻意對既有區塊高度敏感，目的是讓任何字元變動都變紅。
5. Electron 測試目前不會自行重建 `.webpack`，T-40 以先執行 `npm run package` 保證本次測到最新輸出；這是尚未消除的測試流程限制。

額外檢查「自己認為合理所以可能漏列」後，另有以下設計選擇：

1. `UNKNOWN` 錯誤代碼會隔離未預期的 infrastructure 細節，只對 renderer 提供安全通用訊息。
2. Repository／SQLite 仍保留資料完整性檢查，application 同時擁有政策判斷；這是防禦性保護，不是第二份財務規則。
3. 純視覺的綠增紅減、圖示與顯示文字仍由 renderer 映射，依 Architecture Rules 1.4 不上移。
4. T-30 只集中共用／語意性文案，未搬移每個一次性 UI 字串；此選擇已列入已知項目，不視為默認完成。

### 2. 是否修改既有 migration、既有測試或既有對外介面

- **Migration**：沒有修改任何既有 migration 區塊；只在結構外補註解，並新增 SHA-256 固定測試。
- **既有測試**：有。修正失效 selector、補 Electron 編輯狀態等待、拆分測試類型，並新增 browser E2E、IPC、migration 與 renderer 守門測試。
- **既有對外介面**：renderer 使用的 `FinanceHubApi` 呼叫形狀維持不變；main 與 preload 之間的內部 IPC wire contract 改為結構化 `IpcResult`。使用者可見的變更只有 T-05 文案與 T-25 錯誤訊息。

### 3. 新增或搬移的邏輯位於哪一層

- **Domain**：交易現金流、帳戶餘額影響、月度統計等不依賴框架的財務規則。
- **Application**：交易新增／修改／刪除編排、可用帳戶政策、現在時間及餘額不足判斷。
- **Infrastructure**：SQLite 查詢、持久化及原子 transaction，不決定財務政策。
- **Shared**：錯誤代碼、IPC 結果與跨程序共用契約。
- **Main／Preload**：main 將結果序列化，preload 解包，避免依賴 Electron 不會保留的自訂 `Error` 欄位。
- **Renderer**：畫面元件、互動 state、格式化與純視覺映射，不產生財務結論。
- **Tests**：browser mock 只提供測試儲存介面，正式規則由 domain／application 匯入。

### 4. 下個 Sprint 可能需要重寫或調整的地方

1. 若進入「期初 + 交易 + 調整」模型，帳戶餘額儲存與計算流程需重新設計。
2. G-06 會在現有分類 service 上增加交易篩選與重新指派 UI。
3. G-01、G-04、G-05 會分別擴充帳戶型別、資料狀態及交易關聯模型。
4. Electron 測試應加入自動 fresh build，並為儲存完成／畫面刷新建立比單純 DOM 等待更明確的同步訊號。
5. `useAppController` 與跨元件 props 雖符合目前上限，功能增加後可能需要再按 use case 分割。
6. 若資料量成長，月度統計與 mutation 回傳完整列表需改為查詢聚合及增量更新。

### 5. 是否偏離文件

1. T-00 至 T-30 的核心分層與行為要求未發現偏離。
2. `test:electron` 在最終全套驗證仍失敗；計畫明定它只做狀態記錄、不列入 Definition of Done，但此狀態仍是核心數字風險，已明確保留。
3. T-30 的「文案集中」採共用／語意性文案集中，而非所有一次性字串集中；若依最廣義字面解讀，這是一項部分偏離。
4. 階段 1 的 commit 訊息仍有英文；使用者提出「未來 commit 使用中文」後的 commit 均使用繁體中文。這不影響程式或文件規格。

## T-30 拆分後行數與 State 數量

行數以實體檔案行數計算；state 數量以每個元件或 hook 的 `useState` 呼叫數計算。

| 檔案 | 行數 | State |
|---|---:|---:|
| `src/renderer/App.tsx` | 261 | 0 |
| `src/renderer/TransactionsView.tsx` | 143 | 0 |
| `src/renderer/components/DeleteFinancialItemDialog.tsx` | 60 | 0 |
| `src/renderer/components/FinancialItemForm.tsx` | 273 | 0 |
| `src/renderer/components/FinancialItemSummary.tsx` | 156 | 0 |
| `src/renderer/components/IconButton.tsx` | 48 | 0 |
| `src/renderer/components/ManagementDialog.tsx` | 272 | 2 |
| `src/renderer/components/ManagementRow.tsx` | 115 | 2 |
| `src/renderer/components/MoneyAmount.tsx` | 35 | 0 |
| `src/renderer/components/TransactionAccounts.tsx` | 128 | 0 |
| `src/renderer/components/TransactionDayGroup.tsx` | 133 | 0 |
| `src/renderer/components/TransactionForm.tsx` | 262 | 0 |
| `src/renderer/components/TransactionList.tsx` | 85 | 0 |
| `src/renderer/components/TransactionSummary.tsx` | 53 | 0 |
| `src/renderer/formatters.ts` | 11 | 0 |
| `src/renderer/hooks/useAppController.ts` | 295 | 0 |
| `src/renderer/hooks/useFinancialItemState.ts` | 43 | 7 |
| `src/renderer/hooks/useManagementState.ts` | 44 | 8 |
| `src/renderer/hooks/useTransactionMonth.ts` | 265 | 7 |
| `src/renderer/hooks/useViewedMonth.ts` | 13 | 2 |
| `src/renderer/labels.ts` | 50 | 0 |
| `src/renderer/messages.ts` | 60 | 0 |
| `src/renderer/transactionViewModel.ts` | 175 | 0 |

所有列出的檔案均不超過 300 行；單一元件或 hook 均不超過 8 個 `useState`。

## Sprint 結論

Sprint 2.5 已把 Sprint 01、Sprint 02 的核心財務規則收斂至 domain／application，建立可實際執行的瀏覽器端到端驗收及跨 IPC 錯誤契約，並完成 renderer 結構拆分。新安全網亦抓出並修正一項從 Sprint 01 起存在、會讓金額靜默存錯欄位的資料正確性問題。可以進入人工確認流程；是否合併仍由使用者確認，且「文案集中」範圍仍待確認。
