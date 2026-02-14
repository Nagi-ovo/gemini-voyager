import { afterEach, describe, expect, it } from 'vitest';

import {
  applyFloatingTriggerPosition,
  createTopbarPlacementObserver,
  isGeminiWebTopbarMode,
  placePromptTriggerInTopbar,
} from '../index';

describe('prompt trigger topbar placement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('inserts trigger before share button on Gemini top bar', () => {
    const topbar = document.createElement('div');
    const trigger = document.createElement('button');
    const share = document.createElement('button');
    share.setAttribute('data-test-id', 'share-button');
    topbar.appendChild(share);
    document.body.appendChild(topbar);
    document.body.appendChild(trigger);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(topbar.firstElementChild).toBe(trigger);
    expect(trigger.nextElementSibling).toBe(share);
    expect(trigger.classList.contains('gv-pm-trigger-inline')).toBe(true);
  });

  it('falls back to actions menu button when share is not available', () => {
    const topbar = document.createElement('div');
    const trigger = document.createElement('button');
    const actions = document.createElement('button');
    actions.setAttribute('data-test-id', 'actions-menu-button');
    topbar.appendChild(actions);
    document.body.appendChild(topbar);

    const placed = placePromptTriggerInTopbar(trigger, document);

    expect(placed).toBe(true);
    expect(topbar.firstElementChild).toBe(trigger);
    expect(trigger.nextElementSibling).toBe(actions);
  });

  it('returns false if no anchor button exists', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    expect(placePromptTriggerInTopbar(trigger, document)).toBe(false);
    expect(trigger.parentElement).toBe(document.body);
  });

  it('detects Gemini hostname correctly', () => {
    expect(isGeminiWebTopbarMode('gemini.google.com')).toBe(true);
    expect(isGeminiWebTopbarMode('aistudio.google.com')).toBe(false);
    expect(isGeminiWebTopbarMode('example.com')).toBe(false);
  });

  it('creates mutation observer only when topbar mode is enabled', () => {
    const callback: MutationCallback = () => {};
    const observer = createTopbarPlacementObserver(true, callback);
    const disabledObserver = createTopbarPlacementObserver(false, callback);

    expect(observer).toBeInstanceOf(MutationObserver);
    expect(disabledObserver).toBeNull();

    observer?.disconnect();
  });

  it('restores floating trigger position from saved values', () => {
    const trigger = document.createElement('button');

    const applied = applyFloatingTriggerPosition(trigger, { right: 42.6, bottom: 88.2 });

    expect(applied).toBe(true);
    expect(trigger.style.right).toBe('43px');
    expect(trigger.style.bottom).toBe('88px');
  });

  it('ignores invalid saved floating trigger position', () => {
    const trigger = document.createElement('button');
    trigger.style.right = '18px';
    trigger.style.bottom = '18px';

    const applied = applyFloatingTriggerPosition(trigger, { right: Number.NaN, bottom: 12 });

    expect(applied).toBe(false);
    expect(trigger.style.right).toBe('18px');
    expect(trigger.style.bottom).toBe('18px');
  });
});
