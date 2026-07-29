# Sprint 2.5：技術整理（不新增任何功能）

## 文件資訊

- 版本：1.3
- 日期：2026-07-28
- 狀態：階段 0 至階段 4 已完成，等待確認後合併
- 分支：`codex/sprint-02-5`（從 Sprint 02 合併後的 main 開出）
- 依據文件：`00_Architecture_Rules.md` v1.2、`00_Glossary.md` v1.1、`04_Decision_Log.md`
- 對應程式狀態：commit `0a628d2`

### 修訂紀錄

**1.3（2026-07-28）** 實作完成後補入：

- 新增「執行進度」對照表，列出每一項的完成狀態與對應 commit。
- **新增 T-42 撰寫 Sprint 2.5 Review。** 原計畫遺漏 Sprint Review，與 Sprint 01、Sprint 02 的慣例不一致，此為計畫本身的缺漏。

**1.2（2026-07-28）** 依第二輪審查修正四處：

- **分支順序修正。** 原版本要求在 `codex/sprint-02` 分支上執行階段 0（含 T-05 的 UI 文案修正），但那些工作並不屬於 Sprint 02。現改為先合併、再開分支、再執行階段 0。
- **T-26 自相矛盾修正。** 原版本一邊禁止修改已套用的 migration，一邊要求在 v4、v5 區塊加註解。現改為註解只能放在 migration 資料結構之外。
- **T-24 驗收收窄。** 原版本要求 renderer「不存在金額比較或收支類型判斷」，但 Architecture Rules 1.4 明確允許 renderer 依資料決定顏色與圖示，而綠增紅減是已確認的設計（DEC）。現區分財務結論與純視覺映射。
- **T-00 驗收措辭修正。** 新增未提交的 `.gitattributes` 本身就會讓 `git status` 非空，原措辭不精確。

**1.1（2026-07-28）** 依開工前的規範審查回報修正。原版本有兩處事實錯誤與多處遺漏：

- **刪除原 T-00「清理 Git 雜訊」。** 原版本聲稱工作區有 42 個檔案、約 18500 行換行差異需要正規化。**此描述不成立。** repo 儲存為 LF，Windows 工作區為 CRLF，Git for Windows 的 `core.autocrlf` 會自動處理，工作區實際是乾淨的。原描述來自一個未設定 `core.autocrlf` 的觀測環境所產生的假象。現改為只新增 `.gitattributes`，不執行任何正規化。
- **階段 2 內部順序調整**為 T-21 → T-22 → T-20 → T-23 → T-24 → T-25 → T-26。原順序先做 T-20，會導致 T-21、T-22 之後再次改動同一批介面，造成重工。
- **新增階段 0 的 T-05**：「類型／分類」UI 文案修正（G-07）。原版本的「不得改 UI 文案」與術語表第 4 節直接衝突，已裁決為明確例外。
- 補入四項原本遺漏的違規：renderer 判斷餘額是否足夠、renderer 自行判斷可收付款帳戶、renderer 自行取得現在時間、共用元件位置不符。
- T-25 補上跨 IPC 錯誤序列化的明確要求。
- T-11 與 T-40 的測試腳本矛盾已解決。
- T-26 補上 Migration 4 的歷史例外記錄。

**1.0（2026-07-28）** 初版。

## 執行進度

