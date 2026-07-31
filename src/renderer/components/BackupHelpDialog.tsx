interface BackupHelpDialogProps {
  readonly onClose: () => void;
}

export function BackupHelpDialog({ onClose }: BackupHelpDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="backup-help-title"
        aria-modal="true"
        className="panel backup-help-dialog"
        role="dialog"
      >
        <div className="field-heading">
          <div>
            <p className="label">備份說明</p>
            <h2 id="backup-help-title">如何保護 FinanceHub 資料</h2>
          </div>
          <button
            aria-label="關閉備份說明"
            className="dialog-close-button"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <ul className="backup-help-list">
          <li>「立即備份」會建立一份完整且經過驗證的本機備份。</li>
          <li>自動備份會在成功解鎖後檢查，每 24 小時最多建立一次。</li>
          <li>「匯出最新備份」可將最新一份完整備份複製到外接硬碟或雲端同步資料夾。</li>
          <li>每份備份必須保留資料庫、metadata 與 manifest 三個檔案，缺少任何一個都不能還原。</li>
          <li>忘記主密碼或遺失 metadata 都無法復原資料。</li>
          <li>目前尚未提供一鍵還原；需要還原時請先完全關閉 FinanceHub，再依 README 操作。</li>
        </ul>
        <button className="primary-button" type="button" onClick={onClose}>
          我知道了
        </button>
      </section>
    </div>
  );
}
