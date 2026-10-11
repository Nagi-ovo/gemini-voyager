import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'sendShortcut',
  sinceEngine: 'next',
  semantic: ['composer', 'composerRoot', 'sendButton'],
  params: {},
  description:
    'Enter inserts a newline in the composer; Ctrl/Cmd+Enter clicks its enabled send button when no attachment is uploading. Shift+Enter and IME composition keep the host behavior.',
};
