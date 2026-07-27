const MAX_TWD_AMOUNT = Number.MAX_SAFE_INTEGER;

declare const twdAmountBrand: unique symbol;

export type TwdAmount = number & {
  readonly [twdAmountBrand]: 'TwdAmount';
};

export function createTwdAmount(value: number): TwdAmount {
  if (!Number.isSafeInteger(value)) {
    throw new Error('TWD amount must be a safe integer.');
  }

  if (value < 0) {
    throw new Error('TWD amount cannot be negative.');
  }

  return value as TwdAmount;
}

export function addTwdAmounts(
  left: TwdAmount,
  right: TwdAmount,
): TwdAmount {
  const result = left + right;

  if (!Number.isSafeInteger(result) || result > MAX_TWD_AMOUNT) {
    throw new Error('TWD amount exceeds the supported range.');
  }

  return createTwdAmount(result);
}

export const ZERO_TWD = createTwdAmount(0);
