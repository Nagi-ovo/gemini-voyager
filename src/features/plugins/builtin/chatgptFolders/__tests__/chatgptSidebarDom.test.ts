// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, describe, expect, it } from 'vitest';

import {
  findChatGptSidebar,
  findHistoryAnchor,
  listSidebarConversations,
  readMenuConversation,
  readSidebarTitle,
  sidebarRowOf,
} from '../chatgptSidebarDom';
import { type SidebarFixture, makeRows, mountSidebarFixture } from './chatgptSidebarFixture';

let fixture: SidebarFixture | null = null;

afterEach(() => {
  fixture?.destroy();
  fixture = null;
  document.body.replaceChildren();
});

describe('ChatGPT sidebar DOM', () => {
  it('finds the sidebar, not the app rail that is also a labelled nav', () => {
    fixture = mountSidebarFixture(makeRows(3));
    expect(document.querySelector('nav[aria-label]')).toBe(fixture.rail);
    expect(findChatGptSidebar()).toBe(fixture.sidebar);
  });

  it('has no sidebar while ChatGPT renders none', () => {
    fixture = mountSidebarFixture(makeRows(3));
    fixture.removeSidebar();
    expect(findChatGptSidebar()).toBeNull();
  });

  it('lists conversation rows by their links with ids, routes and titles', () => {
    const rows = makeRows(3);
    fixture = mountSidebarFixture(rows);
    fixture.move(rows[1].id, `/g/g-p-67ab12cd34-trip/c/${rows[1].id}`);

    const listed = listSidebarConversations(fixture.sidebar);

    expect(listed.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(listed[1].path).toBe(`/g/g-p-67ab12cd34-trip/c/${rows[1].id}`);
    expect(listed.map(readSidebarTitle)).toEqual([
      'Conversation 1',
      'Conversation 2',
      'Conversation 3',
    ]);
    expect(sidebarRowOf(listed[0].link)).toBe(fixture.row(rows[0].id));
  });

  it('ignores links that are not conversations or open elsewhere', () => {
    fixture = mountSidebarFixture(makeRows(1));
    const extra = document.createElement('a');
    extra.href = `/c/${makeRows(2)[1].id}`;
    extra.target = '_blank';
    fixture.list().append(extra);

    expect(listSidebarConversations(fixture.sidebar)).toHaveLength(1);
  });

  it('anchors the folder section before Recents and outside its drop target', () => {
    fixture = mountSidebarFixture(makeRows(2));
    const anchor = findHistoryAnchor(fixture.sidebar);

    expect(anchor?.matches('[data-chatgpt-project-conversation-drop-target]')).toBe(true);
    expect(anchor?.contains(fixture.list())).toBe(true);
  });

  it('reads the conversation a row menu belongs to, and nothing for other menus', () => {
    const rows = makeRows(3);
    fixture = mountSidebarFixture(rows);

    expect(readMenuConversation(fixture.openMenu(rows[2].id))?.id).toBe(rows[2].id);

    const other = document.createElement('div');
    other.setAttribute('role', 'menu');
    other.setAttribute('aria-labelledby', 'not-a-row');
    document.body.append(other);
    expect(readMenuConversation(other)).toBeNull();
  });
});
