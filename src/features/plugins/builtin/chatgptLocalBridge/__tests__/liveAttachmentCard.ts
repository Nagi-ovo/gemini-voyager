/**
 * The composer's attachment area as captured on chatgpt.com (zh-CN) on
 * 2026-10-18, for a file the person attached through the file input; classes
 * and svg bodies stripped. The file input is empty afterwards, and the card has
 * no `data-attachment-id`, `data-file-id` or `data-testid`. Removing the file
 * leaves `[data-composer-attachments]` in the form with no children.
 */
export function liveAttachmentArea(name: string | null): HTMLElement {
  const area = document.createElement('div');
  area.innerHTML =
    '<div data-composer-attachments="" data-composer-spacing="default" data-visible-attachments=""></div>';
  if (name !== null) {
    area.firstElementChild!.innerHTML =
      '<div><span><span><span><span><svg aria-hidden="true"></svg></span></span>' +
      '<span><svg aria-hidden="true"></svg><span></span></span><span aria-hidden="true"></span>' +
      '<button type="button"></button></span>' +
      '<button type="button"><svg aria-hidden="true"></svg></button></span></div>';
    const [open, remove] = Array.from(area.querySelectorAll('button'));
    area.querySelector('span > svg + span')!.textContent = name;
    open.setAttribute('aria-label', name);
    remove.setAttribute('aria-label', `移除 ${name}`);
  }
  return area;
}

/** A card with no file name in it (an image preview, or a UI in another language). */
export function unnamedAttachmentArea(): HTMLElement {
  const area = liveAttachmentArea(null);
  area.firstElementChild!.innerHTML =
    '<div><span><img alt="" /><button type="button" aria-label="移除文件"><svg aria-hidden="true"></svg></button></span></div>';
  return area;
}
