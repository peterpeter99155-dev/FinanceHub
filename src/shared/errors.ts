export const ERROR_CODES = {
  unknown: 'UNKNOWN',
  invalidInput: 'INVALID_INPUT',
  amountMustBePositive: 'AMOUNT_MUST_BE_POSITIVE',
  amountOutOfRange: 'AMOUNT_OUT_OF_RANGE',
  duplicateName: 'DUPLICATE_NAME',
  builtInImmutable: 'BUILT_IN_IMMUTABLE',
  resourceInUse: 'RESOURCE_IN_USE',
  futureTransaction: 'FUTURE_TRANSACTION',
  negativeAccountBalance: 'NEGATIVE_ACCOUNT_BALANCE',
  invalidCategory: 'INVALID_CATEGORY',
  invalidAccount: 'INVALID_ACCOUNT',
  importDuplicateSource: 'IMPORT_DUPLICATE_SOURCE',
  importReconciliationMismatch: 'IMPORT_RECONCILIATION_MISMATCH',
  importCandidateUnavailable: 'IMPORT_CANDIDATE_UNAVAILABLE',
  importBatchInUse: 'IMPORT_BATCH_IN_USE',
  importSelectionUnavailable: 'IMPORT_SELECTION_UNAVAILABLE',
  pdfFileTooLarge: 'PDF_FILE_TOO_LARGE',
  pdfPageLimitExceeded: 'PDF_PAGE_LIMIT_EXCEEDED',
  pdfTextItemLimitExceeded: 'PDF_TEXT_ITEM_LIMIT_EXCEEDED',
  pdfParseTimeout: 'PDF_PARSE_TIMEOUT',
  pdfPasswordRequired: 'PDF_PASSWORD_REQUIRED',
  pdfPasswordIncorrect: 'PDF_PASSWORD_INCORRECT',
  pdfInvalid: 'PDF_INVALID',
  pdfNoExtractableText: 'PDF_NO_EXTRACTABLE_TEXT',
  pdfUnsupportedFormat: 'PDF_UNSUPPORTED_FORMAT',
  pdfParseIncomplete: 'PDF_PARSE_INCOMPLETE',
  pdfParseFailed: 'PDF_PARSE_FAILED',
  invalidPassword: 'INVALID_PASSWORD',
  wrongPassword: 'WRONG_PASSWORD',
  databaseMetadataMissing: 'DATABASE_METADATA_MISSING',
  databaseFileMissing: 'DATABASE_FILE_MISSING',
  databaseSetupIncomplete: 'DATABASE_SETUP_INCOMPLETE',
  unsupportedEncryptionFormat: 'UNSUPPORTED_ENCRYPTION_FORMAT',
  invalidDatabaseMetadata: 'INVALID_DATABASE_METADATA',
  databaseUnreadable: 'DATABASE_UNREADABLE',
  databaseLocked: 'DATABASE_LOCKED',
  databaseAlreadyUnlocked: 'DATABASE_ALREADY_UNLOCKED',
  backupInProgress: 'BACKUP_IN_PROGRESS',
  backupWriteQueueFull: 'BACKUP_WRITE_QUEUE_FULL',
  backupCheckpointBusy: 'BACKUP_CHECKPOINT_BUSY',
  backupSourceInvalid: 'BACKUP_SOURCE_INVALID',
  backupFormatInvalid: 'BACKUP_FORMAT_INVALID',
  backupIoFailure: 'BACKUP_IO_FAILURE',
  backupExportUnavailable: 'BACKUP_EXPORT_UNAVAILABLE',
  backupExportFailure: 'BACKUP_EXPORT_FAILURE',
  backupStatusUpdateFailure: 'BACKUP_STATUS_UPDATE_FAILURE',
  backupCleanupFailure: 'BACKUP_CLEANUP_FAILURE',
} as const;

export type ErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDetails {
  readonly [key: string]: string | number | boolean | undefined;
}

export class FinanceHubError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'FinanceHubError';
  }
}

export function errorCodeOf(error: unknown): ErrorCode {
  if (error instanceof FinanceHubError) {
    return error.code;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    Object.values(ERROR_CODES).some((code) => code === error.code)
  ) {
    return error.code as ErrorCode;
  }
  return ERROR_CODES.unknown;
}
