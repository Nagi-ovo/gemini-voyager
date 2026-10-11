import type messages from './messages/en.json';

declare module '@/utils/translations' {
  interface PrimitiveMessages {
    quoteReply: typeof messages;
  }
}
