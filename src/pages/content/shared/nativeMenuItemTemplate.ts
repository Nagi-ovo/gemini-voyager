type NativeMenuItemTemplateOptions = {
  menuContent: HTMLElement;
  injectedClassName: string;
  iconName: string;
  label: string;
  tooltip?: string;
  excludedClassNames?: string[];
};

function findTemplateMenuItem(
  menuContent: HTMLElement,
  excludedClassNames: string[],
): HTMLButtonElement | null {
  const directButtons = Array.from(menuContent.children).filter(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && node.classList.contains('mat-mdc-menu-item'),
  );

  const nestedButtons = Array.from(
    menuContent.querySelectorAll<HTMLButtonElement>('button.mat-mdc-menu-item'),
  );
  const candidates: HTMLButtonElement[] = [...directButtons];
  for (const button of nestedButtons) {
    if (!candidates.includes(button)) {
      candidates.push(button);
    }
  }

  return (
    candidates.find(
      (button) => !excludedClassNames.some((className) => button.classList.contains(className)),
    ) ?? null
  );
}

function updateMenuItemLabel(button: HTMLButtonElement, label: string): void {
  const textContainer = button.querySelector('.mat-mdc-menu-item-text') as HTMLElement | null;
  if (!textContainer) return;

  const styledLabel = textContainer.querySelector(
    '.menu-text, .gds-body-m, .gds-label-m, .subtitle',
  );
  if (styledLabel) {
    styledLabel.textContent = label;
    return;
  }

  textContainer.textContent = label;
}

function updateMenuItemIcon(button: HTMLButtonElement, iconName: string): void {
  const icon = button.querySelector('mat-icon') as HTMLElement | null;
  if (!icon) return;

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

function clearTemplateSpecificAttributes(button: HTMLButtonElement): void {
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
}: NativeMenuItemTemplateOptions): HTMLButtonElement | null {
  const template = findTemplateMenuItem(menuContent, [injectedClassName, ...excludedClassNames]);
  if (!template) return null;

  const button = template.cloneNode(true) as HTMLButtonElement;
  clearTemplateSpecificAttributes(button);
  button.classList.add(injectedClassName);
  button.setAttribute('role', 'menuitem');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-disabled', 'false');
  button.disabled = false;

  const description = tooltip || label;
  button.title = description;
  button.setAttribute('aria-label', description);

  updateMenuItemIcon(button, iconName);
  updateMenuItemLabel(button, label);

  return button;
}

export function updateMenuItemTemplateLabel(
  button: HTMLButtonElement,
  label: string,
  tooltip?: string,
): void {
  const description = tooltip || label;
  button.title = description;
  button.setAttribute('aria-label', description);
  updateMenuItemLabel(button, label);
}
