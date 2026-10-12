/**
 * The chat width stylesheet, shared by the native chat width module and the
 * chat width plugin handler so both render the same rules for the same width.
 */
import { getGeminiTurnSelectors } from '@/core/gemini/turnSelectors';
import { normalizeChatWidthPercent } from '@/core/utils/chatAppearanceValues';

const FALLBACK_SCREEN_WIDTH_PX = 1920;

function getTableSelectors(): string[] {
  return [
    'table-block',
    '.table-block',
    'table-block .table-block',
    'table-block .table-content',
    '.table-block.new-table-style',
    '.table-block.has-scrollbar',
    '.table-block .table-content',
    '.table-block-component',
    '.horizontal-scroll-wrapper',
  ];
}

/**
 * The width in px for a width percent: a share of the screen, not of the
 * viewport, so a split-screen window (narrower than the px value) is filled.
 */
export function chatWidthPx(
  widthPercent: number,
  screenSize: { readonly availWidth: number; readonly width: number } = screen,
): number {
  const screenWidth = screenSize.availWidth || screenSize.width || FALLBACK_SCREEN_WIDTH_PX;
  return Math.round((normalizeChatWidthPercent(widthPercent) / 100) * screenWidth);
}

/** Every chat width rule for a content width of `widthPx`. */
export function buildChatWidthCss(widthPx: number): string {
  const widthValue = `${widthPx}px`;

  const userSelectors = getGeminiTurnSelectors('chatWidth.userTurn');
  const assistantSelectors = getGeminiTurnSelectors('chatWidth.assistantTurn');
  const tableSelectors = getTableSelectors();

  // Build comprehensive CSS rules
  const userRules = userSelectors.map((sel) => `${sel}`).join(',\n    ');
  const assistantRules = assistantSelectors.map((sel) => `${sel}`).join(',\n    ');
  const tableRules = tableSelectors.map((sel) => `${sel}`).join(',\n    ');

  // A small gap to account for scrollbars
  const GAP_PX = 10;

  return `
    /* Remove width constraints from outer containers that contain conversations */
    .content-wrapper:has(chat-window),
    .main-content:has(chat-window),
    .content-container:has(chat-window),
    .content-container:has(.conversation-container) {
      max-width: none !important;
    }

    /* Remove width constraints from main and conversation containers, but not buttons */
    [role="main"]:has(chat-window),
    [role="main"]:has(.conversation-container) {
      max-width: none !important;
    }

    /* Target chat window and related containers; A small gap to account for scrollbars */
    chat-window,
    .chat-container,
    chat-window-content,
    .chat-history-scroll-container,
    .chat-history,
    .conversation-container {
      max-width: none !important;
      padding-right: ${GAP_PX}px !important;
      box-sizing: border-box !important;
    }

    /* Gemini's Angular host selector outranks ours: both width variables need !important.
       Grid-scoped child rules hardcode narrow widths too, so variables alone cannot widen turns. */
    chat-window,
    chat-window-content,
    .enable-luminous-content-width-update,
    .chat-container,
    .chat-history-scroll-container,
    infinite-scroller.chat-history {
      --bard-chat-window-content-width-default: ${widthValue} !important;
      --bard-chat-window-max-width-default: ${widthValue} !important;
    }

    .conversation-container {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
    }

    .enable-extended-and-xl-grid .conversation-container user-query,
    .enable-extended-and-xl-grid .conversation-container model-response,
    .enable-extended-and-xl-grid .conversation-container model-response-disclaimers,
    .enable-extended-and-xl-grid .conversation-container .response-container-header,
    .enable-extended-and-xl-grid .conversation-container .response-container-footer,
    .enable-extended-and-xl-grid .conversation-container .response-footer,
    .enable-extended-and-xl-grid .conversation-container message-actions,
    .enable-extended-and-xl-grid .conversation-container thinking-overlay,
    .enable-extended-and-xl-grid .conversation-container .thoughts-container,
    .enable-extended-and-xl-grid .conversation-container .image-gen-shimmer-placeholder,
    .enable-extended-and-xl-grid .conversation-container election-info-disclaimer,
    .enable-extended-and-xl-grid .conversation-container finance-info-disclaimer,
    .enable-extended-and-xl-grid .conversation-container personal-intelligence-banner,
    .enable-extended-and-xl-grid .conversation-container remy-goal-status-footer,
    .enable-extended-and-xl-grid .conversation-container remy-processing-state,
    .enable-extended-and-xl-grid .conversation-container schedule-annotation,
    .enable-extended-and-xl-grid .conversation-container schedule-annotation-v2,
    .enable-extended-and-xl-grid .conversation-container .remy-scheduled-task-confirmation-card-container,
    .enable-extended-and-xl-grid .conversation-container .md-content > :not(#_),
    .enable-extended-and-xl-grid .conversation-container .md-content > * {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
    }

    .enable-extended-and-xl-grid .conversation-container message-actions {
      margin-inline: auto !important;
    }

    main > div:has(user-query),
    main > div:has(model-response),
    main > div:has(.conversation-container) {
      max-width: none !important;
      width: 100% !important;
    }

    /* Fallback for browsers without :has() support */
    @supports not selector(:has(*)) {
      .content-wrapper,
      .main-content,
      .content-container {
        max-width: none !important;
      }

      main > div:not(:has(button)):not(.main-menu-button) {
        max-width: none !important;
        width: 100% !important;
      }
    }

    /* User query containers */
    ${userRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Model response containers */
    ${assistantRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Gemini table containers */
    ${tableRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
      box-sizing: border-box !important;
    }

    table-block .table-block,
    .table-block.has-scrollbar,
    .table-block.new-table-style {
      overflow-x: hidden !important;
    }

    table-block .table-content,
    .table-block .table-content {
      width: 100% !important;
      overflow-x: auto !important;
    }

    /* Exclude the header logo pill wrapper: it also contains a sparkle img, and
       widening it stretches chat-app-side-nav-menu-button into a transparent
       hit box that blocks the header buttons (#875) */
    model-response:has(> .deferred-response-indicator),
    .response-container:has(img[src*="sparkle"]),
    main > div:has(img[src*="sparkle"]):not(:has(chat-app-side-nav-menu-button)) {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Additional deep targeting for nested elements */
    user-query,
    user-query > *,
    user-query > * > *,
    model-response,
    model-response > *,
    model-response > * > *,
    response-container,
    response-container > *,
    response-container > * > *,
    /* Keep the markdown children bound to a turn. The custom elements above are
       Gemini's own and exist only inside the thread, but .md-content is a plain
       class Gemini also renders outside it (canvas and side panels), and an
       unscoped rule would hand those the slider's width - clamping them
       whenever the slider sits narrower than they are. */
    .conversation-container .md-content > :not(#_),
    .conversation-container .md-content > * {
      max-width: ${widthValue} !important;
    }

    /* Target specific internal containers that might have fixed widths */
    .presented-response-container,
    [data-message-author-role] {
      max-width: ${widthValue} !important;
    }

    /* Extend input-container gradient to match chat width */
    input-container {
      max-width: none !important;
      width: 100% !important;
    }

    input-container .input-area-container,
    input-container input-area-v2 {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Gemini pins the overlay to its native input width. Match the composer;
       editInputWidth's html body prefix wins when both sliders are enabled. */
    input-container file-drop-indicator .overlay-container[data-filedrop-id="chat-window-input-container"] {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Specific fix for user bubble background to fit content but respect max-width */
    .user-query-bubble-with-background {
      max-width: ${widthValue} !important;
      width: fit-content !important;
    }
  `;
}
