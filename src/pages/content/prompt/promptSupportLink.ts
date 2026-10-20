/**
 * The sponsor link in the Prompt Manager footer: a heart icon plus a label,
 * pointing at the sponsor guide in the current language.
 */
import { createHeartIcon } from '@/core/icons/promptManagerIcons';
import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

/** zh is the docs' root locale; every other language has its own prefix. */
function sponsorUrl(lang: AppLanguage): string {
  return lang === 'zh'
    ? 'https://voyager.nagi.fun/guide/sponsor.html'
    : `https://voyager.nagi.fun/${lang}/guide/sponsor.html`;
}

export function createSupportLink({
  t,
  getLanguage,
}: {
  t: (key: TranslationKey) => string;
  getLanguage: () => Promise<AppLanguage>;
}): { element: HTMLAnchorElement; applyTexts: () => void } {
  const link = document.createElement('a');
  link.className = 'gv-pm-support';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.title = t('sponsorMe');

  function applyTexts(): void {
    const label = t('sponsorMe');
    const labelEl = document.createElement('span');
    labelEl.className = 'gv-pm-support-label';
    labelEl.textContent = label;
    // 14px matches the settings gear beside it.
    link.replaceChildren(createHeartIcon(14), labelEl);
    link.title = label;
    void getLanguage().then((lang) => {
      link.href = sponsorUrl(lang);
    });
  }

  return { element: link, applyTexts };
}
