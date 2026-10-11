# Gemini · Formula Copy

Click an inline or block formula on gemini.google.com to copy it. This is
Voyager's built-in Gemini formula copy, packaged as an official plugin: the
manifest contains no code of its own and invokes the first-party `formulaCopy`
primitive through a `native` op, so the behaviour is the same service the
native module runs.

## Delivery and control

- Ships inside the extension and updates only with a Voyager release. It is
  never published to or replaced by the online plugin catalog, and Gemini pages
  make no catalog request for it.
- Controlled by the existing formula copy switch and copy format in Voyager's
  Gemini settings (`gvFormulaCopyEnabled`, `gvFormulaCopyFormat`). It has no
  switch or settings of its own. AI Studio's formula copy
  (`voyager.aistudio-formula-copy`) reads the same two keys, so one switch and
  one format apply to both sites.
- Needs no extra site access: Voyager's content script already runs on Gemini.
- Covers `gemini.google.com` only. Gemini Enterprise (`business.gemini.google`)
  is outside its `matches`.

## Status

Whether this plugin or the native module runs the feature is decided per build
by `src/features/plugins/sites/featureOwners.ts`. While that entry is `legacy`,
the native module keeps running and the plugin host refuses this plugin's
`formulaCopy` op on Gemini, so shipping the manifest changes nothing on the
page.

Requires plugin engine 1.3.0 or newer (the `formulaCopy` primitive's floor).
