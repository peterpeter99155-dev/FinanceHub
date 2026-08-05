# Sprint 05 Review：交易匯入與待確認流程

版本：v1.0  
日期：2026-08-04  
分支：`codex/sprint-05`

## 1. 結論

Sprint 05 已完成來源中立的匯入批次、待確認候選、永豐文字型信用卡
月結帳單 PDF adapter、信用卡退款與雙餘額、人工決策、批次原子確認、
去重、既有交易配對及保守分類建議。

正式交易只會在使用者確認後建立；無法安全判斷的資料不猜測，原始
PDF、完整抽取文字及 PDF 密碼均不保存。掃描型 PDF、OCR、Email 收取、
銀行直接連線及自動合併不在本 Sprint 範圍。

## 2. 完成內容

- 新增 `credit_card_refund`，正金額由交易類型決定方向，退款不列收入。
- 信用卡使用非負的「應繳餘額＋溢繳餘額」，且最多一邊大於零。
- 月統計分列收入、支出、退款與淨收支。
- 新增來源觀察、匯入批次、候選、決策與正式交易連結模型。
- 支援建立新交易、連結既有交易、排除，以及整批全成功或全回滾。
- 永豐 parser 支援加密文字型 PDF、跨頁、摘要換行、外幣附註、退款、
  零元及未知負數的安全待確認語意。
- 帳單明細總額只供核對，不會建立為交易；總額不一致時禁止確認。
- 同檔摘要與來源中立觀察指紋防止重複；疑似跨來源重複只提示使用者。
- 分類建議只使用既有正式交易的唯一明確證據，不確定時不提供建議。
- renderer 僅透過窄 preload API 使用匯入功能，不取得 Node 或檔案系統能力。

## 3. Migration

Sprint 05 新增 migration 9～12：

- migration 9：信用卡溢繳餘額及既有資料相容欄位。
- migration 10：退款原交易關聯。
- migration 11：匯入批次、來源觀察、候選及正式交易連結。
- migration 12：允許待確認候選暫不指定交易類型，並以資料庫約束禁止
  `create_new` 在類型空白時進入確認。

舊信用卡 `amount` 完整保留為應繳餘額，溢繳初始化為 0；migration
1～8 未修改。既有 migration 固定雜湊守門測試保持通過。

## 4. IPC 與安全邊界

新增七條匯入 IPC：

- `imports:select-statement`
- `imports:parse-selected-statement`
- `imports:get-batch`
- `imports:list-batches`
- `imports:update-candidate`
- `imports:confirm-candidates`
- `imports:exclude-batch`

檔案選擇只回傳一次性 token 與安全顯示名稱；renderer 不取得完整路徑。
PDF 密碼只在單次解析呼叫傳遞，解析完成或失敗後即清除。所有會寫入
資料庫的匯入路徑均經 Sprint 04 的 FIFO write gate，避免與備份快照競速。
IPC 僅回傳穩定錯誤代碼及安全文案，不回傳原始 filesystem/PDF 錯誤或
敏感路徑。

## 5. 套件與容量

- 新增 `pdfjs-dist@6.2.108`，授權 Apache-2.0。
- PDF.js worker、字型及 WASM 不連網下載；正式 bundle 未加入 viewer。
- 同一台 Windows x64、同一 Electron/Forge 設定，以 `main` 快照與本
  Sprint HEAD 實際 A/B：
  - Setup：138.03 MiB → 138.54 MiB，增加 527,360 bytes（0.50 MiB）。
  - `app.asar`：453,308 → 2,260,454 bytes，增加 1,807,146 bytes。
  - packaged 目錄：374,383,933 → 376,191,079 bytes，增加 1,807,146 bytes。
- Setup 增量低於 30 MiB 停止門檻，未以舊版、連網資產或降低 Electron
  安全設定換取容量。

## 6. 最終驗收證據

最終 HEAD 的自動驗收結果：

