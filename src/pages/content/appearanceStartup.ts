/** Gemini's chat and sidebar appearance are admitted at their original layout start point. */
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

export async function startGeminiChatAppearance(
  admission: OfficialAdmissionController,
  lifetime?: AbortSignal,
): Promise<void> {
  if (lifetime?.aborted) return;
  admission.admit('gemini', 'chatWidth');
  admission.admit('gemini', 'chatFontSize');
  // Paragraph spacing shares the line-height plugin and its switch.
  admission.admit('gemini', 'chatLineHeight');
  // The native edit input width adjuster started right after the chat appearance.
  admission.admit('gemini', 'editInputWidth');
  admission.admit('gemini', 'sidebarWidth');
  admission.admit('gemini', 'sidebarAutoHide');
  admission.admit('gemini', 'sidebarFullHide');
}
