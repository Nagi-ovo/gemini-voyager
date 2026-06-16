import { StorageKeys } from '@/core/types/common';
import { isEdgeReleaseChannel } from '@/core/utils/browser';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';

export const EDGE_FINAL_VERSION_NOTICE_DELAY_MS = 10 * 60 * 1000;
export const EDGE_FINAL_VERSION_NOTICE_READ_MS = 10 * 1000;

const NOTICE_CLASS = 'gv-edge-final-version-notice';
const EDGE_ADDONS_URL =
  'https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne';

type NoticeCopy = {
  title: string;
  body: string;
  backup: string;
  cta: string;
  dismiss: string;
  close: string;
};

const COPY: Record<'en' | 'zh' | 'zh_TW', NoticeCopy> = {
  en: {
    title: 'Voyager will keep supporting Edge',
    body: 'Because some users rely on Edge on mobile and tablet devices, Voyager will keep maintaining and publishing the Microsoft Edge Add-ons version.',
    backup:
      'Edge Add-ons review may still lag behind the Chrome Web Store. For urgent fixes, desktop Edge users can temporarily use the Chrome Web Store build or the GitHub manual package.',
    cta: 'Open Edge Add-ons',
    dismiss: 'Got it',
    close: 'Close',
  },
  zh: {
    title: 'Voyager 会继续支持 Edge',
    body: '考虑到仍有用户依赖 Edge 的移动端和平板使用场景，Voyager 会继续维护并发布 Microsoft Edge Add-ons 版本。',
    backup:
      'Edge Add-ons 审核可能仍会慢于 Chrome 网上应用店；如遇紧急修复，桌面 Edge 用户可以临时使用 Chrome 商店版或 GitHub 手动包。',
    cta: '打开 Edge Add-ons',
    dismiss: '我知道了',
    close: '关闭',
  },
  zh_TW: {
    title: 'Voyager 會繼續支援 Edge',
    body: '考量到仍有使用者依賴 Edge 的行動端和平板使用情境，Voyager 會繼續維護並發布 Microsoft Edge Add-ons 版本。',
    backup:
      'Edge Add-ons 審核可能仍會慢於 Chrome 線上應用程式商店；如遇緊急修復，桌面 Edge 使用者可以暫時使用 Chrome 商店版或 GitHub 手動包。',
    cta: '打開 Edge Add-ons',
    dismiss: '我知道了',
    close: '關閉',
  },
};

let noticeTimer: number | null = null;
let cleanupActiveNotice: (() => void) | null = null;
let started = false;
let runId = 0;

function copyForLanguage(lang: AppLanguage): NoticeCopy {
  if (lang === 'zh' || lang === 'zh_TW') return COPY[lang];
  return COPY.en;
}

function getLocalStorage(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(defaults, (result) => {
        resolve(result ?? defaults);
      });
    } catch {
      resolve(defaults);
    }
  });
}

