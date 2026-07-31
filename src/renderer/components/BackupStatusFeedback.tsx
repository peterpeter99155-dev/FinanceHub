export interface BackupFeedback {
  readonly tone: 'success' | 'error';
  readonly message: string;
}

interface BackupStatusFeedbackProps {
  readonly feedback: BackupFeedback;
}

export function BackupStatusFeedback({
  feedback,
}: BackupStatusFeedbackProps) {
  return (
    <div
      className={`backup-feedback ${feedback.tone}`}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true">
        {feedback.tone === 'success' ? '✓' : '×'}
      </span>
      {feedback.message}
    </div>
  );
}
