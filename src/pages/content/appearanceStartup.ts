/** Gemini's chat appearance is admitted at its original layout start point. */
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

export async function startGeminiChatAppearance(
  admission: OfficialAdmissionController,
  lifetime?: AbortSignal,
): Promise<void> {
  if (lifetime?.aborted) return;
  admission.admit('gemini', 'chatWidth');
  // Admission notifies the host synchronously, so a retired page must not open the next feature.
  if (lifetime?.aborted) return;
  admission.admit('gemini', 'chatFontSize');
  if (lifetime?.aborted) return;
  // Paragraph spacing shares the line-height plugin and its switch.
  admission.admit('gemini', 'chatLineHeight');
}