| 階段 | 項目 | 狀態 | Commit |
|---|---|---|---|
| 0 | T-00 換行宣告（未做正規化） | ✓ | `7381914` |
| 0 | T-05 「類型／分類」文案修正 | ✓ | `7381914` |
| 0 | T-01 Sprint 02 Review | ✓ | `7381914` |
| 0 | T-02 文件狀態修正 | ✓ | `7381914` |
| 0 | T-03 補記 DEC-025～DEC-031 | ✓ | `7381914` |
| — | 合併 sprint-02 → main，開 sprint-02-5 | ✓ | `87646fb` |
| 1 | T-10 修好失效 E2E（含改壞驗紅） | ✓ | `aed7f1c` |
| 1 | T-11 重建 E2E 架構（腳本三分） | ✓ | `aed7f1c` |
| 1 | 補資產負債流程覆蓋、修正測試競速 | ✓ | `2b850fe` |
| 2 | T-21 拆開驗證與計算，移除 `allowInactive` | ✓ | `e25acba` |
| 2 | T-22 單一時鐘與 `Asia/Taipei` 月份 | ✓ | `e25acba` |
| 2 | T-20 use case 編排移回 application | ✓ | `e25acba` |
| 2 | T-23 商業政策移至 application | ✓ | `8dba9f0` |
| 2 | T-24 財務判斷移出 renderer | ✓ | `8dba9f0` |
| 2 | T-26 migration 紀律（含雜湊固定測試） | ✓ | `8dba9f0` |
| 2 | T-25 錯誤代碼化與 IPC 序列化 | ✓ | `3cd823d` |
| 3 | T-30 介面拆分 | ✓ | `9d859bf` |
| 4 | T-40 完整驗證並附輸出 | ✓ | 本次收尾 commit |
| 4 | T-41 五問回報 | ✓ | 本次收尾 commit |
| 4 | T-42 撰寫 Sprint 2.5 Review | ✓ | 本次收尾 commit |
| — | 合併 sprint-02-5 → main | ✓ | `c3f02f6` |

## Sprint Goal

在不改變任何對使用者可見的行為前提下（例外見下），修正 Sprint 01／02 已產生的結構性問題，並補回缺失的自動化安全網，讓 Sprint 03 能站在乾淨的地基上。

## 最重要的前提

**本 Sprint 不得新增任何功能，不得改變 UI 版面、樣式或互動行為。**

判斷標準：Sprint 02 的所有驗收案例，在本 Sprint 前後的操作步驟與結果必須一致。

**可見變更的例外僅有兩項，不得再自行擴充：**

1. **T-05**　收入／支出的「類型」字樣改為「分類」（G-07）。純字串，不動版面。
2. **T-25**　錯誤訊息改為代碼驅動。訊息會變得更穩定正確，語意必須與現在一致。

除此之外任何會改變使用者所見的修改，一律停止並回報。

## 執行順序

```text
開工前　合併 codex/sprint-02 → main，再從 main 開 codex/sprint-02-5
階段 0　文件校正與格式宣告（在 codex/sprint-02-5 分支）
階段 1　修復自動化安全網   ← 必須先做，後面全靠它把關
階段 2　架構修正
階段 3　介面拆分
階段 4　驗證與回報
```

### 開工前：合併與分支

1. commit 本批文件修訂（`00_Architecture_Rules.md` v1.2、`00_Glossary.md` v1.1、`09_Sprint_02_5_Plan.md` v1.2、`AGENTS.md`），單獨一個 commit，只含文件。
2. 合併 `codex/sprint-02` → `main`。Sprint 02 以它實際完成的樣子合併，不在該分支上追加任何整理工作。
3. 從 `main` 開出 `codex/sprint-02-5`。
4. **階段 0 以後的所有工作都在 `codex/sprint-02-5` 上進行**，包含 Sprint 02 Review 的撰寫與文件狀態修正。

理由：Sprint 02 Review、文件狀態修正與 T-05 的文案修正都不是 Sprint 02 產出的東西，放在 Sprint 02 分支上會讓版本歷史失真。歷史應該讀起來是「Sprint 02 帶著這些問題交付；Sprint 2.5 修好並記錄了它們」。

**階段之間順序嚴格，不可調換。階段內除特別註明外可調整。**

**階段 1 先於一切的理由：** Sprint 02 的 Electron 驗收實際上沒有跑完，而現有 E2E 的 selector 已經失效（測試找「管理類型與分類」，畫面已改為「管理類型」）。目前**沒有任何有效的端到端把關**。在這個狀態下做階段 2 與階段 3 的搬移，等於沒有安全網走鋼索。

---

# 階段 0　文件校正與格式宣告

**本階段在 `codex/sprint-02-5` 分支上執行，不在 `codex/sprint-02` 上。**

## T-00　宣告換行格式（不做正規化）

### 說明（v1.1 已更正）

**不要執行全庫格式正規化。** 原計畫的「42 檔換行雜訊」不存在。

### 做法

