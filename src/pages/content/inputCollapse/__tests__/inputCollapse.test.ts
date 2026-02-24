/**
 * Tests for inputCollapse feature
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
} as any;

// Mock i18n
vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => {
    const translations: Record<string, string> = {
      inputCollapsePlaceholder: 'Message Gemini',
    };
    return translations[key] || key;
  },
}));

describe('inputCollapse', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Default mock for storage.get
    (chrome.storage.sync.get as any).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvInputCollapseEnabled: false, gvInputCollapseWhenNotEmpty: false });
      }
    );
  });

  afterEach(() => {
    const { cleanup } = require('../index');
    cleanup?.();
    vi.useRealTimers();
  });

  function createMockContainer(content: string = ''): HTMLElement {
    const container = document.createElement('div');
    container.className = 'element-to-collapse gv-processed';

    const textarea = document.createElement('rich-textarea');
    textarea.textContent = content;
    container.appendChild(textarea);

    const placeholder = document.createElement('div');
    placeholder.className = 'gv-collapse-placeholder';
    container.appendChild(placeholder);

    document.body.appendChild(container);
    return container;
  }

  describe('Feature disabled', () => {
    it('does not initialize when feature is disabled', async () => {
      (chrome.storage.sync.get as any).mockImplementation(
        (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
          callback({ gvInputCollapseEnabled: false });
        }
      );

      const { startInputCollapse } = await import('../index');
      startInputCollapse();

      // Check that styles are not injected
      expect(document.getElementById('gemini-voyager-input-collapse')).toBeNull();
    });
  });

  describe('Default behavior (collapse only when empty)', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as any).mockImplementation(
        (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
          callback({ gvInputCollapseEnabled: true, gvInputCollapseWhenNotEmpty: false });
        }
      );

      const { startInputCollapse } = await import('../index');
      startInputCollapse();
    });

    it('collapses when input is empty and loses focus', async () => {
      const container = createMockContainer('');

      // Simulate focusout event
      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);

      vi.advanceTimersByTime(200);

      expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    });

    it('does not collapse when input has content and loses focus', async () => {
      const container = createMockContainer('test content');

      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);

      vi.advanceTimersByTime(200);

      expect(container.classList.contains('gv-input-collapsed')).toBe(false);
    });

    it('expands on click when collapsed', async () => {
      const container = createMockContainer('');

      // First collapse it
      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);
      vi.advanceTimersByTime(200);
      expect(container.classList.contains('gv-input-collapsed')).toBe(true);

      // Then click to expand
      container.dispatchEvent(new Event('click', { bubbles: true }));
      expect(container.classList.contains('gv-input-collapsed')).toBe(false);
    });
  });

  describe('Allow collapse when not empty (new feature)', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as any).mockImplementation(
        (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
          callback({ gvInputCollapseEnabled: true, gvInputCollapseWhenNotEmpty: true });
        }
      );

      const { startInputCollapse } = await import('../index');
      startInputCollapse();
    });

    it('collapses when input is empty and loses focus', async () => {
      const container = createMockContainer('');

      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);

      vi.advanceTimersByTime(200);

      expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    });

    it('collapses even when input has content and loses focus', async () => {
      const container = createMockContainer('test content');

      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);

      vi.advanceTimersByTime(200);

      expect(container.classList.contains('gv-input-collapsed')).toBe(true);
    });

    it('expands on click when collapsed with content', async () => {
      const container = createMockContainer('test content');

      // Collapse it first
      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);
      vi.advanceTimersByTime(200);
      expect(container.classList.contains('gv-input-collapsed')).toBe(true);

      // Verify content is preserved
      const textarea = container.querySelector('rich-textarea');
      expect(textarea?.textContent).toBe('test content');

      // Click to expand
      container.dispatchEvent(new Event('click', { bubbles: true }));
      expect(container.classList.contains('gv-input-collapsed')).toBe(false);
    });
  });

  describe('Setting changes', () => {
    it('responds to enable/disable changes dynamically', async () => {
      // Start with feature enabled
      (chrome.storage.sync.get as any).mockImplementation(
        (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
          callback({ gvInputCollapseEnabled: true, gvInputCollapseWhenNotEmpty: false });
        }
      );

      const { startInputCollapse } = await import('../index');
      startInputCollapse();

      const container = createMockContainer('');
      const focusOutEvent = new Event('focusout', { bubbles: true });
      Object.defineProperty(focusOutEvent, 'relatedTarget', { value: null, writable: false });
      container.dispatchEvent(focusOutEvent);
      vi.advanceTimersByTime(200);
      expect(container.classList.contains('gv-input-collapsed')).toBe(true);

      // Simulate setting change to disabled
      const mockCallbacks = (chrome.storage.onChanged.addListener as any).mock.calls;
      if (mockCallbacks && mockCallbacks.length > 0) {
        const onChangeCallback = mockCallbacks[0][0];
        onChangeCallback({ gvInputCollapseEnabled: { newValue: false } }, 'sync');

        container.classList.remove('gv-input-collapsed');
        container.dispatchEvent(focusOutEvent);
        vi.advanceTimersByTime(200);
        // Should not collapse when disabled
        expect(container.classList.contains('gv-input-collapsed')).toBe(false);
      }
    });
  });
});
