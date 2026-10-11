# DeepSeek draft auto-save

Keeps unsent text in the DeepSeek composer. After a one-second pause in typing
the text is saved to this device; when you refresh the page or open the same
conversation again, it goes back into the composer, but only while the composer
is empty, so anything you already typed is never replaced. The restore does not
move focus. Sending the message (Enter or the send button) drops its draft.

Drafts are keyed by conversation id (`/a/chat/s/<id>`). Every page without a
conversation id (the new-chat page) shares one new-chat draft. Drafts live in
`chrome.storage.local` as `gvDraft:deepseek:…`, at most five per site, and are
cleared from the popup's storage page together with Gemini drafts. They are not
backed up or synced. DeepSeek routes carry no account index, so two accounts in
one browser share drafts per conversation id.

The plugin uses the `draftSave` primitive with the adapter's `composer` and
`sendButton` semantic selectors and its `conversationIdPattern`. Turning it off
stops saving and restoring and keeps the drafts already saved.

Live check: pending (refresh restore, multi-line text, send clears, first
message from the new-chat page, switching conversations, editing an earlier
message does not save into the main draft).
