# I Made Pretext Accessible. Here's Why That Matters More Than You Think.

This weekend, my entire feed was buzzing about [Pretext](https://github.com/chenglou/pretext) — a tiny JavaScript library that measures and lays out text without ever touching the DOM. No layout reflow. No `getBoundingClientRect`. Pure arithmetic over cached font metrics. The demos are genuinely stunning: text flowing around animated orbs in real time, multi-column editorial layouts with obstacle-aware reflow, shrinkwrap bubbles that CSS literally cannot produce. Fifteen kilobytes, zero dependencies, and the text flows.

I was impressed. And then the old-school web developer in me kicked in.

"I bet that's not accessible. And I bet search engines can't see any of it."

I was right on both counts.

## The Problem Nobody Was Talking About

Open any of Pretext's original demos in a screen reader and you get... nothing. The editorial engine demo — the flagship, the one everyone was sharing — renders its entire article as hundreds of absolutely-positioned `<div>` elements inside a single `<div id="stage">`. No headings. No paragraphs. No landmarks. No ARIA. The HTML body is literally:

```html
<div id="stage"></div>
<div class="hint">Drag the orbs · Click to pause · Zero DOM reads</div>
```

That's it. That's what a screen reader sees. That's what a search engine indexes. That's what shows up in Lynx, in browser reader mode, in a translation service, in an RSS reader. A blank page with a hint about dragging orbs.

The irony is painful: a library that exists to make text layout better on the web was making text completely invisible to a significant portion of the web's users and infrastructure.

## The Old-School Principle Everyone Forgot

There was a time when every web developer understood a foundational principle: **separation of concerns**. HTML for content and structure. CSS for presentation. JavaScript for behavior. Your page should make sense with just the HTML. CSS makes it look good. JavaScript makes it interactive. Each layer enhances the previous one. Take any layer away and the content still works.

This principle has been all but abandoned by modern web development. React renders everything. Next.js hydrates everything. Content lives in JavaScript state objects and gets injected into empty `<div>` shells. The HTML document — the actual thing that browsers, crawlers, screen readers, and text terminals consume — is treated as a container for JavaScript to fill, not as a meaningful document in its own right.

Pretext's demos are an extreme example of this pattern. The article text exists as a JavaScript string constant. It gets measured by canvas, split into line fragments by the layout engine, and rendered as positioned elements. The result looks incredible in a browser. But the HTML document itself contains nothing.

I wanted to prove that you don't have to choose. You can have the stunning visual layout AND the semantic HTML. You can have the animated orbs AND the screen reader support. You can have the DOM-free measurement AND the search engine indexability.

## What I Actually Did

I forked the repo and systematically made every demo accessible. The core architectural pattern is what I call **dual-layer rendering**:

1. **Semantic layer**: the actual content exists as proper HTML — `<article>`, `<h1>`, `<p>`, `<blockquote>`, `<ul>`. This is what screen readers read, what search engines index, what browser reader mode extracts, what Lynx displays.

2. **Visual layer**: Pretext's positioned layout fragments are marked `aria-hidden="true"`. Screen readers skip them entirely. The visual engine does its thing — it just doesn't pretend to be the content.

Same content. Two representations. The semantic one is the source of truth. The visual one is the enhancement.

### The Editorial Engine: The Hard One

The editorial engine was the real test. It has:
- A 30-paragraph article rendered as positioned line fragments
- Five animated orbs acting as obstacles
- Two pull quotes interrupting the column flow
- A drop cap
- Multi-column layout with cursor handoff
- Pointer-only interaction (drag to move orbs, click to pause)

I rebuilt it with:
- The full article as semantic HTML (`<h2>`, `<p>`, `<blockquote>`) in a reading pane
- Three view modes: Visual (the original experience), Article (the readable version), Split (both side-by-side)
- Native `<input type="range">` sliders and `<button>` elements for every orb, replacing the pointer-only drag interaction with keyboard-equivalent controls
- `prefers-reduced-motion` support: users who prefer reduced motion start in Article view with all orbs paused
- A live region (`aria-live="polite"`) for status announcements like "Gold orb paused" and "View: Article"
- Skip link, proper landmarks, visible focus outlines, WCAG AA contrast

The visual stage still does exactly what it did before. The orbs still animate. The text still reflows. It's still impressive. But now there's a real article underneath it that anyone can read.

### The Other Demos

Every demo got the same treatment, scaled to its complexity:

**Dynamic Layout** — same dual-layer pattern. Full article pre-populated in the HTML. View toggle between visual and article modes.

**Accordion** — already had decent semantics (native buttons with `aria-expanded`), but I added `aria-controls`, `role="region"`, `aria-labelledby`, and pre-populated the section content in the HTML instead of injecting it with JS.

**Bubbles** — the chat messages were already in the DOM, but had no speaker identification. Added `role="log"` on chat containers, "Sent" / "Received" labels on each message, proper `<label>` on the width slider, and darkened the sent-message blue from `#0b84fe` to `#0b6fdb` to meet WCAG AA contrast.

**Rich Note** — added a semantic text version of the note alongside the positioned fragments, with a `<noscript>` fallback that uses `<strong>`, `<em>`, and `<code>` to preserve the rich text semantics.

**Masonry** — the original HTML didn't even have an `<html>` tag. Added full document structure, a screen-reader-only `<ul>` with all card texts, and a `<noscript>` fallback.

**Variable Typographic ASCII** — purely generative visual art, so no semantic content to extract. Added `role="img"` with descriptive `aria-description` on each panel, contrast fixes, and reduced-motion CSS.

## The No-JavaScript Revelation

Here's where things got interesting. After the initial accessibility pass, I started testing in Lynx — a text-only browser that doesn't execute JavaScript. And I realized the problem went deeper than screen readers.

The accordion showed empty buttons. The editorial engine showed nothing. The dynamic layout showed a title and a link to somewhere else. The masonry grid was completely blank.

All the content I'd carefully made accessible to screen readers was still being generated by JavaScript. Screen readers run in real browsers with full JS execution, so they were fine. But anything that doesn't execute JS — text browsers, search engine crawlers, RSS readers, translation tools, browser reader modes — still got nothing.

So I went back through every demo and **pre-populated the content directly in the HTML source**:

- The editorial engine now has all 30 paragraphs and both pull quotes in the HTML
- The dynamic layout embeds the full article excerpt
- The accordion pre-populates all section titles and body text
- The rich note includes its formatted text in a `<noscript>` block
- Every demo has a `<noscript>` fallback appropriate to its content type

The accordion defaults to all sections expanded without JS, using a CSS class pattern: sections are `height: auto` by default, and JavaScript adds a `.js-accordion` class that collapses them. The visual stages are hidden by default and only shown when JavaScript adds a view-mode class. Without JS, you get the content. With JS, you get the enhancement.

This is progressive enhancement. It's not new. It's not revolutionary. It's just... correct. And it's something almost nobody does anymore.

## The SEO Angle Nobody Considers

Here's the part that should concern anyone building with JavaScript-heavy rendering: **without these changes, none of the demo content would be indexed by any search engine**.

The original demos render all text via JavaScript into absolutely-positioned fragments. Search engine crawlers see empty markup. Google does execute JavaScript for indexing, but with delays, resource limits, and no guarantees. Bing and DuckDuckGo are less reliable with JS-rendered content. AI crawlers from ChatGPT, Perplexity, and Claude parse HTML directly.

With pre-populated HTML, all content is immediately available on first crawl. No JavaScript execution required. No rendering budget consumed. No indexing delays. The content is just... there, in the HTML, where it always should have been.

Accessibility and SEO are not separate concerns. They are the same principle: **content should exist as semantic HTML first, with visual enhancement layered on top**. A page that's accessible to screen readers is indexable by search engines. A page that works without JavaScript works for crawlers. A page with proper headings and landmarks has good content structure for both humans and machines.

## The Bigger Point

Pretext is a genuinely impressive library. The DOM-free text measurement model is sound. The performance characteristics are real. The visual results are beautiful. I'm not criticizing the library — I'm criticizing the assumption that visual rendering IS the content.

The web was built on a simple idea: documents are marked up with semantic structure, and user agents (browsers, screen readers, crawlers, text terminals) interpret that structure for their users. JavaScript can enhance the experience, but it shouldn't be the only way to access the content.

Somewhere along the way, we forgot this. We started building pages where JavaScript isn't the enhancement — it's the entire experience. The HTML document is an empty shell. The content exists only in memory, rendered into visual fragments that look great in a browser but are meaningless to anything else.

The fix isn't complicated. It's not even that much work. For every demo, the pattern is the same:

1. Put the content in the HTML
2. Let CSS style it
3. Let JavaScript enhance it
4. Mark the enhanced visual layer as decorative (`aria-hidden`)
5. Provide keyboard alternatives to pointer-only interactions
6. Respect user preferences (reduced motion, high contrast)
7. Add `<noscript>` fallbacks

That's it. That's the whole approach. It's the same thing we were taught in 2005. It still works. And it produces pages that are visually stunning AND accessible AND indexable AND work in a text terminal from 1992.

You can have both. You just have to want both.

---

*The accessible Pretext fork is at [github.com/TheMarco/pretext-a11y](https://github.com/TheMarco/pretext-a11y). The live demos are at [pretext-a11y.vercel.app](https://pretext-a11y.vercel.app).*

*All accessibility enhancements by [Marco van Hylckama Vlieg](https://ai-created.com) — [@AIandDesign](https://x.com/AIandDesign)*
