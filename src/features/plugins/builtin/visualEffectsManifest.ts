import type { PluginManifest } from '../types';

/**
 * One shared choice on pages where Voyager already runs. The fixed-id handler
 * owns the renderers; this match never requests permission or injects a script.
 * The legacy keys remain authoritative, including the default-off choice.
 */
export const VISUAL_EFFECTS_MANIFEST: PluginManifest = {
  id: 'voyager.visual-effects',
  name: 'Visual effects',
  version: '1.0.0',
  description: 'Add falling snow, cherry blossoms or rain, with one shared choice across sites.',
  i18n: {
    zh: {
      name: '视觉特效',
      description: '为页面添加飘雪、樱花或雨滴，所有网站共用同一个选择。',
      settings: {
        effect: {
          label: '效果',
          options: { off: '关闭', snow: '飘雪', sakura: '樱花', rain: '雨滴' },
        },
      },
    },
    zh_TW: {
      name: '視覺特效',
      description: '為頁面加入飄雪、櫻花或雨滴，所有網站共用同一個選擇。',
      settings: {
        effect: {
          label: '效果',
          options: { off: '關閉', snow: '飄雪', sakura: '櫻花', rain: '雨滴' },
        },
      },
    },
    ja: {
      name: '視覚効果',
      description: '雪、桜の花びら、雨をページに降らせます。すべてのサイトで同じ設定を使います。',
      settings: {
        effect: { label: '効果', options: { off: 'オフ', snow: '雪', sakura: '桜', rain: '雨' } },
      },
    },
    ko: {
      name: '시각 효과',
      description:
        '페이지에 눈, 벚꽃 또는 비가 내리게 합니다. 모든 사이트에서 같은 설정을 사용합니다.',
      settings: {
        effect: { label: '효과', options: { off: '끄기', snow: '눈', sakura: '벚꽃', rain: '비' } },
      },
    },
    fr: {
      name: 'Effets visuels',
      description:
        'Ajoute de la neige, des pétales de cerisier ou de la pluie, avec un même choix sur tous les sites.',
      settings: {
        effect: {
          label: 'Effet',
          options: { off: 'Désactivé', snow: 'Neige', sakura: 'Sakura', rain: 'Pluie' },
        },
      },
    },
    es: {
      name: 'Efectos visuales',
      description:
        'Añade nieve, pétalos de cerezo o lluvia, con una misma selección en todos los sitios.',
      settings: {
        effect: {
          label: 'Efecto',
          options: {
            off: 'Desactivado',
            snow: 'Nieve',
            sakura: 'Sakura',
            rain: 'Lluvia',
          },
        },
      },
    },
    pt: {
      name: 'Efeitos visuais',
      description:
        'Adiciona neve, pétalas de cerejeira ou chuva, com a mesma escolha em todos os sites.',
      settings: {
        effect: {
          label: 'Efeito',
          options: {
            off: 'Desativado',
            snow: 'Neve',
            sakura: 'Sakura',
            rain: 'Chuva',
          },
        },
      },
    },
    ru: {
      name: 'Визуальные эффекты',
      description:
        'Добавляет падающий снег, лепестки сакуры или дождь. Выбранный эффект применяется на всех сайтах.',
      settings: {
        effect: {
          label: 'Эффект',
          options: { off: 'Выключено', snow: 'Снег', sakura: 'Сакура', rain: 'Дождь' },
        },
      },
    },
    ar: {
      name: 'المؤثرات البصرية',
      description:
        'أضف الثلج أو بتلات الكرز المتساقطة أو المطر، باختيار واحد مشترك بين جميع المواقع.',
      settings: {
        effect: {
          label: 'التأثير',
          options: { off: 'إيقاف', snow: 'ثلج', sakura: 'أزهار الكرز', rain: 'مطر' },
        },
      },
    },
  },
  author: 'voyager-official',
  category: 'theme',
  license: 'GPL-3.0-or-later',
  engine: '>=1.6.0',
  tier: 'declarative',
  // Runtime coverage only: no extension permission or content-script registration.
  matches: ['<all_urls>'],
  contributes: {
    settings: {
      effect: {
        type: 'select',
        label: 'Effect',
        default: 'off',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'snow', label: 'Snow' },
          { value: 'sakura', label: 'Sakura' },
          { value: 'rain', label: 'Rain' },
        ],
      },
    },
  },
};
