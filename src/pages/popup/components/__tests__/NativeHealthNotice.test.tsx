import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NativeHealthEntry } from '@/core/gemini/nativeHealth';

import { NativeHealthNotice } from '../NativeHealthNotice';

const CONVERSATION_URL = 'https://gemini.google.com/u/1/app/0123456789abcdef';

const timelineBroken: NativeHealthEntry = {
  feature: 'timeline',
  anchor: 'turn.user',
  status: 'broken',
  route: 'conversation',
  firstSeenAt: 1_790_000_000_000,
  lastSeenAt: 1_790_000_010_000,
  extensionVersion: '1.7.3',
};

describe('NativeHealthNotice', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('chrome', {
      ...chrome,
      runtime: { ...chrome.runtime, getManifest: () => ({ version: '1.7.3' }) },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function render(entries: NativeHealthEntry[], onDismiss = vi.fn(), language = 'en') {
    act(() => {
      root.render(
        <NativeHealthNotice
          entries={entries}
          language={language}
          onDismiss={onDismiss}
          t={(key) => key}
        />,
      );
    });
    return onDismiss;
  }

  it('renders nothing while every feature is healthy', () => {
    render([]);
    expect(container.innerHTML).toBe('');
  });

  it('names each affected feature and links a prefilled report', () => {
    render([
      timelineBroken,
      { ...timelineBroken, feature: 'composer', anchor: 'chatInput.composer', route: 'new-chat' },
    ]);

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('nativeHealthTimeline');
    expect(status?.textContent).toContain('nativeHealthComposer');
    expect(status?.textContent).toContain('nativeHealthCause');

    const link = container.querySelector<HTMLAnchorElement>('a');
    expect(link?.textContent).toBe('nativeHealthReport');
    expect(link?.target).toBe('_blank');
    const url = new URL(link!.href);
    expect(url.pathname).toBe('/voyager-crew/voyager/issues/new');
    expect(url.searchParams.get('extension-version')).toBe('1.7.3');
    expect(url.searchParams.get('title')).toContain('timeline/turn.user');
    expect(url.searchParams.get('title')).toContain('composer/chatInput.composer');
  });

  it('keeps the active page out of the report link', () => {
    render([timelineBroken]);
    const href = decodeURIComponent(container.querySelector('a')!.href);
    expect(href).not.toContain('0123456789abcdef');
    expect(href).not.toContain(CONVERSATION_URL);
    expect(href).not.toContain('gemini.google.com');
    expect(href).not.toContain('/app/');
  });

  it('lays out right to left in an RTL popup language', () => {
    render([timelineBroken], vi.fn(), 'ar');
    expect(container.querySelector('[role="status"]')?.getAttribute('dir')).toBe('rtl');

    render([timelineBroken], vi.fn(), 'zh_TW');
    expect(container.querySelector('[role="status"]')?.getAttribute('dir')).toBe('ltr');
  });

  it('dismisses from its close button', () => {
    const onDismiss = render([timelineBroken]);
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="nativeHealthDismiss"]',
    );
    act(() => button!.click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
