# Sprint 2.5：技術整理（不新增任何功能）

## 文件資訊

- 日期：2026-07-28
- 狀態：待開始
- 分支：`codex/sprint-02-5`（從 Sprint 02 合併後的 main 開出）
- 依據文件：`00_Architecture_Rules.md`、`00_Glossary.md`、`04_Decision_Log.md`
- 對應程式狀態：所有引用已於 commit `ad6b85e` 核對過
- 本文件同時納入了 Sprint 02 結束時的自我審查回報，以及外部程式審查的結果

## Sprint Goal

在不改變任何對使用者可見的行為前提下，修正 Sprint 01／02 已產生的結構性問題，並補回缺失的自動化安全網，讓 Sprint 03 能站在乾淨的地基上。

## 最重要的前提

**本 Sprint 不得新增任何功能，不得改變任何 UI 行為、版面或文案。**

判斷標準：Sprint 02 的所有驗收案例，在本 Sprint 前後的操作步驟與畫面結果必須完全相同。若某項修正會改變使用者看到的東西，停止並回報。

唯一允許改變的可見行為是 T-40 的錯誤訊息：訊息會變得更穩定正確，但語意必須與現在一致。

## 執行順序（不可調換）

```text
階段 0　合併前置作業
階段 1　修復自動化安全網   ← 必須先做，後面全靠它把關
階段 2　架構修正
階段 3　介面拆分
階段 4　驗證與回報
```

**階段 1 先於一切的理由：** Sprint 02 的 Electron 驗收實際上沒有跑完，而現有 E2E 的 selector 已經失效（測試找「管理類型與分類」，畫面已改為「管理類型」）。也就是目前**沒有任何有效的端到端把關**。在這個狀態下做階段 2 與階段 3 的搬移，等於沒有安全網走鋼索。

---

# 階段 0　合併前置作業

## T-00　清理 Git 雜訊

### 問題

工作區有約 42 個檔案顯示為已修改，`git diff --ignore-all-space` 卻顯示完全沒有差異。也就是這批 diff（約 18500 行新增／16500 行刪除）**100% 是換行字元的全檔改寫**，不含任何實質變更。

### 影響

review 無法進行，真正的邏輯變更會被埋在格式雜訊裡。

### 做法

- 新增 `.gitattributes`，強制文字檔使用 LF。
- 一次性正規化，**單獨一個 commit**，訊息標明「僅格式，無行為變更」，不得混入任何邏輯修改。
- 此後每個 commit 一件事。

## T-01　撰寫 Sprint 02 Review

建立 `docs/08_Sprint_02_Review.md`，內容至少涵蓋以下已知問題。**這些是合併前必須留下的記錄，不得省略或淡化。**

### 已完成

核心收入／支出流程、自訂類型與分類、SQLite 交易一致性、月度統計。

### 未完成（已決議移至 Sprint 03，見 G-06）

1. 交易篩選（依交易類型或分類）— `07_Sprint_02_Plan.md` 第 9 節要求，未實作。
2. 分類重新指派後刪除的 UI 流程 — 底層 `reassignAndDelete` 已存在，但管理畫面刪除時只呼叫一般 `delete`，因此使用中的自訂收支分類無法在畫面上完成移轉。

### 已知問題（Sprint 2.5 處理）

3. Electron 端到端驗收未實際完成，以 5 秒啟動 smoke test 代替。
4. 現有 E2E selector 已失效。
5. `calculateDailyBalance` 在 Renderer 層做財務計算，且無自動化測試。
6. 交易的餘額編排邏輯位於 SQLite Repository。
7. `allowInactive` 旗標與偽造 `isActive` 狀態。
8. 以 `updatedAt` 代替現在時間做未來交易判斷。
9. 錯誤訊息以英文字串比對決定中文文案，其中一處比對 SQLite 原始錯誤訊息。
10. `App.tsx`（1386 行）與 `TransactionsView.tsx`（1077 行）遠超結構上限。

### 文件不一致（Sprint 2.5 處理）

11. `03_Business_Rules.md` 仍寫「支出若選擇信用卡付款，系統仍必須依信用卡消費規則增加待繳金額」，而 DEC-023 已停止提供信用卡付款入口。
12. `03_Business_Rules.md` 對「已被使用的自訂類型或分類可停用」與「使用中的資產／負債類型不得停用」兩條規則未區分適用對象。
13. `07_Sprint_02_Plan.md` 標記「已完成」，但第 11、12 項與上述未完成項並未達成。

