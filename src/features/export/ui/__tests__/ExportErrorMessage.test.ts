import { describe, expect, it } from 'vitest';

import { resolveExportErrorMessage } from '../ExportErrorMessage';

describe('resolveExportErrorMessage', () => {
  const t = (key: 'export_error_generic' | 'export_error_refresh_retry'): string => {
    if (key === 'export_error_refresh_retry') {
      return 'Image export failed to load some resources. Please refresh the page and try exporting again.';
    }
    return 'Export failed: {error}';
  };

  it('returns refresh guidance for image render event errors', () => {
    const message = resolveExportErrorMessage('image_render_event_error', t);
    expect(message).toContain('Please refresh the page');
  });

  it('returns generic export error for other failures', () => {
    const message = resolveExportErrorMessage('network timeout', t);
    expect(message).toBe('Export failed: network timeout');
  });
});
