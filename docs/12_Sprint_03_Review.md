# Sprint 03 Review：本機財務資料加密

- 日期：2026-07-29
- 分支：`codex/sprint-03`
- 範圍：S3-00～S3-42
- 結果：實作與驗證完成，核准合併 `main`

## 1. 完成內容

Sprint 03 將 FinanceHub 的本機 SQLite 資料庫改為主密碼保護的
加密資料庫，並完成：

- Electron 42 與 `better-sqlite3-multiple-ciphers` 的 Windows x64
  打包驗證。
- 版本化 KDF/cipher 規格、metadata sidecar 與 key verifier。
- 首次設定、後續解鎖、錯誤密碼重試與鎖定前資料隔離。
- 資料庫、WAL、SHM、journal 的明文洩漏檢查。
- page authentication 損壞測試。
- 固定加密相容性 fixture。
- 正確的雙檔備份程序與資料存放原則。

## 2. 資料庫套件更換的實際影響

資料庫驅動由 `better-sqlite3` 改為
`better-sqlite3-multiple-ciphers` 12.11.1。上層 domain、
application 與 renderer 的財務規則沒有因套件差異修改；
import、建立方式與型別差異由 infrastructure 吸收。

### 預編譯檔與工具鏈

- Electron 43 / Windows x64 沒有可用的 ABI 148 預編譯檔。
- 目標電腦沒有完整 C++ 原生模組編譯工具鏈。
- 依計畫停止 Electron 43 路線，沒有嘗試補裝工具鏈或繞過。
- Electron 降至 42.7.1，實際使用套件提供的
  `electron-v146-win32-x64` 預編譯檔。
- 安裝過程沒有執行 node-gyp。
- 打包後 `.node` binary 位於 `app.asar.unpacked`，三重雜湊比對
  一致。

Node 測試與 Electron 42 使用不同 ABI。為避免先跑 Node 測試、
再打包時殘留錯誤 binary，新增
`scripts/prepare-sqlite-native.cjs`，在 `pretest`、`prestart`、
`prepackage`、`premake` 與 `pretest:electron` 路徑明確選擇
預編譯檔；找不到時直接失敗，不退回本機編譯。

## 3. 加密格式 v1

完整規格的唯一決策來源為 `DEC-032`。本次實作固定：

| 項目 | v1 |
|---|---|
| 格式版本 | `formatVersion = 1` |
| KDF 版本 | `kdfVersion = 1` |
| KDF | 非同步 `scrypt` |
| KDF 參數 | `N=262144`、`r=8`、`p=1`、`keyLength=32`、`maxmem=536870912` |
| salt | CSPRNG 產生 32 bytes |
| 用途分離 | HKDF-SHA-256 分離 database key 與 verifier key |
| cipher | `chacha20` |
| cipher 參數 | `legacy=0`、`plaintextHeaderSize=0`、`hmacCheck=1`、raw key |
| page size | 4096 bytes |
| 密碼處理 | 不 trim，Unicode NFC 後編碼為 UTF-8 |
| 格式上限 | 1024 Unicode scalar values、4096 UTF-8 bytes |
| 新設定密碼產品限制 | 8 至 64 個半形英文、數字或特殊符號 |
| 既有資料庫解鎖相容性 | Unicode、上限 1024 scalar values |

sidecar 只保存 `formatVersion`、`kdfVersion`、salt 與 key
verifier。完整 KDF/cipher 參數只存在程式內建可信版本表，攻擊者
不能透過修改 sidecar 降低成本或關閉驗證。

目標開發機的 scrypt v1 中位數約 371 ms，只在建立或解鎖執行
一次；使用非同步 API，不阻塞 Electron main process。

## 4. Sidecar 與錯誤區分

以下四種狀態都有自動測試：

1. 資料庫存在、sidecar 不見：`DATABASE_METADATA_MISSING`，原資料庫
   bytes 保持不變。
2. sidecar 存在、資料庫不見：`DATABASE_FILE_MISSING`。
3. 首次建立留下 `.creating`：`DATABASE_SETUP_INCOMPLETE`。
4. sidecar 版本較新：`UNSUPPORTED_ENCRYPTION_FORMAT`。

key verifier 使用獨立 HKDF 子金鑰與 HMAC-SHA-256，並採
constant-time comparison。錯誤 verifier 回報 `WRONG_PASSWORD`；
verifier 正確但資料庫 page authentication 失敗時回報
`DATABASE_UNREADABLE`。