### 環境相關變通（記錄即可，不需修正）

14. E2E 加入 `--disable-gpu`，因開發版 Electron 出現 GPU subprocess crash。
15. `.gitignore` 排除 `.codex-temp/`，因 Windows 鎖住 Electron 暫存目錄。

### 階段性相容做法（刻意保留，記錄備查）

16. 主畫面隱藏轉帳與信用卡入口，底層保留（DEC-021 至 DEC-024）。
17. 編輯既有資料時臨時插入「信用卡（既有）」選項。
18. 收入／支出的帳戶為選填，因此「收支流水總額 ≠ 資產餘額變化」。未來報表必須明確區分已連結帳戶與未指定帳戶。

## T-02　修正文件狀態

- 修正 `07_Sprint_02_Plan.md` 的完成狀態標記，改為反映實際範圍。
- 修正第 4 節的交易類型清單：由 6 項改為 5 項，並註明轉帳手續費以一筆普通支出表示（G-02）。
- 將第 9 節的交易篩選、第 3 節的分類重新指派 UI 標記為移至 Sprint 03（G-06）。

## T-03　補記決策紀錄

在 `04_Decision_Log.md` 新增六筆決議，內容以 `00_Glossary.md` 第 5 節為準，**逐條照抄，不得改寫或省略連動規則**：

- G-01　電子錢包採新增型別（Sprint 03）
- G-02　轉帳手續費為普通支出，交易類型固定 5 種
- G-03　期初餘額不進資料模型
- G-04　資料狀態使用者只能選兩個（Sprint 03）
- G-05　手續費綁定父轉帳並連動刪除（Sprint 03）
- G-06　交易篩選與分類重新指派 UI 移至 Sprint 03

另補記：migration v5 的由來（見 T-52），以及「已套用的 migration 不得修改，只能新增」這條規則。

## T-04　合併

完成 T-00 至 T-03 後合併 `codex/sprint-02` 至 main，再由 main 開出 `codex/sprint-02-5`。

---

# 階段 1　修復自動化安全網

## T-10　修好失效的 E2E

### 問題

`tests/e2e/app.e2e.ts:173` 尋找標題「管理類型與分類」，但 `App.tsx:1105` 已改為「管理類型」。該測試必然失敗或從未被執行。

### 做法

- 修正所有已過期的 selector。
- 檢查是否還有其他 selector 與現行畫面不符，一併列出並修正。
- 確認測試真的會執行且真的會失敗（先故意改壞一處，確認測試抓得到，再改回）。

**這一步必須有證據：** 回報中要附上測試實際執行的輸出，不接受「應該可以跑」。

## T-11　重建 E2E 架構

### 問題

Sprint 02 的 Electron 驗收沒有實際完成，改用 73 項單元測試加 5 秒啟動 smoke test 代替。因此「打包後能啟動」有驗證，但完整收支流程沒有任何自動化操作驗證。

### 做法（採自我審查的建議）

分成三層：

1. **UI 流程測試**：Playwright 瀏覽器環境 + mock `window.financeHub`，驗證表單、列表、錯誤提示、焦點行為。這層不需要 Electron，穩定且快。
2. **打包 smoke**：驗證 Windows 封裝產物能啟動、能開啟主視窗、資料庫能初始化。
3. **少量 Electron 整合測試**：等 GPU 問題有穩定方案再啟用，現階段不擴充。

### 驗收方式

Sprint 02 的七個使用案例（US-01 至 US-07）都有對應的自動化測試，且能實際執行通過。至少必須涵蓋：收入、支出、轉帳、信用卡消費、信用卡繳款、修改、刪除。

**注意：轉帳與信用卡的主要畫面入口目前是隱藏的（DEC-021 至 DEC-024）。這幾項以 service 或 IPC 層測試覆蓋即可，不得為了測試而重新打開 UI 入口。**

---

# 階段 2　架構修正

## T-20　把 use case 編排移回 application 層

### 問題

`sqlite-transaction-repository.ts` 自行決定業務結果：`create()`、`update()`、`delete()` 各自呼叫 domain 的 `calculateAccountBalanceEffects()`，`applyEffects()` 直接修改財務項目餘額，constructor 內自行 `new SqliteFinancialItemRepository(database)` 與 `new SqliteCategoryRepository(database)`。

