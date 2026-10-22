/**
 * Gemini's own account control, the one place the folders read which account
 * a page shows (`geminiPageAccountFingerprint`). A page without it has no
 * known account, so with isolation on its folders stay closed.
 */
const CONTROL_ID = 'gv-test-gemini-account';

/** Shows (or switches) the signed-in account in Gemini's account button. */
export function showGeminiAccount(email: string): HTMLElement {
  let control = document.getElementById(CONTROL_ID);
  if (!control) {
    control = document.createElement('a');
    control.id = CONTROL_ID;
    control.setAttribute('href', 'https://accounts.google.com/SignOutOptions');
    document.body.prepend(control);
  }
  control.setAttribute('aria-label', `Google Account: Test User (${email})`);
  return control;
}
