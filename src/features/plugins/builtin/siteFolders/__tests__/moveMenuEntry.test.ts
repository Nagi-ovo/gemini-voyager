import { describe, expect, it } from 'vitest';

import { buildMenuEntry } from '../moveMenuEntry';

const ATTR = 'data-gv-move-entry';

function template(html: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.firstElementChild!;
}

describe('buildMenuEntry', () => {
  it('shows the folder icon instead of the pencil a mask-painted Rename icon draws', () => {
    const rename = template(
      '<div role="menuitem" data-state="closed"><div class="flex gap-1.5">' +
        '<span class="icon-sm shrink-0 bg-current" aria-hidden="true" ' +
        'style="mask-image: url(&quot;/pencil.svg&quot;); -webkit-mask-image: url(&quot;/pencil.svg&quot;)"></span>' +
        '<span>Rename</span></div></div>',
    );

    const entry = buildMenuEntry(rename, 'Move to folder', ATTR);

    const icon = entry.querySelector('svg.lucide-folder-input');
    expect(icon).not.toBeNull();
    expect(icon!.classList.contains('icon-sm')).toBe(true);
    expect(entry.querySelector('.bg-current')).toBeNull();
    expect(entry.querySelector('[style*="mask"]')).toBeNull();
    expect(entry.textContent).toBe('Move to folder');
  });

  it('swaps a native svg icon for the folder icon and keeps its sizing class', () => {
    const rename = template(
      '<div role="menuitem"><span aria-hidden="true"><svg class="icon-md"><use href="#pencil"></use></svg></span>' +
        '<span>Rename</span><kbd>R</kbd></div>',
    );

    const entry = buildMenuEntry(rename, 'Move to folder', ATTR);

    const icons = entry.querySelectorAll('svg');
    expect(icons).toHaveLength(1);
    expect(icons[0].querySelector('use')).toBeNull();
    expect(icons[0].getAttribute('class')).toBe('icon-md');
    expect(entry.textContent).toBe('Move to folder');
  });
});
