# Sprint 04 Review：介面調整與本機備份

## 1. 結論

Sprint 04 已完成計畫 S4-00～S4-52。FinanceHub 現在會建立可驗證、
版本化的本機加密備份，支援解鎖後的 24 小時自動檢查、手動立即備份、
最近 N 份保留，以及常駐的「資料與備份」介面。

本 Sprint 沒有加入還原 UI、雲端同步、自選備份位置或全面介面改版。

## 2. 完成內容

### 備份格式與一致性

- 備份格式固定為 v1；原始版本使用獨立 `backup-<UUID>` 目錄。
- 每份必須恰好包含：
  - `financehub.db`
  - `financehub.db.metadata.json`
  - `manifest.json`
- manifest 保存格式版本、backupId、建立與完成時間、應用程式版本、
  實際最高 migration、兩個檔案的大小與 SHA-256，以及加密格式版本。
- manifest 不含帳戶、金額、交易、來源完整路徑、salt、verifier、
  密碼或金鑰。
- 寫入路徑採用全域 FIFO 閘門；已開始寫入先完成，備份期間的新寫入
  排隊，上限 100。
- `wal_checkpoint(TRUNCATE)` 使用 500 ms busy timeout；busy 時不複製。
- DB 與 sidecar 複製、同步、雜湊及格式驗證完成後，才將
  `.creating-<UUID>` 原子發布為正式目錄。
- 正常關閉會等待已接受的寫入與備份核心完成。

### 狀態與自動備份

- 手動備份透過 application／main／preload 的窄 IPC 執行。
- 同一時間只允許一個備份。
- 最後成功時間與有效份數由備份目錄重新驗證後重建，資料庫不是唯一
  真相。
- 手動成功及自動成功都以有效備份 `completedAt + 24 小時` 作為下次
  間隔；失敗不重設。
- 解鎖後只檢查一次。沒有有效備份或已滿 24 小時才自動嘗試。
- 自動失敗不阻擋解鎖，並留下可見安全錯誤。
- 備份已原子發布但狀態紀錄失敗時，顯示
  `BACKUP_STATUS_UPDATE_FAILURE` 警告，不把有效備份誤報為建立失敗。
- renderer 在 `isRunning` 時使用等待完成的窄 IPC；main 完成後立即
  回傳新狀態，不使用固定 `setTimeout` 或輪詢。

### 保留清理

- 可保留最近 3、7、14、30 份，預設 7。
- 只有新備份成功發布後才清理。
- 候選必須再次通過格式、大小及雜湊驗證。
- 刪除前再次限制為備份根目錄的直接子目錄，拒絕 symlink、
  junction、reparse point、巢狀目錄及未知內容。
- 候選先原子移入 `.deleting-<UUID>`，再逐一刪除三個預期一般檔案
  與空目錄；production 沒有使用遞迴刪除。
- rename 後再次比對完整 manifest 身分及兩個檔案紀錄。若目錄在
  驗證與 rename 之間被另一份有效備份替換，停止並完整保留
  quarantine。
- 清理失敗不影響新備份，另顯示 `BACKUP_CLEANUP_FAILURE`。

### 介面與文件

- 新增獨立「資料與備份」頁面，顯示實際資料位置、備份位置、最後
  成功時間、有效份數、下次間隔、進行中、失敗與警告。
- 提供立即備份、自動備份開關、保留份數、重新整理狀態及開啟資料夾。
- renderer 不接觸 Node 或檔案系統；開啟資料夾只接受 main 固定的
  備份位置，renderer 不能傳入任意路徑。
- 正式介面的「僅限假資料」改為「本機加密儲存」。
- G-04 手動狀態選單只提供 `confirmed` 與
  `pending_confirmation`；系統專用狀態仍保留在模型與既有資料。
- 390 px 寬度下三個主要頁面沒有水平溢出。
- README 已說明自動備份、三件式格式、SHA-256 檢查與隔離手動還原。

## 3. 修改範圍

主要新增檔案：

- `src/application/backup-service.ts`
- `src/application/ports/backup-port.ts`
- `src/infrastructure/backup/backup-format.ts`
- `src/infrastructure/backup/encrypted-backup-service.ts`
- `src/infrastructure/database/sqlite-backup-settings-repository.ts`
- `src/infrastructure/main/database-write-gate.ts`
- `src/renderer/components/BackupSettingsView.tsx`
- `src/shared/backups.ts`
- 對應 application、infrastructure、Browser E2E 與 Electron 測試。

主要修改檔案：