```text
typecheck: passed
lint: passed
verify: Architecture verification passed; guards 18/18 passed
unit/integration: 36 files passed, 235 tests passed
browser e2e: 20 passed
package smoke: passed
production test-password matches: 0
production known test-derived-key matches: 0
Electron same package: 10/10 passed
make: passed
clean install: install root removed, latest Setup installed, executable exists
installed Sprint 04 regression acceptance: passed
```

Electron 10 次使用相同的 `app.asar`，前後 SHA-256 均為：

```text
6524C76FC599B9EEEF5FED6BDAD5FE6D022522E4E5BDC181E6D3B06F64B7A315
```

`make` 產出：

- `out/make/squirrel.windows/x64/FinanceHub-0.1.0 Setup.exe`
- `out/make/squirrel.windows/x64/financehub-0.1.0-full.nupkg`
- `out/make/zip/win32/x64/FinanceHub-win32-x64-0.1.0.zip`

最新 Setup 為 145,264,640 bytes。先停止已安裝的 FinanceHub、正常卸載並
確認安裝根目錄消失，再以最新 Setup 安裝；安裝後執行檔存在且可啟動。

退款／雙餘額紅燈證明：故意把退款的應繳效果由 `decrease` 改成
`increase` 後，2 個測試檔失敗、3 項測試變紅；還原後 2 個測試檔、
42 項測試全綠，且 `src/domain/transaction.ts` 無殘留 diff。

虛構國內及外幣 fixture 均由 repo 內 generator 產生。外幣列測試直接
斷言外幣金額與折算資訊可抽取；帳單總額不會成為候選。fixture 第 2 頁
另經 Poppler render 做視覺檢查，文字清楚且沒有裁切或重疊。

## 7. 真實資料與敏感資料檢查

- repo、fixture、文件、log 及 production bundle 均未放入使用者真實
  帳單、姓名、帳號、交易摘要或 PDF 密碼。
- 測試僅使用自行產生的虛構 PDF。
- package smoke 額外掃描 App 主密碼、PDF fixture 密碼及驗收密碼，
  production bundle 命中數均為 0。
- 使用者曾在本機以真實國內與外幣帳單驗證 parser 結果；原始 PDF、
  完整抽取文字與密碼沒有複製到 repo、log、輸出或建置產物。

## 8. 未完成、偏離計畫與限制

- 最初的 production bundle 遺漏 PDF.js worker，導致安裝／package 版
  在真正解析前以一般 `Error` 失敗；開發環境可從 `node_modules` 動態
  載入，因此原本測試未抓到。修正後明確把同版本 worker 離線打入 main
  bundle，package smoke 會檢查 `pdfjsWorker` 存在。使用者已在本機透過
  真實 package UI 完成選檔、輸入一次性 PDF 密碼及解析，確認正常。
- 匯入頁已補上匯入紀錄；既有批次可重新開啟，同一 PDF 再匯入會顯示
  原批次而不建立第二份。快速新增信用卡只要求名稱，以 TWD 0 建立並
  自動選取，使用者不必離開匯入頁。
- parser 僅支援目前已確認的永豐信用卡月結帳單文字版面；版面變更時會
  安全失敗，不會寬鬆猜測。
- parser v1.0 已存資料的舊來源指紋不會自動重寫；新資料使用 v1.1
  來源中立指紋。這不會重複建立正式交易，疑似項目仍需使用者決定。
- `originalTransactionId` 的退款原消費關聯為選填；刪除原消費時設為空，
  不刪除退款。
- Email 每日通知、簽帳金融卡通知、授權/請款/沖正配對、CSV、OCR、
  還原 UI 與自動合併均留待後續 Sprint。

## 9. 下一個來源 adapter 的擴充成本

共用批次、候選、決策、去重、配對與正式交易建立流程可直接重用。新增
一個來源主要需要：來源專屬 parser、匿名 fixture、來源欄位正規化、
安全錯誤映射與 adapter 測試。Email 來源另需先拍板授權、請款、沖正及
時間精確度語意；在該決策完成前不得將通知自動合併為正式交易。
