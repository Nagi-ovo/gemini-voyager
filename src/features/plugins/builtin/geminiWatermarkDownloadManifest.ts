import type { PluginManifest } from '../types';

/** Packaged-only download control; the existing watermark resolver owns its switch. */
export const GEMINI_WATERMARK_DOWNLOAD_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-watermark-download',
  name: 'Remove watermark on download',
  version: '1.0.0',
  description: 'Remove the visible watermark from images downloaded from Gemini.',
  i18n: {
    zh: {
      name: '下载时去除水印',
      description: '下载 Gemini 图片时移除可见水印。',
    },
    zh_TW: {
      name: '下載時移除浮水印',
      description: '下載 Gemini 圖片時移除可見浮水印。',
    },
    ja: {
      name: 'ダウンロード時に透かしを除去',
      description: 'Gemini からダウンロードする画像の可視透かしを除去します。',
    },
    ko: {
      name: '다운로드 시 워터마크 제거',
      description: 'Gemini에서 다운로드하는 이미지의 눈에 보이는 워터마크를 제거합니다.',
    },
    fr: {
      name: 'Retirer le filigrane au téléchargement',
      description: 'Retire le filigrane visible des images téléchargées depuis Gemini.',
    },
    es: {
      name: 'Eliminar marca de agua al descargar',
      description: 'Elimina la marca de agua visible de las imágenes descargadas de Gemini.',
    },
    pt: {
      name: 'Remover marca d’água ao baixar',
      description: 'Remove a marca d’água visível das imagens baixadas do Gemini.',
    },
    ru: {
      name: 'Удалять водяной знак при скачивании',
      description: 'Удаляет видимый водяной знак с изображений, скачиваемых из Gemini.',
    },
    ar: {
      name: 'إزالة العلامة المائية عند التنزيل',
      description: 'يزيل العلامة المائية المرئية من الصور التي تنزّلها من Gemini.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {},
};
