# Gemini draft auto-save

Saves and restores unsent text in Gemini’s main composer through the `draftSave` primitive. The existing Draft auto-save setting controls the official plugin. Turning it off keeps stored drafts.

Uses the native `gvDraft_` keys followed by the full pathname and the existing `{ content, timestamp, path }` records. Account-slot paths and Gem routes stay distinct. Changing email within the same account slot still shares stored drafts, while a delayed restore checks its captured account identity before touching the input.

Official and local draft plugins may run together and share this data. Writes and pruning are coordinated on the page. A first send that creates a conversation clears the new-chat draft; leaving without sending preserves it. Unload flush is best effort because closing a browser cannot guarantee an asynchronous storage write finishes. Gemini Enterprise does not save drafts.
