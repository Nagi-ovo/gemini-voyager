import { beforeEach, describe, expect, it } from 'vitest';

import { type ObservedTurn, TurnOwnership } from './turnOwnership';

const A = 'site:conv:a';
const B = 'site:conv:b';

let url: string | null;
let owners: TurnOwnership;

beforeEach(() => {
  document.body.innerHTML = '';
  url = A;
  seenRoute = undefined;
  owners = new TurnOwnership(() => url);
  owners.begin();
});

/** The host inserts a turn element now, under whatever the URL names. */
function insert(parent: Node = document.body): HTMLElement {
  const element = document.createElement('div');
  parent.appendChild(element);
  owners.recordInsertions([element]);
  return element;
}

let seenRoute: string | null | undefined;

/** A refresh sees the URL and these turns; like NavigatorStars, it enters a route only when it changed. */
function refresh(turns: ObservedTurn[]): void {
  if (url !== seenRoute) owners.enterRoute(url);
  seenRoute = url;
  owners.observe(turns);
}

const turn = (element: Element, hash = 'x'): ObservedTurn => ({ element, hash });

describe('turn ownership', () => {
  it('gives a conversation the turns inserted under it, including ones it grows', () => {
    const a1 = insert();
    refresh([turn(a1)]);
    const a2 = insert();
    refresh([turn(a1), turn(a2, 'y')]);

    expect(owners.allows(a1, A)).toBe(true);
    expect(owners.allows(a2, A)).toBe(true);
  });

  it('gives a turn the URL it was inserted under, not the URL of the next refresh', () => {
    const d1 = insert();
    url = B;
    refresh([turn(d1)]);

    expect(owners.allows(d1, B)).toBe(false);
    expect(owners.allows(d1, A)).toBe(true);
  });

  it("never lets a new chat's turns be starred, not even under the id it gets", () => {
    url = null;
    const draft = insert();
    refresh([turn(draft)]);
    url = A;
    refresh([turn(draft)]);
    const next = insert();
    refresh([turn(draft), turn(next, 'y')]);

    expect(owners.allows(draft, A)).toBe(false);
    expect(owners.allows(next, A)).toBe(true);
  });

  it('leaves turns inserted while another conversation’s are on screen unattributed', () => {
    const a1 = insert();
    refresh([turn(a1)]);
    url = B;
    const early = insert();
    refresh([turn(a1), turn(early, 'y')]);
    a1.remove();
    const later = insert();
    refresh([turn(early, 'y'), turn(later, 'z')]);

    expect(owners.allows(early, B)).toBe(false);
    // An unattributed turn may be anyone's, so it still withholds new ones.
    expect(owners.allows(later, B)).toBe(false);
  });

  it('gives turns already on the page the URL from when recording began', () => {
    const before = document.createElement('div');
    document.body.appendChild(before);
    refresh([turn(before)]);

    expect(owners.allows(before, A)).toBe(true);
  });

  it('takes the insertion that brought the turn in, not an older one of the page around it', () => {
    const shell = insert();
    url = B;
    const b1 = insert(shell);
    refresh([turn(b1)]);

    expect(owners.allows(b1, B)).toBe(true);
  });

  it('gives a conversation the elements a far scroll mounts', () => {
    const a1 = insert();
    refresh([turn(a1, 'x')]);
    a1.remove();
    const a2 = insert();
    refresh([turn(a2, 'y')]);

    expect(owners.allows(a2, A)).toBe(true);
  });

  it('leaves the previous thread unattributed when it remounts after the URL changed', () => {
    const a1 = insert();
    refresh([turn(a1, 'x')]);
    url = B;
    a1.remove();
    refresh([]);
    const again = insert();
    refresh([turn(again, 'x')]);

    expect(owners.allows(again, B)).toBe(false);
  });

  it("gives a new chat's re-rendered thread to the id it was given, but not the draft", () => {
    url = null;
    const draft = insert();
    refresh([turn(draft, 'x')]);
    url = A;
    draft.remove();
    const rerendered = insert();
    refresh([turn(rerendered, 'x')]);

    expect(owners.allows(draft, A)).toBe(false);
    expect(owners.allows(rerendered, A)).toBe(true);
  });
});