而 `transaction-service.ts` 只做輸入解析就轉手。

### 說明

Sprint 02 的自我審查認為這是「資料持久化與 atomic update，放這層合理」。**這個判斷不正確。** atomic update 的機制屬於 infrastructure，但「一筆交易要影響哪些帳戶」是業務決定，屬於 application。

可以對照自我審查自己提出的另兩個建議（見 T-23）：那兩處的判斷是對的，只是沒有套用到最大的這一處。

### 期望做法

`TransactionService` 承擔完整 use case：

1. 讀取本次交易涉及的財務項目與分類。
2. 呼叫 domain 驗證。
3. 呼叫 domain 計算餘額影響。
4. 在單一資料庫交易內，寫入交易列並套用餘額變動。

新增交易邊界機制（例如 `runInTransaction` port），由 application 宣告、infrastructure 實作。

`SqliteTransactionRepository` 只負責持久化。相依一律由 constructor 注入。

### 驗收方式

- application 層測試能用假 repository 覆蓋全部 5 種交易類型的餘額影響，執行時不開啟 SQLite。
- `src/infrastructure` 內搜尋不到 `calculateAccountBalanceEffects`、`validateFinancialTransaction`。
- Sprint 02 全部驗收案例行為不變。

### 不要做

不改 schema、不改 UI、不改 domain 的規則內容，只搬移呼叫位置。

## T-21　拆開驗證與餘額計算，移除 `allowInactive`

### 問題

`calculateAccountBalanceEffects()` 內部第一行就呼叫 `validateFinancialTransaction()`，兩件事被綁在一起。因此反轉舊交易影響時（更新或刪除），若該交易的分類或帳戶後來被停用，計算就會失敗。

目前的解法是傳 `allowInactive` 旗標，並在 `sqlite-transaction-repository.ts:281` 用 `{ ...category, isActive: true }` 偽造狀態繞過檢查。程式中仍有 7 處相關程式碼。

### 期望做法

- `validateFinancialTransaction()`：只驗證，用於新增與修改的新值。
- `computeAccountBalanceEffects()`：只計算，不驗證。
- 反轉既有交易影響時只計算，不驗證。既有交易寫入時已驗證過。
- 停用的帳戶或分類不得阻止使用者刪除或修改既有交易。
- `allowInactive` 與所有偽造 `isActive` 的程式碼一併移除。

### 驗收方式

新增測試：

- 分類停用後，仍可刪除使用該分類的舊交易，且帳戶餘額正確反轉。
- 帳戶停用後，仍可刪除涉及該帳戶的舊交易。
- 新增交易時，停用的帳戶或分類仍必須被拒絕。

全專案搜尋不到 `allowInactive`，也搜尋不到硬寫的 `isActive: true` 覆蓋。

## T-22　修正時間權威

### 問題

`sqlite-transaction-repository.ts:264` 回傳 `now: transaction.updatedAt`。「交易不得為未來時間」這條規則實際上是拿交易自己的欄位在比對。

另外 `financialMonthFromDate()` 與 `calculateMonthlyTransactionSummary()` 都用本機時區推導月份。

### 期望做法

- 由 application 層注入時鐘，`now` 只有這一個來源。
- domain 只接受傳入的 `now`。
- 禁止再用任何資料欄位代替 `now`。
- 財務月份以固定時區 `Asia/Taipei` 計算，集中在單一函式。

### 驗收方式

- 測試能注入固定時鐘。
- 跨月邊界測試：當地時間月初 `00:30` 與月末 `23:30` 的交易，月份歸屬正確。
- `occurredAt` 晚於注入的 `now` 一秒即被拒絕。

## T-23　把商業政策從 Repository 提升到 Application

以下兩項由 Sprint 02 自我審查主動提出，方向正確，本 Sprint 一併處理：

1. 「使用中的自訂類型不能停用」目前主要在 `sqlite-financial-item-custom-type-repository.ts:104` 判斷。改為 Repository 只提供使用數量，決策移至 Application。
2. 「系統預設類型不可修改或刪除」同樣主要由 Repository 保護。資料庫防線可保留為第二道，但 Application 必須先提供同樣規則。

