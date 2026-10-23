# Folder benchmark

`bench/folders/` measures the folder tree surfaces and data paths in node and a headless Chrome.
`bun run bench:check` (part of `verify:pr`) keeps the harness building against `src/`; it times
nothing. The datasets (`normal` 500 conversations, `large` 10k, `deepLegacy`, `duplicates`) are
seeded and deterministic, generated in `datasets.ts`.

## Re-run

```sh
bun run bench:folders                         # everything, about 4 minutes
bun bench/folders/run.ts --only=node          # data cases only, in node
bun bench/folders/run.ts --only=browser --datasets=normal,large
bun bench/folders/run.ts --cpu-throttle=4     # a slower machine, via CDP
bun bench/folders/run.ts --scale=0.2          # fewer runs, for a quick check
bunx tsc -p bench/folders                     # typecheck the harness
```

The command bundles the real modules with esbuild. It runs the data cases in node, then serves a
local page and starts a headless Chrome with a throwaway profile. It drives every surface over
the DevTools protocol, then closes Chrome and deletes the profile. It opens no existing browser
window and loads no real site.

Each run writes `bench/folders/.results/latest.md` and `latest.json`, plus a timestamped JSON.
That directory is git-ignored. Set `CHROME_PATH` or pass `--chrome=<path>` when Chrome is not in
its default macOS or Linux location. Set `NODE_BIN` to choose the node binary.

## Method

- **Busy time** is reported as p50 and p95 over several runs. A warm-up run is discarded first.
  Busy time covers:
  - the synchronous action;
  - a forced style and layout pass (`offsetHeight`);
  - every timer of at most 1 s that the action scheduled, such as the 200 ms search debounce and
    its re-render, each also followed by a forced layout.

  Idle waiting is not included.

- **Long tasks** come from the Long Tasks API. The count includes every task over 50 ms that
  overlaps a timed window. Paint and GC can be part of such a task, so a metric can show long
  tasks even though its busy time is under 50 ms. Node has no such API, so the node column (`*`)
  counts samples over 50 ms instead.
- **DOM elements** are counted after mount, including elements inside open shadow roots.
- **Surfaces:**
  - **Gemini sidebar:** the real `FolderSidebarView` and `FolderSidebarRuntime`, mounted in a fake
    Gemini sidebar. The baseline tables below predate the switch to the shared tree and were taken
    on its predecessor, `FolderTreeView`.
  - **Floating panel:** `mountFloatingPanel`. The AI Studio sidebar uses the same shared
    `FolderTree`, so these numbers cover it too.
  - **ChatGPT:** `ChatGptFolderSection`, `openFolderPicker`, and `ChatGptHideFiled` (its
    `data-gv-chatgpt-filed` row-marker pass and the constant rule).
  - **Selection:** a long-press enters multi-select, then each click on a row link toggles a row.
  - **Search:** typing `p`, `pr`, `pro`, `proj`, then clearing. The cost is reported per
    keystroke.
- **Extension API:** stubbed with an in-memory store. Each `storage.*.set` makes one
  `structuredClone`, and `onChanged` fires on a later task. Console output is muted in node.
- **Not applicable:** a surface without a feature reports `n/a` with a note. The shared tree and
  the ChatGPT section have no search or selection. The picker renders a snapshot and closes when
  you pick a folder.

### Noise

Three full runs on the same tree differed by up to 1.5x on p50 for the heaviest cells:

- Gemini sidebar, `large` mount (all expanded): 576, 367 and 401 ms.
- Hide-filed rule, `large`: 1596, 2046 and 1596 ms. On `normal`: 132, 82 and 82 ms.

Other agents were loading the machine at the time, with a load average of 5 to 23. Use the
numbers below for orders of magnitude. To measure the rewrite, run old and new back to back on
an idle machine and compare ratios.

## Headline (headless Chrome, p50 / p95 ms)

| Surface and metric                                       | normal                | large                 |  Long tasks (large) |
| -------------------------------------------------------- | --------------------- | --------------------- | ------------------: |
| Gemini sidebar mount, all expanded                       | 16.2 / 21.5 (5.7k el) | 401 / 424 (112k el)   |                 5/5 |
| Gemini sidebar rename re-render, expanded                | 17.3 / 18.6           | 369 / 484             |                 8/8 |
| Gemini sidebar mount, all collapsed                      | 1.86 / 2.82 (559 el)  | 19.8 / 20.3 (8.9k el) |                   0 |
| Gemini sidebar search, per keystroke (p95 = clearing it) | 2.69 / 17.8           | 63.5 / 395            | 48 in 40 keystrokes |
| Gemini sidebar selection toggle                          | 0.92 / 1.04           | 18.2 / 19.9           |                   0 |
| Floating `FolderTree` mount, expanded                    | 11.1 / 11.5 (2.5k el) | 230 / 345 (50k el)    |                 5/5 |
| Floating `FolderTree` mount, collapsed                   | 4.51 / 4.88 (2.5k el) | 91.9 / 112 (50k el)   |                 5/5 |
| Floating `FolderTree` rename re-render                   | 1.39 / 1.74           | 33.4 / 47.2           |                   0 |
| Floating `FolderTree` toggle one folder                  | 1.78 / 2.16           | 34.5 / 47.3           |                   0 |
| ChatGPT section mount, expanded                          | 10.1 / 11.5           | 201 / 264             |                 5/5 |
| ChatGPT picker mount                                     | 1.78 / 2.89           | 12.4 / 12.6           |                   0 |
| ChatGPT picker search, per keystroke                     | 0.55 / 1.22           | 1.18 / 5.82           |                   0 |
| ChatGPT hide-filed rule, 500 Recents rows                | 82.0 / 83.2           | 1596 / 1633           |                 8/8 |
| `FolderRepository` save (await `saveData`)               | 1.30 / 1.76           | 25.7 / 29.8           |                   0 |
| `conversationMembership`, 500-row batch                  | 0.86 / 1.02           | 14.6 / 15.7           |                   1 |
| `normalizeFolderData`                                    | 0.03 / 0.04           | 0.44 / 0.60           |                   1 |

These numbers are the 2026-10-02 baseline: `main` at `49bd6eec`, Apple M5 Pro, headless Chrome
154, Node v26.5.0. The Gemini sidebar rows predate the shared tree (`FolderTreeView`), and the
ChatGPT hide-filed row predates the `data-gv-chatgpt-filed` row markers (`ed3ce3a0`). Compare a
new run against them by ratio, back to back on an idle machine.
