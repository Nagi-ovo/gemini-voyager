import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'sendShortcut',
  sinceEngine: '1.8.0',
  semantic: ['composer', 'composerRoot', 'sendButton'],
  params: {
    mode: {
      type: 'string',
      required: false,
      sinceEngine: '1.9.0',
      description:
        'Which Enter chord sends (default ctrlEnterSends). Gemini accepts only ctrlEnterSends; AI Studio accepts only enterSends.',
    },
  },
  description:
    'Enter inserts a newline in the composer; Ctrl/Cmd+Enter clicks its enabled send button when no attachment is uploading. Shift+Enter and IME composition keep the host behavior.',
};
