# Draft Issue for houyanchao/AITimeline

---

**Title:** Feature references and license compatibility with Voyager (GPL-3.0)

---

Hi @houyanchao,

I'm the maintainer of [Voyager](https://github.com/Nagi-ovo/gemini-voyager) (formerly Gemini Voyager), a Chrome extension for Google Gemini licensed under **GPL-3.0**.

I noticed that AITimeline shares a significant number of features and implementation details with Voyager, and I'd like to discuss attribution and license compatibility.

## Specific observations

Here are a few examples that suggest AITimeline's implementation drew from Voyager's:

### 1. NanoBanana watermark removal

This is an extremely niche feature — very few extensions in the world implement removal of Google's internal NanoBanana image watermark system. Voyager was one of the first to implement this via fetch interception targeting `googleusercontent.com` / `ggpht.com` `rd-gg-dl` paths. AITimeline added the same feature on 2026-01-20 with a commit message referencing "nano banana去水印".

### 2. Identical magic constants

Voyager's timeline module uses these values:

| Constant | Voyager | AITimeline |
|---|---|---|
| Min active change interval | `120ms` | `MIN_ACTIVE_CHANGE_INTERVAL: 120` |
| Tooltip hide delay | `100ms` | `TOOLTIP_HIDE_DELAY: 100` |
| Long press duration | `550ms` | `LONG_PRESS_DURATION: 550` |
| Long press tolerance | `6px` | `LONG_PRESS_TOLERANCE: 6` |

Four non-standard values matching exactly is statistically very unlikely to be coincidental — especially `550ms` and `6px`.

### 3. Temml MathML conversion

Both projects chose the relatively uncommon **Temml** library (rather than KaTeX's `renderToMathML`) for LaTeX → MathML conversion, and both apply the same post-processing steps: removing `<annotation>` / `<annotation-xml>` elements, unwrapping `<semantics>`, and adding Word-compatible `<!--StartFragment-->` / `<!--EndFragment-->` wrappers.

### 4. Feature timeline alignment

AITimeline's feature additions closely follow Voyager's roadmap: LaTeX copy → Mermaid rendering → Quote Reply → NanoBanana removal → Google Drive sync → Folder management. Additionally, [Issue #4](https://github.com/houyanchao/AITimeline/issues/4) explicitly references Voyager as a feature benchmark.

## What I'm asking

I'm not claiming line-by-line code copying — I can see the code has been rewritten in a different language and architecture. However, the implementation strategies, algorithm choices, and constant values strongly indicate that Voyager served as a primary reference.

I've been in a similar situation myself: when a developer pointed out that one of my modules referenced their work ([Nagi-ovo/gemini-voyager#236](https://github.com/Nagi-ovo/gemini-voyager/issues/236)), I responded by upgrading my license to GPL-3.0 and adding proper attribution. I hope we can resolve this in the same spirit.

Specifically, I'd appreciate it if you could:

1. **Add an acknowledgment** in your README or LICENSE that certain features were inspired by / referenced from Voyager
2. **Review license compatibility** — Voyager is GPL-3.0, and if any implementation was derived from our codebase, the GPL-3.0 copyleft terms would apply

I believe in open source collaboration, and I'm happy to discuss this further. Looking forward to your response.

Best,
Jesse ([@Nagi-ovo](https://github.com/Nagi-ovo))
