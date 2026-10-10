import { beforeEach, describe, expect, it } from 'vitest';

import { renderedCheck, togglesVisibility } from './turnVisibility';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="hidden-page" style="display: none"><div><p id="old">old</p><p id="old-2">old</p></div></div>
    <div id="page"><div><p id="new">new</p></div></div>
    <div hidden id="flagged"><p id="flagged-turn">x</p></div>
  `;
});

const byId = (id: string) => document.getElementById(id)!;

describe('renderedCheck', () => {
  it('skips turns under a hidden ancestor and keeps the rest, in any order', () => {
    const isRendered = renderedCheck();
    expect(isRendered(byId('new'))).toBe(true);
    expect(isRendered(byId('old'))).toBe(false);
    // Decided from the cache of the shared ancestors.
    expect(isRendered(byId('old-2'))).toBe(false);
    expect(isRendered(byId('page'))).toBe(true);
  });

  it('treats a detached turn as off screen', () => {
    const turn = byId('new');
    turn.remove();
    expect(renderedCheck()(turn)).toBe(false);
  });

  it('goes by the computed display, so a [hidden] node shown by CSS counts', () => {
    expect(renderedCheck()(byId('flagged-turn'))).toBe(false);
    const style = document.createElement('style');
    style.textContent = '#flagged { display: block; }';
    document.head.append(style);
    expect(renderedCheck()(byId('flagged-turn'))).toBe(true);
    style.remove();
  });
});

describe('togglesVisibility', () => {
  function record(target: Element, attributeName: string, oldValue: string | null) {
    return { type: 'attributes', target, attributeName, oldValue } as unknown as MutationRecord;
  }

  it('reports a thread shown or hidden, not other style changes', () => {
    const page = byId('page');
    page.setAttribute('style', 'display: none');
    expect(togglesVisibility(record(page, 'style', null))).toBe(true);
    page.setAttribute('style', 'color: red');
    expect(togglesVisibility(record(page, 'style', 'display: none'))).toBe(true);
    page.setAttribute('style', 'color: blue');
    expect(togglesVisibility(record(page, 'style', 'color: red'))).toBe(false);
  });

  it('reports the hidden attribute coming and going', () => {
    const page = byId('page');
    page.setAttribute('hidden', '');
    expect(togglesVisibility(record(page, 'hidden', null))).toBe(true);
    page.setAttribute('hidden', 'until-found');
    expect(togglesVisibility(record(page, 'hidden', ''))).toBe(false);
  });
});
