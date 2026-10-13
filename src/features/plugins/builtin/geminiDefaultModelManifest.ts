import type { PluginManifest } from '../types';

/**
 * Gemini's default model, as a packaged builtin plugin. A builtin rather than
 * a catalog plugin because its runtime is first-party code (stars in Gemini's
 * model menu and a picker that applies the starred model and thinking level on
 * new chats), bound to this id in `pluginNativeRegistration.ts`. It declares
 * no settings: the plugin host turns it on and off from
 * `gvDefaultModelAutoApply`, on unless that key is `false`.
 *
 * `sites/featureOwners.ts` lists it, so this plugin is the feature's only runtime.
 */
export const GEMINI_DEFAULT_MODEL_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-default-model',
  name: 'Gemini · Default Model',
  version: '1.0.0',
  description:
    "Star a model and thinking level in Gemini's model menu, and new chats switch to them automatically.",
  i18n: {
    zh: {
      name: 'Gemini · 默认模型',
      description: '在 Gemini 的模型菜单里给模型和思考强度加星标，新对话会自动切换过去。',
    },
    zh_TW: {
      name: 'Gemini · 預設模型',
      description: '在 Gemini 的模型選單裡為模型和思考強度加上星號，新對話會自動切換過去。',
    },
    ja: {
      name: 'Gemini · デフォルトモデル',
      description:
        'Gemini のモデルメニューでモデルと思考レベルに星をつけると、新しい会話で自動的に切り替わります。',
    },
    ko: {
      name: 'Gemini · 기본 모델',
      description:
        'Gemini 모델 메뉴에서 모델과 사고 강도에 별표를 해 두면 새 대화가 자동으로 그 설정으로 전환됩니다.',
    },
    fr: {
      name: 'Gemini · Modèle par défaut',
      description:
        'Mettez en favori un modèle et un niveau de réflexion dans le menu des modèles de Gemini : les nouvelles conversations basculent dessus automatiquement.',
    },
    es: {
      name: 'Gemini · Modelo predeterminado',
      description:
        'Marca con una estrella un modelo y un nivel de razonamiento en el menú de modelos de Gemini y los chats nuevos cambiarán a ellos automáticamente.',
    },
    pt: {
      name: 'Gemini · Modelo padrão',
      description:
        'Marque com estrela um modelo e um nível de raciocínio no menu de modelos do Gemini, e os novos chats mudam para eles automaticamente.',
    },
    ru: {
      name: 'Gemini · Модель по умолчанию',
      description:
        'Отметьте звёздочкой модель и уровень рассуждений в меню моделей Gemini, и новые чаты будут переключаться на них автоматически.',
    },
    ar: {
      name: 'Gemini · النموذج الافتراضي',
      description:
        'ميّز نموذجًا ومستوى تفكير بنجمة في قائمة النماذج في Gemini، وستنتقل المحادثات الجديدة إليهما تلقائيًا.',
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
