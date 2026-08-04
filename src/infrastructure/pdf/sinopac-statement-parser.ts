import { createHash } from 'node:crypto';

import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import type {
  ImportParseRequest,
  ImportParser,
} from '../../application/ports/import-parser';
import type {
  ImportTransactionKind,
  ParsedImportBatch,
  ParsedImportObservation,
} from '../../domain/import';
import {
  ERROR_CODES,
  type ErrorCode,
  FinanceHubError,
} from '../../shared/errors';
import { IMPORT_WARNING_CODES } from '../../shared/import-warning-codes';
import { observationFingerprintInput } from '../../shared/import-fingerprint';

export const SINOPAC_PARSER_NAME = 'sinopac-credit-card-statement-pdf';
export const SINOPAC_PARSER_VERSION = '1.1.0';

interface PdfParseLimits {
  readonly maxFileBytes: number;
  readonly maxPages: number;
  readonly maxTextItems: number;
  readonly timeoutMs: number;
}

export const PDF_PARSE_LIMITS: PdfParseLimits = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxPages: 30,
  maxTextItems: 50_000,
  timeoutMs: 10_000,
});

interface TextItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly sourceIndex: number;
}

interface TextRow {
  readonly y: number;
  readonly items: readonly TextItem[];
  readonly text: string;
}

interface ParsedRow {
  readonly transactionMd: string;
  readonly postingMd: string;
  readonly cardLastFour: string;
  readonly summary: string;
  readonly signedAmount: number;
  readonly warningCodes: readonly string[];
}

const REQUIRED_MARKERS = [
  '消費日',
  '入帳起息日',
  '卡號末四碼',
  '帳單說明',
  '臺幣金額',
] as const;
const ROW_PATTERN = /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(\d{4}|----)\s+(.+?)\s+(-?[\d,]+)(?:\s+\d{2}\/\d{2}\s+[A-Z]{3}[\d,.]+)?$/;
const AMOUNT_ONLY_ROW_PATTERN = /^(\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+(?:\d{4}|----))\s+(-?[\d,]+)$/;
const SUMMARY_COLUMN_TOLERANCE = 3;

export class SinopacStatementParser implements ImportParser {
  constructor(
    private readonly limits: PdfParseLimits = PDF_PARSE_LIMITS,
  ) {}

  async parse(request: ImportParseRequest): Promise<ParsedImportBatch> {
    if (request.content.byteLength > this.limits.maxFileBytes) {
      throw safePdfError(ERROR_CODES.pdfFileTooLarge);
    }
    return parseWithDeadline(request, this.limits);
  }
}

