# Claude draft auto-save

Keeps unsent text in the Claude composer. After a one-second pause in typing
the text is saved to this device; when you refresh the page or open the same
conversation again, it goes back into the composer, but only while the composer
is empty, so anything you already typed is never replaced. Sending the message
(Enter or the send button) drops its draft.

Drafts are keyed by conversation id (`/chat/<id>`). Every page without a
conversation id (`/new`, a project page) shares one new-chat draft. Drafts live
in `chrome.storage.local` as `gvDraft:claude:…`, at most five per site, and are
cleared from the popup's storage page together with Gemini drafts. They are not
backed up or synced. Claude routes carry no account index, so two accounts in
one browser share drafts per conversation id.

The plugin uses the `draftSave` primitive with the adapter's `composer` and
`sendButton` semantic selectors and its `conversationIdPattern`. Turning it off
stops saving and restoring and keeps the drafts already saved.

Live check: pending (refresh restore, multi-paragraph text, send clears, first
message from `/new`, switching conversations). Check first whether Claude
restores its own composer text after a reload, as ChatGPT does: ChatGPT keeps
its own drafts, so Voyager ships no draft-save plugin there.
