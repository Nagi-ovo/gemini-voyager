# Gemini · Folders

Folders for conversations in Gemini's sidebar (`gemini.google.com`). This is
Voyager's built-in Gemini folders, packaged as an official plugin: the
manifest contains no code of its own and invokes the first-party `folders`
primitive through a `native` op, which on Gemini shows the folder section in
the sidebar (or the floating panel), native rows as drag sources, "Move to
folder" in Gemini's ⋮ menus, the Activity view and the Drive menu over Gemini's
folder session in core.

## Delivery and control

- Ships inside the extension and updates only with a Voyager release. It is
  never published to or replaced by the online plugin catalog. A local plugin
  cannot call `folders` on Gemini.
- Controlled by the existing folders switch in Voyager's settings
  (`geminiFolderEnabled`, on unless turned off), shared with AI Studio's
  folders. Its `hideFiledChats` setting is Gemini's "hide archived" switch
  (`geminiFolderHideArchivedConversations`). Floating mode, search, sorting
  and the other folder options stay on the Folders card and apply live.
- The folder data (`gvFolderData`, per account when account isolation is on),
  the account's `/u/<n>/` route, the popup's cloud-sync answers and
  Folder-as-Project belong to the page, not the plugin: they keep working
  while the plugin is off.
- Gemini Business is not covered.
- Needs no extra site access: Voyager's content script already runs on Gemini.

## Status

This plugin is the feature's only runtime: `src/features/plugins/sites/featureOwners.ts`
assigns the feature to it, and the plugin host admits it where the retired
native manager used to start.
