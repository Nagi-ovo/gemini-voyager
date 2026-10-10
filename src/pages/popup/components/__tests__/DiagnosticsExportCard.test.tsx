import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiagnosticsExportCard } from '../DiagnosticsExportCard';

const diagnosticsMocks = vi.hoisted(() => ({
  buildVoyagerDiagnostics: vi.fn(),
  copyVoyagerDiagnosticsMarkdown: vi.fn(),
  downloadVoyagerDiagnostics: vi.fn(),
  formatVoyagerDiagnosticsMarkdown: vi.fn(),
}));

vi.mock('@/core/services/DiagnosticsExportService', () => diagnosticsMocks);

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === text,
  );
}

describe('DiagnosticsExportCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('previews diagnostics before copying GitHub Markdown', async () => {
    const payload = { format: 'gemini-voyager.plugin-diagnostics.v1' };
    diagnosticsMocks.buildVoyagerDiagnostics.mockReturnValue(payload);
    diagnosticsMocks.formatVoyagerDiagnosticsMarkdown.mockReturnValue('```json\n{}\n```');
    diagnosticsMocks.copyVoyagerDiagnosticsMarkdown.mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <DiagnosticsExportCard
          activeUrl="https://claude.ai/new"
          plugins={[
            {
              id: 'voyager.test',
              version: '1.0.0',
              source: 'builtin',
              enabled: true,
            },
          ]}
        />,
      );
    });

    await act(async () => buttonWithText(container, 'diagnosticsPreview')?.click());

    expect(diagnosticsMocks.buildVoyagerDiagnostics).toHaveBeenCalledWith({
      activeUrl: 'https://claude.ai/new',
      nativeHealth: [],
      plugins: [
        {
          id: 'voyager.test',
          version: '1.0.0',
          source: 'builtin',
          enabled: true,
        },
      ],
    });
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    const preview = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(preview.value).toBe('```json\n{}\n```');
    expect(preview.wrap).toBe('off');
    expect(preview.getAttribute('spellcheck')).toBe('false');

    const downloadButton = buttonWithText(container, 'diagnosticsDownloadJson');
    const copyButton = buttonWithText(container, 'diagnosticsCopyMarkdown');
    expect(downloadButton?.firstElementChild?.classList.contains('inline-flex')).toBe(true);
    expect(copyButton?.firstElementChild?.classList.contains('inline-flex')).toBe(true);

    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(diagnosticsMocks.copyVoyagerDiagnosticsMarkdown).toHaveBeenCalledWith(payload);
    expect(buttonWithText(container, 'diagnosticsCopied')).toBeTruthy();
  });

  it('keeps preview and JSON download available when clipboard copy fails', async () => {
    const payload = { format: 'gemini-voyager.plugin-diagnostics.v1' };
    diagnosticsMocks.buildVoyagerDiagnostics.mockReturnValue(payload);
    diagnosticsMocks.formatVoyagerDiagnosticsMarkdown.mockReturnValue('manual-copy');
    diagnosticsMocks.copyVoyagerDiagnosticsMarkdown.mockRejectedValue(
      new Error('clipboard unavailable'),
    );

    await act(async () => {
      root.render(<DiagnosticsExportCard activeUrl="https://claude.ai/new" plugins={[]} />);
    });
    await act(async () => buttonWithText(container, 'diagnosticsPreview')?.click());
    await act(async () => {
      buttonWithText(container, 'diagnosticsCopyMarkdown')?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.textContent).toContain('diagnosticsCopyFailed');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('manual-copy');

    await act(async () => buttonWithText(container, 'diagnosticsDownloadJson')?.click());
    expect(diagnosticsMocks.downloadVoyagerDiagnostics).toHaveBeenCalledWith(payload);
  });

  it('waits for plugin manifests and state before enabling preview', async () => {
    await act(async () => {
      root.render(<DiagnosticsExportCard activeUrl="https://claude.ai/new" loading plugins={[]} />);
    });

    expect(buttonWithText(container, 'diagnosticsPreview')?.disabled).toBe(true);
    expect(diagnosticsMocks.buildVoyagerDiagnostics).not.toHaveBeenCalled();
  });
});
