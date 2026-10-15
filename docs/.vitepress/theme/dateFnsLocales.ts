// Stand-in for `date-fns/locale`, aliased in config.mts. The git-changelog plugin looks a locale up
// by name (`DateFnsLocales[name]`), and the full barrel would ship every date-fns locale with each
// page; this keeps only the site's 10 languages. An unknown name falls back to the plugin's
// `toLocaleDateString()` path, as before.
export { ar } from 'date-fns/locale/ar';
export { arSA } from 'date-fns/locale/ar-SA';
export { enUS } from 'date-fns/locale/en-US';
export { es } from 'date-fns/locale/es';
export { fr } from 'date-fns/locale/fr';
export { ja } from 'date-fns/locale/ja';
export { ko } from 'date-fns/locale/ko';
export { pt } from 'date-fns/locale/pt';
export { ru } from 'date-fns/locale/ru';
export { zhCN } from 'date-fns/locale/zh-CN';
export { zhTW } from 'date-fns/locale/zh-TW';
