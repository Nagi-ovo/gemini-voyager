/**
 * Whether a person caused `event`, not a script calling `click()` or `dispatchEvent`.
 * A seam because jsdom cannot create trusted events: tests mock it to stand in for a user.
 */
export function isUserEvent(event: Event): boolean {
  return event.isTrusted;
}
