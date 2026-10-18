import type { VoyagerBuildTarget } from '@/core/utils/browser';

import type { PluginManifest } from '../../types';

export const CHATGPT_PRO_USAGE_PLUGIN_ID = 'voyager.chatgpt-pro-usage';
/** The ring's denominator until ChatGPT names the real limit (it does so only once Pro is used up). */
export const DEFAULT_WEEKLY_PRO_LIMIT = 200;
export const MAX_WEEKLY_PRO_LIMIT = 10_000;

// Read here rather than through getVoyagerBuildTarget: the builtin list runs this at import,
// and many suites mock '@/core/utils/browser' without that export.
function buildTarget(): VoyagerBuildTarget {
  // Optional: the docs build runs this under Node, where import.meta.env is undefined.
  const target = import.meta.env?.VOYAGER_BUILD_TARGET;
  return target === 'edge' || target === 'firefox' || target === 'safari' ? target : 'chrome';
}

/**
 * Builds that can run the page observer. Firefox's minimum predates MAIN-world
 * registered scripts. Safari runs its page observers as static manifest
 * entries (a dynamic copy can outlive a rebuilt extension), and a static entry
 * would add chatgpt.com to the hosts every Safari install asks for, so the
 * plugin is left out there, as the Local Bridge is.
 */
export function isChatGptProUsageSupported(target: VoyagerBuildTarget = buildTarget()): boolean {
  return target === 'chrome' || target === 'edge';
}

/** Off by default; background registers its page observer only while it is on. */
export const CHATGPT_PRO_USAGE_MANIFEST: PluginManifest = {
  id: CHATGPT_PRO_USAGE_PLUGIN_ID,
  name: 'ChatGPT · Pro usage this week',
  description:
    'Counts your GPT-6 Pro messages sent from this browser and shows this week’s use as a small ring next to the model picker; hover it for the numbers. Once ChatGPT reports your limit, the ring uses it.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'ChatGPT · Pro 本周用量',
      description:
        '统计在这个浏览器里发出的 GPT-6 Pro 消息，在模型选择框旁用小圆环显示本周用量，悬停可看次数；ChatGPT 报了额度后，圆环以它为准。',
    },
    zh_TW: {
      name: 'ChatGPT · Pro 本週用量',
      description:
        '統計在這個瀏覽器中送出的 GPT-6 Pro 訊息，在模型選擇器旁以小圓環顯示本週用量，滑鼠懸停可看次數；ChatGPT 回報額度後，圓環以它為準。',
    },
    ja: {
      name: 'ChatGPT · 今週の Pro 使用回数',
      description:
        'このブラウザから送信した GPT-6 Pro のメッセージを数え、モデル選択の横に今週の使用量を小さなリングで表示します。ホバーで回数を確認できます。ChatGPT が上限を知らせると、その値を使います。',
    },
    ko: {
      name: 'ChatGPT · 이번 주 Pro 사용량',
      description:
        '이 브라우저에서 보낸 GPT-6 Pro 메시지를 세어 모델 선택기 옆에 이번 주 사용량을 작은 링으로 표시합니다. 마우스를 올리면 횟수를 볼 수 있습니다. ChatGPT가 한도를 알려 주면 링은 그 값을 사용합니다.',
    },
    fr: {
      name: 'ChatGPT · Utilisation de Pro cette semaine',
      description:
        'Compte les messages GPT-6 Pro envoyés depuis ce navigateur et affiche l’utilisation de la semaine sous forme de petit anneau à côté du sélecteur de modèle ; survolez-le pour voir les chiffres. Dès que ChatGPT indique votre limite, l’anneau l’utilise.',
    },
    es: {
      name: 'ChatGPT · Uso de Pro esta semana',
      description:
        'Cuenta los mensajes de GPT-6 Pro enviados desde este navegador y muestra el uso de la semana como un pequeño anillo junto al selector de modelo; pasa el cursor para ver las cifras. Cuando ChatGPT indica tu límite, el anillo lo usa.',
    },
    pt: {
      name: 'ChatGPT · Uso do Pro nesta semana',
      description:
        'Conta as mensagens do GPT-6 Pro enviadas deste navegador e mostra o uso da semana como um pequeno anel ao lado do seletor de modelo; passe o cursor para ver os números. Quando o ChatGPT informa seu limite, o anel o usa.',
    },
    ru: {
      name: 'ChatGPT · Pro за эту неделю',
      description:
        'Считает сообщения GPT-6 Pro, отправленные из этого браузера, и показывает недельное использование маленьким кольцом рядом с выбором модели; наведите курсор, чтобы увидеть числа. Когда ChatGPT сообщает лимит, кольцо использует его.',
    },
    ar: {
      name: 'ChatGPT · استخدام Pro هذا الأسبوع',
      description:
        'يحسب رسائل GPT-6 Pro المرسلة من هذا المتصفح ويعرض استخدام هذا الأسبوع كحلقة صغيرة بجانب منتقي النموذج؛ مرّر المؤشر لرؤية الأرقام. وعندما يذكر ChatGPT حدّك، تستخدمه الحلقة.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  contributes: {
    settings: {
      weeklyLimit: {
        type: 'number',
        label: 'Weekly Pro allowance',
        default: DEFAULT_WEEKLY_PRO_LIMIT,
        min: 1,
        max: MAX_WEEKLY_PRO_LIMIT,
        messageKeys: {
          label: 'chatgptProUsageWeeklyLimit',
          hint: 'chatgptProUsageWeeklyLimitHint',
        },
      },
    },
  },
};
