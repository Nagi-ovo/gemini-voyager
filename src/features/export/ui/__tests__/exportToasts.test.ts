import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { ExportFormat } from '../../types/export';
import {
  exportingProgressText,
  hideExportProgress,
  reportFinishedExport,
  showExportAlert,
  showExportNotice,
  showExportProgress,
} from '../exportToasts';

const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function useBrowser(userAgent: string, vendor: string): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue(vendor);
}

const translate = (key: string) =>
  ({
    export_toast_safari_pdf_ready: 'Choose Save as PDF in the print dialog',
    export_toast_images_omitted: '{count} images stayed as links',
    floatingPanelClose: 'Close',
  })[key] ?? key;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

afterEach(() => {
  hideExportProgress();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('export outcome toasts', () => {
  it('replaces the previous outcome in place and closes after its duration', () => {
    showExportNotice('Copied');
    showExportNotice('Copied again', { tone: 'success' });

    expect(toastDriver.all()).toMatchObject([{ message: 'Copied again', tone: 'success' }]);
    vi.advanceTimersByTime(2199);
    expect(toastDriver.messages()).toEqual(['Copied again']);
    vi.advanceTimersByTime(1);
    expect(toastDriver.all()).toEqual([]);
  });

  it('announces a failure as an alert and keeps it up long enough to read', () => {
    showExportAlert('Export failed: boom', translate);

    expect(toastDriver.all()).toMatchObject([
      { message: 'Export failed: boom', tone: 'error', role: 'alert' },
    ]);
    vi.advanceTimersByTime(9999);
    expect(toastDriver.messages()).toEqual(['Export failed: boom']);
    vi.advanceTimersByTime(1);
    expect(toastDriver.all()).toEqual([]);
  });
});

describe('export problem toasts', () => {
  it('closes from its own Close button, as the alert it replaced did', () => {
    showExportAlert('Nothing to export yet', translate, 'warning');
    const [alert] = toastDriver.all();

    expect(toastDriver.labels(alert)).toEqual(['Close']);
    toastDriver.press(alert, 'Close');

    expect(toastDriver.all()).toEqual([]);
  });
});

describe('reportFinishedExport', () => {
  it('tells the user how many images stayed as links', () => {
    reportFinishedExport({ omittedImageCount: 3 }, ExportFormat.MARKDOWN, translate);

    expect(toastDriver.all()).toMatchObject([
      { message: '3 images stayed as links', tone: 'warning' },
    ]);
  });

  it('guides Safari users through saving the finished PDF', () => {
    useBrowser(SAFARI_UA, 'Apple Computer, Inc.');

    reportFinishedExport({}, ExportFormat.PDF, translate);

    expect(toastDriver.messages()).toEqual(['Choose Save as PDF in the print dialog']);
  });

  it('keeps the Safari PDF guidance up beside the omitted-images notice', () => {
    useBrowser(SAFARI_UA, 'Apple Computer, Inc.');

    reportFinishedExport({ omittedImageCount: 2 }, ExportFormat.PDF, translate);

    expect(toastDriver.messages()).toEqual([
      'Choose Save as PDF in the print dialog',
      '2 images stayed as links',
    ]);
    vi.advanceTimersByTime(5000);
    expect(toastDriver.messages()).toEqual(['2 images stayed as links']);
    vi.advanceTimersByTime(3000);
    expect(toastDriver.all()).toEqual([]);
  });

  it('shows no PDF guidance outside Safari', () => {
    useBrowser(CHROME_UA, 'Google Inc.');

    reportFinishedExport({}, ExportFormat.PDF, translate);

    expect(toastDriver.all()).toEqual([]);
  });
});

describe('export progress toast', () => {
  const t = (key: string) => ({ pm_export: 'Export', loading: 'Loading' })[key] ?? key;

  it('stays up as one pending toast however long the export runs', () => {
    const progress = showExportProgress(exportingProgressText(t));

    vi.advanceTimersByTime(60_000);

    expect(toastDriver.all()).toMatchObject([
      { title: 'Export...', message: 'Loading', pending: true, role: 'status' },
    ]);
    progress.hide();
    expect(toastDriver.all()).toEqual([]);
  });

  it('leaves a newer step up when an older one finishes late', () => {
    const older = showExportProgress({ message: 'Exporting' });
    showExportProgress({ message: 'Collecting messages' });

    older.hide();

    expect(toastDriver.messages()).toEqual(['Collecting messages']);
  });

  it('keeps an outcome beside the progress rather than replacing it', () => {
    showExportProgress({ message: 'Exporting' });
    showExportNotice('Copied');

    expect(toastDriver.messages()).toEqual(['Exporting', 'Copied']);
  });

  it('closes every step at once when the selection takes over', () => {
    const outer = showExportProgress({ message: 'Exporting' });
    showExportProgress({ message: 'Reading conversation' });

    hideExportProgress();
    outer.hide();

    expect(toastDriver.all()).toEqual([]);
  });
});
