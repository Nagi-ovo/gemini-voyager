import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { usePopupLayoutSettings } from '../../hooks/usePopupLayoutSettings';
import type { NativePopupSectionId } from '../../utils/nativeSiteCapabilities';
import { PopupLayoutSettings } from '../PopupLayoutSettings';

const translate = (key: TranslationKey) => key;

function Harness({
  isAIStudio = false,
  visibleSections,
}: {
  isAIStudio?: boolean;
  visibleSections?: NativePopupSectionId[];
}) {
  const settings = usePopupLayoutSettings({ isAIStudio });
  return (
    <PopupLayoutSettings
      settings={settings}
      t={translate}
      wrapSection={(id, content) =>
        !visibleSections || visibleSections.includes(id) ? (
          <section key={id} data-section={id}>
            {content}
          </section>
        ) : null
      }
    />
  );
}

describe('PopupLayoutSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    vi.mocked(chrome.storage.sync.get).mockImplementation((...args: unknown[]) => {
      const callback = args[1];
      if (typeof callback === 'function') callback(args[0]);
      return Promise.resolve(args[0] as Record<string, unknown>);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: React.ComponentProps<typeof Harness> = {}) => {
    act(() => root.render(<Harness {...props} />));
  };
  const slider = (label: string) =>
    container.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;

  it('renders the layout sections that stay outside the Plugins card, each once', () => {
    render();
    expect(
      Array.from(container.querySelectorAll('section')).map((section) => section.dataset.section),
    ).toEqual(['folderSpacing', 'folderTreeIndent', 'gemsSidebar', 'sidebarWidth']);
    expect(slider('folderSpacing').getAttribute('aria-valuetext')).toBe('2px');
    expect(container.querySelector('input[aria-label="chatWidth"]')).toBeNull();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('shows the AI Studio sidebar label, bounds and default', () => {
    render({ isAIStudio: true });
    const sidebar = slider('AI Studio Sidebar');
    expect(sidebar.value).toBe('280');
    expect(sidebar.min).toBe('240');
    expect(sidebar.max).toBe('600');
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});
