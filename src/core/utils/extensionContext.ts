const EXTENSION_CONTEXT_INVALIDATED_PATTERN = /extension context invalidated/i;

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message = extractMessage(error);
  return EXTENSION_CONTEXT_INVALIDATED_PATTERN.test(message);
}

export function hasValidExtensionContext(): boolean {
  try {
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } })
      .chrome?.runtime;
    return Boolean(runtime?.id);
  } catch {
    return false;
  }
}
