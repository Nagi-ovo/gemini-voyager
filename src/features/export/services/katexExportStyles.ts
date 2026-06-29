export function buildKatexExportStyles(scope: string, important = false): string {
  const bang = important ? ' !important' : '';

  return `
      ${scope} .katex {
        font: normal 1.21em KaTeX_Main, Times New Roman, serif${bang};
        line-height: 1.2${bang};
        text-indent: 0${bang};
        text-rendering: auto${bang};
      }

      ${scope} .katex * {
        border-color: currentColor${bang};
      }

      ${scope} .katex .katex-mathml {
        border: 0${bang};
        clip: rect(1px, 1px, 1px, 1px)${bang};
        height: 1px${bang};
        overflow: hidden${bang};
        padding: 0${bang};
        position: absolute${bang};
        width: 1px${bang};
      }

      ${scope} .katex .katex-html > .newline {
        display: block${bang};
      }

      ${scope} .katex .base {
        display: inline-block${bang};
        position: relative${bang};
        white-space: nowrap${bang};
        width: -webkit-min-content${bang};
        width: -moz-min-content${bang};
        width: min-content${bang};
      }

      ${scope} .katex .strut {
        display: inline-block${bang};
      }

      ${scope} .katex .vlist-t {
        border-collapse: collapse${bang};
        display: inline-table${bang};
        table-layout: fixed${bang};
      }

      ${scope} .katex .vlist-r {
        display: table-row${bang};
      }

      ${scope} .katex .vlist {
        display: table-cell${bang};
        position: relative${bang};
        vertical-align: bottom${bang};
      }

      ${scope} .katex .vlist > span {
        display: block${bang};
        height: 0${bang};
        position: relative${bang};
      }

      ${scope} .katex .vlist > span > span {
        display: inline-block${bang};
      }

      ${scope} .katex .vlist > span > .pstrut {
        overflow: hidden${bang};
        width: 0${bang};
      }

      ${scope} .katex .vlist-t2 {
        margin-right: -2px${bang};
      }

      ${scope} .katex .vlist-s {
        display: table-cell${bang};
        font-size: 1px${bang};
        min-width: 2px${bang};
        vertical-align: bottom${bang};
        width: 2px${bang};
      }

      ${scope} .katex .vbox {
        align-items: baseline${bang};
        display: inline-flex${bang};
        flex-direction: column${bang};
      }

      ${scope} .katex .hbox {
        display: inline-flex${bang};
        flex-direction: row${bang};
        width: 100%${bang};
      }

      ${scope} .katex .thinbox {
        display: inline-flex${bang};
        flex-direction: row${bang};
        max-width: 0${bang};
        width: 0${bang};
      }

      ${scope} .katex .msupsub {
        text-align: left${bang};
      }

      ${scope} .katex .mfrac > span > span {
        text-align: center${bang};
      }

      ${scope} .katex .mfrac .frac-line {
        border-bottom-style: solid${bang};
        display: inline-block${bang};
        width: 100%${bang};
      }

      ${scope} .katex .mfrac .frac-line,
      ${scope} .katex .overline .overline-line,
      ${scope} .katex .underline .underline-line,
      ${scope} .katex .hline,
      ${scope} .katex .hdashline,
      ${scope} .katex .rule {
        min-height: 1px${bang};
      }

      ${scope} .katex .mspace {
        display: inline-block${bang};
      }

      ${scope} .katex .llap,
      ${scope} .katex .rlap,
      ${scope} .katex .clap {
        position: relative${bang};
        width: 0${bang};
      }

      ${scope} .katex .llap > .inner,
      ${scope} .katex .rlap > .inner,
      ${scope} .katex .clap > .inner {
        position: absolute${bang};
      }

      ${scope} .katex .llap > .fix,
      ${scope} .katex .rlap > .fix,
      ${scope} .katex .clap > .fix {
        display: inline-block${bang};
      }

      ${scope} .katex .llap > .inner {
        right: 0${bang};
      }

      ${scope} .katex .rlap > .inner,
      ${scope} .katex .clap > .inner {
        left: 0${bang};
      }

      ${scope} .katex .clap > .inner > span {
        margin-left: -50%${bang};
        margin-right: 50%${bang};
      }

      ${scope} .katex .rule {
        border: 0 solid${bang};
        display: inline-block${bang};
        position: relative${bang};
      }

      ${scope} .katex .overline .overline-line,
      ${scope} .katex .underline .underline-line,
      ${scope} .katex .hline {
        border-bottom-style: solid${bang};
        display: inline-block${bang};
        width: 100%${bang};
      }

      ${scope} .katex .hdashline {
        border-bottom-style: dashed${bang};
        display: inline-block${bang};
        width: 100%${bang};
      }

      ${scope} .katex .sqrt > .root {
        margin-left: 0.2777777778em${bang};
        margin-right: -0.5555555556em${bang};
      }

      ${scope} .katex .nulldelimiter {
        display: inline-block${bang};
        width: 0.12em${bang};
      }

      ${scope} .katex .overlay {
        display: block${bang};
      }

      ${scope} .katex .svg-align {
        text-align: left${bang};
      }

      ${scope} .katex svg {
        fill: currentColor${bang};
        stroke: currentColor${bang};
        fill-rule: nonzero${bang};
        fill-opacity: 1${bang};
        stroke-width: 1${bang};
        stroke-linecap: butt${bang};
        stroke-linejoin: miter${bang};
        stroke-miterlimit: 4${bang};
        stroke-dasharray: none${bang};
        stroke-dashoffset: 0${bang};
        stroke-opacity: 1${bang};
        display: block${bang};
        height: inherit${bang};
        position: absolute${bang};
        width: 100%${bang};
      }

      ${scope} .katex svg path {
        stroke: none${bang};
      }

      ${scope} .katex img.katex-svg {
        display: block${bang};
        height: inherit${bang};
        margin: 0${bang};
        max-width: none${bang};
        object-fit: fill${bang};
        position: absolute${bang};
        width: 100%${bang};
      }

      ${scope} .katex .stretchy {
        display: block${bang};
        overflow: hidden${bang};
        position: relative${bang};
        width: 100%${bang};
      }

      ${scope} .katex .stretchy::before,
      ${scope} .katex .stretchy::after {
        content: ''${bang};
      }

      ${scope} .katex .hide-tail {
        overflow: hidden${bang};
        position: relative${bang};
        width: 100%${bang};
      }

      ${scope} .katex-display {
        display: block${bang};
        margin: 1em 0${bang};
        text-align: center${bang};
      }

      ${scope} .katex-display > .katex {
        display: block${bang};
        text-align: center${bang};
        white-space: nowrap${bang};
      }

      ${scope} .katex-display > .katex > .katex-html {
        display: block${bang};
        position: relative${bang};
      }
  `;
}
