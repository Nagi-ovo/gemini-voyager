/**
 * The AI Studio adapter is now `catalog/sites/aistudio/site.json`. These tests
 * bind that data to the host policy and to what the TypeScript adapter found on
 * an AI Studio page.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { AISTUDIO_MATCHES } from '../hostPolicy';
import { aistudioAdapter } from './aistudio';

const ids = (selector: string | undefined) =>
  Array.from(document.querySelectorAll(selector ?? ':not(*)'), (el) => el.id);

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('AI Studio site.json parity', () => {
  it('covers exactly the hosts the manifest injects into', () => {
    expect(aistudioAdapter.id).toBe('aistudio');
    expect(aistudioAdapter.label).toBe('AI Studio');
    expect(aistudioAdapter.matches).toEqual(AISTUDIO_MATCHES);
  });

  it('declares the published anchors, including the live-verified send controls', () => {
    expect(Object.keys(aistudioAdapter.selectors).sort()).toEqual(
      ['assistantTurn', 'composer', 'composerRoot', 'sendButton', 'sidebar', 'userTurn'].sort(),
    );
    expect([...aistudioAdapter.capabilities].sort()).toEqual(
      ['chat', 'composer', 'darkMode', 'sidebar'].sort(),
    );
    expect(aistudioAdapter.conversationIdPattern).toBeUndefined();
    expect(aistudioAdapter.turnKeyAttributes).toBeUndefined();
  });

  it('keeps Voyager’s own accent: no brand colour', () => {
    expect(aistudioAdapter.brandColor).toBeUndefined();
  });

  it('finds turns, the composer, Voyager’s folder panel and the body theme', () => {
    // Chrome .com markup verified 2026-10: localized labels are unnecessary for these anchors.
    document.body.className = 'light-theme gv-aistudio';
    document.body.innerHTML =
      '<div class="user-prompt-container" id="user"></div>' +
      '<div data-turn-role="Model" id="model"></div>' +
      '<div class="gv-folder-container" id="folders"></div>' +
      '<ms-prompt-box id="composer-root"><textarea formcontrolname="promptText" id="prompt"></textarea>' +
      '<div class="prompt-box-container"><div class="buttons-row"><div class="button-wrapper">' +
      '<ms-run-button><button id="run">运行</button></ms-run-button>' +
      '</div></div></div></ms-prompt-box>';
    const { userTurn, assistantTurn, composer, composerRoot, sendButton, sidebar } =
      aistudioAdapter.selectors;
    const { hostSelector, lightSelector, darkSelector } = aistudioAdapter.theme;

    expect(ids(userTurn)).toEqual(['user']);
    expect(ids(assistantTurn)).toEqual(['model']);
    expect(ids(composer)).toEqual(['prompt']);
    expect(ids(composerRoot)).toEqual(['composer-root']);
    expect(ids(sendButton)).toEqual(['run']);
    expect(document.getElementById('composer-root')?.contains(document.getElementById('run'))).toBe(
      true,
    );
    expect(ids(sidebar)).toEqual(['folders']);
    expect(document.querySelector(hostSelector)).toBe(document.body);
    expect(document.querySelector(lightSelector)).toBe(document.body);
    expect(document.querySelector(darkSelector)).toBeNull();
  });
});
