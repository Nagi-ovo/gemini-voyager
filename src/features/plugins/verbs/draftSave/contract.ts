import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'draftSave',
  sinceEngine: '1.8.0',
  semantic: ['composer', 'sendButton'],
  params: {},
  description:
    "Saves unsent text in the main composer to this device and puts it back when the same conversation (or the new-chat page) opens again, only into an empty composer. Drafts are keyed by the site and the conversation id from the adapter's conversationIdPattern, and a draft is dropped once its message is sent. Turning the plugin off keeps saved drafts. On Gemini it shares the native gvDraft_ full-path records, preserving account-slot and Gem routes.",
};
