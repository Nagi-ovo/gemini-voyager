import { getTranslationSyncUnsafe } from '@/utils/i18n';

export const NUDGE_CLASS = 'gv-hide-archived-nudge';

type ShouldShowArgs = {
  nudgeShown: boolean;
  hideArchivedAlreadyOn: boolean;
};

export function shouldShowHideArchivedNudge({
  nudgeShown,
  hideArchivedAlreadyOn,
}: ShouldShowArgs): boolean {
  if (nudgeShown) return false;
  if (hideArchivedAlreadyOn) return false;
  return true;
}

type MountArgs = {
  container: HTMLElement;
  onEnable: () => void;
  onDismiss: () => void;
};

export function mountHideArchivedNudge({ container, onEnable, onDismiss }: MountArgs): void {
  if (container.querySelector(`.${NUDGE_CLASS}`)) return;

  const t = (key: string) => getTranslationSyncUnsafe(key);

  const card = document.createElement('div');
  card.className = NUDGE_CLASS;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');

  const title = document.createElement('div');
  title.className = `${NUDGE_CLASS}__title`;
  title.textContent = t('hideArchivedNudgeTitle');

  const body = document.createElement('div');
  body.className = `${NUDGE_CLASS}__body`;
  body.textContent = t('hideArchivedNudgeBody');

  const actions = document.createElement('div');
  actions.className = `${NUDGE_CLASS}__actions`;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = `${NUDGE_CLASS}__btn ${NUDGE_CLASS}__btn--secondary`;
  dismissBtn.textContent = t('hideArchivedNudgeDismiss');

  const enableBtn = document.createElement('button');
  enableBtn.type = 'button';
  enableBtn.className = `${NUDGE_CLASS}__btn ${NUDGE_CLASS}__btn--primary`;
  enableBtn.textContent = t('hideArchivedNudgeEnable');

  actions.appendChild(dismissBtn);
  actions.appendChild(enableBtn);

  const footnote = document.createElement('div');
  footnote.className = `${NUDGE_CLASS}__footnote`;
  footnote.textContent = t('hideArchivedNudgeFootnote');

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  card.appendChild(footnote);

  const cleanup = () => {
    card.remove();
  };

  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
    onDismiss();
  });
  enableBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
    onEnable();
  });

  const header = container.querySelector('.gv-folder-header');
  if (header && header.nextSibling) {
    container.insertBefore(card, header.nextSibling);
  } else {
    container.appendChild(card);
  }

  requestAnimationFrame(() => card.classList.add(`${NUDGE_CLASS}--show`));
}

export function unmountHideArchivedNudge(container: HTMLElement): void {
  const existing = container.querySelector(`.${NUDGE_CLASS}`);
  if (existing) existing.remove();
}
