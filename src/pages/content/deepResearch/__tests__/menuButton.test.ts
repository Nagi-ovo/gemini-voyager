import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

import {
  applyDeepResearchDownloadButtonI18n,
  applyDeepResearchSaveReportButtonI18n,
  isDeepResearchReportMenuPanel,
  showDeepResearchExportProgressOverlay,
} from '../menuButton';

describe('applyDeepResearchDownloadButtonI18n', () => {
  it('identifies deep research report share/export menu panel', () => {
    const panel = document.createElement('div');
    panel.className = 'mat-mdc-menu-panel';
    panel.setAttribute('role', 'menu');

    const content = document.createElement('div');
    content.className = 'mat-mdc-menu-content';

    const shareContainer = document.createElement('div');
    shareContainer.setAttribute('data-test-id', 'share-button-tooltip-container');
    content.appendChild(shareContainer);

    const exportToDocs = document.createElement('export-to-docs-button');
    exportToDocs.setAttribute('data-test-id', 'export-to-docs-button');
    content.appendChild(exportToDocs);

    const copyButton = document.createElement('copy-button');
    copyButton.setAttribute('data-test-id', 'copy-button');
    content.appendChild(copyButton);

    panel.appendChild(content);

    expect(isDeepResearchReportMenuPanel(panel)).toBe(true);
  });

  it('rejects sidebar conversation menu panel for deep research injection', () => {
    const panel = document.createElement('div');
    panel.className = 'mat-mdc-menu-panel';
    panel.setAttribute('role', 'menu');

    const content = document.createElement('div');
    content.className = 'mat-mdc-menu-content';

    const pin = document.createElement('button');
    pin.setAttribute('data-test-id', 'pin-button');
    content.appendChild(pin);

    const rename = document.createElement('button');
    rename.setAttribute('data-test-id', 'rename-button');
    content.appendChild(rename);

    panel.appendChild(content);

    expect(isDeepResearchReportMenuPanel(panel)).toBe(false);
  });

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
      ko: { deepResearchDownload: '다운로드', deepResearchDownloadTooltip: '다운로드 (MD)' },
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
      ko: {
        deepResearchSaveReport: '보고서 저장',
        deepResearchSaveReportTooltip: '보고서 저장',
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
      ko: { pm_export: '내보내기', loading: '로딩 중' },
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

  it('wires Safari PDF report export success to runtime toast guidance', () => {
    const code = readFileSync(
      resolve(process.cwd(), 'src/pages/content/deepResearch/menuButton.ts'),
      'utf8',
    );

    expect(code).toContain("format === 'pdf'");
    expect(code).toContain('isSafari()');
    expect(code).toContain('showExportToast(');
    expect(code).toContain("t('export_toast_safari_pdf_ready')");
  });
});