### 驗收方式

兩項規則都有 application 層測試，使用假 repository，不開資料庫即可覆蓋。

## T-24　把每日收支計算移出 Renderer

### 問題

`calculateDailyBalance` 位於 `TransactionsView.tsx:950`。「每日收入減支出」是財務計算，卻放在畫面層，沒有任何自動化測試，而且與 domain 的月度統計形成兩套重複規則。

違反 `AGENTS.md`「重要財務計算必須有自動化測試」與 `00_Architecture_Rules.md` 第 1.4 節。

### 期望做法

- 移至 domain。
- **與月度統計共用同一套「哪些交易類型算收入／支出」的判斷**，不得各寫一份。
- 補單元測試，至少涵蓋：只有收入、只有支出、含轉帳、含信用卡消費、含信用卡繳款、空清單。

### 驗收方式

- Renderer 內不存在任何金額加總或收支判斷邏輯。
- 每日與月度統計對同一批資料的判斷結果一致，並有測試證明。

## T-25　錯誤代碼化

### 問題

兩個檔案都用英文訊息內容判斷要顯示哪句中文。

`TransactionsView.tsx:1060` 起：`includes('future')`、`includes('negative')`、`includes('category')`、`includes('account')`。

`App.tsx:1331` 起更多，且包含：

```
error.message.includes('UNIQUE constraint')   // ← SQLite 的原始錯誤字串
error.message.includes('greater than zero')
error.message.includes('allowed maximum')
error.message.includes('safe integer')
error.message.includes('same name')
error.message.includes('Built-in')
error.message.includes('used by')
```

### 影響

- 任何訊息措辭調整都會讓中文提示悄悄失效，且不會有測試失敗。
- 錯誤經過 IPC 會被 Electron 包裝，比對本來就不可靠。
- 沒命中關鍵字時使用者可能看到英文技術訊息。
- **`UNIQUE constraint` 這條特別嚴重**：畫面層在比對 SQLite 引擎產生的字串，等於資料庫實作細節穿透到 UI。

### 期望做法

- 定義帶代碼的錯誤型別（`code` 必填，可附 `details`）。
- 代碼集中於單一模組，例如 `src/shared/error-codes.ts`。
- 資料庫層級的錯誤（唯一索引衝突等）必須在 infrastructure 轉成代碼，不得外流。
- IPC 傳遞保留代碼。
- renderer 依代碼查中文文案表。
- 未知代碼顯示通用中文訊息。

至少涵蓋：未來時間、餘額不得為負、分類無效或停用、帳戶無效或停用、金額超出範圍、找不到資料、名稱或備註過長、名稱重複、內建項目不可刪除、已被使用不可刪除。

### 驗收方式

- `TransactionsView.tsx` 與 `App.tsx` 都不存在對錯誤訊息內容的字串比對。
- renderer 內不存在任何資料庫字眼（`UNIQUE constraint`、`SQLITE` 等）。
- 每個代碼都有中文文案，並有測試檢查「所有代碼都有文案」。
- 現有錯誤顯示情境行為與現在一致。

## T-26　migration 紀律

### 說明（已更正）

`bootstrap-database.ts:142` 的 migration v5 與 v4 的預設分類 `INSERT` 內容相同。經確認，**這不是竄改已套用 migration 後的補救**，而是因為舊版介面曾允許刪除預設分類，v5 是以 `INSERT OR IGNORE` 補回資料的**資料修復 migration**。這是合理做法。

### 做法

- **不要刪除或修改 v4、v5。**
- 在 v5 區塊加註解，說明它是資料修復而非重複內容，避免未來被誤刪。
- 在 `04_Decision_Log.md` 記錄由來，並確立「已套用的 migration 不得修改，只能新增」。
- 確認預設分類寫入可重複執行而不產生重複列。
- 確認舊版允許刪除預設分類的路徑已封閉（若尚未封閉，回報，不要自行改動 UI）。

### 驗收方式

- 連續開啟資料庫兩次，預設分類數量仍為 15 筆。
- 從空資料庫套用全部 migration 後，schema 與分類資料正確。

---

# 階段 3　介面拆分

## T-30　拆分 App.tsx 與 TransactionsView.tsx

### 問題

- `src/renderer/App.tsx`：1386 行，20 個 `useState`。
- `src/renderer/TransactionsView.tsx`：1077 行，10 個 `useState`。

