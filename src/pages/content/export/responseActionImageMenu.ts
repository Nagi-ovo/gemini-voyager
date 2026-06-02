import {
  IMAGE_EXPORT_WIDTH_MEDIUM,
  IMAGE_EXPORT_WIDTH_NARROW,
  IMAGE_EXPORT_WIDTH_WIDE,
} from '../../../features/export/types/export';

export interface ResponseActionCopyImageMenuOptions {
  anchor: HTMLElement;
  translations: {
    narrow: string;
    medium: string;
    wide: string;
  };
  onSelect: (width: number) => void;
}

let activeMenu: HTMLElement | null = null;
let activeOutsideClickHandler: ((e: MouseEvent) => void) | null = null;

export function showResponseActionCopyImageMenu(options: ResponseActionCopyImageMenuOptions): void {
  hideResponseActionCopyImageMenu();

  const menu = document.createElement('div');
  menu.className = 'gv-response-image-menu';

  const widths = [
    { value: IMAGE_EXPORT_WIDTH_NARROW, label: options.translations.narrow },
    { value: IMAGE_EXPORT_WIDTH_MEDIUM, label: options.translations.medium },
    { value: IMAGE_EXPORT_WIDTH_WIDE, label: options.translations.wide },
  ];

  widths.forEach((w) => {
    const item = document.createElement('button');
    item.className = 'gv-response-image-menu-item';
    item.textContent = w.label;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      options.onSelect(w.value);
      hideResponseActionCopyImageMenu();
    });

    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  activeMenu = menu;

  const rect = options.anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + 4;

  if (left + menuWidth > vw - 10) {
    left = vw - menuWidth - 10;
  }
  if (top + menuHeight > vh - 10) {
    top = rect.top - menuHeight - 4;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const handleOutsideClick = (e: MouseEvent) => {
    if (
      activeMenu &&
      !activeMenu.contains(e.target as Node) &&
      !options.anchor.contains(e.target as Node)
    ) {
      hideResponseActionCopyImageMenu();
    }
  };
  activeOutsideClickHandler = handleOutsideClick;
  document.addEventListener('mousedown', handleOutsideClick);
}

export function hideResponseActionCopyImageMenu(): void {
  if (activeOutsideClickHandler) {
    document.removeEventListener('mousedown', activeOutsideClickHandler);
    activeOutsideClickHandler = null;
  }
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}
