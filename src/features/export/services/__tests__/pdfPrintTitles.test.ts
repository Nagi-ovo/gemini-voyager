import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveNativeSidebarTitle, resolvePDFPrintTitle } from '../pdfPrintTitles';

describe('PDF print title resolution', () => {
  const metadata = { url: 'https://gemini.google.com/', exportedAt: '', count: 1 };
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Gemini';
    window.history.pushState({}, '', '/');
  });
  afterEach(() => {
    document.body.innerHTML = '';
    document.title = 'Gemini';
    window.history.pushState({}, '', '/');
  });

  it('keeps cover and conversation dialog fallbacks distinct', () => {
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Untitled Conversation');
    expect(resolvePDFPrintTitle(metadata, 'conversation')).toBe('Gemini Conversation');
    const titled = { ...metadata, title: '  Research  - Gemini  ', platform: 'web' };
    expect(resolvePDFPrintTitle(titled, 'cover')).toBe('Research');
    expect(resolvePDFPrintTitle(titled, 'conversation')).toBe('Research - web');
  });

  it('prefers metadata, then the selected folder title, then native sidebar and page titles', () => {
    document.title = 'Page title - Gemini';
    window.history.pushState({}, '', '/u/2/app/native-id');
    document.body.innerHTML =
      '<div class="gv-folder-conversation-selected"><span class="gv-conversation-title">Folder title</span></div><div data-test-id="conversation" jslog="c_native-id"><h3>Native title</h3></div>';
    expect(resolvePDFPrintTitle({ ...metadata, title: 'Metadata title' }, 'cover')).toBe(
      'Metadata title',
    );
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Folder title');
    document.querySelector('.gv-folder-conversation-selected')!.remove();
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Native title');
    document.querySelector('[data-test-id="conversation"]')!.remove();
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Page title');
  });

  it('uses conversation routes and active sidebar fallbacks without generic Gem labels', () => {
    window.history.pushState({}, '', '/u/1/gem/gem-id/abcdefghijk');
    document.body.innerHTML =
      '<div data-test-id="conversation"><h3>Gem</h3><a href="/gem/gem-id/abcdefghijk" aria-label="Report name">Gems</a></div>';
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Report name');
    document.body.innerHTML =
      '<mat-list-item aria-current="page"><span mat-line>Active conversation</span></mat-list-item>';
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Active conversation');
    document.body.innerHTML = '';
    expect(resolvePDFPrintTitle(metadata, 'cover')).toBe('Conversation abcdefgh');
  });

  it('normalizes a platform suffix containing regular-expression punctuation', () => {
    const titled = {
      ...metadata,
      title: ' A   title - Model (Preview)+ ',
      platform: 'Model (Preview)+',
    };
    expect(resolvePDFPrintTitle(titled, 'cover')).toBe('A title');
    expect(resolvePDFPrintTitle(titled, 'conversation')).toBe('A title - Model (Preview)+');
    expect(
      resolvePDFPrintTitle({ ...metadata, title: 'CHATGPT', platform: 'ChatGPT' }, 'conversation'),
    ).toBe('ChatGPT Conversation');
  });

  it('returns no native title when the matching row has only a generic label', () => {
    document.body.innerHTML =
      '<div data-test-id="conversation" jslog="c_empty"><h3>Gems</h3></div>';
    expect(resolveNativeSidebarTitle('empty')).toBeNull();
    expect(resolveNativeSidebarTitle('missing')).toBeNull();
  });
});
