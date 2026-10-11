/** Elements that had no class attribute before Voyager added one. */
const classless = new WeakSet<Element>();

export function addClass(element: Element, className: string): void {
  if (!element.hasAttribute('class')) classless.add(element);
  element.classList.add(className);
}

/** Removes Voyager's classes and, if the host had none, the then-empty attribute too. */
export function removeClasses(element: Element, ...classNames: string[]): void {
  element.classList.remove(...classNames);
  if (classless.has(element) && element.classList.length === 0) {
    element.removeAttribute('class');
    classless.delete(element);
  }
}
