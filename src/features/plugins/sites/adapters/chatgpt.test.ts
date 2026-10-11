import { afterEach, describe, expect, it } from 'vitest';

import { chatgptAdapter } from './chatgpt';

const { composer, composerRoot, sendButton } = chatgptAdapter.selectors;
const ids = (selector: string | undefined) =>
  Array.from(document.querySelectorAll(selector ?? ':not(*)'), (el) => el.id);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ChatGPT composer markers', () => {
  // Live markup (2026-10): the voice button holds the send slot until the prompt has text.
  const page = (actions: string) =>
    '<div contenteditable="true" id="canvas-editor"></div>' +
    '<form id="other-form"><button type="submit" id="other-submit"></button></form>' +
    '<form id="composer-form"><div data-composer-body>' +
    '<div contenteditable="true" data-composer-markdown="" id="prompt"></div>' +
    `<div data-composer-footer-responsive>${actions}</div>` +
    '</div></form>';

  it('finds the prompt field and its form, not other editors or forms', () => {
    document.body.innerHTML = page('<button type="button" id="voice"></button>');
    expect(ids(composer)).toEqual(['prompt']);
    expect(ids(composerRoot)).toEqual(['composer-form']);
  });

  it('has no send button while the prompt is empty, and finds it once it appears', () => {
    document.body.innerHTML = page('<button type="button" id="voice"></button>');
    expect(ids(sendButton)).toEqual([]);

    document.body.innerHTML = page('<button type="submit" id="send"></button>');
    expect(ids(sendButton)).toEqual(['send']);
  });

  it('still recognizes the older #prompt-textarea composer', () => {
    document.body.innerHTML =
      '<form id="legacy-form"><div contenteditable="true" id="prompt-textarea"></div>' +
      '<button type="submit" id="send"></button></form>';
    expect(ids(composer)).toEqual(['prompt-textarea']);
    expect(ids(composerRoot)).toEqual(['legacy-form']);
    expect(ids(sendButton)).toEqual(['send']);
  });
});
