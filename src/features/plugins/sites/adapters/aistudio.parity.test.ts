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

  it('declares no anchor or field the TypeScript adapter lacked', () => {
    // A new anchor widens what local plugins may target and changes the public SKILL.md;
    // new anchors wait for a live-page check.
    expect(Object.keys(aistudioAdapter.selectors).sort()).toEqual(
      ['assistantTurn', 'composer', 'sidebar', 'userTurn'].sort(),
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
    // Live markup (2026-10) has no `ms-chunk-input`; the prompt box is reached through the
    // `textarea[aria-label]` fallback.
    document.body.className = 'light-theme gv-aistudio';
    document.body.innerHTML =
      '<div class="user-prompt-container" id="user"></div>' +
      '<div data-turn-role="Model" id="model"></div>' +
      '<div class="gv-folder-container" id="folders"></div>' +
      '<ms-prompt-box><textarea aria-label="Enter a prompt" id="prompt"></textarea></ms-prompt-box>';
    const { userTurn, assistantTurn, composer, sidebar } = aistudioAdapter.selectors;
    const { hostSelector, lightSelector, darkSelector } = aistudioAdapter.theme;

    expect(ids(userTurn)).toEqual(['user']);
    expect(ids(assistantTurn)).toEqual(['model']);
    expect(ids(composer)).toEqual(['prompt']);
    expect(ids(sidebar)).toEqual(['folders']);
    expect(document.querySelector(hostSelector)).toBe(document.body);
    expect(document.querySelector(lightSelector)).toBe(document.body);
    expect(document.querySelector(darkSelector)).toBeNull();
  });
});
