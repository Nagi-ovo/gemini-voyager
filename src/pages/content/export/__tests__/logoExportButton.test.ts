import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type LogoExportButton, mountLogoExportButton } from '../logoExportButton';

function renderLogo(): { header: HTMLElement; logo: HTMLElement } {
  const header = document.createElement('div');
  header.className = 'test-header';
  const logo = document.createElement('a');
  logo.setAttribute('data-test-id', 'logo');
  logo.href = '/app';
  header.appendChild(logo);
  document.body.appendChild(header);
  return { header, logo };
}

function exportButton(): HTMLButtonElement | null {
  return document.querySelector('.gv-logo-dropdown-wrapper .gv-export-dropdown-btn');
}

describe('mountLogoExportButton', () => {
  let mounted: LogoExportButton | null = null;
  let texts = { label: 'Export', title: 'Export chat history' };

  beforeEach(() => {
    vi.useFakeTimers();
    texts = { label: 'Export', title: 'Export chat history' };
  });

  afterEach(() => {
    mounted?.stop();
    mounted = null;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('wraps the logo with a labelled export button that opens the dialog', () => {
    const { header, logo } = renderLogo();
    const onClick = vi.fn();
    texts = { label: 'Exporter', title: 'Exporter la conversation' };

    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick });

    const button = exportButton();
    expect(header.querySelector('.gv-logo-dropdown-wrapper')?.contains(logo)).toBe(true);
    expect(button?.title).toBe('Exporter la conversation');
    expect(button?.getAttribute('aria-label')).toBe('Exporter la conversation');
    expect(button?.querySelector('.gv-export-dropdown-label')?.textContent).toBe('Exporter');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    button!.dispatchEvent(click);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(true);
  });

  it('keeps presses on the button from reaching the logo link', () => {
    const { header, logo } = renderLogo();
    const headerPress = vi.fn();
    header.addEventListener('mousedown', headerPress);
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick: vi.fn() });

    exportButton()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(headerPress).not.toHaveBeenCalled();
  });

  it('binds the button only once', () => {
    const { logo } = renderLogo();
    const onClick = vi.fn();
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick });

    expect(mountLogoExportButton(logo, { texts: () => texts, onClick })).toBeNull();
    exportButton()!.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('relabels the mounted button', () => {
    const { logo } = renderLogo();
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick: vi.fn() });

    mounted!.relabel({ label: '导出', title: '导出对话记录' });

    expect(exportButton()?.title).toBe('导出对话记录');
    expect(exportButton()?.querySelector('.gv-export-dropdown-label')?.textContent).toBe('导出');
  });

  it('re-creates the button with current texts after Gemini re-renders the header', async () => {
    const { header, logo } = renderLogo();
    const onClick = vi.fn();
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick });

    header.remove();
    renderLogo();
    texts = { label: 'エクスポート', title: '会話をエクスポート' };
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(799);
    expect(exportButton()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(exportButton()?.title).toBe('会話をエクスポート');
    exportButton()!.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('also recovers after printing', async () => {
    const { header, logo } = renderLogo();
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick: vi.fn() });

    header.remove();
    renderLogo();
    window.dispatchEvent(new Event('gv-print-cleanup'));
    await vi.advanceTimersByTimeAsync(800);

    expect(exportButton()).not.toBeNull();
  });

  it('stops re-creating the button once stopped', async () => {
    const { header, logo } = renderLogo();
    mounted = mountLogoExportButton(logo, { texts: () => texts, onClick: vi.fn() });
    mounted!.stop();

    header.remove();
    renderLogo();
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(exportButton()).toBeNull();
  });
});
