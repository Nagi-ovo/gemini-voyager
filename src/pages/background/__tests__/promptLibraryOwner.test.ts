import { beforeEach, describe, expect, it } from 'vitest';

import { isAllowedPromptLibrarySender } from '../promptLibraryOwner';

describe('prompt library background owner', () => {
  beforeEach(() => {
    Object.assign(chrome.runtime, { id: 'voyager-test' });
    chrome.runtime.getURL = (path: string) => `chrome-extension://voyager-test/${path}`;
  });

  it('accepts writes from the popup and from this extension in a top frame on any site', () => {
    expect(
      isAllowedPromptLibrarySender({
        id: 'voyager-test',
        url: 'chrome-extension://voyager-test/src/pages/popup/index.html',
      }),
    ).toBe(true);
    for (const url of ['https://gemini.google.com/app', 'https://my-llm.example/chat']) {
      expect(
        isAllowedPromptLibrarySender({
          id: 'voyager-test',
          tab: { id: 1, url } as chrome.tabs.Tab,
          frameId: 0,
        }),
      ).toBe(true);
    }
    // Safari leaves frameId out.
    expect(
      isAllowedPromptLibrarySender({ id: 'voyager-test', tab: { id: 1 } as chrome.tabs.Tab }),
    ).toBe(true);
    // Firefox without tab access reports only the frame.
    expect(
      isAllowedPromptLibrarySender({
        id: 'voyager-test',
        url: 'https://gemini.google.com/app',
        frameId: 0,
      }),
    ).toBe(true);
  });

  it('refuses other extensions and subframes', () => {
    const tab = { id: 1, url: 'https://gemini.google.com/app' } as chrome.tabs.Tab;
    expect(isAllowedPromptLibrarySender({ id: 'other-ext', tab, frameId: 0 })).toBe(false);
    expect(isAllowedPromptLibrarySender({ id: 'voyager-test', tab, frameId: 2 })).toBe(false);
    expect(
      isAllowedPromptLibrarySender({
        id: 'voyager-test',
        url: 'https://ads.example/frame',
        frameId: 3,
      }),
    ).toBe(false);
    expect(
      isAllowedPromptLibrarySender({
        id: 'other-ext',
        url: 'chrome-extension://other-ext/popup.html',
      }),
    ).toBe(false);
  });
});
