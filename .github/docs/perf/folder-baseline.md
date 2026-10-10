# Folder system performance baseline

This baseline records how the folder tree surfaces and data paths perform today. It was taken
before the shared folder tree is rewritten on Preact, `@headless-tree/core`,
`@tanstack/virtual-core`, Zag and Floating UI. Run the same command on the rewrite and compare
the two results.

- Source measured: `main` at `49bd6eec`. The harness adds files under `bench/folders/` and
  changes no source file.
- Machine: Apple M5 Pro (18 cores), 48 GiB, macOS 26.4.1 (Darwin 25.4.0, arm64).
- Browser: headless Chrome 154.0.8037.58 (`--headless=new`), cross-origin isolated, so the
  timer resolution is 5 µs. No CPU throttling.
- Node: v26.5.0 (V8 14.6).
- Date: 2026-10-02.

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

## Where each number comes from

| Source                         | What                                                                                                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real browser (headless Chrome) | All UI surfaces: mount, rename re-render, search typing, selection, folder toggle, DOM element counts, and ChatGPT hide-filed (row-marker pass and constant rule). Also every data case again, under the `data (chrome)` heading, with real `localStorage`. |
| Node (`node`, V8)              | Data cases only: `normalizeFolderData`, `FolderRepository` save, `reorderConversations` and `conversationMembership`. `localStorage` is an in-memory shim with a 5 Mi-character quota, like Chrome's.                                                       |

None of the numbers come from jsdom.

## Datasets

The datasets are seeded and deterministic. They are generated in `bench/folders/datasets.ts` and
are valid `FolderData`.

| Dataset      | Folders |  Refs | Unique conversations | Max depth |    JSON | Shape                                                                                                 |
| ------------ | ------: | ----: | -------------------: | --------: | ------: | ----------------------------------------------------------------------------------------------------- |
| `normal`     |      50 |   500 |                  500 |         1 | 104 KiB | A typical library.                                                                                    |
| `large`      |    1000 | 10000 |                10000 |         1 | 2.0 MiB | A heavy user.                                                                                         |
| `deepLegacy` |     300 |  3000 |                 3000 |        24 | 580 KiB | Chains of nested folders from before `MAX_FOLDER_DEPTH = 1`, and no `sortIndex`.                      |
| `duplicates` |     300 |  4972 |                 1000 |         1 | 997 KiB | Each conversation is filed in about five folders. Only 25 titles and 20 folder names, so many repeat. |

The ChatGPT surfaces get the same datasets with ChatGPT ids (`chatgpt:conv:<uuid>`).

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

### Findings

1. **The Gemini sidebar rebuilds everything on each change.** At `large`, renaming one folder
   costs about as much as a fresh mount: 369 vs 401 ms. Every one of those runs is a long task.
   The fully expanded tree has about 11 elements per row, 112k in total.
2. **The shared `FolderTree` renders collapsed subtrees too.** It hides them with
   `display: none`, so the collapsed and expanded trees have the same element count (50k at
   `large`). A collapsed mount still takes 92 ms. Preact's diff keeps updates at about 30 ms,
   but that is still proportional to the whole library.
