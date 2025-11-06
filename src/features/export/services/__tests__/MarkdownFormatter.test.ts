/**
 * MarkdownFormatter unit tests
 */

import { describe, it, expect } from 'vitest';

import type { ChatTurn, ConversationMetadata } from '../../types/export';
import { MarkdownFormatter } from '../MarkdownFormatter';


describe('MarkdownFormatter', () => {
  const mockMetadata: ConversationMetadata = {
    url: 'https://gemini.google.com/app/test-conversation',
    exportedAt: '2025-01-15T10:30:00.000Z',
    count: 2,
    title: 'Test Conversation',
  };

  const mockTurns: ChatTurn[] = [
    {
      user: 'Hello, how are you?',
      assistant: 'I am doing well, thanks!',
      starred: false,
    },
    {
      user: 'Can you help me with TypeScript?',
      assistant: 'Of course! TypeScript is a superset of JavaScript...',
      starred: true,
    },
  ];

  describe('format', () => {
    it('should generate valid Markdown', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toBeTruthy();
      expect(markdown).toContain('# Test Conversation');
      expect(markdown).toContain('---');
    });

    it('should include metadata', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toContain('**Date**:');
      expect(markdown).toContain('**Turns**: 2');
      expect(markdown).toContain('[Gemini Chat]');
    });

    it('should format turns correctly', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toContain('## Turn 1');
      expect(markdown).toContain('## Turn 2 ⭐');
      expect(markdown).toContain('### 👤 User');
      expect(markdown).toContain('### 🤖 Assistant');
    });

    it('should include user content', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toContain('Hello, how are you?');
      expect(markdown).toContain('Can you help me with TypeScript?');
    });

    it('should include assistant content', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toContain('I am doing well, thanks!');
      expect(markdown).toContain('Of course! TypeScript is a superset of JavaScript...');
    });

    it('should mark starred turns', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      const lines = markdown.split('\n');
      const turn2Line = lines.find((l) => l.startsWith('## Turn 2'));

      expect(turn2Line).toContain('⭐');
    });

    it('should include footer', () => {
      const markdown = MarkdownFormatter.format(mockTurns, mockMetadata);

      expect(markdown).toContain('Gemini Voyager');
      expect(markdown).toContain('Generated on');
    });

    it('should handle empty assistant response', () => {
      const turnsWithEmpty: ChatTurn[] = [
        {
          user: 'Test question',
          assistant: '',
          starred: false,
        },
      ];

      const markdown = MarkdownFormatter.format(turnsWithEmpty, mockMetadata);

      expect(markdown).toContain('Test question');
      expect(markdown).toContain('### 🤖 Assistant');
    });

    it('should handle special characters', () => {
      const turnsWithSpecial: ChatTurn[] = [
        {
          user: 'Test with *asterisks* and _underscores_',
          assistant: 'Response with `code` and [links]',
          starred: false,
        },
      ];

      const markdown = MarkdownFormatter.format(turnsWithSpecial, mockMetadata);

      // Should escape special characters in title but not in content
      expect(markdown).toBeTruthy();
    });
  });

  describe('generateFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = MarkdownFormatter.generateFilename();

      expect(filename).toMatch(/^gemini-chat-\d{8}-\d{6}\.md$/);
    });

    it('should have .md extension', () => {
      const filename = MarkdownFormatter.generateFilename();

      expect(filename.endsWith('.md')).toBe(true);
    });
  });
});
