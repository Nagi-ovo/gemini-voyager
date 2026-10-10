import type { ToastInput } from './types';

export type ToastView = {
  readonly element: HTMLElement;
  /** Bring the element in line with `input`, keeping nodes so live regions and focus survive. */
  apply(input: ToastInput): void;
};

type ViewEvents = {
  onAction: () => void;
  onDismiss: () => void;
  /** Present when the message is a button. */
  onActivate?: () => void;
};

function button(className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.addEventListener('click', onClick);
  return element;
}

export function createToastView(events: ViewEvents): ToastView {
  const element = document.createElement('div');
  element.className = 'gv-toast';

  const dot = document.createElement('span');
  dot.className = 'gv-toast-dot';
  dot.setAttribute('aria-hidden', 'true');

  const body = events.onActivate
    ? button('gv-toast-body', events.onActivate)
    : document.createElement('div');
  body.classList.add('gv-toast-body');
  const title = document.createElement('p');
  title.className = 'gv-toast-title';
  title.dir = 'auto';
  const message = document.createElement('p');
  message.className = 'gv-toast-message';
  message.dir = 'auto';
  const messageText = document.createTextNode('');
  // Its own polite region, so a ticking countdown announces only itself.
  const detail = document.createElement('span');
  detail.className = 'gv-toast-detail';
  detail.setAttribute('aria-live', 'polite');
  detail.setAttribute('aria-atomic', 'true');
  message.append(messageText, detail);
  body.append(title, message);

  const action = button('gv-toast-action', events.onAction);
  const dismiss = button('gv-toast-dismiss', events.onDismiss);
  dismiss.textContent = '×';

  element.append(dot, body, action, dismiss);

  return {
    element,
    apply(input) {
      const tone = input.tone ?? 'info';
      element.dataset.tone = tone;
      element.toggleAttribute('data-pending', input.pending === true);
      element.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      title.hidden = !input.title;
      title.textContent = input.title ?? '';
      messageText.data = input.message;
      detail.hidden = !input.detail;
      detail.textContent = input.detail ?? '';
      action.hidden = !input.action;
      action.textContent = input.action?.label ?? '';
      dismiss.hidden = !input.dismissLabel;
      if (input.dismissLabel) dismiss.setAttribute('aria-label', input.dismissLabel);
    },
  };
}