3. **Gemini sidebar search blocks typing on large libraries.** One sample in five is the final
   keystroke, which clears the query and rebuilds the whole expanded tree. That keystroke is
   what sets p95 (395 ms at `large`, about the rename re-render's cost). Typing a filtered query
   is the p50, and at `large` it is already 63.5 ms, over the long-task line. There are more long
   tasks than keystrokes. On `deepLegacy` and `duplicates`, p95 (the clear) is 130 to 175 ms.
4. **The ChatGPT hide-filed rule is the largest single cost, and it is outside the tree.** It is
   one `:has(:is(a[href$=…], …))` rule. Style matching scales with filed ids × rows: 82 ms at
   500 ids and 1.6 s at 10k ids, for only 500 minimal fake rows. Appending a 28-row page under
   the rule costs 44 ms at `large`. Real ChatGPT rows are deeper, so expect worse. `ed3ce3a0`
   replaced this rule with one constant rule over `data-gv-chatgpt-filed` row markers. The
   hide-filed numbers in this baseline predate that change; the bench now measures the marker
   pass.
5. **The emergency backup silently stops fitting in `localStorage` at `large`.** The library is
   2.0 MiB as JSON. The folder key, primary backup and metadata take 4.26M characters, and a
   third copy does not fit in the remaining quota (about 5.2M characters). `createEmergencyBackup`
   catches the `QuotaExceededError` and only logs it. `FolderRepository` ignores its return
   value, and the `chrome.storage.local` mirror is skipped too, so the emergency key is simply
   missing. This shows in both the node shim and real Chrome. The save itself succeeds.
   `duplicates` (3.06M characters) still keeps all four keys.
6. **The pure data paths are not the bottleneck.** Except for the save, the data cases stay
   under 1 ms for `normal` in both runtimes. `reorderConversations` stays under 0.2 ms even at
   `large`. `conversationMembership` at 15 to 17 ms per 500-row batch is the one worth watching.

## Full results

The tables below are the run summarized above, copied verbatim from `.results/latest.md`.

### Run 2026-10-02T19:29:09.666Z

- Commit: `49bd6eec`
- Machine: Apple M5 Pro (18 cores), 48 GiB, Darwin 25.4.0 arm64
- Node: node v26.5.0 (V8 14.6.202.34-node.24)
- Browser: Chrome/154.0.8037.58 (cross-origin isolated: true)
- CPU throttle: 1x, run scale: 1

| Dataset    | Folders | Buckets |  Refs | Unique conversations | Max depth | JSON size |
| ---------- | ------: | ------: | ----: | -------------------: | --------: | --------: |
| normal     |      50 |      51 |   500 |                  500 |         1 |   104 KiB |
| large      |    1000 |    1001 | 10000 |                10000 |         1 |  2080 KiB |
| deepLegacy |     300 |     301 |  3000 |                 3000 |        24 |   580 KiB |
| duplicates |     300 |     301 |  4972 |                 1000 |         1 |   997 KiB |

### Browser (headless Chrome)

#### gemini-sidebar (FolderTreeView)

| Dataset    | Metric                                                          | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note |
| ---------- | --------------------------------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ---- |
| normal     | mount (all expanded)                                            |   16.2 |   21.5 |   15 |          0 |         5654 |      |
| normal     | data change: rename one folder (all expanded)                   |   17.3 |   18.6 |   20 |          0 |              |      |
| normal     | mount (all collapsed)                                           |   1.86 |   2.82 |   15 |          0 |          559 |      |
| normal     | data change: rename one folder (all collapsed)                  |   1.68 |   1.76 |   20 |          0 |              |      |
| normal     | search typing (per keystroke, incl. 200 ms-debounced re-render) |   2.69 |   17.8 |  100 |          0 |              |      |
| normal     | selection toggle (multi-select click)                           |   0.92 |   1.04 |   20 |          0 |              |      |
| large      | mount (all expanded)                                            |    401 |    424 |    5 |          5 |       112274 |      |
| large      | data change: rename one folder (all expanded)                   |    369 |    484 |    8 |          8 |              |      |
| large      | mount (all collapsed)                                           |   19.8 |   20.3 |    5 |          0 |         8926 |      |
| large      | data change: rename one folder (all collapsed)                  |   23.1 |   24.8 |    8 |          0 |              |      |
| large      | search typing (per keystroke, incl. 200 ms-debounced re-render) |   63.5 |    395 |   40 |         48 |              |      |
| large      | selection toggle (multi-select click)                           |   18.2 |   19.9 |    8 |          0 |              |      |
| deepLegacy | mount (all expanded)                                            |    112 |    126 |   10 |         10 |        33889 |      |
| deepLegacy | data change: rename one folder (all expanded)                   |    122 |    148 |   15 |         15 |              |      |
| deepLegacy | mount (all collapsed)                                           |   3.84 |   4.11 |   10 |          0 |         1182 |      |
| deepLegacy | data change: rename one folder (all collapsed)                  |   4.24 |   4.74 |   15 |          0 |              |      |
| deepLegacy | search typing (per keystroke, incl. 200 ms-debounced re-render) |   23.2 |    138 |   75 |         30 |              |      |
| deepLegacy | selection toggle (multi-select click)                           |   4.26 |   5.43 |   15 |          0 |              |      |
| duplicates | mount (all expanded)                                            |    172 |    192 |   10 |         10 |        53428 |      |
| duplicates | data change: rename one folder (all expanded)                   |    173 |    199 |   15 |         15 |              |      |
| duplicates | mount (all collapsed)                                           |   8.00 |   10.3 |   10 |          0 |         3119 |      |
| duplicates | data change: rename one folder (all collapsed)                  |   7.62 |   8.22 |   15 |          0 |              |      |
| duplicates | search typing (per keystroke, incl. 200 ms-debounced re-render) |   12.2 |    174 |   75 |         35 |              |      |
| duplicates | selection toggle (multi-select click)                           |   6.31 |   8.47 |   15 |          0 |              |      |

#### floating panel (FolderTree)

| Dataset    | Metric                                         | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                               |
| ---------- | ---------------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ---------------------------------- |
| normal     | mount (all expanded)                           |   11.1 |   11.5 |   15 |          0 |         2516 |                                    |
| normal     | data change: rename one folder (all expanded)  |   1.39 |   1.74 |   20 |          0 |              |                                    |
| normal     | mount (all collapsed)                          |   4.51 |   4.88 |   15 |          0 |         2516 |                                    |
| normal     | data change: rename one folder (all collapsed) |   1.32 |   1.41 |   20 |          0 |              |                                    |
| normal     | toggle one folder open/closed                  |   1.78 |   2.16 |   20 |          0 |              |                                    |
| normal     | search typing                                  |    n/a |    n/a |    – |          – |              | the floating tree has no search    |
| normal     | selection toggle                               |    n/a |    n/a |    – |          – |              | the floating tree has no selection |
| large      | mount (all expanded)                           |    230 |    345 |    5 |          5 |        50016 |                                    |
| large      | data change: rename one folder (all expanded)  |   33.4 |   47.2 |    8 |          0 |              |                                    |
| large      | mount (all collapsed)                          |   91.9 |    112 |    5 |          5 |        50016 |                                    |
| large      | data change: rename one folder (all collapsed) |   29.0 |   44.1 |    8 |          0 |              |                                    |
| large      | toggle one folder open/closed                  |   34.5 |   47.3 |    8 |          0 |              |                                    |
| large      | search typing                                  |    n/a |    n/a |    – |          – |              | the floating tree has no search    |
| large      | selection toggle                               |    n/a |    n/a |    – |          – |              | the floating tree has no selection |
| deepLegacy | mount (all expanded)                           |   76.1 |    104 |   10 |         10 |        15016 |                                    |
| deepLegacy | data change: rename one folder (all expanded)  |   8.21 |   10.1 |   15 |          0 |              |                                    |
| deepLegacy | mount (all collapsed)                          |   28.4 |   33.4 |   10 |          1 |        15016 |                                    |
| deepLegacy | data change: rename one folder (all collapsed) |   7.74 |   9.64 |   15 |          0 |              |                                    |
| deepLegacy | toggle one folder open/closed                  |   7.75 |   9.53 |   15 |          0 |              |                                    |
| deepLegacy | search typing                                  |    n/a |    n/a |    – |          – |              | the floating tree has no search    |
| deepLegacy | selection toggle                               |    n/a |    n/a |    – |          – |              | the floating tree has no selection |
| duplicates | mount (all expanded)                           |    101 |    130 |   10 |         10 |        22904 |                                    |
| duplicates | data change: rename one folder (all expanded)  |   13.7 |   24.6 |   15 |          0 |              |                                    |
| duplicates | mount (all collapsed)                          |   37.8 |   46.3 |   10 |          3 |        22904 |                                    |
| duplicates | data change: rename one folder (all collapsed) |   12.1 |   14.2 |   15 |          0 |              |                                    |
| duplicates | toggle one folder open/closed                  |   11.8 |   13.3 |   15 |          0 |              |                                    |
| duplicates | search typing                                  |    n/a |    n/a |    – |          – |              | the floating tree has no search    |
| duplicates | selection toggle                               |    n/a |    n/a |    – |          – |              | the floating tree has no selection |

#### chatgpt section (FolderTree)

| Dataset    | Metric                                         | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                         |
| ---------- | ---------------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ---------------------------- |
| normal     | mount (all expanded)                           |   10.1 |   11.5 |   15 |          0 |         2507 |                              |
| normal     | data change: rename one folder (all expanded)  |   1.79 |   2.28 |   20 |          0 |              |                              |
| normal     | mount (all collapsed)                          |   5.52 |   6.34 |   15 |          0 |         2507 |                              |
| normal     | data change: rename one folder (all collapsed) |   3.75 |   4.45 |   20 |          0 |              |                              |
| normal     | search typing                                  |    n/a |    n/a |    – |          – |              | the section has no search    |
| normal     | selection toggle                               |    n/a |    n/a |    – |          – |              | the section has no selection |
| large      | mount (all expanded)                           |    201 |    264 |    5 |          5 |        50007 |                              |
| large      | data change: rename one folder (all expanded)  |   28.5 |   46.4 |    8 |          0 |              |                              |
| large      | mount (all collapsed)                          |   88.5 |   88.6 |    5 |          5 |        50007 |                              |
| large      | data change: rename one folder (all collapsed) |   29.7 |   42.8 |    8 |          0 |              |                              |
| large      | search typing                                  |    n/a |    n/a |    – |          – |              | the section has no search    |
| large      | selection toggle                               |    n/a |    n/a |    – |          – |              | the section has no selection |
| deepLegacy | mount (all expanded)                           |   66.4 |   72.9 |   10 |         10 |        15007 |                              |
| deepLegacy | data change: rename one folder (all expanded)  |   7.54 |   10.0 |   15 |          0 |              |                              |
| deepLegacy | mount (all collapsed)                          |   26.1 |   37.0 |   10 |          0 |        15007 |                              |
| deepLegacy | data change: rename one folder (all collapsed) |   7.24 |   8.78 |   15 |          0 |              |                              |
| deepLegacy | search typing                                  |    n/a |    n/a |    – |          – |              | the section has no search    |
| deepLegacy | selection toggle                               |    n/a |    n/a |    – |          – |              | the section has no selection |
| duplicates | mount (all expanded)                           |   83.1 |   95.7 |   10 |         10 |        22895 |                              |
| duplicates | data change: rename one folder (all expanded)  |   11.5 |   13.2 |   15 |          0 |              |                              |
| duplicates | mount (all collapsed)                          |   36.7 |   37.4 |   10 |          1 |        22895 |                              |
| duplicates | data change: rename one folder (all collapsed) |   11.4 |   13.6 |   15 |          0 |              |                              |
| duplicates | search typing                                  |    n/a |    n/a |    – |          – |              | the section has no search    |
| duplicates | selection toggle                               |    n/a |    n/a |    – |          – |              | the section has no selection |

#### chatgpt folder picker

| Dataset    | Metric                                | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                                      |
| ---------- | ------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ----------------------------------------- |
| normal     | mount (flat list, no expansion state) |   1.78 |   2.89 |   15 |          0 |          128 |                                           |
| normal     | search typing (per keystroke)         |   0.55 |   1.22 |  100 |          0 |              |                                           |
| normal     | data change                           |    n/a |    n/a |    – |          – |              | the picker renders a snapshot when opened |
| normal     | selection toggle                      |    n/a |    n/a |    – |          – |              | picking a folder closes the picker        |
| large      | mount (flat list, no expansion state) |   12.4 |   12.6 |    5 |          0 |         2378 |                                           |
| large      | search typing (per keystroke)         |   1.18 |   5.82 |   40 |          0 |              |                                           |
| large      | data change                           |    n/a |    n/a |    – |          – |              | the picker renders a snapshot when opened |
| large      | selection toggle                      |    n/a |    n/a |    – |          – |              | picking a folder closes the picker        |
| deepLegacy | mount (flat list, no expansion state) |   6.11 |   6.66 |   10 |          0 |          884 |                                           |
| deepLegacy | search typing (per keystroke)         |   4.46 |   6.82 |   75 |          0 |              |                                           |
| deepLegacy | data change                           |    n/a |    n/a |    – |          – |              | the picker renders a snapshot when opened |
| deepLegacy | selection toggle                      |    n/a |    n/a |    – |          – |              | picking a folder closes the picker        |
| duplicates | mount (flat list, no expansion state) |   2.82 |   3.36 |   10 |          0 |          718 |                                           |
| duplicates | search typing (per keystroke)         |   0.84 |   2.90 |   75 |          0 |              |                                           |
| duplicates | data change                           |    n/a |    n/a |    – |          – |              | the picker renders a snapshot when opened |
| duplicates | selection toggle                      |    n/a |    n/a |    – |          – |              | picking a folder closes the picker        |

#### chatgpt hide-filed rule (style matching)

| Dataset    | Metric                                  | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                  |
| ---------- | --------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | --------------------- |
| normal     | apply rule (500 ids) to 500 rows        |   82.0 |   83.2 |   20 |         20 |              | hides 250 of 500 rows |
| normal     | append a page of 28 rows under the rule |   2.65 |   2.75 |   20 |          0 |              |                       |
| large      | apply rule (10000 ids) to 500 rows      |   1596 |   1633 |    8 |          8 |              | hides 250 of 500 rows |
| large      | append a page of 28 rows under the rule |   44.4 |   44.7 |    8 |          0 |              |                       |
| deepLegacy | apply rule (3000 ids) to 500 rows       |    484 |    491 |   15 |         15 |              | hides 249 of 500 rows |
| deepLegacy | append a page of 28 rows under the rule |   13.7 |   14.2 |   15 |          0 |              |                       |
| duplicates | apply rule (1000 ids) to 500 rows       |    162 |    163 |   15 |         15 |              | hides 249 of 500 rows |
| duplicates | append a page of 28 rows under the rule |   6.36 |   6.60 |   15 |          0 |              |                       |

#### data (chrome)

| Dataset    | Metric                                               | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                                                                                                  |
| ---------- | ---------------------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ----------------------------------------------------------------------------------------------------- |
| normal     | normalizeFolderData                                  | 0.0280 | 0.0370 |   40 |          0 |              |                                                                                                       |
| normal     | FolderRepository save (await saveData)               |   1.30 |   1.76 |   30 |          0 |              | localStorage after: 0.32M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| normal     | FolderRepository save + storage echo                 |   6.78 |   7.34 |   30 |          0 |              | localStorage after: 0.32M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| normal     | reorderConversations (8 of 16, same folder)          | 0.0080 | 0.0100 |   40 |          0 |              |                                                                                                       |
| normal     | reorderConversations (8 of 16, into another folder)  | 0.0085 | 0.0095 |   40 |          0 |              |                                                                                                       |
| normal     | conversationMembership (500 rows, one batch)         |   0.86 |   1.02 |   40 |          0 |              |                                                                                                       |
| normal     | hideFiledRowsCss (500 filed ids)                     | 0.0600 | 0.0650 |   40 |          0 |              |                                                                                                       |
| large      | normalizeFolderData                                  |   0.44 |   0.60 |   20 |          1 |              |                                                                                                       |
| large      | FolderRepository save (await saveData)               |   25.7 |   29.8 |   10 |          0 |              | localStorage after: 4.26M chars, keys backup:metadata, backup:primary, gvFolderData                   |
| large      | FolderRepository save + storage echo                 |   32.3 |   32.6 |   10 |          0 |              | localStorage after: 4.26M chars, keys backup:metadata, backup:primary, gvFolderData                   |
| large      | reorderConversations (11 of 22, same folder)         | 0.0700 | 0.0935 |   30 |          0 |              |                                                                                                       |
| large      | reorderConversations (11 of 22, into another folder) | 0.0690 | 0.0850 |   30 |          0 |              |                                                                                                       |
| large      | conversationMembership (500 rows, one batch)         |   14.6 |   15.7 |   20 |          1 |              |                                                                                                       |
| large      | hideFiledRowsCss (10000 filed ids)                   |   1.61 |   1.72 |   20 |          1 |              |                                                                                                       |
| deepLegacy | normalizeFolderData                                  |   0.49 |   0.58 |   40 |          1 |              |                                                                                                       |
| deepLegacy | FolderRepository save (await saveData)               |   6.73 |   7.41 |   30 |          0 |              | localStorage after: 1.92M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| deepLegacy | FolderRepository save + storage echo                 |   13.5 |   14.3 |   30 |          0 |              | localStorage after: 1.92M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| deepLegacy | reorderConversations (10 of 21, same folder)         | 0.0225 | 0.0240 |   40 |          0 |              |                                                                                                       |
| deepLegacy | reorderConversations (10 of 21, into another folder) | 0.0220 | 0.0240 |   40 |          0 |              |                                                                                                       |
| deepLegacy | conversationMembership (500 rows, one batch)         |   4.29 |   4.95 |   40 |          1 |              |                                                                                                       |
| deepLegacy | hideFiledRowsCss (3000 filed ids)                    |   0.37 |   0.39 |   40 |          0 |              |                                                                                                       |
| duplicates | normalizeFolderData                                  |   0.21 |   0.24 |   40 |          0 |              |                                                                                                       |
| duplicates | FolderRepository save (await saveData)               |   12.5 |   13.6 |   30 |          0 |              | localStorage after: 3.06M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| duplicates | FolderRepository save + storage echo                 |   18.9 |   22.6 |   30 |          0 |              | localStorage after: 3.06M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| duplicates | reorderConversations (16 of 33, same folder)         | 0.0230 | 0.0245 |   40 |          0 |              |                                                                                                       |
| duplicates | reorderConversations (16 of 33, into another folder) | 0.0230 | 0.0260 |   40 |          0 |              |                                                                                                       |
| duplicates | conversationMembership (500 rows, one batch)         |   4.83 |   5.28 |   40 |          1 |              |                                                                                                       |
| duplicates | hideFiledRowsCss (1000 filed ids)                    | 0.0950 |   0.11 |   40 |          0 |              |                                                                                                       |

### Node

#### data

| Dataset    | Metric                                               | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note                                                                                                  |
| ---------- | ---------------------------------------------------- | -----: | -----: | ---: | ---------: | -----------: | ----------------------------------------------------------------------------------------------------- |
| normal     | normalizeFolderData                                  | 0.0266 | 0.0384 |   40 |         0* |              |                                                                                                       |
| normal     | FolderRepository save (await saveData)               |   1.18 |   1.45 |   30 |         0* |              | localStorage after: 0.32M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| normal     | FolderRepository save + storage echo                 |   2.60 |   2.80 |   30 |         0* |              | localStorage after: 0.32M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| normal     | reorderConversations (8 of 16, same folder)          | 0.0067 | 0.0085 |   40 |         0* |              |                                                                                                       |
| normal     | reorderConversations (8 of 16, into another folder)  | 0.0063 | 0.0079 |   40 |         0* |              |                                                                                                       |
| normal     | conversationMembership (500 rows, one batch)         |   0.71 |   0.81 |   40 |         0* |              |                                                                                                       |
| normal     | hideFiledRowsCss (500 filed ids)                     | 0.0516 | 0.0616 |   40 |         0* |              |                                                                                                       |
| large      | normalizeFolderData                                  |   0.59 |   0.82 |   20 |         0* |              |                                                                                                       |
| large      | FolderRepository save (await saveData)               |   22.3 |   31.6 |   10 |         0* |              | localStorage after: 4.26M chars, keys backup:metadata, backup:primary, gvFolderData                   |
| large      | FolderRepository save + storage echo                 |   29.7 |   33.7 |   10 |         0* |              | localStorage after: 4.26M chars, keys backup:metadata, backup:primary, gvFolderData                   |
| large      | reorderConversations (11 of 22, same folder)         |   0.13 |   0.55 |   30 |         0* |              |                                                                                                       |
| large      | reorderConversations (11 of 22, into another folder) |   0.12 |   0.14 |   30 |         0* |              |                                                                                                       |
| large      | conversationMembership (500 rows, one batch)         |   17.2 |   18.1 |   20 |         0* |              |                                                                                                       |
| large      | hideFiledRowsCss (10000 filed ids)                   |   1.60 |   1.77 |   20 |         0* |              |                                                                                                       |
| deepLegacy | normalizeFolderData                                  |   0.59 |   0.69 |   40 |         0* |              |                                                                                                       |
| deepLegacy | FolderRepository save (await saveData)               |   6.39 |   6.83 |   30 |         0* |              | localStorage after: 1.92M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| deepLegacy | FolderRepository save + storage echo                 |   9.11 |   9.66 |   30 |         0* |              | localStorage after: 1.92M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| deepLegacy | reorderConversations (10 of 21, same folder)         | 0.0323 | 0.0360 |   40 |         0* |              |                                                                                                       |
| deepLegacy | reorderConversations (10 of 21, into another folder) | 0.0332 | 0.0406 |   40 |         0* |              |                                                                                                       |
| deepLegacy | conversationMembership (500 rows, one batch)         |   4.77 |   5.30 |   40 |         0* |              |                                                                                                       |
| deepLegacy | hideFiledRowsCss (3000 filed ids)                    |   0.41 |   0.48 |   40 |         0* |              |                                                                                                       |
| duplicates | normalizeFolderData                                  |   0.25 |   0.35 |   40 |         0* |              |                                                                                                       |
| duplicates | FolderRepository save (await saveData)               |   10.6 |   16.7 |   30 |         0* |              | localStorage after: 3.06M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| duplicates | FolderRepository save + storage echo                 |   14.6 |   15.4 |   30 |         0* |              | localStorage after: 3.06M chars, keys backup:emergency, backup:metadata, backup:primary, gvFolderData |
| duplicates | reorderConversations (16 of 33, same folder)         | 0.0343 | 0.0456 |   40 |         0* |              |                                                                                                       |
| duplicates | reorderConversations (16 of 33, into another folder) | 0.0350 | 0.0434 |   40 |         0* |              |                                                                                                       |
| duplicates | conversationMembership (500 rows, one batch)         |   5.52 |   6.05 |   40 |         0* |              |                                                                                                       |
| duplicates | hideFiledRowsCss (1000 filed ids)                    | 0.0999 |   0.12 |   40 |         0* |              |                                                                                                       |

`*` node has no Long Tasks API: the count is samples over 50 ms.
