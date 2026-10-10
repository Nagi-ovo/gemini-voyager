/** How long an armed write may wait for its storage.onChanged echo. */
export const STORAGE_ECHO_SUPPRESS_WINDOW_MS = 2000;

export interface StorageEcho {
  readonly key: string;
  readonly serialized: string;
  readonly armedAt: number;
}

/**
 * JSON with object keys sorted at every level. chrome.storage hands listeners a
 * copy whose keys come back sorted, so insertion-order JSON would never match.
 */
export function serializeStoredValue(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return nested;
    const record = nested as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}

/**
 * Recognises this context's own storage writes so their echo can skip a
 * reload. An optimisation only: a missed echo costs one reload of this
 * context's own data. An echo matches only the exact value written, since
 * Chrome emits nothing for an unchanged or rejected write while Firefox
 * reports unchanged ones too.
 */
export class StorageEchoTracker {
  private echoes: StorageEcho[] = [];

  get pendingCount(): number {
    return this.echoes.length;
  }

  /** Call before writing. Expired echoes go now: a write Chrome never reports leaves no event. */
  arm(key: string, serialized: string | undefined): StorageEcho | null {
    this.echoes = this.live();
    if (serialized === undefined) return null;
    const echo: StorageEcho = { key, serialized, armedAt: Date.now() };
    this.echoes.push(echo);
    return echo;
  }

  /** Remove suppression for an attempt that reported failure. */
  disarm(echo: StorageEcho | null): void {
    if (echo) this.echoes = this.echoes.filter((entry) => entry !== echo);
  }

  /** True when a storage change for `key` is the echo of an armed write. */
  consume(key: string, newValue: unknown): boolean {
    const serialized = serializeStoredValue(newValue);
    const live = this.live();
    const index = live.findIndex((echo) => echo.key === key && echo.serialized === serialized);
    // Events arrive in write order, so earlier echoes for this key will never come.
    // On a mismatch, drop them all: a later external write could restore their value.
    const cutoff = index === -1 ? Infinity : index;
    this.echoes = live.filter((echo, position) => echo.key !== key || position > cutoff);
    return index !== -1;
  }

  private live(): StorageEcho[] {
    const now = Date.now();
    return this.echoes.filter((echo) => now - echo.armedAt <= STORAGE_ECHO_SUPPRESS_WINDOW_MS);
  }
}
