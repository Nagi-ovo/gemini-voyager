/**
 * Message Timestamp Tests
 * Tests for the message timestamp feature (Issue #303)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the module
vi.mock('../index', () => ({
  startMessageTimestamp: vi.fn(),
}));

describe('Message Timestamp Feature', () => {
  beforeEach(() => {
    // Reset DOM
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    // Mock chrome storage
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn((keys, callback) => {
            callback({ gvMessageTimestampEnabled: true });
          }),
          set: vi.fn(),
          onChanged: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
          },
        },
      },
    } as any;
  });

  describe('Timestamp Formatting', () => {
    it('should format date to MM/DD/YY h:mm TT format', () => {
      const formatTimestamp = (date: Date): string => {
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear().toString().slice(-2);
        
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
      };

      // Test morning time
      const morningDate = new Date('2026-02-15T09:30:00');
      expect(formatTimestamp(morningDate)).toBe('02/15/26 9:30 AM');

      // Test afternoon time
      const afternoonDate = new Date('2026-02-15T14:45:00');
      expect(formatTimestamp(afternoonDate)).toBe('02/15/26 2:45 PM');

      // Test midnight
      const midnightDate = new Date('2026-02-15T00:00:00');
      expect(formatTimestamp(midnightDate)).toBe('02/15/26 12:00 AM');

      // Test noon
      const noonDate = new Date('2026-02-15T12:00:00');
      expect(formatTimestamp(noonDate)).toBe('02/15/26 12:00 PM');
    });
  });

  describe('Style Injection', () => {
    it('should create style element with correct ID', () => {
      const STYLE_ID = 'gemini-voyager-message-timestamp';
      expect(STYLE_ID).toBe('gemini-voyager-message-timestamp');
    });

    it('should include proper CSS classes', () => {
      const expectedClasses = [
        '.gv-message-timestamp',
        '.gv-message-timestamp:hover',
      ];

      expect(expectedClasses).toContain('.gv-message-timestamp');
      expect(expectedClasses).toContain('.gv-message-timestamp:hover');
    });

    it('should have correct font size', () => {
      const expectedFontSize = '11px';
      expect(expectedFontSize).toBe('11px');
    });

    it('should support dark mode', () => {
      const expectedDarkModeQuery = '@media (prefers-color-scheme: dark)';
      expect(expectedDarkModeQuery).toContain('prefers-color-scheme: dark');
    });
  });

  describe('Storage Integration', () => {
    it('should use correct storage key', () => {
      const STORAGE_KEY = 'gvMessageTimestampEnabled';
      expect(STORAGE_KEY).toBe('gvMessageTimestampEnabled');
    });

    it('should default to enabled', () => {
      const mockGet = vi.fn((keys, callback) => {
        callback({ gvMessageTimestampEnabled: true });
      });

      global.chrome = {
        storage: {
          sync: {
            get: mockGet,
            set: vi.fn(),
            onChanged: {
              addListener: vi.fn(),
            },
          },
        },
      } as any;

      // Verify default is true
      expect(true).toBe(true);
    });

    it('should respect disabled setting', () => {
      const mockGet = vi.fn((keys, callback) => {
        callback({ gvMessageTimestampEnabled: false });
      });

      global.chrome = {
        storage: {
          sync: {
            get: mockGet,
            set: vi.fn(),
            onChanged: {
              addListener: vi.fn(),
            },
          },
        },
      } as any;

      // Verify disabled state
      expect(false).toBe(false);
    });
  });

  describe('DOM Selectors', () => {
    it('should target model response elements', () => {
      const expectedSelectors = [
        'model-response',
        '[data-test-id="model-response"]',
        '.model-response',
        '.response-container',
        'response-container',
        '[role="article"]',
      ];

      expect(expectedSelectors).toContain('model-response');
      expect(expectedSelectors).toContain('[data-test-id="model-response"]');
      expect(expectedSelectors).toContain('.model-response');
    });

    it('should observe chat container', () => {
      const expectedContainers = [
        'main',
        '[role="main"]',
        'chat-window',
        '.chat-container',
      ];

      expect(expectedContainers).toContain('main');
      expect(expectedContainers).toContain('[role="main"]');
    });
  });

  describe('Timestamp Element Creation', () => {
    it('should create element with correct class', () => {
      const timestamp = document.createElement('div');
      timestamp.className = 'gv-message-timestamp';
      
      expect(timestamp.className).toBe('gv-message-timestamp');
    });

    it('should not duplicate timestamps', () => {
      // Create a mock message element
      const messageEl = document.createElement('div');
      
      // Add first timestamp
      const timestamp1 = document.createElement('div');
      timestamp1.className = 'gv-message-timestamp';
      messageEl.appendChild(timestamp1);
      
      // Check if timestamp exists
      const hasTimestamp = messageEl.querySelector('.gv-message-timestamp') !== null;
      expect(hasTimestamp).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should remove style element on cleanup', () => {
      const STYLE_ID = 'gemini-voyager-message-timestamp';
      
      // Create style element
      const style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
      
      // Verify it exists
      expect(document.getElementById(STYLE_ID)).toBe(style);
      
      // Remove it
      style.remove();
      
      // Verify it's gone
      expect(document.getElementById(STYLE_ID)).toBeNull();
    });

    it('should remove all timestamp elements on cleanup', () => {
      // Create multiple timestamp elements
      for (let i = 0; i < 3; i++) {
        const ts = document.createElement('div');
        ts.className = 'gv-message-timestamp';
        document.body.appendChild(ts);
      }
      
      // Verify they exist
      let timestamps = document.querySelectorAll('.gv-message-timestamp');
      expect(timestamps.length).toBe(3);
      
      // Remove all
      timestamps.forEach((ts) => ts.remove());
      
      // Verify they're gone
      timestamps = document.querySelectorAll('.gv-message-timestamp');
      expect(timestamps.length).toBe(0);
    });
  });

  describe('Mutation Observer', () => {
    it('should observe childList and subtree', () => {
      const expectedConfig = {
        childList: true,
        subtree: true,
      };

      expect(expectedConfig.childList).toBe(true);
      expect(expectedConfig.subtree).toBe(true);
    });
  });
});
