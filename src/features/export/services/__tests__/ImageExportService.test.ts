import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatTurn, ConversationMetadata } from '../../types/export';
import { ImageExportService } from '../ImageExportService';

vi.mock('html-to-image', () => {
  return {
    toBlob: vi.fn(),
  };
});

import { toBlob } from 'html-to-image';

describe('ImageExportService', () => {
  const mockMetadata: ConversationMetadata = {
    url: 'https://gemini.google.com/app/test',
    exportedAt: '2026-01-01T00:00:00.000Z',
    count: 1,
    title: 'Test',
  };

  const mockTurns: ChatTurn[] = [
    {
      user: 'Hello',
      assistant: 'World',
      starred: false,
    },
  ];

  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        el.click = vi.fn();
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders via html-to-image and downloads a png', async () => {
    (toBlob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'image/png' }),
    );

    await ImageExportService.export(mockTurns, mockMetadata, { filename: 'chat.png' });

    expect(toBlob).toHaveBeenCalledOnce();
    expect(global.URL.createObjectURL).toHaveBeenCalledOnce();
    const anchors = document.querySelectorAll('a');
    expect(anchors.length).toBeGreaterThan(0);
    expect((anchors[0] as HTMLAnchorElement).download).toBe('chat.png');
  });
});
