export function normalizeIndianPhone(input: string): { value: string; anomaly: boolean } {
  if (!input || !input.trim()) return { value: input, anomaly: false };
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return { value: '+' + digits, anomaly: false };
  }
  if (digits.length === 10) {
    return { value: '+91' + digits, anomaly: false };
  }
  return { value: input.trim(), anomaly: true };
}
