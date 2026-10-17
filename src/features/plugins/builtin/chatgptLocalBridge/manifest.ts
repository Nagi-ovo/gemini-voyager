import type { PluginManifest } from '../../types';

export const CHATGPT_LOCAL_BRIDGE_PLUGIN_ID = 'voyager.chatgpt-local-bridge';

/**
 * Off by default (not in `pluginDefaults.ts`). Turning it on only lets this
 * page answer the background; the background decides, per task, whether the
 * paired `voyager serve`, the remote policy and the lease allow anything.
 */
export const CHATGPT_LOCAL_BRIDGE_MANIFEST: PluginManifest = {
  id: CHATGPT_LOCAL_BRIDGE_PLUGIN_ID,
  name: 'ChatGPT · Local Bridge',
  description:
    'Let the paired Voyager CLI on this computer send prompts to ChatGPT in a tab Voyager opens and read the replies. Off until you turn it on.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'ChatGPT · 本地桥',
      description:
        '让本机已配对的 Voyager CLI 在 Voyager 打开的标签页里向 ChatGPT 发送提示并读取回复。打开后才会生效。',
    },
    zh_TW: {
      name: 'ChatGPT · 本機橋接',
      description:
        '讓本機已配對的 Voyager CLI 在 Voyager 開啟的分頁中向 ChatGPT 傳送提示並讀取回覆。開啟後才會生效。',
    },
    ja: {
      name: 'ChatGPT · ローカルブリッジ',
      description:
        'このコンピューターでペアリングした Voyager CLI が、Voyager の開いたタブで ChatGPT にプロンプトを送り、回答を読み取れるようにします。オンにするまで動作しません。',
    },
    ko: {
      name: 'ChatGPT · 로컬 브리지',
      description:
        '이 컴퓨터에서 페어링한 Voyager CLI가 Voyager가 연 탭에서 ChatGPT에 프롬프트를 보내고 답변을 읽을 수 있게 합니다. 켜기 전에는 작동하지 않습니다.',
    },
    fr: {
      name: 'ChatGPT · Pont local',
      description:
        'Permet au Voyager CLI associé sur cet ordinateur d’envoyer des requêtes à ChatGPT dans un onglet ouvert par Voyager et d’en lire les réponses. Inactif tant que vous ne l’activez pas.',
    },
    es: {
      name: 'ChatGPT · Puente local',
      description:
        'Permite que el Voyager CLI vinculado en este equipo envíe instrucciones a ChatGPT en una pestaña que abre Voyager y lea las respuestas. No hace nada hasta que lo actives.',
    },
    pt: {
      name: 'ChatGPT · Ponte local',
      description:
        'Permite que o Voyager CLI pareado neste computador envie prompts ao ChatGPT em uma aba aberta pelo Voyager e leia as respostas. Fica inativo até você ativá-lo.',
    },
    ru: {
      name: 'ChatGPT · Локальный мост',
      description:
        'Позволяет сопряжённому Voyager CLI на этом компьютере отправлять запросы в ChatGPT во вкладке, которую открывает Voyager, и читать ответы. Не работает, пока вы его не включите.',
    },
    ar: {
      name: 'ChatGPT · الجسر المحلي',
      description:
        'يتيح لـ Voyager CLI المقترن على هذا الكمبيوتر إرسال الطلبات إلى ChatGPT في علامة تبويب يفتحها Voyager وقراءة الردود. لا يعمل حتى تشغّله.',
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
