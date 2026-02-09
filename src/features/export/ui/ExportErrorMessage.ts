import { IMAGE_RENDER_EVENT_ERROR_CODE } from '../types/errors';

export function resolveExportErrorMessage(
  error: unknown,
  t: (key: 'export_error_generic' | 'export_error_refresh_retry') => string,
): string {
  const raw = typeof error === 'string' ? error.trim() : String(error || '').trim();

  if (raw === IMAGE_RENDER_EVENT_ERROR_CODE) {
    return t('export_error_refresh_retry');
  }

  const genericTemplate = t('export_error_generic');
  const detail = raw || 'unknown error';

  if (genericTemplate.includes('{error}')) {
    return genericTemplate.replace('{error}', detail);
  }

  return `${genericTemplate} ${detail}`.trim();
}
