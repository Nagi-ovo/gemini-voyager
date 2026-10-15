import type { PluginManifest } from '../../types';

export const CHATGPT_RESPONSE_NOTIFICATION_PLUGIN_ID = 'voyager.chatgpt-response-notification';

/** Its plugin switch is the setting; turning it on also asks for the notifications permission. */
export const CHATGPT_RESPONSE_NOTIFICATION_MANIFEST: PluginManifest = {
  id: CHATGPT_RESPONSE_NOTIFICATION_PLUGIN_ID,
  name: 'ChatGPT · Response completion notifications',
  description:
    'Send a system notification when ChatGPT finishes a reply while you are in another tab or app.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'ChatGPT · 思考完成通知',
      description: '你切到其他标签页或应用时，ChatGPT 完成回答后发送系统通知。',
    },
    zh_TW: {
      name: 'ChatGPT · 思考完成通知',
      description: '你切換到其他分頁或應用程式時，ChatGPT 完成回答後傳送系統通知。',
    },
    ja: {
      name: 'ChatGPT · 完了通知',
      description:
        '別のタブやアプリを使っている間に ChatGPT の回答が完了すると、システム通知を送信します。',
    },
    ko: {
      name: 'ChatGPT · 응답 완료 알림',
      description: '다른 탭이나 앱을 쓰는 동안 ChatGPT가 답변을 마치면 시스템 알림을 보냅니다.',
    },
    fr: {
      name: 'ChatGPT · Notifications de réponse terminée',
      description:
        'Envoie une notification système lorsque ChatGPT termine une réponse pendant que vous êtes dans un autre onglet ou une autre application.',
    },
    es: {
      name: 'ChatGPT · Notificaciones al completar la respuesta',
      description:
        'Envía una notificación del sistema cuando ChatGPT termina una respuesta mientras estás en otra pestaña o aplicación.',
    },
    pt: {
      name: 'ChatGPT · Notificações de resposta concluída',
      description:
        'Envia uma notificação do sistema quando o ChatGPT termina uma resposta enquanto você está em outra aba ou aplicativo.',
    },
    ru: {
      name: 'ChatGPT · Уведомления о завершении ответа',
      description:
        'Отправляет системное уведомление, когда ChatGPT завершает ответ, пока вы в другой вкладке или приложении.',
    },
    ar: {
      name: 'ChatGPT · إشعارات اكتمال الرد',
      description: 'يرسل إشعار نظام عندما ينهي ChatGPT الرد بينما أنت في علامة تبويب أو تطبيق آخر.',
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
