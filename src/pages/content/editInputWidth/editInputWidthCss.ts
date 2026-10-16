/**
 * The edit input width stylesheet: the edit-mode prompt box, its Cancel/Update
 * row, the main composer and its file-drop overlay, sized to a share of the
 * window. Pure text; `pluginHandler.ts` owns the element and its lifetime.
 */

/** Gemini's edit-mode containers, from the most specific shape to the broadest fallback. */
const EDIT_MODE_SELECTORS = ['.query-content.edit-mode', 'div.edit-mode', '[class*="edit-mode"]'];
const EDIT_MODE_RULES = EDIT_MODE_SELECTORS.join(',\n    ');

/** The rules for an already-normalized width, in percent of the viewport width. */
export function buildEditInputWidthCss(widthPercent: number): string {
  const widthValue = `${widthPercent}vw`;
  return `
    /* Remove width constraints from outer containers that contain edit mode (similar to chatWidth) */
    .content-wrapper:has(.edit-mode),
    .main-content:has(.edit-mode),
    .content-container:has(.edit-mode) {
      max-width: none !important;
    }

    /* Remove width constraints from main container when it has edit mode */
    [role="main"]:has(.edit-mode) {
      max-width: none !important;
    }

    main > div:has(.edit-mode) {
      max-width: none !important;
      width: 100% !important;
    }

    /* Target edit mode containers directly */
    ${EDIT_MODE_RULES} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
    }

    /* Target the edit-container within edit-mode */
    .edit-mode .edit-container,
    .query-content.edit-mode .edit-container {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
    }

    /* Target Material Design form field */
    .edit-mode .mat-mdc-form-field,
    .edit-container .mat-mdc-form-field,
    .edit-mode .edit-form {
      max-width: ${widthValue} !important;
      width: 100% !important;
    }

    /* Gemini nests two .edit-container elements: the outer one holds both the
       prompt box and .edit-button-area (Cancel/Update), the inner one sits
       inside .query-content.edit-mode and is indented by that element's
       padding. Sizing both to the same slider width from different left
       offsets pushed the box past the buttons by exactly that padding, so the
       actions no longer sat under the box (#edit-actions-desync). The width
       belongs to the outermost edit container only; anything nested fills it. */
    .edit-mode .edit-container .edit-container,
    .edit-mode .edit-container .query-content.edit-mode {
      max-width: 100% !important;
      width: 100% !important;
    }

    /* Every width rule above must measure the border box. These containers
       carry horizontal padding, so a content-box width overflows its parent by
       that padding and desyncs the box from the button row again. */
    ${EDIT_MODE_RULES},
    .edit-mode .edit-container,
    .query-content.edit-mode .edit-container,
    .edit-mode .mat-mdc-form-field,
    .edit-container .mat-mdc-form-field,
    .edit-mode .edit-form,
    .edit-mode .mat-mdc-text-field-wrapper,
    .edit-mode .mat-mdc-form-field-flex,
    .edit-mode .mdc-text-field,
    .edit-mode .mat-mdc-form-field-infix {
      box-sizing: border-box !important;
    }

    /* Target text field wrapper and flex container */
    .edit-mode .mat-mdc-text-field-wrapper,
    .edit-mode .mat-mdc-form-field-flex,
    .edit-mode .mdc-text-field {
      max-width: ${widthValue} !important;
      width: 100% !important;
    }

    /* Target form field infix (contains the textarea) */
    .edit-mode .mat-mdc-form-field-infix {
      max-width: ${widthValue} !important;
      width: 100% !important;
    }

    /* Target the textarea itself */
    .edit-mode textarea,
    .edit-container textarea,
    .edit-mode .mat-mdc-input-element,
    .edit-mode .cdk-textarea-autosize {
      max-width: ${widthValue} !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    /* ===== Main chat input area (input-container > input-area-v2) ===== */
    /* !important matches chatWidth's luminous variable rule: Gemini declares
       the same variables through an Angular host attribute selector, which
       outranks a plain element selector. input-container is the nearer
       ancestor for the composer, so the edit slider still owns it (#955). */
    input-container {
      --bard-chat-window-content-width-default: ${widthValue} !important;
      --bard-chat-window-max-width-default: ${widthValue} !important;
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Beat chatWidth's \`input-container input-area-v2\` rule when both sliders
       are on, so the composer follows Edit input width (#955). */
    html body input-container .input-area-container,
    html body input-container input-area-v2,
    html body input-container input-area-v2 .input-area {
      max-width: 100% !important;
      width: 100% !important;
    }

    /* Widen the file-drop overlay with the input area (#887). Gemini pins it to
       var(--bard-chat-window-max-width-default, 760px). Prefix with html body so
       this wins over chatWidth when both modules are enabled, matching the
       composer. */
    html body input-container file-drop-indicator .overlay-container[data-filedrop-id="chat-window-input-container"] {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Fallback for browsers without :has() support */
    @supports not selector(:has(*)) {
      .content-wrapper,
      .main-content,
      .content-container {
        max-width: none !important;
      }
    }
  `;
}
