/**
 * The Gemini adapter is now `catalog/sites/gemini/site.json`. These tests bind
 * that data to the first-party sources it used to be computed from, so the two
 * cannot drift apart.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  combineSelectors,
  getAssistantTurnSelectors,
  getUserTurnSelectors,
} from '@/core/utils/selectors';

import { GEMINI_MATCHES } from '../hostPolicy';
import { geminiAdapter } from './gemini';

const ids = (selector: string | undefined) =>
  Array.from(document.querySelectorAll(selector ?? ':not(*)'), (el) => el.id);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Gemini site.json parity', () => {
  it('uses the membership turn lists the first-party helpers join', () => {
    expect(geminiAdapter.selectors.userTurn).toBe(combineSelectors(getUserTurnSelectors()));
    expect(geminiAdapter.selectors.assistantTurn).toBe(
      combineSelectors(getAssistantTurnSelectors()),
    );
  });

  it('covers exactly the hosts the manifest injects into', () => {
    expect(geminiAdapter.id).toBe('gemini');
    expect(geminiAdapter.label).toBe('Gemini');
    expect(geminiAdapter.matches).toEqual(GEMINI_MATCHES);
  });

  it('declares no anchor or field the TypeScript adapter lacked, besides the code block', () => {
    // A new anchor widens what local plugins may target and changes the public SKILL.md;
    // new anchors wait for a live-page check. `codeBlock` is the tag the native long code
    // block collapse and `contentStyle.css` have always targeted on Gemini.
    expect(Object.keys(geminiAdapter.selectors).sort()).toEqual(
      ['assistantTurn', 'codeBlock', 'composer', 'sidebar', 'userTurn'].sort(),
    );
    expect([...geminiAdapter.capabilities].sort()).toEqual(
      ['chat', 'composer', 'darkMode', 'sidebar'].sort(),
    );
    expect(geminiAdapter.conversationIdPattern).toBeUndefined();
    expect(geminiAdapter.turnKeyAttributes).toBeUndefined();
  });

  it('keeps Voyager’s own accent: no brand colour', () => {
    expect(geminiAdapter.brandColor).toBeUndefined();
  });

  it('finds every code block, thinking ones included, as the native collapse did', () => {
    document.body.innerHTML =
      '<model-response><code-block id="answer"><div class="code-block-decoration">' +
      '<span>Python</span><div class="buttons"></div></div>' +
      '<code data-test-id="code-content">print(1)</code></code-block></model-response>' +
      '<div class="thoughts"><code-block id="thought"></code-block></div>' +
      '<pre id="plain"><code>x</code></pre>';
    expect(ids(geminiAdapter.selectors.codeBlock)).toEqual(['answer', 'thought']);
  });

  it('finds the composer, the sidebar and the theme host on a Gemini page', () => {
    document.body.innerHTML =
      '<div class="theme-host dark-theme" id="theme">' +
      '<bard-sidenav id="rail"></bard-sidenav>' +
      '<div class="gv-folder-container" id="folders"></div>' +
      '<input-area-v2 id="input-area"><rich-textarea id="rich">' +
      '<div class="ql-editor" contenteditable="true"></div></rich-textarea></input-area-v2>' +
      '</div>';
    const { composer, sidebar } = geminiAdapter.selectors;
    const { hostSelector, lightSelector, darkSelector } = geminiAdapter.theme;

    expect(ids(composer)).toEqual(['input-area', 'rich']);
    expect(ids(sidebar)).toEqual(['rail', 'folders']);
    expect(ids(hostSelector)).toEqual(['theme']);
    expect(ids(darkSelector)).toEqual(['theme']);
    expect(ids(lightSelector)).toEqual([]);
  });
});
