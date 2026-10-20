/**
 * The sponsor link in the Prompt Manager footer: a heart icon plus a label,
 * pointing at the sponsor guide in the current language.
 */
import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

const SPONSOR_HEART_PATH_16 =
  'M7.655 14.916h-.002l-.006-.003l-.018-.01a22 22 0 0 1-3.744-2.584C2.045 10.731 0 8.35 0 5.5C0 2.836 2.086 1 4.25 1C5.797 1 7.153 1.802 8 3.02C8.847 1.802 10.203 1 11.75 1C13.914 1 16 2.836 16 5.5c0 2.85-2.044 5.231-3.886 6.818a22 22 0 0 1-3.433 2.414a7 7 0 0 1-.31.17l-.018.01l-.008.004a.75.75 0 0 1-.69 0';

function createSponsorHeartIcon(size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SPONSOR_HEART_PATH_16);
  svg.appendChild(path);

  return svg;
}

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
    link.replaceChildren(createSponsorHeartIcon(), labelEl);
    link.title = label;
    void getLanguage().then((lang) => {
      link.href = sponsorUrl(lang);
    });
  }

  return { element: link, applyTexts };
}