- 新增 `.gitattributes`，明文宣告文字檔以 LF 儲存，避免未來在未設定 `core.autocrlf` 的機器上產生假差異。
- 加入後檢查工作區：**除 `.gitattributes` 本身之外，若沒有其他檔案出現換行差異，就到此為止，不要製造任何正規化 commit。**
- 若真的有其他檔案出現差異，先回報實際情況與檔案清單再決定，不要自行執行全庫改寫。

## T-05　「類型／分類」文案修正

### 依據

`00_Glossary.md` G-07。術語表規定「類型」只用於資產／負債，「分類」只用於收入／支出，但畫面目前混用。

### 做法

- 將收入／支出相關的「類型」字樣改為「分類」，包含「收入類型」「支出類型」「新增類型」及收支表單欄位標籤。
- 資產／負債的「類型」字樣**不動**，那是正確的。
- 同步修正所有受影響的 E2E selector。
- 不改任何版面、樣式、欄位順序或互動行為。

### 為什麼放在階段 0

E2E selector 會引用這些文字。在階段 1 重建 E2E 之前改完，selector 只需要寫一次。

## T-01　撰寫 Sprint 02 Review

建立 `docs/08_Sprint_02_Review.md`，內容至少涵蓋以下項目。**這些是合併前必須留下的記錄，不得省略或淡化。**

### 已完成

核心收入／支出流程、自訂類型與分類、SQLite 交易一致性、月度統計。

### 未完成（已決議移至 Sprint 03，見 G-06）

1. 交易篩選（依交易類型或分類）。
2. 分類重新指派後刪除的 UI 流程。底層 `reassignAndDelete` 已存在，但管理畫面刪除時只呼叫一般 `delete`，因此**使用中的自訂收支分類目前無法刪除**。

### 已知問題（Sprint 2.5 處理）

3. Electron 端到端驗收未實際完成，以 5 秒啟動 smoke test 代替。
4. 現有 E2E selector 已失效。
5. `calculateDailyBalance` 在 renderer 做財務計算，無自動化測試，且與 domain 的月度統計形成兩套重複規則。
6. renderer 直接比較支出金額與帳戶餘額決定是否顯示「餘額不足」。
7. renderer 自行用 `account.type === 'bank_deposit' || 'cash'` 判斷可收付款帳戶，違反單一轉換點。
8. renderer 多處自行 `new Date()` 決定目前月份、日期上限與預設時間。
9. 交易的餘額編排邏輯位於 SQLite Repository。
10. `allowInactive` 旗標與偽造 `isActive` 狀態。
11. 以 `updatedAt` 代替現在時間做未來交易判斷。
12. 財務月份依本機時區推導，未固定 `Asia/Taipei`。
13. 錯誤訊息以英文字串比對決定中文文案，其中一處比對 SQLite 原始錯誤訊息。
14. `App.tsx` 與 `TransactionsView.tsx` 遠超結構上限，文案未集中，共用元件未放入 `components/`。
15. Application 層測試多數開啟真實 SQLite，實質上是 integration 測試。

### 文件不一致（Sprint 2.5 處理）

16. `03_Business_Rules.md` 仍寫「支出若選擇信用卡付款，系統仍必須依信用卡消費規則增加待繳金額」，而 DEC-023 已停止提供該入口。
17. `03_Business_Rules.md` 對「已被使用的自訂類型或分類可停用」與「使用中的資產／負債類型不得停用」未區分適用對象。
18. `07_Sprint_02_Plan.md` 標記「已完成」，但上述未完成項並未達成。

### 環境相關變通（記錄即可，不需修正）

19. E2E 加入 `--disable-gpu`，因開發版 Electron 出現 GPU subprocess crash。
20. `.gitignore` 排除 `.codex-temp/`，因 Windows 鎖住 Electron 暫存目錄。

### 階段性相容做法（刻意保留，記錄備查）

21. 主畫面隱藏轉帳與信用卡入口，底層保留（DEC-021 至 DEC-024）。
22. 編輯既有資料時臨時插入「信用卡（既有）」選項。
23. 收入／支出的帳戶為選填，因此「收支流水總額 ≠ 資產餘額變化」。未來報表必須明確區分已連結帳戶與未指定帳戶。

## T-02　修正文件狀態