## 5. 明文洩漏與完整性驗證

測試建立加密資料庫，寫入 UTF-8 已知字串「示範銀行存款」，
保持 WAL 連線開啟並列舉：

- `financehub.db`
- `financehub.db-wal`
- `financehub.db-shm`
- 所有名稱包含 journal 的相關檔案

每個檔案以 `Buffer.includes(Buffer.from(value, 'utf8'))` 搜尋。
結果：

```text
database / wal / shm / journal plaintext matches: 0
cipher: chacha20
hmac_check: 1
page_size: 4096
```

完整性測試在關閉資料庫後翻轉第一頁 offset 200 的一個 bit。
使用正確密碼重開時 verifier 通過，但 `sqlite_master` 讀取失敗，
FinanceHub 回傳 `DATABASE_UNREADABLE`，未回傳未驗證資料。

ChaCha20-Poly1305 提供 page 層級的機密性與竄改偵測。它不保護
sidecar 被刪除，也不防止整組有效備份被回滾成較舊版本。

## 6. 密碼與金鑰的生命週期

- 主密碼只由 renderer 經單一解鎖 IPC 傳到 main。
- 每次輸入只傳一次，不回傳、不保存、不記錄、不再跨 IPC。
- scrypt 主金鑰與兩把子金鑰只存在 main/infrastructure。
- 可控 Buffer 使用後以 `fill(0)` 做 best-effort 清零。
- stable IPC 錯誤只回傳代碼與非敏感 details。
- production bundle 掃描所有固定測試密碼，結果為 0。

實際限制：JavaScript 字串不可變，無法可靠覆寫。程式只能盡快
移除引用，不能保證 runtime、原生函式庫、swap 或 crash dump
沒有副本；本專案不宣稱做不到的「完全記憶體清除」。

## 7. 解鎖結構與 UI

main 啟動時只建立 `ApplicationController`，註冊狀態查詢與解鎖
handler。解鎖成功前不建立資料庫連線、Repository、Service 或
財務 IPC handler；提前呼叫財務 IPC 會失敗。

renderer 的 `SecurityGate` 在解鎖前完全不掛載財務 `App`。
瀏覽器與 Electron 測試都斷言鎖定畫面不存在任何 `TWD`、淨資產
元件、帳戶名稱或交易入口。密碼欄位焦點使用 `useLayoutEffect`，
沒有以 `setTimeout` 協調狀態或焦點。

首次設定介面在收尾階段依 DEC-034 更新：

- 主密碼與確認欄位以眼睛圖示切換顯示／隱藏。
- 新密碼只接受 8 至 64 個半形英文、數字或特殊符號；renderer
  阻擋不合規輸入，main 建立資料庫前另有獨立驗證。
- 解鎖既有資料庫不套用新限制。測試以中文且超過 64 個的舊密碼
  建立資料庫，再由新版正式解鎖路徑開啟並讀取 schema。
- 畫面顯示 Electron 實際 `userData` 位置，以及必須一起備份的
  `financehub.db` 與 `financehub.db.metadata.json`。
- 警告改以一般使用者可理解的文字說明忘記密碼與遺失任一檔案
  都無法復原。

## 8. 相容性 fixture

`tests/fixtures/encryption-v1` 保存固定、完全是假資料的 v1 加密
資料庫與 sidecar。測試密碼只存在測試程式。相容性測試先複製
fixture 到暫存目錄再開啟，避免 migration 修改提交的基準檔。

升級資料庫套件、底層 cipher 或 migration 前，必須先確認新版
仍可開啟此既有 fixture。

## 9. 實際安裝與操作驗收

`npm run make` 產生：

- Squirrel Setup
- full nupkg
- Windows x64 ZIP

實際執行 `FinanceHub-0.1.0 Setup.exe --silent`，安裝 exit code 為
0。驗收操作由 Playwright 驅動安裝後的真實
`AppData\Local\FinanceHub\app-0.1.0\FinanceHub.exe`，不使用 mock：

1. 首次啟動看到「設定主密碼」。
2. 輸入並確認固定驗收密碼，勾選不可復原警告。
3. 建立資產「安裝驗收銀行」，金額 TWD 24,680。
4. 確認淨資產為 TWD 24,680。
5. 正常關閉視窗，確認程式結束。
6. 使用相同 user-data 目錄重開。
7. 解鎖前確認沒有任何 TWD 金額。
8. 輸入主密碼解鎖。
9. 確認「安裝驗收銀行」與 TWD 24,680 均正確。
10. 確認資料庫與 metadata sidecar 同時存在。

