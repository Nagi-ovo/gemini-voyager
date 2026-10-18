/**
 * Detects a Cloudflare or human-verification interstitial, or ChatGPT's
 * account security block, so a bridge op stops before it touches such a page
 * (spec §3.3). The rules follow oracle's evidence classes:
 * - strong: no app shell, and a challenge title, a challenge widget, or
 *   verification copy on a short page — counts at once;
 * - shell: the ChatGPT app shell rendered — never a challenge, whatever scripts
 *   the page carries (bot management injects them on healthy pages too);
 * - weak: only the challenge-platform script on a short, shell-less page — it
 *   also matches a healthy load mid-hydration, so it counts only once it has
 *   persisted for {@link WEAK_PERSIST_MS}.
 *
 * The selectors are code constants on purpose: this check must keep working
 * when the site data is broken.
 */
import type { AppLanguage } from '@/utils/language';

export type ChallengeKind = 'challenge' | 'account-blocked';

const APP_SHELL_SELECTOR = [
  'form[data-chatgpt-composer]',
  '[data-turn-key]',
  '#prompt-textarea',
  '[data-testid="prompt-textarea"]',
  '[data-testid^="conversation-turn"]',
  '[data-testid="profile-button"]',
  'main form[data-type]',
  'nav a[href*="/c/"]',
].join(', ');
const CHALLENGE_WIDGET_SELECTOR = [
  '#challenge-form',
  '#challenge-running',
  '#cf-challenge-running',
  '[class*="cf-challenge"]',
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[src*="/cdn-cgi/challenge-platform/"]',
].join(', ');
const CHALLENGE_SCRIPT_SELECTOR = 'script[src*="/challenge-platform/"]';
const VERIFYING_COPY =
  /verify(ing)? you are human|checking your browser|needs to review the security of your connection|just a moment/;
const SHORT_PAGE_CHARS = 600;
export const WEAK_PERSIST_MS = 12_000;
const OBSERVER_DEBOUNCE_MS = 300;

interface Verdict {
  readonly strong: boolean;
  readonly weak: boolean;
  readonly accountBlocked: boolean;
}

function normalized(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Page data and conversation text are not the page speaking: an existing chat's
// first load embeds its turns in <script> data, and a reply can quote any notice.
const NOT_PAGE_COPY_SELECTOR = 'script, style, noscript, template, [data-turn-key]';

/** The shell page's own text, without layout: no scripts, no conversation turns. */
function shellText(doc: Document): string {
  const body = doc.body;
  if (!body) return '';
  const walker = doc.createTreeWalker(
    body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    (node) =>
      node instanceof Element && node.matches(NOT_PAGE_COPY_SELECTOR)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  );
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '');
  }
  return normalized(parts.join(' '));
}

function pageText(doc: Document): string {
  const body = doc.body;
  return normalized(body ? (body.innerText ?? body.textContent ?? '') : '');
}

function readVerdict(doc: Document): Verdict {
  const title = (doc.title || '').toLowerCase();
  const titleSaysChallenge =
    title.includes('just a moment') ||
    (title.includes('attention required') && title.includes('cloudflare'));
  // A shell page streams a reply for minutes: read its text without forcing layout.
  const hasShell = doc.querySelector(APP_SHELL_SELECTOR) !== null;
  const text = hasShell ? shellText(doc) : pageText(doc);
  const shortPage = text.length < SHORT_PAGE_CHARS;
  const accountBlocked =
    text.includes('suspicious activity detected') && text.includes('secure your account');
  if (hasShell) return { strong: false, weak: false, accountBlocked };
  const hasWidget = doc.querySelector(CHALLENGE_WIDGET_SELECTOR) !== null;
  return {
    strong: titleSaysChallenge || hasWidget || (shortPage && VERIFYING_COPY.test(text)),
    weak: shortPage && doc.querySelector(CHALLENGE_SCRIPT_SELECTOR) !== null,
    accountBlocked,
  };
}

export interface ChallengeGuard {
  /** Synchronous verdict for the page as it is now; weak evidence counts once it persisted. */
  current(): ChallengeKind | null;
  /** Watch the page while an op runs; `onDetected` fires once, shortly after the page changed. */
  watch(onDetected: (kind: ChallengeKind) => void): () => void;
}