- 修正 `07_Sprint_02_Plan.md` 的完成狀態標記，反映實際範圍。
- 第 4 節交易類型清單由 6 項改為 5 項，註明轉帳手續費以一筆普通支出表示（G-02）。
- 第 9 節交易篩選、第 3 節分類重新指派 UI 標記為移至 Sprint 03（G-06）。
- 修正 `03_Business_Rules.md` 上述兩處（第 16、17 項）。**只做文字澄清，不改變任何已確認的財務規則。若發現澄清會改變規則語意，停止並回報。**

## T-03　補記決策紀錄

在 `04_Decision_Log.md` 新增七筆決議，內容以 `00_Glossary.md` 第 5 節為準，**逐條照抄，不得改寫或省略連動規則**：

- G-01　電子錢包採新增型別（Sprint 03）
- G-02　轉帳手續費為普通支出，交易類型固定 5 種
- G-03　期初餘額不進資料模型
- G-04　資料狀態使用者只能選兩個（Sprint 03）
- G-05　手續費綁定父轉帳並連動刪除（Sprint 03）
- G-06　交易篩選與分類重新指派 UI 移至 Sprint 03
- G-07　「類型／分類」文案修正列為 Sprint 2.5 例外

另補記：

- Migration 4 同時包含 schema 與 seed，為規範建立前的歷史例外，保留不動。
- Migration 5 為資料修復 migration，保留不動。
- 「已套用的 migration 不得修改，只能新增」正式成為規則。

---

# 階段 1　修復自動化安全網

## T-10　修好失效的 E2E

### 問題

`tests/e2e/app.e2e.ts:173` 尋找標題「管理類型與分類」，`App.tsx:1105` 已改為「管理類型」。該測試必然失敗或從未被執行。

### 做法

- 修正所有已過期的 selector（含 T-05 造成的文案變更）。
- 檢查是否還有其他 selector 與現行畫面不符，一併列出並修正。
- **確認測試真的會執行且真的會失敗**：先故意改壞一處受測邏輯，確認測試變紅，再改回。

### 驗收方式

回報必須附上測試實際執行的輸出，以及「故意改壞會變紅」的驗證結果。不接受「應該可以跑」。

## T-11　重建 E2E 架構

### 問題

Sprint 02 的 Electron 驗收沒有實際完成，改用 73 項單元測試加 5 秒啟動 smoke test 代替。完整收支流程沒有任何自動化操作驗證。

### 說明

這一項本身接近一個小型測試基礎建設工作，不是只修幾個 selector。成本已被評估為偏高但值得，屬本 Sprint 必要範圍。

### 做法

分成三層，並**同步調整 npm scripts 以解除與 GPU 問題的相依**：

| script | 內容 | 穩定性要求 |
|---|---|---|
| `test:e2e` | Playwright 瀏覽器環境 + mock `window.financeHub`，驗證表單、列表、錯誤提示、焦點行為 | 必須穩定通過，列入 DoD |
| `test:package-smoke` | 驗證 Windows 封裝產物能啟動、開啟主視窗、初始化資料庫 | 必須穩定通過，列入 DoD |
| `test:electron` | 少量 Electron 整合測試 | 現階段不擴充，允許不穩定，**不列入 DoD** |

`test:e2e` 不得再指向受 GPU 問題影響的 Electron Playwright 測試。

### 驗收方式

Sprint 02 的七個使用案例（US-01 至 US-07）都有對應的自動化測試並實際通過：收入、支出、轉帳、信用卡消費、信用卡繳款、修改、刪除。

**轉帳與信用卡的主要畫面入口目前是隱藏的（DEC-021 至 DEC-024）。這幾項以 application 或 IPC 層測試覆蓋即可，不得為了測試而重新打開 UI 入口。**

---

# 階段 2　架構修正

**本階段順序經審查後調整，建議依序執行：T-21 → T-22 → T-20 → T-23 → T-24 → T-25 → T-26。**

理由：T-20 需要使用乾淨的 domain API。若先做 T-20，之後 T-21 與 T-22 會再次改動 application 與 repository 介面，造成重工。T-25 放在架構搬移穩定之後，才知道錯誤真正從哪一層產生。

## T-21　拆開驗證與餘額計算，移除 `allowInactive`

### 問題

`calculateAccountBalanceEffects()` 內部第一行就呼叫 `validateFinancialTransaction()`。因此反轉舊交易影響時（更新或刪除），若分類或帳戶後來被停用，計算就會失敗。

