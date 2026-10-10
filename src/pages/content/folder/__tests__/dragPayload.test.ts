import { describe, expect, it } from 'vitest';

import { parseDragDataPayload } from '../aistudioPromptLinks';
import {
  isAllowedConversationUrl,
  parseDragPayload,
  parseDragPayloadObject,
  readDragPayload,
} from '../dragPayload';

const extractPromptId = (url: string): string | null =>
  url.match(/\/prompts\/([^/?#]+)/)?.[1] ?? null;

function transferWith(data: Record<string, string>): DataTransfer {
  return { getData: (type: string) => data[type] ?? '' } as unknown as DataTransfer;
}

describe('parseDragPayload: producer shapes', () => {
  it('keeps a native single-conversation drag', () => {
    const payload = {
      type: 'conversation',
      conversationId: 'c_abc123',
      title: 'Plan',
      url: 'https://gemini.google.com/app/abc123',
      isGem: true,
      gemId: 'gem-1',
    };
    expect(parseDragPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('keeps a folder drag', () => {
    const payload = { type: 'folder', folderId: 'f1', title: 'Work' };
    expect(parseDragPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('keeps a folder-row multi drag that carries stored refs but no title', () => {
    const stored = {
      conversationId: 'c_1',
      title: 'One',
      url: 'https://gemini.google.com/u/1/app/1',
      addedAt: 10,
      lastOpenedAt: 20,
      lastTurnAt: 30,
      updatedAt: 40,
      isGem: false,
      gemId: 'g',
      starred: true,
      customTitle: true,
      sortIndex: 2,
    };
    const parsed = parseDragPayload(
      JSON.stringify({ type: 'conversation', conversations: [stored], sourceFolderId: 'f1' }),
    );
    expect(parsed).toEqual({
      type: 'conversation',
      title: '',
      conversations: [stored],
      sourceFolderId: 'f1',
    });
  });

  it('keeps the floating panel row payload', () => {
    expect(
      parseDragPayload(
        JSON.stringify({ type: 'conversation', conversationId: 'c_1', sourceFolderId: 'f2' }),
      ),
    ).toEqual({ type: 'conversation', conversationId: 'c_1', sourceFolderId: 'f2', title: '' });
  });
});

describe('parseDragPayload: malformed and hostile input', () => {
  it.each([
    ['empty', ''],
    ['not JSON', 'not json'],
    ['JSON null', 'null'],
    ['JSON array', '[{"type":"conversation","conversationId":"x"}]'],
    ['JSON string', '"conversation"'],
    ['unknown type', '{"type":"prompt","conversationId":"x"}'],
    ['folder without id', '{"type":"folder","title":"x"}'],
    ['folder id not a string', '{"type":"folder","folderId":7}'],
    ['conversation without id', '{"type":"conversation","title":"x"}'],
    ['empty conversations without id', '{"type":"conversation","conversations":[]}'],
    ['conversations not an array', '{"type":"conversation","conversations":{"0":{}}}'],
    ['conversation element without id', '{"type":"conversation","conversations":[{"title":"x"}]}'],
    ['non-string conversation id', '{"type":"conversation","conversationId":{"x":1}}'],
    ['non-string source folder', '{"type":"conversation","conversationId":"x","sourceFolderId":1}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseDragPayload(raw)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'java\tscript:alert(1)',
    '\njavascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('rejects the conversation url %j', (url) => {
    expect(isAllowedConversationUrl(url)).toBe(false);
    expect(
      parseDragPayload(JSON.stringify({ type: 'conversation', conversationId: 'x', url })),
    ).toBeNull();
    expect(
      parseDragPayload(
        JSON.stringify({ type: 'conversation', conversations: [{ conversationId: 'x', url }] }),
      ),
    ).toBeNull();
  });

  it('allows every url that resolves to http(s), as stored rows may hold them', () => {
    for (const url of [
      '',
      'https://gemini.google.com/app/x',
      'http://a.b/c',
      '/app/x',
      'app/x',
      '//gemini.google.com/app/abcdef1234567890',
      '/\\gemini.google.com/app/x',
      'http://[',
    ]) {
      expect(isAllowedConversationUrl(url)).toBe(true);
    }
  });

  it('keeps stored reference fields but drops prototype keys', () => {
    const raw =
      '{"type":"conversation","conversationId":"x","title":"t","__proto__":{"polluted":true},' +
      '"extra":1,"conversations":[{"conversationId":"y","__proto__":{"polluted":true},' +
      '"constructor":1,"futureField":2,"sortIndex":"3"}]}';
    const parsed = parseDragPayload(raw);
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!).sort()).toEqual([
      'conversationId',
      'conversations',
      'title',
      'type',
    ]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    const reference = parsed!.conversations![0];
    expect(Object.getPrototypeOf(reference)).toBe(Object.prototype);
    expect(reference).toEqual({ conversationId: 'y', title: '', futureField: 2, sortIndex: '3' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('ignores a non-string top-level url instead of rejecting the drag', () => {
    expect(
      parseDragPayloadObject({ type: 'conversation', conversationId: 'x', url: null }),
    ).toEqual({ type: 'conversation', conversationId: 'x', title: '' });
  });

  it('omits wrong-typed optional fields rather than passing them through', () => {
    expect(
      parseDragPayloadObject({
        type: 'conversation',
        conversationId: 'x',
        title: 5,
        isGem: 'yes',
        gemId: 3,
      }),
    ).toEqual({ type: 'conversation', conversationId: 'x', title: '' });
  });

  it('stays JSON-only unless a URL id extractor is supplied', () => {
    expect(parseDragPayload('https://aistudio.google.com/prompts/abc')).toBeNull();
  });
});

describe('parseDragPayload: uri-list fallback', () => {
  const options = { conversationIdFromUrl: extractPromptId, origin: 'https://aistudio.google.com' };

  it('turns a dropped URL into a conversation with an empty title', () => {
    expect(parseDragPayload('https://aistudio.google.com/prompts/xyz987', options)).toEqual({
      type: 'conversation',
      conversationId: 'xyz987',
      title: '',
      url: 'https://aistudio.google.com/prompts/xyz987',
    });
  });

  it('reads the first line of text/x-moz-url and resolves root-relative paths', () => {
    expect(
      parseDragPayload('https://aistudio.google.com/prompts/abc555\nTitle', options)
        ?.conversationId,
    ).toBe('abc555');
    expect(parseDragPayload('/prompts/rel1', options)?.url).toBe(
      'https://aistudio.google.com/prompts/rel1',
    );
  });

  it('rejects non-http URLs and URLs without an id', () => {
    expect(parseDragPayload('javascript:alert(1)//prompts/x', options)).toBeNull();
    expect(parseDragPayload('https://aistudio.google.com/library', options)).toBeNull();
  });

  it('prefers a valid JSON payload over the URL fallback', () => {
    const json = JSON.stringify({ type: 'conversation', conversationId: 'json-id', title: 'T' });
    expect(parseDragPayload(json, options)?.conversationId).toBe('json-id');
  });
});

describe('readDragPayload', () => {
  it('reads only application/json', () => {
    const json = JSON.stringify({ type: 'folder', folderId: 'f1', title: 'F' });
    expect(readDragPayload(transferWith({ 'application/json': json }))?.folderId).toBe('f1');
    expect(
      readDragPayload(transferWith({ 'text/uri-list': 'https://gemini.google.com/app/abc' })),
    ).toBeNull();
    expect(readDragPayload(null)).toBeNull();
  });

  it('returns null when getData throws', () => {
    const transfer = {
      getData: () => {
        throw new Error('protected');
      },
    } as unknown as DataTransfer;
    expect(readDragPayload(transfer)).toBeNull();
  });
});

describe('AI Studio parseDragDataPayload projection', () => {
  it('projects conversation payloads to id, title, url and source folder', () => {
    expect(
      parseDragDataPayload(
        JSON.stringify({
          type: 'conversation',
          conversationId: 'p1',
          title: 'Prompt',
          url: 'https://aistudio.google.com/prompts/p1',
          sourceFolderId: 'f1',
        }),
      ),
    ).toEqual({
      type: 'conversation',
      conversationId: 'p1',
      title: 'Prompt',
      url: 'https://aistudio.google.com/prompts/p1',
      sourceFolderId: 'f1',
    });
    expect(
      parseDragDataPayload(
        JSON.stringify({ type: 'conversation', conversationId: 'p2', title: '' }),
      ),
    ).toEqual({ type: 'conversation', conversationId: 'p2', title: '', url: '' });
  });

  it('ignores folder payloads and hostile urls', () => {
    expect(parseDragDataPayload(JSON.stringify({ type: 'folder', folderId: 'f' }))).toBeNull();
    expect(
      parseDragDataPayload(
        JSON.stringify({ type: 'conversation', conversationId: 'p', url: 'javascript:alert(1)' }),
      ),
    ).toBeNull();
  });
});
