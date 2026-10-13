/** Gemini's native conversation surface includes home, Gems and account-prefixed routes. */
export function isGeminiConversationRoute(href: string): boolean {
  return /^\/(?:u\/\d+\/)?(app|gem)(\/|$)/.test(new URL(href, location.href).pathname);
}
