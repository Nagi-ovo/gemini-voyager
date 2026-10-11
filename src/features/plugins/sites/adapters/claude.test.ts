import { afterEach, describe, expect, it } from 'vitest';

import { claudeAdapter } from './claude';

const { composer, composerRoot, sendButton } = claudeAdapter.selectors;
const ids = (selector: string | undefined) =>
  Array.from(document.querySelectorAll(selector ?? ':not(*)'), (el) => el.id);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Claude composer markers', () => {
  it('finds the prompt field, its card and send button, not another ProseMirror editor', () => {
    // Live markup (2026-10); Claude's composer is not inside a form.
    document.body.innerHTML =
      '<div contenteditable="true" class="ProseMirror" id="artifact-editor"></div>' +
      '<div data-composer-card-holder><div id="card">' +
      '<div><div contenteditable="true" class="ProseMirror" data-testid="chat-input" id="prompt"></div></div>' +
      '<button data-testid="chat-input-attach" id="attach"></button>' +
      '<button data-testid="chat-input-send" id="send" disabled></button>' +
      '</div></div>';
    expect(ids(composer)).toEqual(['prompt']);
    expect(ids(composerRoot)).toEqual(['card']);
    expect(ids(sendButton)).toEqual(['send']);
  });
});
