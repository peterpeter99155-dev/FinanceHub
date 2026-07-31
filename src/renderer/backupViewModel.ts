import type { BackupStatus } from '../shared/backups';

export function backupHeadline(status: BackupStatus): string {
  if (status.lastError) return '最近一次備份未完成';
  if (status.lastSuccessfulAt) return '備份狀態正常';
  return '尚未建立備份';
}

export function formatBackupTime(value: string | undefined): string {
  if (!value) return '尚無紀錄';
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}
