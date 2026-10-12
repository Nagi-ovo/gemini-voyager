import type { PluginManifest } from '../types';

export const GEMINI_SAFARI_ENTER_FIX_MANIFEST: PluginManifest = {
  id: 'voyager.gemini-safari-enter-fix',
  name: 'Gemini · Fix Enter key on Safari',
  version: '1.0.0',
  description: "Send messages with a single Enter press (fixes Safari's double-Enter issue)",
  i18n: {
    zh: {
      name: 'Gemini · 修复 Safari 回车键',
      description: '按一次 Enter 即可发送消息（修复 Safari 需要按两次 Enter 的问题）',
    },
    zh_TW: {
      name: 'Gemini · 修復 Safari Enter 鍵',
      description: '按一次 Enter 即可傳送訊息（修復 Safari 需按兩次 Enter 的問題）',
    },
    ja: {
      name: 'Gemini · Safari の Enter キーを修正',
      description: 'Enter を1回押すだけでメッセージを送信（Safari の2回押し問題を修正）',
    },
    ko: {
      name: 'Gemini · Safari Enter 키 수정',
      description: 'Enter 한 번으로 메시지 전송 (Safari의 Enter 두 번 눌러야 하는 문제 수정)',
    },
    fr: {
      name: 'Gemini · Corriger la touche Entrée sur Safari',
      description:
        'Envoyer les messages avec une seule pression sur Entrée (corrige le problème du double Entrée sur Safari)',
    },
    es: {
      name: 'Gemini · Corregir tecla Enter en Safari',
      description:
        'Enviar mensajes con una sola pulsación de Enter (corrige el problema de doble Enter en Safari)',
    },
    pt: {
      name: 'Gemini · Corrigir tecla Enter no Safari',
      description:
        'Enviar mensagens com um único Enter (corrige o problema do duplo Enter no Safari)',
    },
    ru: {
      name: 'Gemini · Исправить клавишу Enter в Safari',
      description:
        'Отправка сообщений одним нажатием Enter (исправление проблемы двойного Enter в Safari)',
    },
    ar: {
      name: 'Gemini · إصلاح مفتاح Enter في Safari',
      description: 'إرسال الرسائل بضغطة واحدة على Enter (إصلاح مشكلة الضغط المزدوج في Safari)',
    },
  },
  author: 'voyager-official',
  category: 'productivity',
  license: 'GPL-3.0-or-later',
  engine: '>=1.8.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {},
};
