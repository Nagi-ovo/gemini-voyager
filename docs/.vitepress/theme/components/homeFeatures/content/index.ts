import { shallowReactive } from 'vue';

import type { HomeFeaturesContent } from '../types';

// One chunk per language, so a page downloads only its own showcase copy.
const loaders: Record<string, () => Promise<HomeFeaturesContent>> = {
  'zh-CN': () => import('./zh').then((m) => m.zh),
  'zh-TW': () => import('./zh_TW').then((m) => m.zhTW),
  'en-US': () => import('./en').then((m) => m.en),
  'ja-JP': () => import('./ja').then((m) => m.ja),
  'ko-KR': () => import('./ko').then((m) => m.ko),
  'fr-FR': () => import('./fr').then((m) => m.fr),
  'es-ES': () => import('./es').then((m) => m.es),
  'pt-PT': () => import('./pt').then((m) => m.pt),
  'ar-SA': () => import('./ar').then((m) => m.ar),
  'ru-RU': () => import('./ru').then((m) => m.ru),
};

/**
 * Showcase copy keyed by VitePress locale `lang`, holding the languages loaded so far.
 * `HomeFeaturesLazy` loads the page's language before `HomeFeatures` renders, and scenes only
 * render after a feature click, so readers always find their language here.
 */
export const homeFeaturesContent: Record<string, HomeFeaturesContent> = shallowReactive({});

const pending = new Map<string, Promise<HomeFeaturesContent>>();

/** Loads and caches the copy for `lang`; unknown locales get en-US under their own key. */
export function loadHomeFeaturesContent(lang: string): Promise<HomeFeaturesContent> {
  let load = pending.get(lang);
  if (!load) {
    load = (loaders[lang] ?? loaders['en-US'])().then(
      (content) => (homeFeaturesContent[lang] = content),
      (error: unknown) => {
        pending.delete(lang); // let a later visit retry a failed chunk
        throw error;
      },
    );
    pending.set(lang, load);
  }
  return load;
}
