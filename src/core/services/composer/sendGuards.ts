const PENDING_UPLOAD_SELECTOR = 'progress, [role="progressbar"]';

/** A direct send-button click must preserve the host's attachment-upload guard. */
export function hasPendingComposerUpload(root: Element): boolean {
  return root.querySelector(PENDING_UPLOAD_SELECTOR) !== null;
}