- `src/infrastructure/database/bootstrap-database.ts`
- `src/infrastructure/main/application-controller.ts`
- `src/main.ts`
- `src/preload.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/FinancialItemForm.tsx`
- `src/renderer/hooks/useAppController.ts`
- `src/renderer/styles.css`
- `src/shared/bootstrap.ts`
- `src/shared/errors.ts`
- `README.md`

## 4. Migration、測試與 IPC

### Migration

- 只追加 migration 6：單例 `backup_settings`。
- 保存自動備份開關、保留份數、下次間隔、最近安全錯誤及清理警告。
- 不保存最後成功時間或有效份數。
- migration 1～5 的 SQL 沒有修改；固定雜湊守門已更新並通過。

### 測試

- 既有財務流程斷言沒有刪除或放寬。
- bootstrap 測試配合合法新增 migration 更新版本與固定雜湊。
- Electron 測試保留既有財務流程，另延伸真實備份 UI／IPC 斷言。
- Browser mock 只模擬儲存及狀態，不重寫備份格式、財務計算或清理
  規則。

### IPC

新增：

- `backups:get-status`
- `backups:wait-for-completion`
- `backups:create-now`
- `backups:set-automatic-enabled`
- `backups:set-retention-count`
- `backups:open-directory`

所有 filesystem 原始錯誤、完整錯誤路徑與 native message 都不跨 IPC。

## 5. 故障注入結果

自動化測試已涵蓋：

- WAL 有最新提交資料時的快照與隔離還原。
- checkpoint busy 時不複製且正常解除閘門。
- DB 或 sidecar 缺失。
- metadata 無效。
- 目的地不可使用、同名碰撞及部分暫存目錄。
- manifest 格式、大小、雜湊不符，以及多檔、缺檔、子目錄與連結。
- FIFO 順序、佇列超過 100、關閉排空及備份互斥。
- 備份發布後 `recordSuccess()` 失敗。
- 清理失敗保留新備份。
- quarantine 名稱衝突。
- 驗證與 rename 之間被替換成另一份有效備份。

目錄替換測試證明：替換後的 DB、sidecar、manifest 三個檔案完整
留在 `.deleting-*`，沒有刪除。

## 6. 完整驗收

最終結果：

```text
typecheck: passed
lint: passed
verify: passed
unit/integration: 26 files, 157 tests passed
browser e2e: 11 passed
package smoke: passed
production test-password matches: 0
production known test-derived-key matches: 0
Electron same package: 10/10 passed
make: passed
clean install: uninstall exit 0, install exit 0
installed Sprint 04 acceptance: passed
```

`make` 產出：

- `out/make/squirrel.windows/x64/FinanceHub-0.1.0 Setup.exe`
- `out/make/squirrel.windows/x64/financehub-0.1.0-full.nupkg`
- `out/make/zip/win32/x64/FinanceHub-win32-x64-0.1.0.zip`

Electron 10 次使用同一份 package，沒有在各次之間重新建置：

```text
electron-run-1=passed
electron-run-2=passed
electron-run-3=passed
electron-run-4=passed
electron-run-5=passed
electron-run-6=passed
electron-run-7=passed
electron-run-8=passed
electron-run-9=passed
electron-run-10=passed
```

## 7. 最新安裝版與還原演練

先正常卸載本機同版本舊安裝，再以最新 Setup 靜默安裝；兩者 exit code
皆為 0。驗收只使用 `mkdtemp` 建立的隔離 user-data，不讀寫正式
Roaming 資料。

安裝版實際完成：

1. 設定主密碼並解鎖。
2. 建立資產「安裝驗收銀行」TWD 24,680。
3. 建立收入交易與備註「安裝驗收薪資」TWD 1,234。
4. 首次解鎖自動備份成功。
5. 從 UI 執行一次立即備份。
6. 確認每份備份恰好包含三個檔案。
7. 在加密 DB 及可能的 WAL／SHM／journal 搜尋兩個已知財務字串，
   結果 0 筆。
8. 未滿 24 小時重開，備份 ID 集合完全不變。
9. 在隔離測試資料修改所有有效 manifest 的完成時間模擬超過
   24 小時；重開解鎖後出現一個新 backupId。
10. 建立第 8 份成功備份後，畫面與磁碟均只剩最近 7 份。
11. 關閉程式，依 README 將最新備份的 DB 與 sidecar 複製到另一個
    隔離 user-data。
12. 使用原密碼解鎖，確認資產、交易、備註與淨資產 TWD 25,914。

缺 DB 與缺 sidecar 的隔離安裝端啟動均進入安全錯誤畫面，不建立或
覆寫資料。缺 DB、sidecar、manifest 的三種備份來源則全部由正式
`validateBackupDirectory()` 測試拒絕。

