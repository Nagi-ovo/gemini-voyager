import type { PluginManifest } from '../types';

/** The fixed-id notification run follows the existing opt-in switch; no public primitive. */
export const GEMINI_RESPONSE_NOTIFICATION_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-response-notification',
  name: 'Gemini · Response completion notifications',
  description: 'Send a system notification when Gemini finishes a response.',
  version: '1.0.0',
  i18n: {
    zh: {
      name: 'Gemini · 思考完成通知',
      description: '当 Gemini 完整输出回答后，发送系统通知。',
    },
    zh_TW: {
      name: 'Gemini · 思考完成通知',
      description: '當 Gemini 完整輸出回答後，傳送系統通知。',
    },
    ja: {
      name: 'Gemini · 完了通知',
      description: 'Gemini の回答が完了したらシステム通知を送信します。',
    },
    ko: {
      name: 'Gemini · 응답 완료 알림',
      description: 'Gemini가 답변을 완료하면 시스템 알림을 보냅니다.',
    },
    fr: {
      name: 'Gemini · Notifications de réponse terminée',
      description: 'Envoyer une notification système lorsque Gemini termine sa réponse.',
    },
    es: {
      name: 'Gemini · Notificaciones al completar la respuesta',
      description: 'Envía una notificación del sistema cuando Gemini termina una respuesta.',
    },
    pt: {
      name: 'Gemini · Notificações de resposta concluída',
      description: 'Envia uma notificação do sistema quando o Gemini termina uma resposta.',
    },
    ru: {
      name: 'Gemini · Уведомления о завершении ответа',
      description: 'Отправлять системное уведомление, когда Gemini завершает ответ.',
    },
    ar: {
      name: 'Gemini · إشعارات اكتمال الرد',
      description: 'إرسال إشعار نظام عندما ينهي Gemini الرد.',
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
