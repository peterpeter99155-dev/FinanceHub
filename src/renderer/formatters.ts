export function financialTone(
  value: number,
): 'positive' | 'negative' | 'neutral' {
  if (value > 0) {
    return 'positive';
  }
  if (value < 0) {
    return 'negative';
  }
  return 'neutral';
}
