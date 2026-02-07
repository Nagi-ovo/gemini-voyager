import { describe, expect, it } from 'vitest';

import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

import {
  applyDeepResearchDownloadButtonI18n,
  applyDeepResearchSaveReportButtonI18n,
  showDeepResearchExportProgressOverlay,
} from '../menuButton';

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
      zh_TW: { deepResearchDownload: '下載', deepResearchDownloadTooltip: '下載（MD）' },
      ja: {
        deepResearchDownload: 'ダウンロード',
        deepResearchDownloadTooltip: 'ダウンロード（MD）',
      },
      fr: { deepResearchDownload: 'Télécharger', deepResearchDownloadTooltip: 'Télécharger (MD)' },
      es: { deepResearchDownload: 'Descargar', deepResearchDownloadTooltip: 'Descargar (MD)' },
      pt: { deepResearchDownload: 'Baixar', deepResearchDownloadTooltip: 'Baixar (MD)' },
      ar: { deepResearchDownload: 'تحميل', deepResearchDownloadTooltip: 'تحميل (MD)' },
      ru: { deepResearchDownload: 'Скачать', deepResearchDownloadTooltip: 'Скачать (MD)' },
    };

    applyDeepResearchDownloadButtonI18n(button, dict, 'ja');

    expect(button.title).toBe('ダウンロード（MD）');
    expect(button.getAttribute('aria-label')).toBe('ダウンロード（MD）');
    expect(span.textContent).toBe(' ダウンロード');
  });

  it('updates save report label and tooltip according to language', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    span.className = 'mat-mdc-menu-item-text';
    span.textContent = ' placeholder';
    button.appendChild(span);

    const dict: Record<AppLanguage, Record<string, string>> = {
      en: { deepResearchSaveReport: 'Save report', deepResearchSaveReportTooltip: 'Save report' },
      zh: { deepResearchSaveReport: '保存报告', deepResearchSaveReportTooltip: '保存报告' },
      zh_TW: { deepResearchSaveReport: '儲存報告', deepResearchSaveReportTooltip: '儲存報告' },
      ja: {
        deepResearchSaveReport: 'レポートを保存',
        deepResearchSaveReportTooltip: 'レポートを保存',
      },
      fr: {
        deepResearchSaveReport: 'Enregistrer le rapport',
        deepResearchSaveReportTooltip: 'Enregistrer le rapport',
      },
      es: {
        deepResearchSaveReport: 'Guardar informe',
        deepResearchSaveReportTooltip: 'Guardar informe',
      },
      pt: {
        deepResearchSaveReport: 'Salvar relatório',
        deepResearchSaveReportTooltip: 'Salvar relatório',
      },
      ar: { deepResearchSaveReport: 'حفظ التقرير', deepResearchSaveReportTooltip: 'حفظ التقرير' },
      ru: {
        deepResearchSaveReport: 'Сохранить отчет',
        deepResearchSaveReportTooltip: 'Сохранить отчет',
      },
    };

    applyDeepResearchSaveReportButtonI18n(button, dict, 'zh');

    expect(button.title).toBe('保存报告');
    expect(button.getAttribute('aria-label')).toBe('保存报告');
    expect(span.textContent).toBe(' 保存报告');
  });

  it('renders and removes deep research export progress overlay', () => {
    const dict: Record<AppLanguage, Record<string, string>> = {
      en: { pm_export: 'Export', loading: 'Loading' },
      zh: { pm_export: '导出', loading: '加载中' },
      zh_TW: { pm_export: '匯出', loading: '載入中' },
      ja: { pm_export: 'エクスポート', loading: '読み込み中' },
      fr: { pm_export: 'Exporter', loading: 'Chargement' },
      es: { pm_export: 'Exportar', loading: 'Cargando' },
      pt: { pm_export: 'Exportar', loading: 'Carregando' },
      ar: { pm_export: 'تصدير', loading: 'جارٍ التحميل' },
      ru: { pm_export: 'Экспорт', loading: 'Загрузка' },
    };

    const t = (key: TranslationKey): string => {
      if (key === 'pm_export' || key === 'loading') {
        return dict.en[key];
      }
      return '';
    };
    const hide = showDeepResearchExportProgressOverlay(t);

    const overlay = document.querySelector('.gv-export-progress-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Export...');
    expect(overlay?.textContent).toContain('Loading');

    hide();

    expect(document.querySelector('.gv-export-progress-overlay')).toBeNull();
  });
});
