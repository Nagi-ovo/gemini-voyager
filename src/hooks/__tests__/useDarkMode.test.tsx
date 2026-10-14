import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DarkModeToggle } from '@/components/DarkModeToggle';
import { LanguageProvider } from '@/contexts/LanguageContext';
import {
  getInitialThemeMode,
  getNextThemeMode,
  resolveIsDark,
  useDarkMode,
} from '@/hooks/useDarkMode';

describe('useDarkMode helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getInitialThemeMode', () => {
    it('defaults to auto when no stored preference exists', () => {
      expect(getInitialThemeMode()).toBe('auto');
    });

    it('reads saved themeMode when valid', () => {
      localStorage.setItem('themeMode', 'dark');
      expect(getInitialThemeMode()).toBe('dark');

      localStorage.setItem('themeMode', 'light');
      expect(getInitialThemeMode()).toBe('light');

      localStorage.setItem('themeMode', 'auto');
      expect(getInitialThemeMode()).toBe('auto');
    });

    it('falls back to legacy darkMode boolean when themeMode is not set', () => {
      localStorage.setItem('darkMode', 'true');
      expect(getInitialThemeMode()).toBe('dark');

      localStorage.setItem('darkMode', 'false');
      expect(getInitialThemeMode()).toBe('light');
    });
  });

  describe('getNextThemeMode', () => {
    it('cycles in physical button order: light -> auto -> dark -> light', () => {
      expect(getNextThemeMode('light')).toBe('auto');
      expect(getNextThemeMode('auto')).toBe('dark');
      expect(getNextThemeMode('dark')).toBe('light');
    });
  });

  describe('resolveIsDark', () => {
    it('returns true for dark and false for light', () => {
      expect(resolveIsDark('dark')).toBe(true);
      expect(resolveIsDark('light')).toBe(false);
    });
  });
});

describe('useDarkMode hook and DarkModeToggle component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.classList.remove('dark');
  });

  function HookHarness() {
    const { themeMode, isDark, toggleDarkMode } = useDarkMode();
    return (
      <div>
        <span data-testid="mode">{themeMode}</span>
        <span data-testid="isDark">{String(isDark)}</span>
        <button data-testid="toggle" onClick={(e) => toggleDarkMode(e)} type="button">
          Toggle
        </button>
      </div>
    );
  }

  it('initializes in auto mode and toggles through cycle', () => {
    act(() => {
      root.render(<HookHarness />);
    });

    const modeEl = container.querySelector('[data-testid="mode"]')!;
    const toggleBtn = container.querySelector('[data-testid="toggle"]') as HTMLButtonElement;

    expect(modeEl.textContent).toBe('auto');

    // Click 1: auto -> forced theme
    act(() => {
      toggleBtn.click();
    });
    expect(localStorage.getItem('themeMode')).not.toBe('auto');

    // Click 2
    act(() => {
      toggleBtn.click();
    });

    // Click 3: returns to auto
    act(() => {
      toggleBtn.click();
    });
    expect(modeEl.textContent).toBe('auto');
    expect(localStorage.getItem('themeMode')).toBe('auto');
  });

  it('renders DarkModeToggle with auto monitor icon and cycles', () => {
    act(() => {
      root.render(
        <LanguageProvider>
          <DarkModeToggle />
        </LanguageProvider>,
      );
    });

    const button = container.querySelector('button')!;
    expect(button).toBeTruthy();
    // Default mode is auto, should have lucide-monitor
    expect(button.querySelector('.lucide-monitor')).toBeTruthy();

    act(() => {
      button.click();
    });
    // Mode is no longer auto
    expect(button.querySelector('.lucide-monitor')).toBeFalsy();
  });
});
