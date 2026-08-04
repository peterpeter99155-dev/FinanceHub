import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifySinopacObservation,
  PDF_PARSE_LIMITS,
  SinopacStatementParser,
} from '../../src/infrastructure/pdf/sinopac-statement-parser';
import { toIpcResult } from '../../src/shared/ipc-result';

const FIXTURES = path.resolve('tests/fixtures/import');
const FIXTURE_PDF_PASSWORD = 'FIXTURE-PDF-PASSWORD-7319';

async function parseFixture(name: string, sourcePassword?: string) {
  return new SinopacStatementParser().parse({
    content: new Uint8Array(await readFile(path.join(FIXTURES, name))),
    sourcePassword,
    creditCardAccountId: 'fictional-card',
  });
}

describe('SinopacStatementParser', () => {
  it('parses a fictional multi-page statement and reconciles its bank total', async () => {
    const parsed = await parseFixture('statement-plain.pdf');

    expect(parsed).toMatchObject({
      sourceType: 'sinopac_credit_card_monthly_pdf',
      statementMonth: '2030-01',
      creditCardAccountId: 'fictional-card',
      statementDetailTotal: 4073,
    });
    expect(parsed.observations).toHaveLength(6);
    expect(parsed.observations.map(({ kind, amount }) => ({ kind, amount })))
      .toEqual([
        { kind: 'credit_card_purchase', amount: 1234 },
        { kind: 'credit_card_purchase', amount: 2600 },
        { kind: 'credit_card_refund', amount: 500 },
        { kind: undefined, amount: 100 },
        { kind: 'credit_card_purchase', amount: 789 },
        { kind: undefined, amount: 50 },
      ]);
    expect(parsed.observations[4].summary)
      .toBe('FICTIONAL MULTI-LINE DESCRIPTION');
    expect(parsed.observations[3]).toMatchObject({
      statementEffect: -100,
      warningCodes: ['NEGATIVE_ITEM_REQUIRES_USER_CONFIRMATION'],
    });
    expect(parsed.observations[5]).toMatchObject({
      statementEffect: 50,
      warningCodes: ['SPLIT_DESCRIPTION_FRAGMENT_COUNT_UNSUPPORTED'],
    });
    expect(parsed.observations.every(({ occurredAtPrecision }) =>
      occurredAtPrecision === 'date')).toBe(true);
  });

  it('uses PDF-password-specific errors without exposing the supplied password', async () => {
    await expect(parseFixture('statement-encrypted.pdf')).rejects
      .toMatchObject({ code: 'PDF_PASSWORD_REQUIRED' });
    const attempt = parseFixture('statement-encrypted.pdf', 'wrong-fixture-password');
    await expect(attempt).rejects.toMatchObject({
      code: 'PDF_PASSWORD_INCORRECT',
      details: undefined,
    });
    await expect(attempt).rejects.not.toThrow(/wrong-fixture-password/);
    await expect(parseFixture('statement-encrypted.pdf', FIXTURE_PDF_PASSWORD))
      .resolves.toMatchObject({ statementDetailTotal: 4073 });
    await expect(toIpcResult(() =>
      parseFixture('statement-encrypted.pdf', 'another-wrong-password'),
    )).resolves.toEqual({ ok: false, code: 'PDF_PASSWORD_INCORRECT' });
  });

  it('does not use statement reconciliation effect as a transaction-kind guess', () => {
    expect(classifySinopacObservation('虛構商店退款', -100)).toEqual({
      kind: 'credit_card_refund',
      warningCodes: [],
    });
    expect(classifySinopacObservation('虛構回饋折抵', -100)).toEqual({
      warningCodes: ['NEGATIVE_ITEM_REQUIRES_USER_CONFIRMATION'],
    });
  });

  it('keeps statementEffect outside the classification function', async () => {
    const source = await readFile(
      path.resolve('src/infrastructure/pdf/sinopac-statement-parser.ts'),
      'utf8',
    );
    const start = source.indexOf('export function classifySinopacObservation');
    const end = source.indexOf('\nfunction parseStatementTotal', start);
    expect(start).toBeGreaterThan(-1);
    expect(source.slice(start, end)).not.toContain('statementEffect');
  });

  it.each([
    ['corrupt.pdf', 'PDF_INVALID'],
    ['scanned.pdf', 'PDF_NO_EXTRACTABLE_TEXT'],
    ['unsupported.pdf', 'PDF_UNSUPPORTED_FORMAT'],
  ])('fails safely for %s', async (name, code) => {
    await expect(parseFixture(name)).rejects.toMatchObject({
      code,
      details: undefined,
    });
  });

  it('enforces file, page, text-item and execution limits with stable codes', async () => {
    const parser = new SinopacStatementParser();
    await expect(parser.parse({
      content: new Uint8Array(10 * 1024 * 1024 + 1),
      creditCardAccountId: 'fictional-card',
    })).rejects.toMatchObject({ code: 'PDF_FILE_TOO_LARGE' });
    const content = new Uint8Array(
      await readFile(path.join(FIXTURES, 'statement-plain.pdf')),
    );
    await expect(new SinopacStatementParser({
      ...PDF_PARSE_LIMITS,
      maxPages: 2,
    }).parse({ content, creditCardAccountId: 'fictional-card' }))
      .rejects.toMatchObject({ code: 'PDF_PAGE_LIMIT_EXCEEDED' });
    await expect(new SinopacStatementParser({
      ...PDF_PARSE_LIMITS,
      maxTextItems: 1,
    }).parse({ content, creditCardAccountId: 'fictional-card' }))
      .rejects.toMatchObject({ code: 'PDF_TEXT_ITEM_LIMIT_EXCEEDED' });
    await expect(new SinopacStatementParser({
      ...PDF_PARSE_LIMITS,
      timeoutMs: 0,
    }).parse({ content, creditCardAccountId: 'fictional-card' }))
      .rejects.toMatchObject({ code: 'PDF_PARSE_TIMEOUT' });
  });
});
