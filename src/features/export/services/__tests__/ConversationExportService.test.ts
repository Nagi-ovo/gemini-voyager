/**
 * ConversationExportService unit tests
 */

import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ChatTurn, ConversationMetadata } from '../../types/export';
import { ConversationExportService } from '../ConversationExportService';


// Setup DOM environment

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document as any;
global.window = dom.window as any;

describe('ConversationExportService', () => {
  const mockMetadata: ConversationMetadata = {
    url: 'https://gemini.google.com/app/test',
    exportedAt: '2025-01-15T10:30:00.000Z',
    count: 2,
  };

  const mockTurns: ChatTurn[] = [
    {
      user: 'Test question',
      assistant: 'Test answer',
      starred: false,
    },
  ];

  // Mock DOM methods
  beforeEach(() => {
    document.body.innerHTML = '';

    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    // Mock window.print
    (global.window as any).print = vi.fn();

    // Mock document.createElement to prevent actual downloads
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        // Mock click to prevent actual download
        element.click = vi.fn();
      }
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('export', () => {
    it('should export as JSON', async () => {
      const result = await ConversationExportService.export(mockTurns, mockMetadata, {
        format: 'json' as any,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(result.filename).toMatch(/\.json$/);
    });

    it('should export as Markdown', async () => {
      const result = await ConversationExportService.export(mockTurns, mockMetadata, {
        format: 'markdown' as any,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('markdown');
      expect(result.filename).toMatch(/\.md$/);
    });

    it('should export as PDF', async () => {
      const result = await ConversationExportService.export(mockTurns, mockMetadata, {
        format: 'pdf' as any,
      });

      expect(result.success).toBe(true);
      expect(result.format).toBe('pdf');
      expect((global.window as any).print).toHaveBeenCalled();
    });

    it('should handle unsupported format', async () => {
      const result = await ConversationExportService.export(mockTurns, mockMetadata, {
        format: 'invalid' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported format');
    });

    it('should use custom filename if provided', async () => {
      const customFilename = 'my-export.json';
      const result = await ConversationExportService.export(mockTurns, mockMetadata, {
        format: 'json' as any,
        filename: customFilename,
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBe(customFilename);
    });

    it('should handle export errors gracefully', async () => {
      // Mock an error by throwing in the format method
      const invalidTurns: ChatTurn[] = [
        {
          user: 'test',
          assistant: 'test',
          starred: false,
        },
      ];

      // Mock JSON.stringify to throw
      const originalStringify = JSON.stringify;
      vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
        throw new Error('Stringify error');
      });

      const result = await ConversationExportService.export(invalidTurns, mockMetadata, {
        format: 'json' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stringify error');

      // Restore
      JSON.stringify = originalStringify;
    });
  });

  describe('getAvailableFormats', () => {
    it('should return all available formats', () => {
      const formats = ConversationExportService.getAvailableFormats();

      expect(formats).toHaveLength(3);
      expect(formats.map((f) => f.format)).toEqual(['json', 'markdown', 'pdf']);
    });

    it('should mark Markdown as recommended', () => {
      const formats = ConversationExportService.getAvailableFormats();
      const markdown = formats.find((f) => f.format === 'markdown');

      expect(markdown?.recommended).toBe(true);
    });

    it('should include descriptions', () => {
      const formats = ConversationExportService.getAvailableFormats();

      formats.forEach((format) => {
        expect(format.label).toBeTruthy();
        expect(format.description).toBeTruthy();
      });
    });
  });
});