結果：全部通過。驗收資料目錄完成後已刪除。這是自動化輔助的
實際安裝端操作驗收，不是人工目視點擊，也不是瀏覽器 mock。

2026-07-30 合併前以登入介面收尾後的最新安裝檔重新驗收。第一次
執行時，Squirrel 因已安裝版本同為 `0.1.0` 而保留 2026-07-29
的舊程式，造成新版確認文案找不到；這不是產品程式紅燈。確認安裝
檔與既有程式時間後，正常卸載舊版並乾淨安裝最新 `0.1.0`，再跑
相同步驟，結果全部通過：

```text
Installed application acceptance passed.
First launch: master password configured
Created item: 安裝驗收銀行, TWD 24,680
Application closed normally: true
Second launch: locked screen shown before financial data
Unlock succeeded: true
Persisted item verified: 安裝驗收銀行, TWD 24,680
Database and metadata sidecar both present: true
```

## 10. 完整驗證

```text
typecheck: passed
lint: passed
unit: 21 files, 118 tests passed
browser e2e: 7 passed
package smoke: passed
make: passed
installed application acceptance: passed
```

Electron 測試每次都先重新 package，再跑完整首次設定、建立資料、
關閉、重開與解鎖流程。連續結果：

```text
run-1=passed
run-2=passed
run-3=passed
run-4=passed
run-5=passed
run-6=passed
run-7=passed
run-8=passed
run-9=passed
run-10=passed
```

未出現間歇失敗，沒有增加等待或延長 timeout。

合併前使用登入介面收尾後的同一份最新 package 再執行一次：

```text
Electron: 10/10 passed
package smoke: passed
production bundle test-password matches: 0
make: passed
clean installed application acceptance: passed
```

## 11. S3-41 九個問題

### 1. 是否有變通做法或未列出的設計選擇？

沒有為了讓紅燈變綠而放寬斷言、增加固定等待、延長 timeout、
關閉 cipher 驗證或加入解鎖後門。

本 Sprint 的工程取捨與「當時認為合理、仍應明列」的設計選擇：

1. Electron 降至 42 取得可信預編譯檔；這是有期限技術債。
2. `prepare-sqlite-native.cjs` 在 Node/Electron ABI 間切換
   預編譯 binary，找不到時直接失敗，不執行 node-gyp。
3. `test:electron` 每次先 package，代價是變慢，但不會測到舊產物。
4. sidecar 不保存 KDF/cipher 參數，只保存版本並查可信表。
5. verifier 在開啟 SQLite 前驗證，讓錯密碼完全不接觸資料庫。
6. 首次建立使用 `.creating` 與 rename，避免半成品被誤判。
7. renderer 使用 SecurityGate 完全不掛載財務 App，而非掛載後遮住。
8. 相容性 fixture 測試使用副本，避免未來 migration 改寫基準。
9. 安裝端驗收由 Playwright 操作真實安裝程式；它不是純人工點擊。

### 2. 是否修改既有 migration、測試或對外介面？

- 已存在的 migration SQL 一個字都沒有修改；只把 migration 執行
  周邊抽成可接受既有 connection 的函式，雜湊守門測試通過。
- 既有 domain/application/browser 核心測試斷言沒有修改。
- `tests/electron/app.electron.ts` 增加安全設定、鎖定前不可見與解鎖
  步驟，原財務流程斷言保留。
- E2E mock、package smoke 與測試生命週期有配合安全閘門的修改。
- preload 的 `FinanceHubApi` 新增 `unlockDatabase`；
  `BootstrapStatus` 新增 `databaseState`、實際資料目錄與兩個備份
  檔名。這是既有 renderer 對 main 的介面明確變更，不是公開網路
  API。
- 資料庫驅動型別與 import 在 infrastructure 內更新，上層介面不變。

### 3. 新增邏輯放在哪一層？

- 加密格式、KDF、sidecar：`infrastructure/security`，因為是密碼學
  與檔案格式細節，不屬於財務 domain。
- 加密 SQLite 開啟：`infrastructure/database`，隔離資料庫套件。
- 解鎖建構順序：`infrastructure/main/ApplicationController`，
  負責 Electron main 的 composition root 與 IPC 生命週期。
