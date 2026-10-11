import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type FormulaCopyPopupSettings,
  useFormulaCopyPopupSettings,
} from '../useFormulaCopyPopupSettings';

function Harness({ capture }: { capture: (settings: FormulaCopyPopupSettings) => void }) {
  const settings = useFormulaCopyPopupSettings();

  useEffect(() => {
    capture(settings);
  }, [capture, settings]);

  return null;
}

describe('useFormulaCopyPopupSettings', () => {
  let container: HTMLDivElement;
  let root: Root;
  let settings: FormulaCopyPopupSettings;

  const render = (): void => {
    act(() => {
      root.render(<Harness capture={(nextSettings) => (settings = nextSettings)} />);
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('hydrates untouched settings from storage', () => {
    act(() => settings.hydrateFromStorage(false, 'notion'));

    expect(settings.enabled).toBe(false);
    expect(settings.format).toBe('notion');
  });

  it('does not overwrite user changes with a late storage snapshot', () => {
    act(() => {
      settings.setEnabledFromUser(false);
      settings.setFormatFromUser('notion');
    });
    act(() => settings.hydrateFromStorage(true, 'latex'));

    expect(settings.enabled).toBe(false);
    expect(settings.format).toBe('notion');
  });

  it('hydrates each setting independently when only the other one was touched', () => {
    act(() => settings.setEnabledFromUser(false));
    act(() => settings.hydrateFromStorage(true, 'no-dollar'));

    expect(settings.enabled).toBe(false);
    expect(settings.format).toBe('no-dollar');
  });

  it.each([
    ['missing', undefined, true],
    ['false', false, false],
    ['true', true, true],
    ['the string "false"', 'false', true],
    ['0', 0, true],
    ['null', null, true],
  ])('reads a %s enabled value the way the page does', (_label, stored, expected) => {
    act(() => settings.hydrateFromStorage(stored, undefined));
    expect(settings.enabled).toBe(expected);
  });

  it('ignores an invalid stored format', () => {
    act(() => settings.hydrateFromStorage(false, 'invalid'));

    expect(settings.enabled).toBe(false);
    expect(settings.format).toBe('latex');
  });
});
