import { type VoyagerBuildTarget, getVoyagerBuildTarget } from '@/core/utils/browser';

import type { PluginManifest } from '../../types';

export const CHATGPT_PRO_USAGE_PLUGIN_ID = 'voyager.chatgpt-pro-usage';

/**
 * Builds that can run the page observer. Firefox's minimum predates MAIN-world
 * registered scripts. Safari runs its page observers as static manifest
 * entries (a dynamic copy can outlive a rebuilt extension), and a static entry
 * would add chatgpt.com to the hosts every Safari install asks for, so the
 * plugin is left out there, as the Local Bridge is.
 */
export function isChatGptProUsageSupported(
  target: VoyagerBuildTarget = getVoyagerBuildTarget(),
): boolean {
  return target === 'chrome' || target === 'edge';
}

/** Off by default; background registers its page observer only while it is on. */
export const CHATGPT_PRO_USAGE_MANIFEST: PluginManifest = {
  id: CHATGPT_PRO_USAGE_PLUGIN_ID,
  name: 'ChatGPT · Pro usage this week',
  description:
    'Counts your GPT-6 Pro messages sent from this browser and shows this week’s total next to the model picker. Once ChatGPT reports your limit, it shows how many are left and when they reset.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'ChatGPT · Pro 本周用量',
      description:
        '统计在这个浏览器里发出的 GPT-6 Pro 消息，在模型选择框旁显示本周用了几次；ChatGPT 告知额度后，还会显示剩余次数和重置时间。',
    },
    zh_TW: {
      name: 'ChatGPT · Pro 本週用量',
      description:
        '統計在這個瀏覽器中送出的 GPT-6 Pro 訊息，在模型選擇器旁顯示本週用了幾次；ChatGPT 告知額度後，也會顯示剩餘次數與重設時間。',
    },
    ja: {
      name: 'ChatGPT · 今週の Pro 使用回数',
      description:
        'このブラウザから送信した GPT-6 Pro のメッセージを数え、モデル選択の横に今週の回数を表示します。ChatGPT が上限を伝えると、残り回数とリセット時刻も表示します。',
    },
    ko: {
      name: 'ChatGPT · 이번 주 Pro 사용량',
      description:
        '이 브라우저에서 보낸 GPT-6 Pro 메시지를 세어 모델 선택기 옆에 이번 주 횟수를 표시합니다. ChatGPT가 한도를 알려 주면 남은 횟수와 초기화 시간도 표시합니다.',
    },
    fr: {
      name: 'ChatGPT · Utilisation de Pro cette semaine',
      description:
        'Compte les messages GPT-6 Pro envoyés depuis ce navigateur et affiche le total de la semaine à côté du sélecteur de modèle. Dès que ChatGPT indique votre limite, il affiche aussi le nombre restant et la date de réinitialisation.',
    },
    es: {
      name: 'ChatGPT · Uso de Pro esta semana',
      description:
        'Cuenta los mensajes de GPT-6 Pro enviados desde este navegador y muestra el total de la semana junto al selector de modelo. Cuando ChatGPT indica tu límite, también muestra cuántos quedan y cuándo se restablecen.',
    },
    pt: {
      name: 'ChatGPT · Uso do Pro nesta semana',
      description:
        'Conta as mensagens do GPT-6 Pro enviadas deste navegador e mostra o total da semana ao lado do seletor de modelo. Quando o ChatGPT informa seu limite, também mostra quantas restam e quando são renovadas.',
    },
    ru: {
      name: 'ChatGPT · Pro за эту неделю',
      description:
        'Считает сообщения GPT-6 Pro, отправленные из этого браузера, и показывает число за неделю рядом с выбором модели. Когда ChatGPT сообщает лимит, показывает и остаток, и время сброса.',
    },
    ar: {
      name: 'ChatGPT · استخدام Pro هذا الأسبوع',
      description:
        'يحسب رسائل GPT-6 Pro المرسلة من هذا المتصفح ويعرض عدد هذا الأسبوع بجانب منتقي النموذج. وعندما يذكر ChatGPT حدّك، يعرض أيضًا المتبقي وموعد إعادة التعيين.',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.2.0',
  tier: 'declarative',
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  contributes: {},
};
