# Sprint 01 Review：可操作的淨資產底座

## 文件資訊

- 日期：2026-07-27
- 狀態：實作完成，待使用者驗收
- 分支：`codex/sprint-01`
- 資料限制：只使用假資料或匿名化資料

## Sprint Goal 結果

已完成第一個可執行的 Windows 桌面垂直切片：

```text
手動建立資產與負債
→ 儲存 SQLite
→ 計算淨資產
→ 首頁顯示資產與負債
→ 修改後重新計算
→ 關閉重開後資料仍存在
```

## 完成內容

### 桌面應用與安全邊界

- Electron Forge、Webpack、React、TypeScript 專案可啟動及封裝。
- renderer 啟用 sandbox 與 context isolation，停用 Node.js integration。
- React 只透過具型別且受限制的 preload API 操作財務項目。
- Electron fuses 關閉 RunAsNode、Node options 與 CLI inspect，並啟用 ASAR integrity。
- UI 明確標示目前僅限假資料。

### 財務領域規則

- TWD 金額使用安全整數，不使用浮點數。
- 支援資產、負債、類型、資料狀態、是否啟用及是否計入淨資產。
- 依 BR-001 計算總資產、總負債與淨資產。
- 停用、不計入及待確認項目不影響正式合計。
- 類型與資產／負債方向不一致時拒絕儲存。

### 本機持久化

- 使用 SQLite 與版本化 migration。
- Repository 介面與 SQLite adapter 分離。
- 支援新增、查詢、修改與停用。
- 資料庫存於 Electron `userData`，不放在 Git 專案內。
- 資料庫關閉再開啟後可讀回原資料。

### 使用者介面

- 首頁顯示淨資產、總資產及總負債。
- 顯示啟用中的資產／負債、類型、資料狀態、金額及更新時間。
- 支援新增與編輯資產／負債。
- 支援設定資料狀態及是否計入淨資產。
- 支援停用項目；資料保留但不再顯示或計入合計。
- 載入與操作失敗會顯示錯誤，不會以零值掩蓋。

## 自動化驗證

### 靜態與單元／整合測試

- TypeScript typecheck：通過。
- ESLint：通過。
- Vitest：5 個測試檔、26 項測試通過。
- SQLite migration、Repository CRUD、重啟持久化測試通過。
- production package：Windows x64 封裝成功。

### Electron 端到端測試

Playwright 已實際啟動 Electron 並完成：

1. 建立示範銀行存款 TWD 1,000,000。
2. 建立示範房產 TWD 8,000,000。
3. 建立示範房貸 TWD 5,000,000。
4. 驗證總資產 TWD 9,000,000、總負債 TWD 5,000,000、淨資產 TWD 4,000,000。
5. 將房貸改為 TWD 4,900,000，驗證淨資產變為 TWD 4,100,000。
6. 關閉並重開 Electron，驗證資料與 TWD 4,100,000 淨資產仍存在。
7. 停用房產，驗證項目保留於資料庫但不再顯示或計入總資產。

## 使用者驗收方式

```powershell
npm.cmd install
npm.cmd start
```

建議只使用以下完全虛構資料操作：

- 示範銀行存款：TWD 1,000,000
- 示範房產：TWD 8,000,000
- 示範房貸：TWD 5,000,000

驗收重點：

- 新增後首頁是否立即更新。
- 修改房貸後淨資產是否正確重算。
- 關閉重開後資料是否仍存在。
- 停用項目後是否從畫面及正式合計移除。
- 錯誤、狀態及更新時間是否容易理解。

## 尚未完成項目

下列項目依 Sprint 規劃明確不屬於 Sprint 01：

- 真實資料庫加密及主密碼。
- 外幣、匯率、股票／ETF 市價與成本。
- 收入、支出、轉帳與月度摘要。
- Gmail、銀行 Email、信用卡 PDF 或其他外部來源。
- 自訂類型管理介面。
- 待確認中心與停用項目管理畫面。
- 永久刪除、備份與還原。

## 已知風險與待確認

- 資料庫尚未加密，不得輸入真實金融資料。
- `npm audit --omit=dev` 的正式執行相依為 0 個漏洞。
- Forge、Webpack 與 ESLint 開發工具鏈仍有 48 個傳遞相依警告；目前上游沒有相容的完整修復路徑，不使用 `audit fix --force` 降版或破壞建置，後續追蹤更新。
- E2E 使用未熔斷的開發 Electron binary 測試 Webpack 產物；封裝版因安全設定關閉 RunAsNode，另以啟動 smoke test 驗證。
- 目前停用項目不在 UI 顯示，尚未提供重新啟用介面。
- Sprint Review 通過前不合併至 `main`。

## 本 Sprint commits

- `2398055` 建立 Sprint 01 技術底座
- `98ba62c` 實作淨資產核心計算
- `de9dacd` 加入財務項目 SQLite 儲存層
- `9aed70b` 完成資產負債管理垂直流程
