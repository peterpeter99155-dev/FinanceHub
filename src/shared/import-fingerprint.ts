interface ObservationIdentityInput {
  readonly occurredAt: string;
  readonly statementEffect: number;
  readonly summary: string;
  readonly creditCardAccountId: string;
}

export function observationFingerprintInput(
  input: ObservationIdentityInput,
): string {
  return [
    input.occurredAt.slice(0, 10),
    input.statementEffect,
    normalizeFingerprintText(input.summary),
    input.creditCardAccountId,
  ].join('|');
}

function normalizeFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-TW');
}