async function parseWithDeadline(
  request: ImportParseRequest,
  limits: PdfParseLimits,
): Promise<ParsedImportBatch> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => Promise<void>) | undefined;
  return Promise.race([
    parsePdf(request, limits, (operation) => {
      cancel = operation;
    }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => {
          void cancel?.();
          reject(safePdfError(ERROR_CODES.pdfParseTimeout));
        },
        limits.timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
}

async function parsePdf(
  request: ImportParseRequest,
  limits: PdfParseLimits,
  registerCancellation: (operation: () => Promise<void>) => void,
): Promise<ParsedImportBatch> {
  const loadingTask = getDocument({
    data: new Uint8Array(request.content),
    ...(request.sourcePassword
      ? { password: request.sourcePassword }
      : {}),
    isEvalSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    useWorkerFetch: false,
    useWasm: false,
    verbosity: 0,
  } as Parameters<typeof getDocument>[0] & {
    readonly isEvalSupported: boolean;
  });
  registerCancellation(() => loadingTask.destroy());

  try {
    const document = await loadingTask.promise;
    if (document.numPages > limits.maxPages) {
      throw safePdfError(ERROR_CODES.pdfPageLimitExceeded);
    }
    const pages: TextItem[][] = [];
    let totalTextItems = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageItems: TextItem[] = [];
      for (const [sourceIndex, item] of content.items.entries()) {
        if (!('str' in item)) continue;
        totalTextItems += 1;
        if (totalTextItems > limits.maxTextItems) {
          throw safePdfError(ERROR_CODES.pdfTextItemLimitExceeded);
        }
        const text = item.str.trim();
        if (text) {
          pageItems.push({
            text,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            sourceIndex,
          });
        }
      }
      pages.push(pageItems);
      page.cleanup();
    }
    if (totalTextItems === 0) {
      throw safePdfError(ERROR_CODES.pdfNoExtractableText);
    }
    return buildParsedBatch(pages, request);
  } catch (error) {
    if (error instanceof FinanceHubError) throw error;
    if (error instanceof PasswordException) {
      throw safePdfError(
        error.code === PasswordResponses.NEED_PASSWORD
          ? ERROR_CODES.pdfPasswordRequired
          : ERROR_CODES.pdfPasswordIncorrect,
      );
    }
    if (error instanceof InvalidPDFException) {
      throw safePdfError(ERROR_CODES.pdfInvalid);
    }
    throw safePdfError(ERROR_CODES.pdfParseFailed);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

function buildParsedBatch(
  pages: readonly (readonly TextItem[])[],
  request: ImportParseRequest,
): ParsedImportBatch {
  const compactText = pages
    .flat()
    .map(({ text }) => text)
    .join('')
    .replace(/\s+/g, '');
  const closing = compactText.match(/結帳日(\d{4})\/(\d{2})\/(\d{2})/);
  if (!closing || !REQUIRED_MARKERS.every((marker) => compactText.includes(marker))) {
    throw safePdfError(ERROR_CODES.pdfUnsupportedFormat);
  }
  const statementTotal = parseStatementTotal(compactText);
  if (statementTotal === undefined) {
    throw safePdfError(ERROR_CODES.pdfParseIncomplete);
  }
  const statementYear = Number(closing[1]);
  const statementMonth = Number(closing[2]);
  const observations: ParsedImportObservation[] = [];
  let unmatchedRows = 0;
  const allRows = pages.flatMap(groupRows);
  const summaryColumnX = findNormalSummaryColumnX(allRows);

  for (const [pageIndex, pageItems] of pages.entries()) {
    const rows = groupRows(pageItems);
    const usedSummarySourceIndexes = new Set<number>();
    for (const row of rows) {
      if (!/^\d{2}\/\d{2}\s+\d{2}\/\d{2}(?:\s|$)/.test(row.text)) continue;
      if (isAutomaticPayment(row.text)) continue;
      const parsed = parseRow(
        row,
        pageItems,
        summaryColumnX,
        usedSummarySourceIndexes,
      );
      if (!parsed) {
        unmatchedRows += 1;
        continue;
      }
      const classified = classifySinopacObservation(
        parsed.summary,
        parsed.signedAmount,
      );
      markUsedSummaryItems(
        pageItems,
        row.y,
        summaryColumnX,
        usedSummarySourceIndexes,
      );
      const occurredAt = inferDate(
        parsed.transactionMd,
        statementYear,
        statementMonth,
      );
      const amount = Math.abs(parsed.signedAmount);
      observations.push({
        observationFingerprint: createHash('sha256')
          .update(
            observationFingerprintInput({
            occurredAt,
              statementEffect: parsed.signedAmount,
              summary: parsed.summary,
              creditCardAccountId: request.creditCardAccountId,
            }),
          )
          .digest('hex'),
        kind: parsed.warningCodes.length === 0
          ? classified.kind
          : undefined,
        amount,
        statementEffect: parsed.signedAmount,
        occurredAt,
        occurredAtPrecision: 'date',
        summary: parsed.summary,
        pageNumber: pageIndex + 1,
        anonymousRowLocator: `page-${pageIndex + 1}-y-${row.y}`,
        warningCodes: [
          ...parsed.warningCodes,
          ...classified.warningCodes,
        ],
      });
    }
  }
  if (observations.length === 0) {
    throw safePdfError(ERROR_CODES.pdfUnsupportedFormat);
  }
  if (unmatchedRows > 0) {
    throw new FinanceHubError(
      ERROR_CODES.pdfParseIncomplete,
      '帳單中有無法安全辨識的項目，未建立匯入批次。',
      {
        unmatchedRowCount: unmatchedRows,
        reviewDisposition: 'special_review',
        warningCode: 'ROW_REQUIRES_SPECIAL_REVIEW',
      },
    );
  }
  return {
    sourceType: 'sinopac_credit_card_monthly_pdf',
    sourceFileDigest: createHash('sha256')
      .update(request.content)
      .digest('hex'),
    statementMonth: `${closing[1]}-${closing[2]}`,
    creditCardAccountId: request.creditCardAccountId,
    parserName: SINOPAC_PARSER_NAME,
    parserVersion: SINOPAC_PARSER_VERSION,
    statementDetailTotal: statementTotal,
    observations,
  };
}

function parseRow(
  row: TextRow,
  pageItems: readonly TextItem[],
  summaryColumnX: number | null,
  usedSummarySourceIndexes: ReadonlySet<number>,
): ParsedRow | undefined {
  let match = row.text.match(ROW_PATTERN);
  if (!match) {
    const amountOnly = row.text.match(AMOUNT_ONLY_ROW_PATTERN);
    if (!amountOnly) return undefined;
    const splitDescription = resolveSplitDescription(
      pageItems,
      row,
      summaryColumnX,
      usedSummarySourceIndexes,
    );
    if (!splitDescription.fragments) {
      const core = amountOnly[1].match(
        /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(\d{4}|----)$/,
      );
      if (!core) return undefined;
      return {
        transactionMd: core[1],
        postingMd: core[2],
        cardLastFour: core[3],
        summary: '',
        signedAmount: parseInteger(amountOnly[2]),
        warningCodes: [splitDescription.warningCode],
      };
    }
    match = `${amountOnly[1]} ${splitDescription.fragments.map(({ text }) => text).join('')} ${amountOnly[2]}`
      .match(ROW_PATTERN);
    if (!match) return undefined;
  }
  return {
    transactionMd: match[1],
    postingMd: match[2],
    cardLastFour: match[3],
    summary: match[4],
    signedAmount: parseInteger(match[5]),
    warningCodes: [],
  };
}

function resolveSplitDescription(
  pageItems: readonly TextItem[],
  row: TextRow,
  summaryColumnX: number | null,
  usedSummarySourceIndexes: ReadonlySet<number>,
): {
  readonly fragments?: readonly TextItem[];
  readonly warningCode: string;
} {
  if (summaryColumnX === null) {
    return { warningCode: 'SPLIT_DESCRIPTION_COLUMN_UNKNOWN' };
  }
  const card = row.items.find(({ text }) => /^(?:\d{4}|----)$/.test(text));
  const amount = [...row.items].reverse().find(({ text }) => /^-?[\d,]+$/.test(text));
  if (!card || !amount) {
    return { warningCode: 'SPLIT_DESCRIPTION_BOUNDARY_UNAVAILABLE' };
  }
  const fragments = pageItems
    .filter((item) =>
      Math.abs(item.y - row.y) <= 10 &&
      item.x > card.x &&
      item.x < amount.x &&
      Math.abs(item.x - summaryColumnX) <= SUMMARY_COLUMN_TOLERANCE &&
      !row.items.some(({ sourceIndex }) => sourceIndex === item.sourceIndex),
    )
    .sort((left, right) => left.sourceIndex - right.sourceIndex);
  if (fragments.length !== 2) {
    return {
      warningCode:
        IMPORT_WARNING_CODES.splitDescriptionFragmentCountUnsupported,
    };
  }
  if (fragments[1].sourceIndex !== fragments[0].sourceIndex + 1) {
    return { warningCode: 'SPLIT_DESCRIPTION_SOURCE_ORDER_NONCONTIGUOUS' };
  }
  if (fragments.some(({ sourceIndex }) =>
    usedSummarySourceIndexes.has(sourceIndex))) {
    return { warningCode: 'SPLIT_DESCRIPTION_FRAGMENT_ALREADY_USED' };
  }
  return { fragments, warningCode: '' };
}

function groupRows(items: readonly TextItem[]): TextRow[] {
  const groups = new Map<number, TextItem[]>();
  for (const item of items) {
    const key = Math.round(item.y / 3) * 3;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([y, rowItems]) => {
      const sorted = rowItems.sort((left, right) => left.x - right.x);
      return {
        y,
        items: sorted,
        text: sorted.map(({ text }) => text).join(' ').replace(/\s+/g, ' ').trim(),
      };
    });
}

function findNormalSummaryColumnX(rows: readonly TextRow[]): number | null {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (!ROW_PATTERN.test(row.text)) continue;
    const card = row.items.find(({ text }) => /^(?:\d{4}|----)$/.test(text));
    const amount = [...row.items].reverse().find(({ text }) => /^-?[\d,]+$/.test(text));
    const summary = card && amount
      ? row.items.find((item) => item.x > card.x && item.x < amount.x)
      : undefined;
    if (summary) counts.set(summary.x, (counts.get(summary.x) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

function markUsedSummaryItems(
  pageItems: readonly TextItem[],
  rowY: number,
  summaryColumnX: number | null,
  used: Set<number>,
): void {
  if (summaryColumnX === null) return;
  for (const item of pageItems) {
    if (
      Math.abs(item.y - rowY) <= 10 &&
      Math.abs(item.x - summaryColumnX) <= SUMMARY_COLUMN_TOLERANCE
    ) used.add(item.sourceIndex);
  }
}

export function classifySinopacObservation(
  summary: string,
  signedAmount: number,
): {
  readonly kind?: ImportTransactionKind;
  readonly warningCodes: readonly string[];
} {
  if (signedAmount > 0) return { kind: 'credit_card_purchase', warningCodes: [] };
  if (signedAmount < 0 && /退款|退貨/.test(summary)) {
    return { kind: 'credit_card_refund', warningCodes: [] };
  }
  if (signedAmount === 0) {
    return {
      warningCodes: [IMPORT_WARNING_CODES.zeroAmountNotImportable],
    };
  }
  return {
    warningCodes: [
      IMPORT_WARNING_CODES.negativeItemRequiresUserConfirmation,
    ],
  };
}

function parseStatementTotal(compactText: string): number | undefined {
  const match = compactText.match(/(?:您的正卡,?)?本期應繳(?:金額)?合計(-?[\d,]+)/i);
  return match ? parseInteger(match[1]) : undefined;
}

function isAutomaticPayment(value: string): boolean {
  return /自動扣款|自扣已入帳|扣款已入帳|AUTOPAYMENT/i.test(value.replace(/\s+/g, ''));
}

function inferDate(value: string, statementYear: number, statementMonth: number): string {
  const [monthText, dayText] = value.split('/');
  const month = Number(monthText);
  const year = statementMonth <= 2 && month >= 11
    ? statementYear - 1
    : statementYear;
  if (month < 1 || month > 12) throw safePdfError(ERROR_CODES.pdfParseIncomplete);
  return `${year}-${monthText}-${dayText}T04:00:00.000Z`;
}

function parseInteger(value: string): number {
  const parsed = Number(value.replaceAll(',', ''));
  if (!Number.isSafeInteger(parsed)) throw safePdfError(ERROR_CODES.pdfParseIncomplete);
  return parsed;
}

function safePdfError(code: ErrorCode): FinanceHubError {
  return new FinanceHubError(code, '無法安全解析這份 PDF 帳單。');
}
