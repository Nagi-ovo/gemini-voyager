import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { VisualEffectChoices } from '../VisualEffectChoices';

const translate = (key: TranslationKey): string => key;

describe('VisualEffectChoices', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('offers the three effects, marks the active one and reports a pick', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<VisualEffectChoices value="sakura" onChange={onChange} t={translate} />);
    });

    // Off is the row's switch, not a choice.
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual([
      'visualEffectSnow',
      'visualEffectSakura',
      'visualEffectRain',
    ]);
    expect(
      buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent),
    ).toEqual(['visualEffectSakura']);
    expect(buttons.every((b) => b.querySelector('svg'))).toBe(true);

    act(() => buttons[2].click());
    expect(onChange).toHaveBeenCalledWith('rain');
  });

  it('exposes only the current effect as pressed as the selection changes', () => {
    const effects = ['snow', 'sakura', 'rain'] as const;

    for (const effect of effects) {
      act(() => {
        root.render(<VisualEffectChoices value={effect} onChange={vi.fn()} t={translate} />);
      });

      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(
        effects.map((option) => String(option === effect)),
      );
    }
  });
});