目前的解法是傳 `allowInactive` 旗標，並在 `sqlite-transaction-repository.ts` 第 240、281、335 行附近用 `{ ...category, isActive: true }` 偽造狀態。

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

## T-22　建立單一時鐘與月份函式

### 問題

- `sqlite-transaction-repository.ts:264` 使用 `now: transaction.updatedAt`，拿資料自身欄位當現在時間。
- `sqlite-transaction-repository.ts:378` 與 `TransactionsView.tsx:927` 都用本機時區的 `new Date()` / `getMonth()` 推導月份。
- `TransactionsView` 另有多處自行 `new Date()` 決定目前月份、可輸入日期上限與預設財務時間。

### 期望做法

- 由 application 層注入時鐘，`now` 只有這一個來源。
- domain 只接受傳入的 `now`。
- **renderer 不得自行取得現在時間做財務判斷**，目前月份、日期上限、預設財務時間一律由 application 提供。
- 禁止用任何資料欄位代替 `now`。
- 財務月份以固定時區 `Asia/Taipei` 計算，集中在單一函式，所有需要月份的地方都呼叫它。

### 驗收方式

- 測試能注入固定時鐘。
- 跨月邊界測試：當地時間月初 `00:30` 與月末 `23:30` 的交易，月份歸屬正確。
- `occurredAt` 晚於注入的 `now` 一秒即被拒絕。
- renderer 內搜尋不到用於財務判斷的 `new Date()`。

## T-20　把 use case 編排移回 application 層

### 問題

`sqlite-transaction-repository.ts:123` 起，`create()`、`update()`、`delete()` 各自呼叫 domain 的 `calculateAccountBalanceEffects()`，`applyEffects()` 直接修改財務項目餘額；constructor 第 52、53 行自行 `new SqliteFinancialItemRepository(database)` 與 `new SqliteCategoryRepository(database)`。

`transaction-service.ts` 只做輸入解析就轉手。

### 說明

Sprint 02 的自我審查曾認為這是「資料持久化與 atomic update，放這層合理」。**這個判斷不正確。** atomic update 的機制屬於 infrastructure，但「一筆交易要影響哪些帳戶」是業務決定，屬於 application。

開工前的規範審查已確認此項違反 Architecture Rules 1.2、1.3、1.6。

### 期望做法

`TransactionService` 承擔完整 use case：

1. 讀取本次交易涉及的財務項目與分類。
2. 呼叫 domain 驗證。
3. 呼叫 domain 計算餘額影響。
4. 在單一資料庫交易內，寫入交易列並套用餘額變動。

新增交易邊界機制（例如 `runInTransaction` port），由 application 宣告、infrastructure 實作。

`SqliteTransactionRepository` 只負責持久化。相依一律由 constructor 注入。

### 同時處理

- **可收付款帳戶的判斷收攏到單一函式。** renderer 目前自行用 `account.type === 'bank_deposit' || account.type === 'cash'` 判斷，違反 Glossary 第 4 節。應改為由 application 提供已判定的清單。
- **Application 測試改用假 repository。** 目前 `transaction-service.test.ts` 等會開啟真實 SQLite，實質上是 integration 測試。搬移 use case 後，application 測試必須能在不開資料庫的情況下覆蓋全部 5 種交易類型。原有的 SQLite 測試可保留為 infrastructure 層 integration 測試，但不得取代 application 測試。

### 說明：本項為全 Sprint 風險最高

此項不是搬幾個函式，而是交易寫入架構重組，會觸及：交易邊界 port、財務項目查詢與寫入 port、分類載入、application 編排、SQLite adapter、更新與刪除的反轉流程、application 假 repository、infrastructure rollback 測試。

建議完成後先完整驗證一輪，再進行後續項目。

### 驗收方式

- application 層測試能用假 repository 覆蓋全部 5 種交易類型的餘額影響，執行時不開啟 SQLite。
- `src/infrastructure` 內搜尋不到 `calculateAccountBalanceEffects`、`validateFinancialTransaction`。
- renderer 內搜尋不到 `bank_deposit`、`cash` 等型別字面值的判斷。
- Sprint 02 全部驗收案例行為不變。

