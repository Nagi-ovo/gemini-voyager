import { afterEach, describe, expect, it } from 'vitest';

import { deepseekAdapter } from './deepseek';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('class');
});

describe('DeepSeek content markers', () => {
  it('distinguishes user, thinking-only, final and empty virtual turns', () => {
    document.body.innerHTML =
      '<div class="ds-message" id="user"><div class="ds-collapsible-text">Example</div></div>' +
      '<div class="ds-message" id="thinking"><div class="ds-think-content">Working</div></div>' +
      '<div class="ds-message" id="answer"><div class="ds-assistant-message-main-content">Answer</div></div>' +
      '<div class="ds-message" id="pending"></div>' +
      '<div class="ds-collapsible-text">Unrelated preview</div>';
    const ids = (selector: string) =>
      Array.from(document.querySelectorAll(selector), (el) => el.id);
    expect(ids(deepseekAdapter.selectors.userTurn)).toEqual(['user']);
    expect(ids(deepseekAdapter.selectors.assistantTurn)).toEqual(['thinking', 'answer']);
    document
      .querySelector('#thinking')
      ?.insertAdjacentHTML(
        'beforeend',
        '<div class="ds-assistant-message-main-content">Finished</div>',
      );
    expect(ids(deepseekAdapter.selectors.assistantTurn)).toEqual(['thinking', 'answer']);
    expect(ids(deepseekAdapter.selectors.userTurn)).toEqual(['user']);
  });

  it('finds the composer without matching unrelated editors', () => {
    document.body.innerHTML =
      '<textarea placeholder="Search"></textarea>' +
      '<textarea class="ds-scroll-area" placeholder="Message DeepSeek" id="composer"></textarea>' +
      '<div contenteditable="true"></div>';
    expect(document.querySelectorAll(deepseekAdapter.selectors.composer)).toHaveLength(1);
    expect(document.querySelector(deepseekAdapter.selectors.composer)?.id).toBe('composer');
  });

  it('finds the composer card, send button and conversation list without mixing their scroll areas', () => {
    // Live markup (2026-10): every scrolling region, the prompt included, is a `.ds-scroll-area`.
    document.body.innerHTML =
      '<div id="app">' +
      '<div id="sidebar"><div class="ds-scroll-area" id="sidebar-scroll">' +
      '<a href="/a/chat/s/one">One</a><a href="/a/chat/s/two">Two</a></div></div>' +
      '<div><div class="ds-virtual-list ds-scroll-area" id="thread">' +
      '<div class="ds-message"><div class="ds-collapsible-text">Hi</div></div></div></div>' +
      '<div class="ds-button ds-button--primary ds-button--circle" role="button" id="to-bottom"></div>' +
      '<div id="card"><div><textarea class="ds-scroll-area" id="composer"></textarea></div>' +
      '<div><div class="ds-button ds-button--primary ds-button--circle ds-button--disabled" role="button" id="send"></div></div>' +
      '</div></div>';
    const ids = (selector: string | undefined) =>
      Array.from(document.querySelectorAll(selector ?? ':not(*)'), (el) => el.id);
    const { composerRoot, sendButton, sidebar, scrollContainer } = deepseekAdapter.selectors;
    expect(ids(composerRoot)).toEqual(['card']);
    expect(ids(sendButton)).toEqual(['send']);
    expect(ids(sidebar)).toEqual(['sidebar']);
    expect(ids(scrollContainer)).toEqual(['thread']);
  });

  it.each(['light', 'dark'])('recognizes the body %s theme', (theme) => {
    document.body.className = 'zh_CN ' + theme;
    expect(document.querySelector(deepseekAdapter.theme.hostSelector)).toBe(document.body);
    expect(document.querySelector(deepseekAdapter.theme.lightSelector) !== null).toBe(
      theme === 'light',
    );
    expect(document.querySelector(deepseekAdapter.theme.darkSelector) !== null).toBe(
      theme === 'dark',
    );
  });
});
