interface BackupSettingsHeadingProps {
  readonly disabled: boolean;
  readonly exporting: boolean;
  readonly onExport: () => void;
  readonly onHelp: () => void;
  readonly onOpenDirectory: () => void;
}

export function BackupSettingsHeading({
  disabled,
  exporting,
  onExport,
  onHelp,
  onOpenDirectory,
}: BackupSettingsHeadingProps) {
  return (
    <div className="section-heading backup-heading">
      <div className="backup-title-row">
        <div>
          <p className="label">本機資料保護</p>
          <h2 id="backup-title">資料與備份</h2>
        </div>
        <button
          aria-label="查看備份說明"
          className="backup-help-button"
          type="button"
          onClick={onHelp}
        >
          ?
        </button>
      </div>
      <div className="backup-heading-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          type="button"
          onClick={onExport}
        >
          {exporting ? '正在匯出…' : '匯出最新備份'}
        </button>
        <button
          className="secondary-button"
          disabled={disabled}
          type="button"
          onClick={onOpenDirectory}
        >
          開啟備份資料夾
        </button>
      </div>
    </div>
  );
}
