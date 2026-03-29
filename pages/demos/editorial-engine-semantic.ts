import {
  HEADLINE_TEXT,
  BODY_PARAGRAPHS,
  PULLQUOTE_TEXTS,
  PULLQUOTE_AFTER_PARAGRAPH,
} from './editorial-engine-content.ts'

export function renderArticle(mount: HTMLElement): void {
  mount.textContent = '' // Clear pre-populated HTML fallback
  const h1 = document.createElement('h2')
  h1.textContent = HEADLINE_TEXT
  h1.id = 'article-headline'
  h1.className = 'article-headline'
  mount.appendChild(h1)

  let pullquoteIndex = 0
  for (let i = 0; i < BODY_PARAGRAPHS.length; i++) {
    const p = document.createElement('p')
    p.textContent = BODY_PARAGRAPHS[i]!
    mount.appendChild(p)

    if (pullquoteIndex < PULLQUOTE_AFTER_PARAGRAPH.length && i === PULLQUOTE_AFTER_PARAGRAPH[pullquoteIndex]) {
      const bq = document.createElement('blockquote')
      bq.textContent = PULLQUOTE_TEXTS[pullquoteIndex]!
      mount.appendChild(bq)
      pullquoteIndex++
    }
  }
}
