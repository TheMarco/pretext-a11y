# Pretext

Pure JavaScript/TypeScript library for multiline text measurement & layout. Fast, accurate & supports all the languages you didn't even know about. Allows rendering to DOM, Canvas, SVG and soon, server-side.

Pretext side-steps the need for DOM measurements (e.g. `getBoundingClientRect`, `offsetHeight`), which trigger layout reflow, one of the most expensive operations in the browser. It implements its own text measurement logic, using the browsers' own font engine as ground truth (very AI-friendly iteration method).

## Installation

```sh
npm install @chenglou/pretext
```

## Demos

Clone the repo, run `bun install`, then `bun start`, and open the `/demos` in your browser (no trailing slash. Bun devserver bugs on those)
Alternatively, see them live at [chenglou.me/pretext](https://chenglou.me/pretext/). Some more at [somnai-dreams.github.io/pretext-demos](https://somnai-dreams.github.io/pretext-demos/)

## API

Pretext serves 2 use cases:

### 1. Measure a paragraph's height _without ever touching DOM_

```ts
import { prepare, layout } from '@chenglou/pretext'

const prepared = prepare('AGI 春天到了. بدأت الرحلة 🚀', '16px Inter')
const { height, lineCount } = layout(prepared, textWidth, 20) // pure arithmetics. No DOM layout & reflow!
```

`prepare()` does the one-time work: normalize whitespace, segment the text, apply glue rules, measure the segments with canvas, and return an opaque handle. `layout()` is the cheap hot path after that: pure arithmetic over cached widths.

If you want textarea-like text where ordinary spaces, `\t` tabs, and `\n` hard breaks stay visible, pass `{ whiteSpace: 'pre-wrap' }` to `prepare()` / `prepareWithSegments()`.

```ts
const prepared = prepare(textareaValue, '16px Inter', { whiteSpace: 'pre-wrap' })
const { height } = layout(prepared, textareaWidth, 20)
```

On the current checked-in benchmark snapshot:
- `prepare()` is about `19ms` for the shared 500-text batch
- `layout()` is about `0.09ms` for that same batch

We support all the languages you can imagine, including emojis and mixed-bidi, and caters to specific browser quirks

The returned height is the crucial last piece for unlocking web UI's:
- proper virtualization/occlusion without guesstimates & caching
- fancy userland layouts: masonry, JS-driven flexbox-like implementations, nudging a few layout values without CSS hacks (imagine that), etc.
- _development time_ verification (especially now with AI) that labels on e.g. buttons don't overflow to the next line, browser-free
- prevent layout shift when new text loads and you wanna re-anchor the scroll position

### 2. Lay out the paragraph lines manually yourself

Switch out `prepare` with `prepareWithSegments`, then:

- `layoutWithLines()` gives you all the lines at a fixed width:

```ts
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

const prepared = prepareWithSegments('AGI 春天到了. بدأت الرحلة 🚀', '18px "Helvetica Neue"')
const { lines } = layoutWithLines(prepared, 320, 26) // 320px max width, 26px line height
for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i].text, 0, i * 26)
```

- `walkLineRanges()` gives you line widths and cursors without building the text strings:

```ts
let maxW = 0
walkLineRanges(prepared, 320, line => { if (line.width > maxW) maxW = line.width })
// maxW is now the widest line — the tightest container width that still fits the text! This multiline "shrink wrap" has been missing from web
```

- `layoutNextLine()` lets you route text one row at a time when width changes as you go:

```ts
let cursor = { segmentIndex: 0, graphemeIndex: 0 }
let y = 0

// Flow text around a floated image: lines beside the image are narrower
while (true) {
  const width = y < image.bottom ? columnWidth - image.width : columnWidth
  const line = layoutNextLine(prepared, cursor, width)
  if (line === null) break
  ctx.fillText(line.text, 0, y)
  cursor = line.end
  y += 26
}
```

This usage allows rendering to canvas, SVG, WebGL and (eventually) server-side.

### API Glossary

Use-case 1 APIs:
```ts
prepare(text: string, font: string, options?: { whiteSpace?: 'normal' | 'pre-wrap' }): PreparedText // one-time text analysis + measurement pass, returns an opaque value to pass to `layout()`. Make sure `font` is synced with your css `font` declaration shorthand (e.g. size, weight, style, family) for the text you're measuring. `font` is the same format as what you'd use for `myCanvasContext.font = ...`, e.g. `16px Inter`.
layout(prepared: PreparedText, maxWidth: number, lineHeight: number): { height: number, lineCount: number } // calculates text height given a max width and lineHeight. Make sure `lineHeight` is synced with your css `line-height` declaration for the text you're measuring.
```

Use-case 2 APIs:
```ts
prepareWithSegments(text: string, font: string, options?: { whiteSpace?: 'normal' | 'pre-wrap' }): PreparedTextWithSegments // same as `prepare()`, but returns a richer structure for manual line layouts needs
layoutWithLines(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): { height: number, lineCount: number, lines: LayoutLine[] } // high-level api for manual layout needs. Accepts a fixed max width for all lines. Similar to `layout()`'s return, but additionally returns the lines info
walkLineRanges(prepared: PreparedTextWithSegments, maxWidth: number, onLine: (line: LayoutLineRange) => void): number // low-level api for manual layout needs. Accepts a fixed max width for all lines. Calls `onLine` once per line with its actual calculated line width and start/end cursors, without building line text strings. Very useful for certain cases where you wanna speculatively test a few width and height boundaries (e.g. binary search a nice width value by repeatedly calling walkLineRanges and checking the line count, and therefore height, is "nice" too. You can have text messages shrinkwrap and balanced text layout this way). After walkLineRanges calls, you'd call layoutWithLines once, with your satisfying max width, to get the actual lines info.
layoutNextLine(prepared: PreparedTextWithSegments, start: LayoutCursor, maxWidth: number): LayoutLine | null // iterator-like api for laying out each line with a different width! Returns the LayoutLine starting from `start`, or `null` when the paragraph's exhausted. Pass the previous line's `end` cursor as the next `start`.
type LayoutLine = {
  text: string // Full text content of this line, e.g. 'hello world'
  width: number // Measured width of this line, e.g. 87.5
  start: LayoutCursor // Inclusive start cursor in prepared segments/graphemes
  end: LayoutCursor // Exclusive end cursor in prepared segments/graphemes
}
type LayoutLineRange = {
  width: number // Measured width of this line, e.g. 87.5
  start: LayoutCursor // Inclusive start cursor in prepared segments/graphemes
  end: LayoutCursor // Exclusive end cursor in prepared segments/graphemes
}
type LayoutCursor = {
  segmentIndex: number // Segment index in prepareWithSegments' prepared rich segment stream
  graphemeIndex: number // Grapheme index within that segment; `0` at segment boundaries
}
```

Other helpers:
```ts
clearCache(): void // clears Pretext's shared internal caches used by prepare() and prepareWithSegments(). Useful if your app cycles through many different fonts or text variants and you want to release the accumulated cache
setLocale(locale?: string): void // optional (by default we use the current locale). Sets locale for future prepare() and prepareWithSegments(). Internally, it also calls clearCache(). Setting a new locale doesn't affect existing prepare() and prepareWithSegments() states (no mutations to them)
```

## Caveats

Pretext doesn't try to be a full font rendering engine (yet?). It currently targets the common text setup:
- `white-space: normal`
- `word-break: normal`
- `overflow-wrap: break-word`
- `line-break: auto`
- If you pass `{ whiteSpace: 'pre-wrap' }`, ordinary spaces, `\t` tabs, and `\n` hard breaks are preserved instead of collapsed. Tabs follow the default browser-style `tab-size: 8`. The other wrapping defaults stay the same: `word-break: normal`, `overflow-wrap: break-word`, and `line-break: auto`.
- `system-ui` is unsafe for `layout()` accuracy on macOS. Use a named font.
- Because the default target includes `overflow-wrap: break-word`, very narrow widths can still break inside words, but only at grapheme boundaries.

## Accessibility

This fork adds comprehensive accessibility enhancements to every demo page, proving that ambitious visual layouts and genuine accessibility can coexist.

### Architecture

Every demo follows a **dual-layer pattern**:

- **Semantic layer** — all meaningful content exists as proper HTML (headings, paragraphs, blockquotes, lists), readable by screen readers, find-in-page, browser translation, and reader mode.
- **Visual layer** — the Pretext-powered positioned layout is marked `aria-hidden="true"`, so assistive technologies skip it entirely and read the semantic content instead.

### What was done

| Demo | Enhancements |
|------|-------------|
| **Editorial Engine** | Full semantic article, three view modes (Visual/Article/Split), native orb controls via sliders and buttons, `prefers-reduced-motion` support, skip link, landmarks, live region announcements |
| **Dynamic Layout** | Semantic article with full body copy, view toggle, visual stage hidden from AT, scroll fix for article mode |
| **Accordion** | `aria-controls` linking buttons to panels, `role="region"` with `aria-labelledby`, `aria-hidden` on collapsed panels, `:focus-visible` outlines |
| **Bubbles** | Speaker identification (Sent/Received labels), `role="log"` on chat containers, proper `<label>` on slider, sr-only text prefixes |
| **Rich Note** | Semantic note text for screen readers, positioned fragments hidden from AT, proper slider label |
| **Masonry** | Full HTML document structure, sr-only heading, semantic `<ul>` with all card texts, visual container hidden from AT |
| **Variable Typographic ASCII** | `role="img"` with descriptive labels on art panels, contrast fixes, reduced-motion CSS |

### Across all demos

- **`:focus-visible`** outlines on every interactive element
- **WCAG AA contrast** on all essential text
- **`prefers-reduced-motion`** respected where animation exists
- **"Accessibility in this demo"** explanation section on every demo page
- **Accessibility overview** on the demos index page

### Progressive enhancement: works without JavaScript

Pretext is a JavaScript library, so it would be easy to assume these demos are useless without JS. We made sure that's not the case. Every demo follows a progressive enhancement strategy where content is accessible even when JavaScript is unavailable:

- **Content-first defaults.** Pages default to showing readable content. Visual stages are hidden until JavaScript adds the appropriate view class. Without JS, you get the article — not a blank page.
- **Pre-populated HTML.** Where possible, content lives directly in the HTML source (accordion section titles and body text, chat messages in bubbles) rather than being injected by JavaScript. Crawlers, reader modes, and text browsers see real content immediately.
- **Graceful degradation.** The accordion defaults to all sections expanded when JS can't run the collapse logic. Sliders and view toggles are inert without JS, but the content they control is already visible.
- **`<noscript>` fallbacks.** Every demo that depends on JavaScript for rendering includes a `<noscript>` message explaining what the demo does and, where applicable, linking to original source material.

This matters because accessibility extends beyond screen readers. Content should reach people regardless of how they access the web — whether that's a full browser, a text terminal like Lynx, a translation service, a browser reader mode, or a search engine indexing the page.

### The principle

Pretext's core job is DOM-free text measurement. Accessibility depends on how you expose content and interaction around it. The semantic DOM is the source of truth for reading; the visual engine is a progressive enhancement on top. This fork demonstrates that pattern across every layout archetype: editorial, chat, accordion, masonry, rich text, and generative art.

## Develop

See [DEVELOPMENT.md](DEVELOPMENT.md) for the dev setup and commands.

## Credits

Sebastian Markbage first planted the seed with [text-layout](https://github.com/chenglou/text-layout) last decade. His design — canvas `measureText` for shaping, bidi from pdf.js, streaming line breaking — informed the architecture we kept pushing forward here.

All accessibility enhancements by [Marco van Hylckama Vlieg](https://ai-created.com) — [@AIandDesign](https://x.com/AIandDesign)
