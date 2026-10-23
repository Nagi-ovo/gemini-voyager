import { describe, expect, it } from 'vitest';

import { resolveExportErrorMessage } from '../ExportErrorMessage';

describe('resolveExportErrorMessage', () => {
  const t = (
    key:
      | 'export_error_generic'
      | 'export_error_refresh_retry'
      | 'export_select_mode_empty'
      | 'export_read_interrupted',
  ): string => {
    if (key === 'export_error_refresh_retry') {
      return 'Image export failed to load some resources. Please refresh the page and try exporting again.';
    }
    if (key === 'export_select_mode_empty') return 'Select at least one message.';
    if (key === 'export_read_interrupted') return 'Wait for the response to finish.';
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

  it('hides internal ChatGPT export tokens behind refresh guidance', () => {
    expect(
      resolveExportErrorMessage(new Error('chatgpt_export_message_unavailable:id'), t),
    ).toContain('Please refresh the page');
    expect(resolveExportErrorMessage(new Error('export_empty_selection'), t)).toBe(
      'Select at least one message.',
    );
    expect(resolveExportErrorMessage(new Error('export_read_interrupted'), t)).toBe(
      'Wait for the response to finish.',
    );
  });
});
