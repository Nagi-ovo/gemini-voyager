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
DeepSeek’s `.ds-collapsible-text`. For reply or thinking content, set
`params.target` to `assistantTurn` or `thinkingBlock`; the site must declare that
key.

Live check: pending (long and short messages, light/dark themes, RTL, settings
changes and disabling).