## 8. 外部套件、權限與網路

- 沒有新增 npm 套件。
- 沒有新增網路服務或網路權限。
- 新增的 OS 能力只有 main 端 `shell.openPath`，且只能開啟程式固定
  的備份目錄；renderer 不能指定任意路徑。
- 備份仍只使用既有本機資料目錄權限。

## 9. 工程取捨與未省略的設計選擇

沒有為了讓測試通過而放寬斷言、增加產品固定等待、略過完整性驗證、
關閉加密、使用遞迴刪除或加入後門。

本次「當時認為合理，但仍明列」的選擇：

1. 不使用 driver 的 `database.backup()`；S4-00 原型證明其目標格式
   無法用原密碼及 sidecar 開啟。
2. 24 小時依有效備份 manifest 重建，不把資料庫快取當唯一真相。
3. 狀態紀錄失敗使用記憶體警告；重新啟動後警告不保留，但有效備份
   與間隔仍由目錄正確重建。
4. 完成同步使用等待型 IPC，不使用固定輪詢；renderer 關閉時不取消
   main 已接受的備份。
5. 自動備份在同一次啟動最多嘗試一次；手動備份仍可重試。
6. 修改保留份數不立即刪除；依決策只在下一份新備份成功後清理。
7. `completedAt` 只用於通過驗證後排序，不宣稱能抵抗系統時鐘回撥。
8. 安裝端「手動」驗收由 Playwright 操作真實安裝版，步驟與人工
   操作相同，但證據可重複。

## 10. 尚未完成項目

以下均明確不在 Sprint 04：

- 還原 UI 與還原前安全快照。
- 使用者自選備份目的地。
- 雲端或外接磁碟同步。
- 可讀格式匯出。
- 每日／每週／每月分層保留。
- 修改主密碼與閒置自動鎖定。

## 11. 已知風險

- 預設備份與原資料位於同一實體磁碟，無法防範整顆磁碟故障。
- Sprint 04 只能依 README 手動還原；操作錯誤仍可能造成資料混用。
- manifest 沒有額外簽章，時間也不是可信時間；本格式提供檔案一致性
  與損壞檢查，不提供防回滾保證。
- metadata、原密碼或完整備份任一缺失，資料都無法復原。
- 狀態紀錄更新失敗的警告只存在當次執行記憶體；重啟後以目錄真相
  重建成功狀態。
- 保留清理是不可逆操作；目前以重新驗證、直接子目錄、拒絕連結、
  quarantine、完整身分比對及逐檔刪除降低風險。
- Electron 42 於 2026-10-20 EOL，仍是有期限技術債。

## 12. 下一個還原 Sprint 的相容性承諾

- 必須繼續讀取 backup format v1；不得原地改寫 v1 定義。
- 還原前必須使用同一套 `validateBackupDirectory()` 驗證三件式、
  大小、SHA-256、格式版本與路徑安全。
- 還原必須先建立目前資料的安全快照，不得直接覆寫。
- DB 與 sidecar 必須成對原子切換；失敗時可回到還原前狀態。
- 不得要求或保存第二組備份密碼；使用建立備份時的原主密碼。
- 較新未知格式必須拒絕，不得猜測或降級。
- 安裝端隔離還原 fixture 應持續作為相容性防線。

## 13. Sprint 結束後的小型備份介面調整

2026-07-31 依使用者確認補充：

- 重新整理狀態完成後顯示明確泡泡通知。
- 標題旁提供備份說明，使用一般使用者可理解的方式解釋自動備份、
  三件式備份、metadata 與主密碼遺失風險。
- 新備份採
  `FinanceHub-backup-YYYY-MM-DD_HH-mm-ss-<UUID>` 可讀目錄名稱；
  舊 `backup-<UUID>` 仍保持相容。
- 新增「匯出最新備份」，將最新一份已驗證的三件式備份完整複製到
  使用者選擇的位置。
- 一鍵還原仍未實作，明確列入後續 Sprint。
- 降低保留份數且新值低於現有有效備份數時，改為當下顯示實際
  移除份數與最舊備份時間；確認後立即安全清理，取消或清理失敗時
  維持原設定。避免把設定造成的多份刪除延後混入下一次手動備份。
- 後續介面優化將評估固定保留最近 7 份並隱藏一般份數選單；目前
  僅記錄待排，不修改既有功能。
- 操作提示的正式規範已集中於 `00_UI_Feedback_Rules.md`；備份頁
  作為第一個正式實作，其他既有提示在後續修改到該流程時遷移。
