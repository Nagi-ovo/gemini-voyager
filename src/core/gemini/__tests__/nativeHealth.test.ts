import { describe, expect, it } from 'vitest';

import {
  type NativeHealthEntry,
  buildNativeHealthIssueUrl,
  classifyGeminiRoute,
  nativeHealthDismissKey,
  parseNativeHealthEntries,
} from '../nativeHealth';

const timelineBroken: NativeHealthEntry = {
  feature: 'timeline',
  anchor: 'turn.user',
  status: 'broken',
  route: 'conversation',
  firstSeenAt: 1_790_000_000_000,
  lastSeenAt: 1_790_000_010_000,
  extensionVersion: '1.7.3',
};

describe('classifyGeminiRoute', () => {
  it.each([
    ['/app/0123456789abcdef', 'conversation'],
    ['/u/2/app/0123456789abcdef', 'conversation'],
    ['/gem/coding-partner/0123456789abcdef', 'conversation'],
    ['/app', 'new-chat'],
    ['/app/', 'new-chat'],
    ['/u/1/app', 'new-chat'],
    ['/gem/coding-partner', 'new-chat'],
    ['/mystuff', 'other'],
    ['/gems/view', 'other'],
  ])('%s is a %s route', (pathname, route) => {
    expect(classifyGeminiRoute(pathname)).toBe(route);
  });
});

describe('parseNativeHealthEntries', () => {
  it('keeps known feature/anchor pairs and drops everything else', () => {
    expect(
      parseNativeHealthEntries([
        timelineBroken,
        { ...timelineBroken, feature: 'unknown-feature' },
        { ...timelineBroken, feature: 'export', anchor: 'free text from the page' },
        { ...timelineBroken, feature: 'composer', anchor: 'chatInput.composer', status: 'fine' },
        { ...timelineBroken, feature: 'folders', anchor: 'folder.sidebarAnchor', route: '/app/x' },
        { ...timelineBroken, feature: 'chat-width', anchor: 'chatWidth.userTurn', firstSeenAt: -1 },
        'not an entry',
        null,
      ]),
    ).toEqual([timelineBroken]);
    expect(parseNativeHealthEntries({ entries: [timelineBroken] })).toEqual([]);
  });

  it('replaces an unexpected version string instead of passing it through', () => {
    const [entry] = parseNativeHealthEntries([
      { ...timelineBroken, extensionVersion: 'https://example.com/leak' },
    ]);
    expect(entry.extensionVersion).toBe('unknown');
  });
});

describe('nativeHealthDismissKey', () => {
  it('changes with the extension version, so an update can show the notice again', () => {
    expect(nativeHealthDismissKey(timelineBroken)).toBe('timeline:turn.user@1.7.3');
    expect(nativeHealthDismissKey({ ...timelineBroken, extensionVersion: '1.7.4' })).not.toBe(
      nativeHealthDismissKey(timelineBroken),
    );
  });
});

describe('buildNativeHealthIssueUrl', () => {
  it('prefills a bug report from closed identifiers only', () => {
    const url = new URL(
      buildNativeHealthIssueUrl(
        [
          timelineBroken,
          {
            ...timelineBroken,
            feature: 'folders',
            anchor: 'folder.sidebarAnchor',
            status: 'degraded',
          },
        ],
        { extensionVersion: '1.7.3', browser: 'chrome 140.0.7339.81' },
      ),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/voyager-crew/voyager/issues/new',
    );
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('title')).toBe(
      '[Bug] Gemini page change: timeline/turn.user, folders/folder.sidebarAnchor (v1.7.3, chrome 140.0.7339.81)',
    );
    expect(url.searchParams.get('extension-version')).toBe('1.7.3');
    expect(url.searchParams.get('browser-version')).toBe('chrome 140.0.7339.81');
    const description = url.searchParams.get('description') ?? '';
    expect(description).toContain('`timeline` → `turn.user`: broken (conversation page)');
    expect(description).toContain('`folders` → `folder.sidebarAnchor`: degraded');
  });

  it('never carries page URLs, conversation ids or unexpected text', () => {
    const url = buildNativeHealthIssueUrl(
      [
        timelineBroken,
        {
          ...timelineBroken,
          feature: 'export',
          anchor: 'https://gemini.google.com/app/0123456789abcdef',
        },
      ] as NativeHealthEntry[],
      {
        extensionVersion: '1.7.3 /app/0123456789abcdef',
        browser: 'chrome https://gemini.google.com/app/0123456789abcdef',
      },
    );
    const decoded = decodeURIComponent(url);
    expect(decoded).not.toContain('0123456789abcdef');
    expect(decoded).not.toContain('/app/');
    expect(decoded).not.toContain('gemini.google.com');
    expect(decoded).not.toContain('export');
  });
});
