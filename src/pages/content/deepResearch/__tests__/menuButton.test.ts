import { describe, expect, it } from 'vitest';

import { applyDeepResearchDownloadButtonI18n } from '../menuButton';

import type { AppLanguage } from '@/utils/language';

describe('applyDeepResearchDownloadButtonI18n', () => {
  it('updates label and tooltip according to language', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    span.className = 'mat-mdc-menu-item-text';
    span.textContent = ' placeholder';
    button.appendChild(span);

    const dict: Record<AppLanguage, Record<string, string>> = {
      en: { deepResearchDownload: 'Download', deepResearchDownloadTooltip: 'Download (MD)' },
      zh: { deepResearchDownload: '下载', deepResearchDownloadTooltip: '下载（MD）' },
      ja: {
        deepResearchDownload: 'ダウンロード',
        deepResearchDownloadTooltip: 'ダウンロード（MD）',
      },
      fr: { deepResearchDownload: 'Télécharger', deepResearchDownloadTooltip: 'Télécharger (MD)' },
      es: { deepResearchDownload: 'Descargar', deepResearchDownloadTooltip: 'Descargar (MD)' },
    };

    applyDeepResearchDownloadButtonI18n(button, dict, 'ja');

    expect(button.title).toBe('ダウンロード（MD）');
    expect(button.getAttribute('aria-label')).toBe('ダウンロード（MD）');
    expect(span.textContent).toBe(' ダウンロード');
  });
});