Sprint 02 期間已抽出 `MoneyAmount.tsx`、`IconButton.tsx`，方向正確但遠遠不足。

### 期望做法

依 `00_Architecture_Rules.md` 第 6 節，拆到單檔 300 行、單元件 8 個 state 以內。採自我審查提出的切分方式：

`TransactionsView.tsx` 拆為 `TransactionForm`、`TransactionList`、`TransactionDayGroup`、`AccountBalanceStrip`、`useTransactionMonth`。

`App.tsx` 至少拆出管理彈窗與資產表單。

共用元件放 `src/renderer/components`。文案集中，不散落於元件內。

### 前置條件

**T-10 與 T-11 必須先完成並實際通過。** 沒有有效的端到端測試就不得開始本項。

### 驗收方式

- 沒有 `.tsx` 檔案超過 300 行。
- 沒有元件超過 8 個 `useState`。
- **拆分前後 E2E 完全相同且通過。** 版面、樣式、焦點行為、鍵盤操作不得有任何變化。
- 本項單獨 commit，不與其他階段混合。

### 不要做

不改樣式與版面、不順手改行為、不引入任何狀態管理套件。

---

# 階段 4　驗證與回報

## T-40　執行

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run package`
- `npm.cmd run test:e2e`

**回報必須附上實際輸出。** Sprint 02 曾出現「以 smoke test 代替完整驗收」的情況，本 Sprint 不接受同樣處理。若某項確實無法執行，明確說明原因並列為未完成，不得以其他測試替代後宣告完成。

## T-41　回報格式

除 `AGENTS.md` 既有要求外，必須逐條回答：

1. 這次有沒有為了讓測試通過或繞過設計而加的變通做法？全部列出來。
2. 這次有沒有修改到已經存在的 migration、既有測試或既有對外介面？
3. 這次新增或搬移的邏輯放在哪一層？為什麼放那裡？
4. 哪些地方你認為下個 Sprint 會需要重寫？
5. 有沒有任何地方偏離了文件？

**額外要求：** 第 1 題必須明確檢查是否有「自己認為合理、因此沒列出」的設計選擇。Sprint 02 的自我審查漏掉了 `allowInactive`、`updatedAt` 代替 now、錯誤訊息字串比對這三項，共同特徵是它們在當時被認為已解決。

---

## Definition of Done

- 對使用者可見的行為完全不變（T-25 的錯誤訊息穩定性除外）。
- Sprint 01／02 的全部驗收案例仍可通過，且**有實際執行的證據**。
- 淨資產、帳戶餘額、月度統計在整理前後完全一致。
- T-00 至 T-30 的驗收方式全部達成。
- `00_Architecture_Rules.md` 第 11 節的結構性完成定義全部符合。
- typecheck、lint、單元測試、E2E、Windows production package 全部通過並附輸出。
- 回報包含上述五個問題的答案與額外要求。

## 不在本 Sprint 範圍

- 任何新功能。
- 任何 UI 行為、版面或樣式變更。
- 交易篩選、分類重新指派 UI（G-06，Sprint 03）。
- 電子錢包型別（G-01，Sprint 03）。
- 資料狀態選單調整（G-04，Sprint 03）。
- 手續費綁定父轉帳（G-05，Sprint 03）。
- 帳戶餘額模型改為「期初 + 交易 + 調整」（Sprint 03 以後，需先討論）。
- Mutation 後回傳完整列表的改法（MVP 可接受）。
- 資料庫加密、Gmail／PDF 匯入、第二層分類、定期交易、投資交易。
- 效能優化（例如月度統計改為 SQL 聚合）。

## 已知風險

- T-20 與 T-21 會同時觸及三層與其測試，是風險最高的部分。建議完成後先驗證一輪，再進入階段 3。
- T-30 是大量機械性搬移，最容易無意間改到行為。必須靠 E2E 把關，且單獨 commit。
- **階段 1 若未真正完成就進入階段 2 或 3，本 Sprint 的所有驗收都失去意義。** 若 E2E 遲遲無法穩定執行，停下來回報，不要繼續往下做。
- G-01、G-04、G-05、G-06 已決議但排在 Sprint 03。本 Sprint 若順手實作，視為超出範圍，必須退回。
