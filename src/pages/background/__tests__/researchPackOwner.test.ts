import { beforeEach, describe, expect, it } from 'vitest';

import { isAllowedResearchPackSender } from '../researchPackOwner';

describe('research pack background owner', () => {
  beforeEach(() => {
    Object.assign(chrome.runtime, { id: 'voyager-test' });
  });

  it('accepts pack edits only from this extension on a Gemini page', () => {
    const sender = (id: string, url: string): chrome.runtime.MessageSender => ({
      id,
      tab: { url } as chrome.tabs.Tab,
    });

    expect(
      isAllowedResearchPackSender(sender('voyager-test', 'https://gemini.google.com/app')),
    ).toBe(true);
    expect(
      isAllowedResearchPackSender(sender('voyager-test', 'https://gemini.google.com.evil.com/app')),
    ).toBe(false);
    expect(
      isAllowedResearchPackSender(sender('voyager-test', 'http://gemini.google.com/app')),
    ).toBe(false);
    expect(isAllowedResearchPackSender(sender('other-ext', 'https://gemini.google.com/app'))).toBe(
      false,
    );
    expect(isAllowedResearchPackSender({ id: 'voyager-test' })).toBe(false);
  });

  it('falls back to the frame URL when Firefox or Safari omit the tab URL', () => {
    const gemini = 'https://gemini.google.com/u/1/app/abc';
    // Firefox without the tabs permission: no tab URL, only the sending frame's URL.
    expect(isAllowedResearchPackSender({ id: 'voyager-test', url: gemini, frameId: 0 })).toBe(true);
    // Safari: a tab without a URL, and no frameId reported.
    expect(
      isAllowedResearchPackSender({
        id: 'voyager-test',
        tab: { id: 7 } as chrome.tabs.Tab,
        url: gemini,
      }),
    ).toBe(true);

    expect(
      isAllowedResearchPackSender({
        id: 'voyager-test',
        url: 'https://chatgpt.com/c/abc',
        frameId: 0,
      }),
    ).toBe(false);
    expect(
      isAllowedResearchPackSender({
        id: 'voyager-test',
        url: 'chrome-extension://voyager-test/popup.html',
      }),
    ).toBe(false);
  });

  it('accepts only the top frame, where the content script runs', () => {
    const gemini = 'https://gemini.google.com/app';
    expect(
      isAllowedResearchPackSender({
        id: 'voyager-test',
        tab: { url: gemini } as chrome.tabs.Tab,
        url: 'https://ads.example/frame',
        frameId: 3,
      }),
    ).toBe(false);
    expect(isAllowedResearchPackSender({ id: 'voyager-test', url: gemini, frameId: 3 })).toBe(
      false,
    );
  });
});
