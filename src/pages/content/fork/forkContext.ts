export type ForkLanguage = 'en' | 'ar' | 'es' | 'fr' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh' | 'zh_TW';

function normalizeLanguage(raw: string | undefined): ForkLanguage {
  if (!raw) return 'en';
  const value = raw.trim();
  if (value === 'zh_TW' || value.toLowerCase() === 'zh-tw') return 'zh_TW';
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('fr')) return 'fr';
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('ko')) return 'ko';
  if (value.startsWith('pt')) return 'pt';
  if (value.startsWith('ru')) return 'ru';
  return 'en';
}

const CONTEXT_PREFIX: Record<ForkLanguage, string> = {
  en: `# Branch Context
You are continuing a branched conversation.
- The section below is the conversation history up to the fork point.
- Continue from the final "User" message as a new branch.
- Do not rewrite the history; only provide the next assistant response.
`,
  ar: `# سياق التفرع
أنت تتابع محادثة متفرعة.
- القسم أدناه هو سجل المحادثة حتى نقطة التفرع.
- تابع من آخر رسالة "المستخدم" كفرع جديد.
- لا تعِد كتابة السجل؛ قدّم رد المساعد التالي فقط.
`,
  es: `# Contexto de Rama
Estás continuando una conversación en rama.
- La sección de abajo es el historial hasta el punto de bifurcación.
- Continúa desde el último mensaje de "Usuario" como una nueva rama.
- No reescribas el historial; entrega solo la siguiente respuesta del asistente.
`,
  fr: `# Contexte de Branche
Vous poursuivez une conversation branchée.
- La section ci-dessous est l'historique jusqu'au point de branchement.
- Continuez à partir du dernier message "Utilisateur" comme une nouvelle branche.
- Ne réécrivez pas l'historique; fournissez uniquement la prochaine réponse de l'assistant.
`,
  ja: `# 分岐コンテキスト
これは分岐した会話の続きです。
- 以下は分岐点までの会話履歴です。
- 最後の「User」メッセージから新しい分岐として続けてください。
- 履歴を書き直さず、次のアシスタント返信のみを返してください。
`,
  ko: `# 분기 컨텍스트
현재 분기된 대화를 이어서 처리합니다.
- 아래 섹션은 분기 지점까지의 대화 기록입니다.
- 마지막 "User" 메시지부터 새 분기로 이어서 답변하세요.
- 기록을 다시 쓰지 말고, 다음 어시스턴트 응답만 제공하세요.
`,
  pt: `# Contexto de Ramificação
Você está continuando uma conversa ramificada.
- A seção abaixo é o histórico até o ponto de ramificação.
- Continue a partir da última mensagem de "User" como uma nova ramificação.
- Não reescreva o histórico; forneça apenas a próxima resposta do assistente.
`,
  ru: `# Контекст Ветвления
Вы продолжаете разговор в новой ветке.
- Раздел ниже — история диалога до точки ветвления.
- Продолжайте от последнего сообщения "User" как новую ветку.
- Не переписывайте историю; дайте только следующий ответ ассистента.
`,
  zh: `# 分支上下文
你正在继续一个“分支对话”。
- 下方内容是到分叉点为止的历史对话。
- 请从最后一条“User”消息继续，生成这个新分支的后续回复。
- 不要重写历史，只输出下一条助手回复。
`,
  zh_TW: `# 分支上下文
你正在延續一個「分支對話」。
- 下方內容是到分叉點為止的歷史對話。
- 請從最後一條「User」訊息繼續，產生這個新分支的後續回覆。
- 不要重寫歷史，只輸出下一條助手回覆。
`,
};

export function composeForkInputWithContext(historyMarkdown: string, rawLanguage?: string): string {
  const language = normalizeLanguage(rawLanguage);
  const prefix = CONTEXT_PREFIX[language] || CONTEXT_PREFIX.en;
  const normalizedHistory = historyMarkdown.trim();
  return `${prefix}\n# Conversation History\n${normalizedHistory}\n`;
}
