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
        cancel: 'Cancel',
        export: 'Export',
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
});