### 不要做

不改 schema、不改 UI、不改 domain 的規則內容，只搬移呼叫位置與相依關係。

## T-23　把商業政策從 Repository 提升到 Application

以下兩項由 Sprint 02 自我審查主動提出，方向正確：

1. 「使用中的自訂類型不能停用」目前主要在 `sqlite-financial-item-custom-type-repository.ts:104` 判斷。改為 Repository 只提供使用數量，決策移至 Application。
2. 「系統預設類型不可修改或刪除」同樣主要由 Repository 保護。資料庫防線可保留為第二道，但 Application 必須先提供同樣規則。

### 驗收方式

兩項規則都有 application 層測試，使用假 repository，不開資料庫即可覆蓋。

## T-24　把財務判斷移出 Renderer

### 問題

1. `calculateDailyBalance` 位於 `TransactionsView.tsx:950`。「每日收入減支出」是財務計算，卻放在畫面層，沒有自動化測試，而且與 domain 的月度統計形成兩套重複規則。
2. renderer 直接以 `Number(draft.amount) > selectedExpenseAccount.amount` 判斷是否顯示「餘額不足」。這是財務判斷，不應只存在畫面層。

### 期望做法

- 每日收支計算移至 domain，**與月度統計共用同一套「哪些交易類型算收入／支出」的判斷**，不得各寫一份。
- 「餘額是否足夠」的判斷改由 domain 或 application 提供結果，renderer 只負責顯示。
- 補單元測試，至少涵蓋：只有收入、只有支出、含轉帳、含信用卡消費、含信用卡繳款、空清單。

### 驗收方式

- **renderer 內不存在會產生財務結論或影響商業規則的金額加總、金額比較或收支類型判斷。**
- 每日與月度統計對同一批資料的判斷結果一致，並有測試證明。

### 明確允許保留在 renderer 的（v1.2 澄清）

原版本的驗收文字比 Architecture Rules 1.4 更嚴，會誤禁以下正當用法：

- **依交易類型決定顏色與圖示**（綠增紅減是已確認的設計決定），這是純視覺映射，不是財務判斷。
- 純計數：筆數、輸入框剩餘字數。
- 分頁、排序、展開收合等呈現狀態。

判斷標準仍以 Architecture Rules 1.4 為準：**這個數字或結論如果算錯，使用者會不會對自己的財務狀況產生錯誤認知？** 顏色錯了是顯示問題，金額或「餘額是否足夠」錯了才是財務問題。

## T-25　錯誤代碼化

### 問題

`TransactionsView.tsx:1060` 起與 `App.tsx:1331` 起，都用英文訊息內容判斷要顯示哪句中文，包含：

