export const IMPORT_DECISIONS = [
  'create_new',
  'link_existing',
  'exclude',
] as const;
export type ImportDecision = (typeof IMPORT_DECISIONS)[number];

export const FINANCIAL_TIME_PRECISIONS = ['date', 'datetime'] as const;
export type FinancialTimePrecision =
  (typeof FINANCIAL_TIME_PRECISIONS)[number];

export type ImportTransactionKind =
  | 'credit_card_purchase'
  | 'credit_card_refund';

export interface ParsedImportObservation {
  readonly observationFingerprint: string;
  readonly kind: ImportTransactionKind;
  readonly amount: number;
  readonly occurredAt: string;
  readonly occurredAtPrecision: FinancialTimePrecision;
  readonly summary: string;
  readonly pageNumber: number;
  readonly anonymousRowLocator: string;
  readonly warningCodes: readonly string[];
}

export interface ParsedImportBatch {
  readonly sourceType: string;
  readonly sourceFileDigest: string;
  readonly statementMonth: string;
  readonly creditCardAccountId: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly statementDetailTotal: number;
  readonly observations: readonly ParsedImportObservation[];
}

export interface ImportBatch {
  readonly id: string;
  readonly sourceType: string;
  readonly sourceFileDigest: string;
  readonly statementMonth: string;
  readonly creditCardAccountId: string;
  readonly importedAt: string;
  readonly parserName: string;
  readonly parserVersion: string;
  readonly statementDetailTotal: number;
  readonly parsedDetailTotal: number;
}

export interface SourceObservation extends ParsedImportObservation {
  readonly id: string;
  readonly batchId: string;
}

export interface ImportCandidate {
  readonly id: string;
  readonly batchId: string;
  readonly observationId: string;
  readonly kind: ImportTransactionKind;
  readonly amount: number;
  readonly occurredAt: string;
  readonly occurredAtPrecision: FinancialTimePrecision;
  readonly name: string;
  readonly creditCardAccountId: string;
  readonly categoryId?: string;
  readonly decision?: ImportDecision;
  readonly transactionId?: string;
  readonly updatedAt: string;
}

export interface TransactionSourceLink {
  readonly observationId: string;
  readonly transactionId: string;
  readonly linkedAt: string;
}

export interface CandidateDecision {
  readonly candidateId: string;
  readonly decision: ImportDecision;
  readonly existingTransactionId?: string;
}

export function calculateStatementDetailTotal(
  observations: readonly Pick<
    ParsedImportObservation,
    'kind' | 'amount'
  >[],
): number {
  let total = 0;
  for (const observation of observations) {
    const direction =
      observation.kind === 'credit_card_refund' ? -1 : 1;
    total += direction * observation.amount;
    if (!Number.isSafeInteger(total)) {
      throw new Error('Statement detail total exceeds the supported range.');
    }
  }
  return total;
}