function setLocalStorage(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function markNoticeShown(): Promise<void> {
  await setLocalStorage({ [StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN]: true });
}

function removeExistingNotice(): void {
  document.querySelector(`.${NOTICE_CLASS}`)?.remove();
  cleanupActiveNotice = null;
}

function mountNotice(copy: NoticeCopy): void {
  if (document.querySelector(`.${NOTICE_CLASS}`)) return;

  const overlay = document.createElement('div');
  overlay.className = NOTICE_CLASS;
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('div');
  dialog.className = `${NOTICE_CLASS}__dialog`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'gv-edge-final-version-notice-title');

  const header = document.createElement('div');
  header.className = `${NOTICE_CLASS}__header`;

  const title = document.createElement('h2');
  title.id = 'gv-edge-final-version-notice-title';
  title.className = `${NOTICE_CLASS}__title`;
  title.textContent = copy.title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${NOTICE_CLASS}__close`;
  closeBtn.setAttribute('aria-label', copy.close);
  closeBtn.textContent = 'x';
  closeBtn.disabled = true;

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = `${NOTICE_CLASS}__body`;

  const bodyText = document.createElement('p');
  bodyText.textContent = copy.body;

  const backupText = document.createElement('p');
  backupText.textContent = copy.backup;

  body.appendChild(bodyText);
  body.appendChild(backupText);

  const actions = document.createElement('div');
  actions.className = `${NOTICE_CLASS}__actions`;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = `${NOTICE_CLASS}__btn ${NOTICE_CLASS}__btn--secondary`;
  dismissBtn.textContent = copy.dismiss;
  dismissBtn.disabled = true;

  const storeBtn = document.createElement('button');
  storeBtn.type = 'button';
  storeBtn.className = `${NOTICE_CLASS}__btn ${NOTICE_CLASS}__btn--primary`;
  storeBtn.textContent = copy.cta;
  storeBtn.disabled = true;

  actions.appendChild(dismissBtn);
  actions.appendChild(storeBtn);

  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const unlockAt = Date.now() + EDGE_FINAL_VERSION_NOTICE_READ_MS;
  let readTimer: number | null = null;
  const originalDismissText = copy.dismiss;
  const originalStoreText = copy.cta;

  function updateReadLock(): void {
    const remainingSeconds = Math.ceil(Math.max(0, unlockAt - Date.now()) / 1000);
    const locked = remainingSeconds > 0;

    closeBtn.disabled = locked;
    dismissBtn.disabled = locked;
    storeBtn.disabled = locked;
    dismissBtn.textContent = locked
      ? `${originalDismissText} (${remainingSeconds}s)`
      : originalDismissText;
    storeBtn.textContent = locked
      ? `${originalStoreText} (${remainingSeconds}s)`
      : originalStoreText;

    if (!locked && readTimer !== null) {
      clearInterval(readTimer);
      readTimer = null;
    }
  }

  function close(): void {
    if (Date.now() < unlockAt) return;
    void markNoticeShown();
    removeExistingNotice();
    document.removeEventListener('keydown', onKeyDown);
    if (readTimer !== null) {
      clearInterval(readTimer);
      readTimer = null;
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  closeBtn.addEventListener('click', close);
  dismissBtn.addEventListener('click', close);
  storeBtn.addEventListener('click', () => {
    if (Date.now() < unlockAt) return;
    void markNoticeShown();
    window.open(EDGE_ADDONS_URL, '_blank', 'noopener,noreferrer');
    removeExistingNotice();
    document.removeEventListener('keydown', onKeyDown);
    if (readTimer !== null) {
      clearInterval(readTimer);
      readTimer = null;
    }
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKeyDown);
  updateReadLock();
  readTimer = window.setInterval(updateReadLock, 250);

  cleanupActiveNotice = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (readTimer !== null) {
      clearInterval(readTimer);
      readTimer = null;
    }
    cleanupActiveNotice = null;
  };
}

async function scheduleNotice(delayMs: number, currentRunId: number): Promise<void> {
  const defaults = {
    [StorageKeys.EDGE_FINAL_VERSION_NOTICE_FIRST_SEEN_AT]: null,
    [StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN]: false,
  };
  const stored = await getLocalStorage(defaults);
  if (currentRunId !== runId) return;

  if (stored[StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN] === true) return;

  const now = Date.now();
  const firstSeenRaw = stored[StorageKeys.EDGE_FINAL_VERSION_NOTICE_FIRST_SEEN_AT];
  const firstSeenAt = typeof firstSeenRaw === 'number' ? firstSeenRaw : now;

  if (firstSeenRaw !== firstSeenAt) {
    await setLocalStorage({
      [StorageKeys.EDGE_FINAL_VERSION_NOTICE_FIRST_SEEN_AT]: firstSeenAt,
    });
    if (currentRunId !== runId) return;
  }

  const remainingMs = Math.max(0, delayMs - (now - firstSeenAt));
  const lang = await getCurrentLanguage();
  if (currentRunId !== runId) return;

  noticeTimer = window.setTimeout(async () => {
    if (currentRunId !== runId) return;
    const latest = await getLocalStorage(defaults);
    if (currentRunId !== runId) return;
    if (latest[StorageKeys.EDGE_FINAL_VERSION_NOTICE_SHOWN] === true) return;
    mountNotice(copyForLanguage(lang));
  }, remainingMs);
}

export function startEdgeFinalVersionNotice(
  delayMs: number = EDGE_FINAL_VERSION_NOTICE_DELAY_MS,
): () => void {
  if (!isEdgeReleaseChannel()) return () => {};
  if (started) return () => {};
  started = true;
  const currentRunId = runId + 1;
  runId = currentRunId;

  void scheduleNotice(delayMs, currentRunId);

  return () => {
    started = false;
    runId += 1;
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    cleanupActiveNotice?.();
    removeExistingNotice();
  };
}
