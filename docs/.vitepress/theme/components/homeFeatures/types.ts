/** A prewritten answer: plain text ("\n\n" splits paragraphs, "- " starts a bullet) or a structured reply. */
export type Answer =
  | string
  | { lead?: string; text?: string; list?: string[]; todo?: string[]; table?: string[][] };

export interface DemoChat {
  title: string;
  star?: boolean;
  /** Turn indexes starred on the timeline. */
  starred?: number[];
  turns: [question: string, answer: Answer][];
  /** Material the prompt replies are built from, so every prompt answers in this chat's context. */
  extra: { table: string[][]; summary: string[]; translation: string; todo: string[] };
}

export type TreeNode = { folder: string; open?: boolean; kids: TreeNode[] } | { chat: string };

export type ReplyKind = 'table' | 'summary' | 'todo' | 'translate' | 'plain';

export interface DemoPrompt {
  name: string;
  tag: string;
  text: string;
  reply: ReplyKind;
}

export interface FeatureItem {
  /** Key in featureIcons; a comma-separated list cycles through the icons. */
  icon: string;
  name: string;
  detail: string;
}

export interface HomeFeaturesContent {
  timeline: {
    eyebrow: string;
    title: string;
    body: string;
    hint: string;
    overview: string;
    searchPlaceholder: string;
    noMatch: string;
  };
  folders: {
    eyebrow: string;
    title: string;
    body: string;
    hint: string;
    heading: string;
    searchPlaceholder: string;
    newFolder: string;
    noMatch: string;
    star: string;
  };
  prompts: {
    eyebrow: string;
    title: string;
    body: string;
    hint: string;
    add: string;
    searchPlaceholder: string;
    all: string;
    saved: string;
    settings: string;
    noMatch: string;
  };
  composer: { placeholder: string; send: string; ball: string };
  /** Labels for the bar shown while a feature scene plays in the demo. */
  demo: { replay: string; close: string };
  /** "Here it is:" style lead lines for structured replies. */
  replyLeads: { table: string; summary: string; todo: string; plain: string };
  chats: Record<string, DemoChat>;
  tree: TreeNode[];
  current: string;
  promptList: DemoPrompt[];
  groups: { title: string; items: FeatureItem[] }[];
}
