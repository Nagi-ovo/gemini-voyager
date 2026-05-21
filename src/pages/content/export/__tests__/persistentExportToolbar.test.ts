import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isPersistentExportToolbarMounted,
  mountPersistentExportToolbar,
} from '../persistentExportToolbar';

afterEach(() => {
  document.querySelectorAll('.gv-persistent-export-toolbar').forEach((n) => n.remove());
});

describe('persistentExportToolbar', () => {
  it('mounts a top-right export button with label and tooltip', () => {
    const onClick = vi.fn();
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });
    expect(isPersistentExportToolbarMounted()).toBe(true);
    expect(handle.root.classList.contains('gv-persistent-export-toolbar')).toBe(true);
    expect(handle.button.getAttribute('aria-label')).toBe('Export chat history');
    expect(handle.button.title).toBe('Export chat history');
    expect(handle.button.textContent).toContain('Export');
  });

  it('invokes onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });
    handle.button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate-mount; second call updates text on existing instance', () => {
    const first = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    const second = mountPersistentExportToolbar({
      label: '导出',
      tooltip: '导出对话历史',
      onClick: vi.fn(),
    });
    expect(document.querySelectorAll('.gv-persistent-export-toolbar').length).toBe(1);
    expect(second.root).toBe(first.root);
    expect(first.button.getAttribute('aria-label')).toBe('导出对话历史');
    expect(first.button.textContent).toContain('导出');
  });

  it('setText updates label/tooltip after language change', () => {
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    handle.setText('Exporter', 'Exporter la conversation');
    expect(handle.button.title).toBe('Exporter la conversation');
    expect(handle.button.getAttribute('aria-label')).toBe('Exporter la conversation');
    expect(handle.button.textContent).toContain('Exporter');
  });
});
