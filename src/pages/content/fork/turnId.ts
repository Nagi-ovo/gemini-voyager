const USER_TURN_ID_RE = /^u-(\d+)(?:-.+)?$/;

export function makeStableTurnId(index: number): string {
  return `u-${Math.max(0, index)}`;
}

export function normalizeTurnId(turnId: string): string {
  const trimmed = turnId.trim();
  const match = USER_TURN_ID_RE.exec(trimmed);
  if (!match) return trimmed;
  return `u-${match[1]}`;
}
