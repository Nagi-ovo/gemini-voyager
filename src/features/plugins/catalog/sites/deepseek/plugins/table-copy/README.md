# DeepSeek · Table Copy

Adds a small toolbar above each table in a DeepSeek reply with two icon
buttons: **Copy table as Markdown** and **Copy table for spreadsheets (TSV)**.
This plugin contains no code of its own: it invokes Voyager's first-party
`tableCopy` primitive through a `native` op.

- Markdown is the table conversation export writes (`extractTable`), so a
  formula in a cell stays LaTeX (`$x^2$`, `$\frac{a}{b}$`) instead of KaTeX's
  flattened glyph text.
- TSV keeps formulas as LaTeX too, drops bold and code markers, and prefixes an
  apostrophe to a cell that starts with `=`, `+`, `-` or `@` (plain numbers
  excepted) so a spreadsheet pastes it as text rather than evaluating it.
- The table is never edited. Tables inside the thinking block and tables nested
  in another table get no toolbar. Turning the plugin off removes every toolbar.
- Requires Voyager plugin engine 1.8.0 or newer (`requires.handlers: ["tableCopy"]`).
- Ships disabled; enable it from the popup on DeepSeek.
- Status: needs a live check on DeepSeek's current table and KaTeX markup,
  including whether streaming rebuilds the `<table>` (see PR #1035).
