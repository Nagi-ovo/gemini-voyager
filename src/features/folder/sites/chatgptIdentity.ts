/**
 * Which ChatGPT conversation a URL names, and how it is stored in a folder.
 *
 * A conversation lives at `/c/<id>`, inside a Project at `/g/g-p-<project>/c/<id>`,
 * or inside a GPT at `/g/g-<gpt>/c/<id>`, optionally under `/u/<index>/`: the
 * route site.json's `conversationIdPattern` reads, as the timeline's stars do.
 * The id alone is the identity, `chatgpt:conv:<id>`, so a conversation that moves
 * in or out of a Project is still the same folder entry. The stored URL keeps the
 * full path it was filed under, on the host it was filed on: `chat.openai.com`,
 * which redirects, still names ChatGPT's conversations, while its folder file
 * takes `chatgpt.com` links only.
 */
import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';

import { createSiteIdentity } from './siteIdentity';

export const CHATGPT_ORIGIN = 'https://chatgpt.com';
const CHATGPT_LEGACY_ORIGINS = ['https://chat.openai.com'] as const;

export const CHATGPT_IDENTITY = createSiteIdentity(
  chatgptAdapter,
  CHATGPT_ORIGIN,
  CHATGPT_LEGACY_ORIGINS,
);

/**
 * The conversation a root-relative link (`/c/<id>`, `/g/<project>/c/<id>`) names,
 * as its bare id and path; `null` for any other link. No URL parsing, so a pass
 * over every sidebar row stays cheap.
 */
export const readChatGptConversationPath = CHATGPT_IDENTITY.readPath;

/** The conversation `href` names on either ChatGPT host, or `null` for any other page or site. */
export const readChatGptConversation = CHATGPT_IDENTITY.read;
