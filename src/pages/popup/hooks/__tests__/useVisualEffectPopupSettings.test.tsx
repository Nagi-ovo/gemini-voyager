import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { VisualEffectPicker } from '../../components/VisualEffectPicker';
import { useVisualEffectPopupSettings } from '../useVisualEffectPopupSettings';

const translate = (key: TranslationKey): string => key;

describe('visual effect popup settings with their picker', () => {
  let root: Root;
  let container: HTMLDivElement;
  let visual: ReturnType<typeof useVisualEffectPopupSettings>;
  const write = vi.fn(async (_payload: Record<string, unknown>) => {});

  function Harness() {
    const currentVisual = useVisualEffectPopupSettings(write);
    useEffect(() => {
      visual = currentVisual;
    }, [currentVisual]);
    return <VisualEffectPicker {...currentVisual} t={translate} />;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    write.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('falls back to legacy snow, prefers a named effect, and clears legacy snow when choosing off', () => {
    const activeLabel = () => container.querySelector('button.shadow-md')?.textContent;
    act(() => visual.hydrateFromStorage({ gvVisualEffect: 'off', gvSnowEffect: true }));
    expect(visual.value).toBe('snow');
    expect(activeLabel()).toBe('visualEffectSnow');

    act(() => visual.hydrateFromStorage({ gvVisualEffect: 'rain', gvSnowEffect: true }));
    expect(visual.value).toBe('rain');
    expect(activeLabel()).toBe('visualEffectRain');
    const off = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === 'visualEffectOff',
    )!;
    act(() => off.click());
    expect(visual.value).toBe('off');
    expect(activeLabel()).toBe('visualEffectOff');
    expect(write).toHaveBeenCalledWith({ gvVisualEffect: 'off', gvSnowEffect: false });
    act(() => visual.hydrateFromStorage(write.mock.calls[0][0]));
    expect(visual.value).toBe('off');
  });
});
