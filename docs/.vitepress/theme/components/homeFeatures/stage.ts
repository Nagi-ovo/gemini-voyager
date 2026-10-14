import { inject, reactive, type InjectionKey } from 'vue';

/**
 * The showcase stage lets a feature scene play inside the live demo above the feature list.
 * HomeFeatures owns one stage; HomeFeatureDemo registers its regions and reads `view`;
 * a scene component teleports its own markup into the regions and sets `view` fields.
 */
export type StageRegion =
  /** End of the conversation scroll, after the last turn; content scrolls with the chat. */
  | 'chatTail'
  /** Covers the conversation area between the title bar and the composer. */
  | 'chatCover'
  /** Covers the whole conversation card (title bar, chat, timeline, composer); the Voyager ball stays above it. */
  | 'hostCover'
  /** Right end of the conversation title bar, for small toolbar buttons. */
  | 'topbarEnd'
  /** Covers the composer row at the bottom of the conversation card. */
  | 'composerCover'
  /** Covers the whole folder card. */
  | 'foldersCover'
  /** Covers the whole prompt library card. */
  | 'promptsCover';

export type StageCard = 'timeline' | 'folders' | 'prompts';

export interface StageView {
  /** Max width of the conversation column, in percent of the chat area. */
  chatWidth: number;
  /** Multiplier for the conversation font size. */
  fontScale: number;
  /** Shows a send time above each user message. */
  timestamps: boolean;
  /** Host look: 'gemini' by default; scenes may define more as `.gvf-skin-<name>` rules. */
  skin: string;
  /** When set, an address bar with this text appears above the conversation card. */
  address: string;
  /** Hides the Voyager ball. */
  hideBall: boolean;
  /** Width in px reserved at the card's inline start for a host sidebar; the page shifts over. */
  sideInset: number;
}

export const defaultView = (): StageView => ({
  chatWidth: 100,
  fontScale: 1,
  timestamps: false,
  skin: 'gemini',
  address: '',
  hideBall: false,
  sideInset: 0,
});

export interface Stage {
  /** Region elements, filled in by HomeFeatureDemo once it mounts. */
  regions: Partial<Record<StageRegion, HTMLElement>>;
  view: StageView;
  /** Kept for scenes; the page never scrolls on its own when a feature is clicked. */
  focus: (card: StageCard) => void;
  /** Scrolls the conversation to its end, e.g. after adding to chatTail. */
  scrollChatToEnd: () => void;
  /** Card elements, registered by HomeFeatureDemo. */
  cards: Partial<Record<StageCard, HTMLElement>>;
  chatEl: HTMLElement | null;
  /** Plays the scene of the feature with this icon key, e.g. when a demo control maps to a feature. */
  play: (key: string) => void;
  /** Ends the playing scene, keeping the turns it sent. */
  stop: () => void;
  /** Moves the turns a scene sent into the chat; set by HomeFeatureDemo, called before a scene ends. */
  keep: () => void;
}

export const stageKey: InjectionKey<Stage> = Symbol('gvf-stage');

export function createStage(): Stage {
  const stage: Stage = reactive({
    regions: {},
    cards: {},
    chatEl: null,
    view: defaultView(),
    play: () => {},
    stop: () => {},
    keep: () => {},
    // Clicking a feature must not move the page; scenes may still call this, and it stays a no-op.
    focus(_card: StageCard) {},
    scrollChatToEnd() {
      const el = stage.chatEl;
      el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    },
  }) as Stage;
  return stage;
}

export function useStage(): Stage {
  const stage = inject(stageKey);
  if (!stage) throw new Error('useStage() must run inside HomeFeatures');
  return stage;
}
