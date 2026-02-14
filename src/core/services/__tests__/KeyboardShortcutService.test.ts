/**
 * KeyboardShortcutService Tests
 * Tests for the enhanced keyboard shortcut functionality
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  KeyboardShortcutService,
  keyboardShortcutService,
} from '../KeyboardShortcutService';
import type { KeyboardShortcutConfig } from '@/core/types/keyboardShortcut';

describe('KeyboardShortcutService', () => {
  beforeEach(() => {
    // Reset singleton instance
    // @ts-expect-error - accessing private static field for testing
    KeyboardShortcutService.instance = null;

    // Mock chrome storage
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn(),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as any;
  });

  describe('Default Configuration', () => {
    it('should have correct default shortcuts', async () => {
      const service = KeyboardShortcutService.getInstance();
      const { config } = service.getConfig();

      // Timeline navigation
      expect(config.previous).toEqual({
        action: 'timeline:previous',
        modifiers: [],
        key: 'k',
      });
      expect(config.next).toEqual({
        action: 'timeline:next',
        modifiers: [],
        key: 'j',
      });
      expect(config.scrollToTop).toEqual({
        action: 'timeline:scrollToTop',
        modifiers: ['Shift'],
        key: 'K',
      });
      expect(config.scrollToBottom).toEqual({
        action: 'timeline:scrollToBottom',
        modifiers: ['Shift'],
        key: 'J',
      });

      // Feature shortcuts
      expect(config.exportChat).toEqual({
        action: 'chat:export',
        modifiers: ['Ctrl', 'Shift'],
        key: 'e',
      });
      expect(config.toggleFolder).toEqual({
        action: 'folder:toggle',
        modifiers: ['Ctrl', 'Shift'],
        key: 'f',
      });
      expect(config.openPrompt).toEqual({
        action: 'prompt:open',
        modifiers: ['Ctrl', 'Shift'],
        key: 'p',
      });
      expect(config.focusInput).toEqual({
        action: 'input:focus',
        modifiers: ['Ctrl', 'Shift'],
        key: 'i',
      });
    });
  });

  describe('Shortcut Validation', () => {
    it('should validate correct configuration', async () => {
      const service = KeyboardShortcutService.getInstance();
      const validConfig: KeyboardShortcutConfig = {
        previous: { action: 'timeline:previous', modifiers: [], key: 'k' },
        next: { action: 'timeline:next', modifiers: [], key: 'j' },
        scrollToTop: { action: 'timeline:scrollToTop', modifiers: ['Shift'], key: 'K' },
        scrollToBottom: { action: 'timeline:scrollToBottom', modifiers: ['Shift'], key: 'J' },
        exportChat: { action: 'chat:export', modifiers: ['Ctrl'], key: 'e' },
        toggleFolder: { action: 'folder:toggle', modifiers: ['Ctrl'], key: 'f' },
        openPrompt: { action: 'prompt:open', modifiers: ['Ctrl'], key: 'p' },
        focusInput: { action: 'input:focus', modifiers: ['Ctrl'], key: 'i' },
      };

      await expect(service.saveConfig(validConfig, true)).resolves.not.toThrow();
    });

    it('should reject invalid configuration with missing shortcuts', async () => {
      const service = KeyboardShortcutService.getInstance();
      const invalidConfig = {
        previous: { action: 'timeline:previous', modifiers: [], key: 'k' },
        next: { action: 'timeline:next', modifiers: [], key: 'j' },
        // Missing other required shortcuts
      } as KeyboardShortcutConfig;

      await expect(service.saveConfig(invalidConfig, true)).rejects.toThrow(
        'Invalid shortcut configuration'
      );
    });

    it('should reject invalid modifier keys', async () => {
      const service = KeyboardShortcutService.getInstance();
      const invalidConfig: KeyboardShortcutConfig = {
        previous: { action: 'timeline:previous', modifiers: ['InvalidModifier' as any], key: 'k' },
        next: { action: 'timeline:next', modifiers: [], key: 'j' },
        scrollToTop: { action: 'timeline:scrollToTop', modifiers: ['Shift'], key: 'K' },
        scrollToBottom: { action: 'timeline:scrollToBottom', modifiers: ['Shift'], key: 'J' },
        exportChat: { action: 'chat:export', modifiers: ['Ctrl'], key: 'e' },
        toggleFolder: { action: 'folder:toggle', modifiers: ['Ctrl'], key: 'f' },
        openPrompt: { action: 'prompt:open', modifiers: ['Ctrl'], key: 'p' },
        focusInput: { action: 'input:focus', modifiers: ['Ctrl'], key: 'i' },
      };

      await expect(service.saveConfig(invalidConfig, true)).rejects.toThrow(
        'Invalid shortcut configuration'
      );
    });
  });

  describe('Shortcut Formatting', () => {
    it('should format shortcuts with modifiers correctly', () => {
      const service = KeyboardShortcutService.getInstance();

      expect(
        service.formatShortcut({
          action: 'timeline:previous',
          modifiers: ['Ctrl', 'Shift'],
          key: 'k',
        })
      ).toBe('Ctrl + Shift + k');
    });

    it('should format shortcuts without modifiers correctly', () => {
      const service = KeyboardShortcutService.getInstance();

      expect(
        service.formatShortcut({
          action: 'timeline:previous',
          modifiers: [],
          key: 'k',
        })
      ).toBe('k');
    });

    it('should format arrow keys with symbols', () => {
      const service = KeyboardShortcutService.getInstance();

      expect(
        service.formatShortcut({
          action: 'timeline:previous',
          modifiers: ['Alt'],
          key: 'ArrowUp',
        })
      ).toBe('Alt + ↑');
    });
  });

  describe('Action Labels', () => {
    it('should return correct labels for all actions', () => {
      const service = KeyboardShortcutService.getInstance();

      expect(service.getActionLabel('timeline:previous')).toBe('Previous Message');
      expect(service.getActionLabel('timeline:next')).toBe('Next Message');
      expect(service.getActionLabel('timeline:scrollToTop')).toBe('Scroll to Top');
      expect(service.getActionLabel('timeline:scrollToBottom')).toBe('Scroll to Bottom');
      expect(service.getActionLabel('chat:export')).toBe('Export Chat');
      expect(service.getActionLabel('folder:toggle')).toBe('Toggle Folder Panel');
      expect(service.getActionLabel('prompt:open')).toBe('Open Prompt Library');
      expect(service.getActionLabel('input:focus')).toBe('Focus Input');
    });
  });

  describe('Listener Management', () => {
    it('should register and notify listeners', () => {
      const service = KeyboardShortcutService.getInstance();
      const listener = vi.fn();

      const unsubscribe = service.on(listener);

      // Simulate a keyboard event
      const event = new KeyboardEvent('keydown', { key: 'k' });
      // @ts-expect-error - accessing private method for testing
      service.notifyListeners('timeline:previous', event);

      expect(listener).toHaveBeenCalledWith('timeline:previous', event);

      unsubscribe();
    });

    it('should unsubscribe listeners correctly', () => {
      const service = KeyboardShortcutService.getInstance();
      const listener = vi.fn();

      const unsubscribe = service.on(listener);
      unsubscribe();

      // Simulate a keyboard event
      const event = new KeyboardEvent('keydown', { key: 'k' });
      // @ts-expect-error - accessing private method for testing
      service.notifyListeners('timeline:previous', event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = KeyboardShortcutService.getInstance();
      const instance2 = KeyboardShortcutService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Reset to Defaults', () => {
    it('should reset configuration to defaults', async () => {
      const service = KeyboardShortcutService.getInstance();

      // Save custom config
      const customConfig: KeyboardShortcutConfig = {
        previous: { action: 'timeline:previous', modifiers: ['Ctrl'], key: 'p' },
        next: { action: 'timeline:next', modifiers: ['Ctrl'], key: 'n' },
        scrollToTop: { action: 'timeline:scrollToTop', modifiers: ['Shift'], key: 'T' },
        scrollToBottom: { action: 'timeline:scrollToBottom', modifiers: ['Shift'], key: 'B' },
        exportChat: { action: 'chat:export', modifiers: ['Alt'], key: 'e' },
        toggleFolder: { action: 'folder:toggle', modifiers: ['Alt'], key: 'f' },
        openPrompt: { action: 'prompt:open', modifiers: ['Alt'], key: 'p' },
        focusInput: { action: 'input:focus', modifiers: ['Alt'], key: 'i' },
      };

      await service.saveConfig(customConfig, true);

      // Reset to defaults
      await service.resetToDefaults();

      const { config } = service.getConfig();
      expect(config.previous.key).toBe('k');
      expect(config.next.key).toBe('j');
    });
  });
});
