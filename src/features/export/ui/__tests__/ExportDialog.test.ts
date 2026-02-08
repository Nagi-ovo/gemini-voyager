import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportDialog } from '../ExportDialog';

describe('ExportDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('does not autofocus the first (json) radio option', () => {
    vi.useFakeTimers();

    const dialog = new ExportDialog();
    dialog.show({
      onExport: () => {},
      onCancel: () => {},
      translations: {
        title: 'Export Chat',
        selectFormat: 'Select format',
        warning: 'Warning',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const firstRadio = document.querySelector(
      'input[name="export-format"][value="json"]',
    ) as HTMLInputElement | null;
    const wrapper = document.querySelector('.gv-export-dialog') as HTMLElement | null;
    expect(firstRadio).not.toBeNull();
    expect(wrapper).not.toBeNull();

    vi.advanceTimersByTime(120);

    expect(document.activeElement).toBe(wrapper);
    expect(document.activeElement).not.toBe(firstRadio);
  });

  it('does not render warning block when warning is empty', () => {
    const dialog = new ExportDialog();
    dialog.show({
      onExport: () => {},
      onCancel: () => {},
      translations: {
        title: 'Export',
        selectFormat: 'Select format',
        warning: '',
        safariCmdpHint: 'Safari tip',
        safariMarkdownHint: 'Safari markdown tip',
        cancel: 'Cancel',
        export: 'Export',
        fontSizeLabel: 'Font Size',
        fontSizePreview: 'The quick brown fox jumps over the lazy dog.',
        formatDescriptions: {
          json: 'JSON format',
          markdown: 'Markdown format',
          pdf: 'PDF format',
          image: 'Image format',
        },
      },
    });

    const warning = document.querySelector('.gv-export-dialog-warning') as HTMLElement | null;
    expect(warning).toBeNull();
  });
});
