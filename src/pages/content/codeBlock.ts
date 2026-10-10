// Gemini's localized generic labels must still allow content-based chart detection.
const GENERIC_LANGUAGE_LABELS = new Set([
  // Arabic
  'مقتطف الرمز',
  // Spanish
  'fragmento de código',
  // French
  'extrait de code',
  // Korean
  '코드 스니펫',
  // Portuguese
  'snippet de código',
  // Russian
  'фрагмент кода',
  // Simplified Chinese
  '代码段',
  '代码',
  '代码块',
  '示例',
  '示例代码',
  // Traditional Chinese
  '程式碼片段',
  // Japanese
  'コード スニペット',
  // English
  'code',
  'code snippet',
  'snippet',
  'example',
  'code example',
  'sample',
  // Common generic terms
  'text',
  'plain',
  'plaintext',
  'raw',
  'output',
  'result',
]);

export const isGenericLanguageLabel = (language: string | null): boolean => {
  if (!language) return true; // No label = generic
  return GENERIC_LANGUAGE_LABELS.has(language.toLowerCase());
};
