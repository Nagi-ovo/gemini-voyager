import { afterEach, expect, it, vi } from 'vitest';

import { isSidebarCollapsed } from '../sidebarDom';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.body.className = '';
});

it.each([
  {
    sidebarClass: 'collapsed',
    contentClass: '',
    icon: 'side_nav',
    opened: true,
    width: 320,
    collapsed: true,
  },
  {
    sidebarClass: '',
    contentClass: 'collapsed',
    icon: 'side_nav',
    opened: true,
    width: 320,
    collapsed: true,
  },
  {
    sidebarClass: '',
    contentClass: '',
    icon: 'side_nav_expand',
    opened: true,
    width: 320,
    collapsed: true,
  },
  {
    sidebarClass: '',
    contentClass: '',
    icon: 'side_nav',
    opened: false,
    width: 56,
    collapsed: false,
  },
  { sidebarClass: '', contentClass: '', icon: '', opened: true, width: 56, collapsed: false },
  { sidebarClass: '', contentClass: '', icon: '', opened: false, width: 56, collapsed: true },
  { sidebarClass: '', contentClass: '', icon: '', opened: false, width: 80, collapsed: false },
])(
  'resolves collapse precedence for $sidebarClass/$contentClass/$icon, opened=$opened, width=$width',
  ({ sidebarClass, contentClass, icon, opened, width, collapsed }) => {
    document.body.innerHTML = `
    <bard-sidenav class="${sidebarClass}"><side-navigation-content><div class="${contentClass}"></div></side-navigation-content></bard-sidenav>
    <button data-test-id="side-nav-menu-button"><mat-icon fonticon="${icon}"></mat-icon></button>
  `;
    document.body.classList.toggle('mat-sidenav-opened', opened);
    vi.spyOn(document.querySelector('bard-sidenav')!, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 800,
    } as DOMRect);
    expect(isSidebarCollapsed()).toBe(collapsed);
  },
);
