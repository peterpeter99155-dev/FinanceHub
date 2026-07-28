export const FINANCIAL_TIME_ZONE = 'Asia/Taipei';

export interface FinancialDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function financialDateParts(
  value: string | Date,
): FinancialDateParts {
  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error('Financial date-time is invalid.');
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FINANCIAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

export function financialMonthFromDateTime(value: string): string {
  const { year, month } = financialDateParts(value);
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}`;
}

export function financialDateKey(value: string): string {
  const { year, month, day } = financialDateParts(value);
  return [year, month, day]
    .map((part, index) =>
      index === 0
        ? part.toString().padStart(4, '0')
        : part.toString().padStart(2, '0'),
    )
    .join('-');
}

export function shiftFinancialMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + month - 1 + offset;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

export function financialLocalDateTimeInput(value: string): string {
  const { year, month, day, hour, minute } = financialDateParts(value);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(
    minute,
  )}`;
}

export function viewedMonthLocalDateTime(
  year: number,
  month: number,
  now: string,
): string {
  const current = financialDateParts(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${pad(year, 4)}-${pad(month)}-${pad(
    Math.min(current.day, lastDay),
  )}T${pad(current.hour)}:${pad(current.minute)}`;
}

export function financialLocalInputToIso(value: string): string {
  const timestamp = Date.parse(`${value}:00+08:00`);

  if (Number.isNaN(timestamp)) {
    throw new Error('Financial local date-time is invalid.');
  }

  return new Date(timestamp).toISOString();
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}