export function createChallengeGuard(
  doc: Document = document,
  now: () => number = Date.now,
): ChallengeGuard {
  let weakSince: number | null = null;

  const current = (): ChallengeKind | null => {
    const verdict = readVerdict(doc);
    if (verdict.accountBlocked) return 'account-blocked';
    if (verdict.strong) return 'challenge';
    if (!verdict.weak) {
      weakSince = null;
      return null;
    }
    const at = now();
    weakSince ??= at;
    return at - weakSince >= WEAK_PERSIST_MS ? 'challenge' : null;
  };

  const watch = (onDetected: (kind: ChallengeKind) => void): (() => void) => {
    let done = false;
    let weakTimer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
      if (done) return;
      const kind = current();
      if (kind) {
        stop();
        onDetected(kind);
        return;
      }
      // Weak evidence only counts after it persisted, which no mutation may announce.
      if (weakSince !== null && weakTimer === null) {
        weakTimer = setTimeout(
          () => {
            weakTimer = null;
            check();
          },
          Math.max(0, weakSince + WEAK_PERSIST_MS - now()),
        );
      }
    };
    let pending: ReturnType<typeof setTimeout> | null = null;
    // Streaming replies mutate the page many times a second; one check per quiet moment is enough.
    const observer = new MutationObserver(() => {
      if (pending !== null || done) return;
      pending = setTimeout(() => {
        pending = null;
        check();
      }, OBSERVER_DEBOUNCE_MS);
    });
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'id', 'class'],
    });
    function stop(): void {
      done = true;
      observer.disconnect();
      if (weakTimer !== null) clearTimeout(weakTimer);
      if (pending !== null) clearTimeout(pending);
      weakTimer = null;
      pending = null;
    }
    check();
    return stop;
  };

  return { current, watch };
}

/** The toast shown when an op stopped because the page asks the person to act. */
export const CHALLENGE_TOAST_COPY: Readonly<Record<AppLanguage, Record<ChallengeKind, string>>> = {
  en: {
    challenge:
      'Voyager Local Bridge stopped: ChatGPT is asking for a verification. Complete it on this page, then run the task again.',
    'account-blocked':
      'Voyager Local Bridge stopped: ChatGPT reported unusual activity on this account. Secure your account before using the bridge again.',
  },
  zh: {
    challenge: 'Voyager 本地桥已停止：ChatGPT 要求人机验证。请在本页完成验证后再重新运行任务。',
    'account-blocked':
      'Voyager 本地桥已停止：ChatGPT 提示此账号存在异常活动。请先处理账号安全，再使用本地桥。',
  },
  zh_TW: {
    challenge: 'Voyager 本機橋接已停止：ChatGPT 要求驗證。請在此頁完成驗證後再重新執行任務。',
    'account-blocked':
      'Voyager 本機橋接已停止：ChatGPT 表示此帳號有異常活動。請先處理帳號安全，再使用本機橋接。',
  },
  ja: {
    challenge:
      'Voyager ローカルブリッジを停止しました。ChatGPT が確認を求めています。このページで確認を完了してから、タスクをもう一度実行してください。',
    'account-blocked':
      'Voyager ローカルブリッジを停止しました。ChatGPT がこのアカウントの不審なアクティビティを検出しました。アカウントを保護してから再度ご利用ください。',
  },
  ko: {
    challenge:
      'Voyager 로컬 브리지가 중지되었습니다. ChatGPT가 인증을 요청합니다. 이 페이지에서 인증을 마친 뒤 작업을 다시 실행하세요.',
    'account-blocked':
      'Voyager 로컬 브리지가 중지되었습니다. ChatGPT가 이 계정의 비정상적인 활동을 알렸습니다. 계정을 보호한 뒤 다시 사용하세요.',
  },
  fr: {
    challenge:
      'Voyager Local Bridge s’est arrêté : ChatGPT demande une vérification. Effectuez-la sur cette page, puis relancez la tâche.',
    'account-blocked':
      'Voyager Local Bridge s’est arrêté : ChatGPT signale une activité inhabituelle sur ce compte. Sécurisez votre compte avant de réutiliser le pont.',
  },
  es: {
    challenge:
      'Voyager Local Bridge se detuvo: ChatGPT pide una verificación. Complétala en esta página y vuelve a ejecutar la tarea.',
    'account-blocked':
      'Voyager Local Bridge se detuvo: ChatGPT detectó actividad inusual en esta cuenta. Protege tu cuenta antes de volver a usar el puente.',
  },
  pt: {
    challenge:
      'O Voyager Local Bridge parou: o ChatGPT está pedindo uma verificação. Conclua-a nesta página e execute a tarefa novamente.',
    'account-blocked':
      'O Voyager Local Bridge parou: o ChatGPT detectou atividade incomum nesta conta. Proteja sua conta antes de usar a ponte novamente.',
  },
  ru: {
    challenge:
      'Voyager Local Bridge остановлен: ChatGPT просит пройти проверку. Пройдите её на этой странице и запустите задачу снова.',
    'account-blocked':
      'Voyager Local Bridge остановлен: ChatGPT сообщает о подозрительной активности в аккаунте. Защитите аккаунт, прежде чем снова использовать мост.',
  },
  ar: {
    challenge:
      'توقف جسر Voyager المحلي: يطلب ChatGPT إجراء تحقق. أكمله في هذه الصفحة ثم شغّل المهمة مرة أخرى.',
    'account-blocked':
      'توقف جسر Voyager المحلي: أبلغ ChatGPT عن نشاط غير معتاد في هذا الحساب. أمّن حسابك قبل استخدام الجسر مرة أخرى.',
  },
};
