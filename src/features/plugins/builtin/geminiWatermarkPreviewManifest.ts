import type { PluginManifest } from '../types';

/** Packaged-only preview control; the existing watermark resolver owns its switch. */
export const GEMINI_WATERMARK_PREVIEW_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-watermark-preview',
  name: 'Remove watermark in preview',
  version: '1.0.0',
  description: 'Remove the visible watermark from image previews in Gemini.',
  i18n: {
    zh: {
      name: '预览时去除水印',
      description: '移除 Gemini 图片预览中的可见水印。',
    },
    zh_TW: {
      name: '預覽時移除浮水印',
      description: '移除 Gemini 圖片預覽中的可見浮水印。',
    },
    ja: {
      name: 'プレビュー時に透かしを除去',
      description: 'Gemini の画像プレビューから可視透かしを除去します。',
    },
    ko: {
      name: '미리보기에서 워터마크 제거',
      description: 'Gemini 이미지 미리보기에서 눈에 보이는 워터마크를 제거합니다.',
    },
    fr: {
      name: 'Retirer le filigrane dans l’aperçu',
      description: 'Retire le filigrane visible des aperçus d’images dans Gemini.',
    },
    es: {
      name: 'Eliminar marca de agua en la vista previa',
      description: 'Elimina la marca de agua visible de las vistas previas de imágenes en Gemini.',
    },
    pt: {
      name: 'Remover marca d’água na pré-visualização',
      description: 'Remove a marca d’água visível das pré-visualizações de imagens no Gemini.',
    },
    ru: {
      name: 'Удалять водяной знак в превью',
      description: 'Удаляет видимый водяной знак с изображений в предпросмотре Gemini.',
    },
    ar: {
      name: 'إزالة العلامة المائية في المعاينة',
      description: 'يزيل العلامة المائية المرئية من معاينات الصور في Gemini.',
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
