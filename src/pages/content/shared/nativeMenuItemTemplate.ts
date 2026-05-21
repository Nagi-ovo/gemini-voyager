type NativeMenuItemTemplateOptions = {
  menuContent: HTMLElement;
  injectedClassName: string;
  iconName: string;
  label: string;
  tooltip?: string;
  excludedClassNames?: string[];
};

const TEMPLATE_ITEM_SELECTOR = 'button.mat-mdc-menu-item, gem-menu-item';

function isGemMenuItem(el: Element): boolean {
  return el.tagName.toLowerCase() === 'gem-menu-item';
}

function findTemplateMenuItem(
  menuContent: HTMLElement,
  excludedClassNames: string[],
): HTMLElement | null {
  const directChildren = Array.from(menuContent.children).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement &&
      (isGemMenuItem(node) || node.classList.contains('mat-mdc-menu-item')),
  );
  const nested = Array.from(menuContent.querySelectorAll<HTMLElement>(TEMPLATE_ITEM_SELECTOR));
  const candidates: HTMLElement[] = [...directChildren];
  for (const el of nested) {
    if (!candidates.includes(el)) candidates.push(el);
  }
  return (
    candidates.find(
      (el) => !excludedClassNames.some((className) => el.classList.contains(className)),
    ) ?? null
  );
}

function updateMenuItemLabel(button: HTMLElement, label: string): void {
  // gem-menu-item structure: .label-container > .label > <span> (text)
  const gemLabel = button.querySelector('.label-container .label') as HTMLElement | null;
  if (gemLabel) {
    const innerSpan = gemLabel.querySelector('span');
    if (innerSpan) {
      innerSpan.textContent = label;
      return;
    }
    gemLabel.textContent = label;
    return;
  }

  // Legacy mat-mdc-menu-item structure
  const textContainer = button.querySelector('.mat-mdc-menu-item-text') as HTMLElement | null;
  if (textContainer) {
    const styledLabel = textContainer.querySelector(
      '.menu-text, .gds-body-m, .gds-label-m, .subtitle',
    );
    if (styledLabel) {
      styledLabel.textContent = label;
      return;
    }
    textContainer.textContent = label;
    return;
  }

  // Last resort: replace direct text content
  button.textContent = label;
}

function updateMenuItemIcon(button: HTMLElement, iconName: string): void {
  const icon = button.querySelector('mat-icon') as HTMLElement | null;
  if (!icon) return;

  // The lumi-symbols font in lr26+ Gemini only ships a subset of glyphs (no
  // `download` etc). Material Symbols icons like `download` live in
  // google-symbols. When the cloned template uses lumi-symbols, swap to
  // google-symbols so our custom icon names render correctly. Gemini sets
  // the actual font-family via inline style (not via the class), so we must
  // override it inline; otherwise the icon falls back to Luminous Symbols
  // and renders a wrong glyph (or a Unicode codepoint placeholder).
  if (icon.classList.contains('lumi-symbols')) {
    icon.classList.remove('lumi-symbols');
    icon.classList.add('google-symbols');
  }
  const inlineFamily = icon.style.fontFamily || '';
  if (!inlineFamily || /luminous/i.test(inlineFamily)) {
    icon.style.fontFamily = '"Google Symbols"';
  }

  const usesFontIconAttribute = icon.hasAttribute('fonticon');
  if (usesFontIconAttribute) {
    icon.setAttribute('fonticon', iconName);
  } else {
    icon.removeAttribute('fonticon');
  }
  if (icon.hasAttribute('data-mat-icon-name')) {
    icon.setAttribute('data-mat-icon-name', iconName);
  }
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = usesFontIconAttribute ? '' : iconName;
}

function clearTemplateSpecificAttributes(button: HTMLElement): void {
  const attributesToRemove = [
    'data-test-id',
    'id',
    'jslog',
    'jscontroller',
    'jsaction',
    'jsname',
    'aria-describedby',
    'aria-labelledby',
  ];

  for (const attribute of attributesToRemove) {
    button.removeAttribute(attribute);
  }

  const classesToRemove = [
    'cdk-focused',
    'cdk-keyboard-focused',
    'cdk-program-focused',
    'cdk-mouse-focused',
    'mat-mdc-menu-item-highlighted',
    'active',
  ];
  for (const className of classesToRemove) {
    button.classList.remove(className);
  }
}

export function createMenuItemFromNativeTemplate({
  menuContent,
  injectedClassName,
  iconName,
  label,
  tooltip,
  excludedClassNames = [],
}: NativeMenuItemTemplateOptions): HTMLElement | null {
  const template = findTemplateMenuItem(menuContent, [injectedClassName, ...excludedClassNames]);
  if (!template) return null;

  const button = template.cloneNode(true) as HTMLElement;
  clearTemplateSpecificAttributes(button);
  button.classList.add(injectedClassName);
  button.setAttribute('role', 'menuitem');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-disabled', 'false');
  if (button instanceof HTMLButtonElement) {
    button.disabled = false;
  }

  const description = tooltip || label;
  button.title = description;
  button.setAttribute('aria-label', description);

  updateMenuItemIcon(button, iconName);
  updateMenuItemLabel(button, label);

  return button;
}

export function updateMenuItemTemplateLabel(
  button: HTMLElement,
  label: string,
  tooltip?: string,
): void {
  const description = tooltip || label;
  button.title = description;
  button.setAttribute('aria-label', description);
  updateMenuItemLabel(button, label);
}
