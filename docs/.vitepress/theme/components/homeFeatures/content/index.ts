import type { HomeFeaturesContent } from '../types';
import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import { ko } from './ko';
import { pt } from './pt';
import { ru } from './ru';
import { zh } from './zh';
import { zhTW } from './zh_TW';

/** Showcase copy keyed by VitePress locale `lang`; unknown locales fall back to en-US. */
export const homeFeaturesContent: Record<string, HomeFeaturesContent> = {
  'zh-CN': zh,
  'zh-TW': zhTW,
  'en-US': en,
  'ja-JP': ja,
  'ko-KR': ko,
  'fr-FR': fr,
  'es-ES': es,
  'pt-PT': pt,
  'ar-SA': ar,
  'ru-RU': ru,
};