```
error.message.includes('UNIQUE constraint')   // ← SQLite 的原始錯誤字串
error.message.includes('future')
error.message.includes('negative')
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
- 資料庫層級的錯誤（唯一索引衝突等）必須在 infrastructure 轉成代碼，原始訊息不得外流。
- **跨 IPC 必須明確序列化。** Electron 的 IPC 不會自動保留自訂 Error 的額外屬性，因此不能只定義一個 Error 子類別就算完成。main 端必須把錯誤轉成明確結構（例如 `{ ok: false, code, details }`）或以已知方式序列化，renderer 端必須能穩定取回代碼。**此項必須有測試證明代碼確實跨越了 IPC 邊界。**
- renderer 依代碼查中文文案表。
- 未知代碼顯示通用中文訊息。

至少涵蓋：未來時間、餘額不得為負、分類無效或停用、帳戶無效或停用、金額超出範圍、找不到資料、名稱或備註過長、名稱重複、內建項目不可刪除、已被使用不可刪除。

### 說明

此項會跨越 domain、application、infrastructure、main IPC、preload、shared contract、renderer 與測試共八處，成本偏高。已評估為必要範圍。

### 驗收方式

- `TransactionsView.tsx` 與 `App.tsx` 都不存在對錯誤訊息內容的字串比對。
- renderer 內不存在任何資料庫字眼（`UNIQUE constraint`、`SQLITE` 等）。
- 每個代碼都有中文文案，並有測試檢查代碼與文案一一對應。
- 有測試證明錯誤代碼能正確跨越 IPC。
- 現有錯誤顯示情境的語意與現在一致。

## T-26　migration 紀律與歷史例外

### 說明（已更正）

`bootstrap-database.ts:142` 的 migration v5 與 v4 的預設分類 `INSERT` 內容相同。經確認，**這不是竄改已套用 migration 後的補救**，而是因為舊版介面曾允許刪除預設分類，v5 是以 `INSERT OR IGNORE` 補回資料的**資料修復 migration**。這是合理做法。

另外 Migration 4 同時包含 schema 變更與預設資料寫入，不符合現行規範的「一個 migration 一件事」。這是規範建立前的既成事實。

### 做法

- **不要刪除或修改任何已套用的 migration，包含 v4 與 v5。**
- **註解不得寫在 migration 定義區塊內部（v1.2 更正）。** 原版本要求在 v4、v5 區塊加註解，與「不得修改」自相矛盾。改為：說明文字放在 `MIGRATIONS` 資料結構**之外**，例如檔案頂部的說明區塊，列出已知歷史例外與其原因。migration 陣列內部一個字都不動。
- 主要記錄以 `04_Decision_Log.md` 為準（T-03 已含）。
- 確認舊版允許刪除預設分類的路徑已封閉。**若尚未封閉，回報，不要自行改動 UI。**

### 驗收方式

依 Architecture Rules 9.1 的三條要求：

1. 同一資料庫連續開啟兩次，不重複套用 migration，預設分類仍為 15 筆。
2. 預設資料寫入可安全重複執行。
3. 從空資料庫套用全部 migration 後，schema 與分類資料正確。

**不要求「每個 migration 個別重跑」** —— 含 `CREATE TABLE` 的 migration 重跑必然失敗，冪等性由 `schema_migrations` 保證。

---

# 階段 3　介面拆分

## T-30　拆分 App.tsx 與 TransactionsView.tsx

### 問題

- `src/renderer/App.tsx`：約 1383 行。
- `src/renderer/TransactionsView.tsx`：約 1070 行。
- 兩者的 `useState` 數量都超過 8 個上限。
- `MoneyAmount.tsx`、`IconButton.tsx` 放在 `src/renderer` 根目錄，應在 `src/renderer/components`。
- 大量中文文案直接寫在元件內，未集中。

### 期望做法

依 `00_Architecture_Rules.md` 第 6 節拆到單檔 300 行、單元件 8 個 state 以內。採自我審查提出的切分方式：

`TransactionsView.tsx` 拆為 `TransactionForm`、`TransactionList`、`TransactionDayGroup`、`AccountBalanceStrip`、`useTransactionMonth`。

`App.tsx` 至少拆出管理彈窗與資產表單。

同時：

- 共用元件移至 `src/renderer/components`。
- 文案集中至 labels / messages 模組。
- 保留焦點與鍵盤行為。
- **保持 CSS selector 不變**，避免樣式失效。

### 前置條件

**T-10 與 T-11 必須先完成並實際通過。** 沒有有效的端到端測試就不得開始本項。

### 驗收方式

- 沒有 `.tsx` 檔案超過 300 行。
- 沒有元件超過 8 個 `useState`。
- **拆分前後 E2E 完全相同且通過。** 版面、樣式、焦點行為、鍵盤操作不得有任何變化。
- 本項單獨 commit，不與其他階段混合。

### 不要做

不改樣式與版面、不順手改行為、不引入任何狀態管理套件。300 行為機械門檻，不接受個案協商。

---

# 階段 4　驗證與回報

## T-40　執行

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run package`
- `npm.cmd run test:e2e`（瀏覽器 UI 流程）
- `npm.cmd run test:package-smoke`（封裝啟動）

`test:electron` 現階段允許不穩定，**不列入 DoD**，但需回報其狀態。

**回報必須附上實際輸出。** Sprint 02 曾出現「以 smoke test 代替完整驗收」的情況，本 Sprint 不接受同樣處理。若某項確實無法執行，明確說明原因並列為未完成，不得以其他測試替代後宣告完成。

## T-41　回報格式

除 `AGENTS.md` 既有要求外，必須逐條回答：

