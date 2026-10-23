// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/" }
/**
 * Hiding filed chats when a site's `hideFiled.rows` is a selector list: the
 * filed, focus and keep-shown conditions hold for every branch, not the last.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { deepseekAdapter } from '@/features/plugins/sites/adapters/deepseek';
import type { SiteAdapter } from '@/features/plugins/types';

import { siteFoldersFromData } from '../siteData';

const ROWS = 'a.old-row, a.new-row';

function siteWithRows(): SiteAdapter {
  const folders = deepseekAdapter.folders!;
  return {
    ...deepseekAdapter,
    folders: {
      ...folders,
      hideFiled: { rows: ROWS, keepShown: ['.pinned, .current'] },
    },
  };
}

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('hiding filed chats with a selector list of rows', () => {
  it('keeps unfiled rows of every branch visible and hides only filed ones', () => {
    const { hideFiled } = siteFoldersFromData(siteWithRows())!;
    const style = document.createElement('style');
    style.textContent = hideFiled.css;
    document.head.append(style);
    const attribute = hideFiled.filedAttribute;
    document.body.innerHTML = `
      <a class="old-row" id="old"></a><a class="new-row" id="new"></a>
      <a class="old-row" id="old-filed" ${attribute}="1"></a>
      <a class="new-row" id="new-filed" ${attribute}="1"></a>
      <a class="old-row pinned" id="old-kept" ${attribute}="1"></a>`;
    const shown = (id: string) => getComputedStyle(document.getElementById(id)!).display !== 'none';

    expect(shown('old')).toBe(true);
    expect(shown('new')).toBe(true);
    expect(shown('old-filed')).toBe(false);
    expect(shown('new-filed')).toBe(false);
    expect(shown('old-kept')).toBe(true);
  });
});
