/**
 * Popup → ChatGPT tab contract for opening the export flow from the popup.
 *
 * Kept free of DOM and export imports so the popup can depend on it without
 * pulling the content-side export pipeline into its bundle.
 */
export const CHATGPT_EXPORT_PLUGIN_ID = 'voyager.chatgpt-export';

/** Ask the top frame's mounted ChatGPT exporter to open its export dialog. */
export const CHATGPT_EXPORT_OPEN_MESSAGE = 'gv.chatgptExport.open';

/**
 * `no-conversation`: the exporter is running but the page holds no
 * conversation (new chat, settings, Codex), so there is nothing to export.
 */
export type ChatGptExportOpenResponse = { ok: true } | { ok: false; reason: 'no-conversation' };
