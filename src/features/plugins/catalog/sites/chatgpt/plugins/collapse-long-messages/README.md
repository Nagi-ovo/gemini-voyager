# Collapse long ChatGPT messages

Caps the visible height of long messages you send, with one button after each
message to expand or collapse it. Short messages keep their native layout.

**Collapsed text height** sets the visible height from 80 to 2000 pixels (320 by
default). **Collapse long messages initially** starts new long messages collapsed;
turn it off to keep them expanded until you choose to collapse them. Changing either
setting reapplies the plugin with the new values.

The plugin uses the adapter’s `userTurn` semantic selector and the `collapse`
primitive. It keeps host text intact, handles content that grows after mounting,
and preserves an expanded state while the same element survives. Toggle buttons
remain outside the clipped content. There is no expand-all control.

Buttons support keyboard input, localized labels, light/dark themes and RTL layout.
Disabling the plugin removes its controls and restores the original layout.
Do not adapt this plugin to content that already has native collapse, including
DeepSeek’s `.ds-collapsible-text`. For reply or thinking content, change both
`params.target` and `requires.semantic` to the chosen adapter key.

## Reviewer checks before catalog inclusion

- Add the proposed directory at `catalog/sites/chatgpt/plugins/collapse-long-messages/`
  and add its marketplace entry. No stylesheet or site-adapter change is needed.
- In light and dark themes, verify a long pasted message receives a visible,
  keyboard-operable toggle after the message, while a short message does not.
- In RTL, verify toggle placement, label direction and the fade remain readable.
- Let a target grow beyond the height threshold and verify its toggle appears.
  Expand it, append more content and verify it stays expanded.
- Set the height above the message’s natural height and verify the toggle disappears
  and the message displays fully. Switch the initial-collapse setting and verify
  settings reactivation uses the new value.
- Disable the plugin and verify native message layout returns with no leftover
  controls, clipping or fade.
