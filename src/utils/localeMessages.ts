export type LocaleMessageEntry = {
  message: string;
  description?: string;
};

export type LocaleMessagesJson = Record<string, LocaleMessageEntry>;

export function extractMessageDictionary(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};

  const maybeModule = raw as Record<string, unknown>;
  const resolvedRaw =
    maybeModule.default && typeof maybeModule.default === 'object' ? maybeModule.default : raw;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedRaw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const message = (value as Record<string, unknown>).message;
    if (typeof message === 'string') out[key] = message;
  }
  return out;
}
