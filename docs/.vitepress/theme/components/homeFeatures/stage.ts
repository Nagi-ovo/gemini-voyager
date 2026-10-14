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
}

export const defaultView = (): StageView => ({
  chatWidth: 100,
  fontScale: 1,
  timestamps: false,
  skin: 'gemini',
  address: '',
  hideBall: false,
});

export interface Stage {
  /** Region elements, filled in by HomeFeatureDemo once it mounts. */
  regions: Partial<Record<StageRegion, HTMLElement>>;
  view: StageView;
  /** Scrolls a card into view; on narrow screens the cards are stacked. */
  focus: (card: StageCard) => void;
  /** Scrolls the conversation to its end, e.g. after adding to chatTail. */
  scrollChatToEnd: () => void;
  /** Card elements, registered by HomeFeatureDemo. */
  cards: Partial<Record<StageCard, HTMLElement>>;
  chatEl: HTMLElement | null;
}

export const stageKey: InjectionKey<Stage> = Symbol('gvf-stage');

export function createStage(): Stage {
  const stage: Stage = reactive({
    regions: {},
    cards: {},
    chatEl: null,
    view: defaultView(),
    focus(card: StageCard) {
      const el = stage.cards[card];
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Leave the card alone when it is already fully on screen.
      if (r.top >= 64 && r.bottom <= window.innerHeight) return;
      el.scrollIntoView({
        behavior: 'smooth',
        block: r.height > window.innerHeight - 80 ? 'start' : 'center',
      });
    },
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