1. 這次有沒有為了讓測試通過或繞過設計而加的變通做法？全部列出來。
2. 這次有沒有修改到已經存在的 migration、既有測試或既有對外介面？
3. 這次新增或搬移的邏輯放在哪一層？為什麼放那裡？
4. 哪些地方你認為下個 Sprint 會需要重寫？
5. 有沒有任何地方偏離了文件？

**第 1 題的額外要求：** 必須明確檢查是否有「自己認為合理、因此沒列出」的設計選擇。Sprint 02 的自我審查漏掉了 `allowInactive`、`updatedAt` 代替 now、錯誤訊息字串比對這三項，共同特徵是它們在當時被認為已解決。

## T-42　撰寫 Sprint 2.5 Review

**本項為 v1.3 補入。** 原計畫遺漏了 Sprint Review，與 Sprint 01（`06_Sprint_01_Review.md`）、Sprint 02（`08_Sprint_02_Review.md`）的慣例不一致。

建立 `docs/10_Sprint_02_5_Review.md`，至少涵蓋：

- 完成範圍：T-00 至 T-30 逐項結果，附對應 commit。
- 對外行為的兩項預期變更（T-05 文案、T-25 錯誤訊息），確認其餘行為未變。
- 過程中發現並修正的既有問題：E2E selector 失效、Electron 測試競速、Sprint 02 的端到端驗收未實際執行。
- 本 Sprint 建立的機械化防線：migration 區塊 SHA-256 固定測試、renderer 禁用字串守門測試。
- 已決議但移至 Sprint 03 的項目：G-01 電子錢包、G-04 資料狀態、G-05 手續費關聯、G-06 交易篩選與分類重新指派。
- 未修正的已知項目與理由。
- 拆分後各檔案行數與 state 數量對照表。

---

## Definition of Done

- 使用者可見的行為只有 T-05 與 T-25 兩項預期變更，其餘完全不變。
- Sprint 01／02 的全部驗收案例仍可通過，且**有實際執行的證據**。
- 淨資產、帳戶餘額、月度統計在整理前後完全一致。
- 階段 0 至階段 3 的所有驗收方式全部達成。
- `00_Architecture_Rules.md` 第 11 節的結構性完成定義全部符合。
- typecheck、lint、單元測試、`test:e2e`、`test:package-smoke`、Windows production package 全部通過並附輸出。
- 回報包含 T-41 的五個問題與額外要求。
- `docs/10_Sprint_02_5_Review.md` 已完成（T-42）。

## 不在本 Sprint 範圍

- 任何新功能。
- 除 T-05、T-25 外任何 UI 行為、版面或樣式變更。
- 交易篩選、分類重新指派 UI（G-06，Sprint 03）。
- 電子錢包型別（G-01，Sprint 03）。
- 資料狀態選單調整（G-04，Sprint 03）。
- 手續費綁定父轉帳（G-05，Sprint 03）。
- 擴充 Electron 整合測試（等 GPU 問題有穩定方案）。
- 帳戶餘額模型改為「期初 + 交易 + 調整」（Sprint 03 以後，需先討論）。
- Mutation 後回傳完整列表的改法（MVP 可接受）。
- 資料庫加密、Gmail／PDF 匯入、第二層分類、定期交易、投資交易。
- 效能優化（例如月度統計改為 SQL 聚合）。

## 已知風險

- **T-20 是全 Sprint 風險與成本最高的項目**，屬交易寫入架構重組。建議完成後先完整驗證一輪，再進入階段 3。
- T-11 接近一個小型測試基礎建設工作，成本偏高但已評估為必要。
- T-25 跨越八處，且 IPC 序列化容易被誤以為「定義 Error 子類別就完成」。
- T-30 是大量機械性搬移，最容易無意間改到行為。必須靠 E2E 把關，且單獨 commit。
- **階段 1 若未真正完成就進入階段 2 或 3，本 Sprint 的所有驗收都失去意義。** 若 E2E 遲遲無法穩定，停下來回報，不要繼續往下做。
- G-01、G-04、G-05、G-06 已決議但排在 Sprint 03。本 Sprint 若順手實作，視為超出範圍，必須退回。
- 若發現本計畫或架構規範仍有過寬、過嚴或字面不可執行的條文，**提出修改建議並停止該項實作，不要直接違反也不要勉強照做。** 本文件 1.1 版即由此程序產生。