- 一次性 IPC contract：`shared`＋`preload`，renderer 不接觸 Node。
- 設定與解鎖畫面：`renderer/components/SecurityGate`。
- 財務 domain/application 沒有依賴 Electron、React 或 SQLite。

### 4. 下個 Sprint 可能需要重寫什麼？

- preload/IPC 的免 Electron contract 測試仍待 Sprint 03 後續工作。
- 閒置自動鎖定需要可在執行中關閉 connection、移除財務 handlers
  並重新掛回 SecurityGate；目前 controller 只處理啟動解鎖與退出。
- 修改主密碼需要原子重加密流程，目前沒有。
- 程式化備份／還原需要安全關閉、雙檔一致性與錯誤復原流程。
- Electron 42 必須在 EOL 前升級或替換技術路線。
- 若支援多 KDF 版本，registry 與 fixture 流程會擴充，但 v1 不重寫。

### 5. 是否偏離文件？

核心功能、格式、錯誤語義與驗收沒有偏離。唯一需要透明揭露的是：
計畫稱「手動驗收」，實際採用 Playwright 操作真實已安裝程式，
完整走相同步驟並驗證畫面與持久化結果；不是人手目視點擊。

### 6. 密碼或金鑰是否可能寫入檔案、log、錯誤或 IPC 回傳？

- 檔案：sidecar 只有 salt 與 verifier，沒有密碼或導出金鑰。
- log：搜尋 production `src`，沒有密碼／金鑰 log；驗收輸出也不印
  密碼值。
- 錯誤：IPC 只回 stable code 與非敏感 details，不回原始 exception
  message、密碼或 key。
- IPC：主密碼只在解鎖呼叫由 renderer 傳 main 一次；回傳為 void。
  database key、verifier key 與 scrypt master key 不跨 IPC。
- bundle：所有固定測試密碼逐一掃描 `app.asar`，結果 0。
- crash：程式未把解鎖參數放入 command line；但 JavaScript/runtime
  記憶體是否進入 OS crash dump 無法完全保證，已記為能力界線。

### 7. 是否存在跳過解鎖的路徑？

沒有。解鎖前不建立 Repository、Service 或財務 IPC handler；
呼叫財務 IPC 會失敗。renderer 在 SecurityGate 解鎖前不掛載財務
App。production bundle 不含固定測試密碼或 test-only unlock adapter。

### 8. WAL、SHM、journal 明文如何檢查？

在真實加密連線中寫入已知 UTF-8 財務字串，保持 WAL 開啟，列舉
主檔、`-wal`、`-shm` 與所有 journal，再用原始 bytes 搜尋 UTF-8
needle。所有檔案結果均為 0 筆。

### 9. 錯誤密碼是否完全不修改資料庫與 sidecar？

是。測試在錯密碼前後對兩個檔案分別擷取完整 bytes 與
`stat(..., { bigint: true }).mtimeNs`，錯密碼回傳
`WRONG_PASSWORD` 後比較 snapshot 完全相等。verifier 在 SQLite
開啟前完成，因此錯密碼不會執行 migration 或觸碰資料庫。

## 12. 已解除限制與新增風險

已解除「正式加密完成前只能使用假資料」的產品限制。真實財務資料
可存放於使用者自己擁有並管理的電腦；開發、測試與 Git 仍只能用
假資料。

新增或明確化的風險：

- 忘記主密碼永久無法復原。
- 遺失 metadata sidecar 等同忘記密碼。
- 加密資料損壞後外部修復工具可用性降低，因此雙檔備份是必要程序。
- 加密不防擁有電腦系統管理權限的一方。
- Electron 42 在 2026-10-20 EOL。

## 13. 移至後續 Sprint

- 閒置自動鎖定。
- 修改主密碼。
- 可讀格式匯出。
- 程式化備份與還原。
- 生物辨識。
- preload/IPC 的免 Electron contract 測試。
- Electron 42 升版。
- 公開散布前的加密軟體出口法規評估。
- 手機版與同步。
- G-01 電子錢包型別、G-05 手續費綁定父轉帳、G-06 交易篩選與分類
  重新指派：Sprint 03 未實作，後續待排。
- G-04 手動資料狀態選單限制：Sprint 03 未實作，後由 S4-01 納入
  Sprint 04。
