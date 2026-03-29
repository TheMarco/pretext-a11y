import {
  layoutNextLine,
  layoutWithLines,
  prepareWithSegments,
  walkLineRanges,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '../../src/layout.ts'

import {
  BODY_TEXT,
  BODY_FONT,
  BODY_LINE_HEIGHT,
  HEADLINE_TEXT,
  HEADLINE_FONT_FAMILY,
  PULLQUOTE_TEXTS,
  ORB_DEFS,
  type OrbColor,
} from './editorial-engine-content.ts'

import { renderArticle } from './editorial-engine-semantic.ts'
import {
  initControls,
  setViewMode,
  syncOrbSliders,
  type ViewMode,
} from './editorial-engine-controls.ts'

// ── Constants ──

const GUTTER = 48
const COL_GAP = 40
const BOTTOM_GAP = 20
const DROP_CAP_LINES = 3
const MIN_SLOT_WIDTH = 50
const NARROW_BREAKPOINT = 760
const NARROW_GUTTER = 20
const NARROW_COL_GAP = 20
const NARROW_BOTTOM_GAP = 16
const NARROW_ORB_SCALE = 0.58
const NARROW_ACTIVE_ORBS = 3

// ── Types ──

type Interval = {
  left: number
  right: number
}

type PositionedLine = {
  x: number
  y: number
  width: number
  text: string
}

type CircleObstacle = {
  cx: number
  cy: number
  r: number
  hPad: number
  vPad: number
}

type RectObstacle = {
  x: number
  y: number
  w: number
  h: number
}

type PullquotePlacement = {
  colIdx: number
  yFrac: number
  wFrac: number
  side: 'left' | 'right'
}

type PullquoteRect = RectObstacle & {
  lines: PositionedLine[]
  colIdx: number
}

type Orb = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  paused: boolean
}

type HeadlineFit = {
  fontSize: number
  lines: PositionedLine[]
}

type PullquoteSpec = {
  prepared: PreparedTextWithSegments
  placement: PullquotePlacement
}

type PointerSample = {
  x: number
  y: number
}

type PointerState = {
  x: number
  y: number
}

type DragState = {
  orbIndex: number
  startPointerX: number
  startPointerY: number
  startOrbX: number
  startOrbY: number
}

type InteractionMode = 'idle' | 'text-select'

type AppState = {
  orbs: Orb[]
  pointer: PointerState
  drag: DragState | null
  interactionMode: InteractionMode
  selectionActive: boolean
  events: {
    pointerDown: PointerSample | null
    pointerMove: PointerSample | null
    pointerUp: PointerSample | null
  }
  lastFrameTime: number | null
  viewMode: ViewMode
}

// ── Helpers ──

function getRequiredDiv(id: string): HTMLDivElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLDivElement)) throw new Error(`#${id} not found`)
  return element
}

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots = [base]
  for (let blockedIndex = 0; blockedIndex < blocked.length; blockedIndex++) {
    const interval = blocked[blockedIndex]!
    const next: Interval[] = []
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]!
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot)
        continue
      }
      if (interval.left > slot.left) next.push({ left: slot.left, right: interval.left })
      if (interval.right < slot.right) next.push({ left: interval.right, right: slot.right })
    }
    slots = next
  }
  return slots.filter(slot => slot.right - slot.left >= MIN_SLOT_WIDTH)
}

function circleIntervalForBand(
  cx: number,
  cy: number,
  r: number,
  bandTop: number,
  bandBottom: number,
  hPad: number,
  vPad: number,
): Interval | null {
  const top = bandTop - vPad
  const bottom = bandBottom + vPad
  if (top >= cy + r || bottom <= cy - r) return null
  const minDy = cy >= top && cy <= bottom ? 0 : cy < top ? top - cy : cy - bottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - hPad, right: cx + maxDx + hPad }
}

// ── Semantic layer ──

const articleMount = document.getElementById('article-content')
if (articleMount) renderArticle(articleMount)

// ── Reduced motion ──

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const prefersReducedMotion = reduceMotion.matches

// ── Visual stage setup ──

const stage = getRequiredDiv('stage')

function createOrbEl(color: OrbColor): HTMLDivElement {
  const element = document.createElement('div')
  element.className = 'orb'
  element.style.background = `radial-gradient(circle at 35% 35%, rgba(${color[0]},${color[1]},${color[2]},0.35), rgba(${color[0]},${color[1]},${color[2]},0.12) 55%, transparent 72%)`
  element.style.boxShadow = `0 0 60px 15px rgba(${color[0]},${color[1]},${color[2]},0.18), 0 0 120px 40px rgba(${color[0]},${color[1]},${color[2]},0.07)`
  stage.appendChild(element)
  return element
}

const W0 = window.innerWidth
const H0 = window.innerHeight

await document.fonts.ready

const preparedBody = prepareWithSegments(BODY_TEXT, BODY_FONT)
const PQ_FONT = `italic 19px ${HEADLINE_FONT_FAMILY}`
const PQ_LINE_HEIGHT = 27
const preparedPullquotes = PULLQUOTE_TEXTS.map(text => prepareWithSegments(text, PQ_FONT))
const pullquoteSpecs: PullquoteSpec[] = [
  { prepared: preparedPullquotes[0]!, placement: { colIdx: 0, yFrac: 0.48, wFrac: 0.52, side: 'right' } },
  { prepared: preparedPullquotes[1]!, placement: { colIdx: 1, yFrac: 0.32, wFrac: 0.5, side: 'left' } },
]
const DROP_CAP_SIZE = BODY_LINE_HEIGHT * DROP_CAP_LINES - 4
const DROP_CAP_FONT = `700 ${DROP_CAP_SIZE}px ${HEADLINE_FONT_FAMILY}`
const DROP_CAP_TEXT = BODY_TEXT[0]!
const preparedDropCap = prepareWithSegments(DROP_CAP_TEXT, DROP_CAP_FONT)

let dropCapWidth = 0
walkLineRanges(preparedDropCap, 9999, line => {
  dropCapWidth = line.width
})
const DROP_CAP_TOTAL_W = Math.ceil(dropCapWidth) + 10

const dropCapEl = document.createElement('div')
dropCapEl.className = 'drop-cap'
dropCapEl.textContent = DROP_CAP_TEXT
dropCapEl.style.font = DROP_CAP_FONT
dropCapEl.style.lineHeight = `${DROP_CAP_SIZE}px`
stage.appendChild(dropCapEl)

const linePool: HTMLDivElement[] = []
const headlinePool: HTMLDivElement[] = []
const pullquoteLinePool: HTMLDivElement[] = []
const pullquoteBoxPool: HTMLDivElement[] = []
const domCache = {
  stage,
  dropCap: dropCapEl,
  bodyLines: linePool,
  headlineLines: headlinePool,
  pullquoteLines: pullquoteLinePool,
  pullquoteBoxes: pullquoteBoxPool,
  orbs: ORB_DEFS.map(definition => createOrbEl(definition.color)),
}

const st: AppState = {
  orbs: ORB_DEFS.map(definition => ({
    x: definition.fx * W0,
    y: definition.fy * H0,
    r: definition.r,
    vx: definition.vx,
    vy: definition.vy,
    paused: prefersReducedMotion,
  })),
  pointer: { x: -9999, y: -9999 },
  drag: null,
  interactionMode: 'idle',
  selectionActive: false,
  events: {
    pointerDown: null,
    pointerMove: null,
    pointerUp: null,
  },
  lastFrameTime: null,
  viewMode: prefersReducedMotion ? 'article' : 'visual',
}

// ── Controls wiring ──

setViewMode(st.viewMode)
// Sync the pressed state for the initial view mode
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(btn => {
  btn.setAttribute('aria-pressed', btn.dataset['view'] === st.viewMode ? 'true' : 'false')
})
if (prefersReducedMotion) {
  const motionBtn = document.getElementById('toggle-motion')
  if (motionBtn) {
    motionBtn.setAttribute('aria-pressed', 'true')
    motionBtn.textContent = 'Resume all motion'
  }
}

initControls({
  onViewModeChange(mode: ViewMode) {
    st.viewMode = mode
    setViewMode(mode)
    scheduleRender()
  },
  onOrbPositionChange(index: number, xPct: number, yPct: number) {
    const orb = st.orbs[index]
    if (!orb) return
    orb.x = xPct * window.innerWidth
    orb.y = yPct * window.innerHeight
    scheduleRender()
  },
  onOrbPauseToggle(index: number) {
    const orb = st.orbs[index]
    if (!orb) return
    orb.paused = !orb.paused
    scheduleRender()
  },
  onOrbReset(index: number) {
    const def = ORB_DEFS[index]
    const orb = st.orbs[index]
    if (!def || !orb) return
    orb.x = def.fx * window.innerWidth
    orb.y = def.fy * window.innerHeight
    orb.vx = def.vx
    orb.vy = def.vy
    orb.paused = false
    scheduleRender()
  },
  onToggleAllMotion() {
    const anyMoving = st.orbs.some(o => !o.paused)
    for (const orb of st.orbs) orb.paused = anyMoving
    scheduleRender()
  },
})

// ── DOM pool ──

function syncPool(pool: HTMLDivElement[], count: number, className: string): void {
  while (pool.length < count) {
    const element = document.createElement('div')
    element.className = className
    stage.appendChild(element)
    pool.push(element)
  }
  for (let index = 0; index < pool.length; index++) {
    pool[index]!.style.display = index < count ? '' : 'none'
  }
}

// ── Headline fitting ──

let cachedHeadlineWidth = -1
let cachedHeadlineHeight = -1
let cachedHeadlineMaxSize = -1
let cachedHeadlineFontSize = 24
let cachedHeadlineLines: PositionedLine[] = []

function fitHeadline(maxWidth: number, maxHeight: number, maxSize: number = 92): HeadlineFit {
  if (maxWidth === cachedHeadlineWidth && maxHeight === cachedHeadlineHeight && maxSize === cachedHeadlineMaxSize) {
    return { fontSize: cachedHeadlineFontSize, lines: cachedHeadlineLines }
  }

  cachedHeadlineWidth = maxWidth
  cachedHeadlineHeight = maxHeight
  cachedHeadlineMaxSize = maxSize
  let lo = 20
  let hi = maxSize
  let best = lo
  let bestLines: PositionedLine[] = []

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2)
    const font = `700 ${size}px ${HEADLINE_FONT_FAMILY}`
    const lineHeight = Math.round(size * 0.93)
    const prepared = prepareWithSegments(HEADLINE_TEXT, font)
    let breaksWord = false
    let lineCount = 0

    walkLineRanges(prepared, maxWidth, line => {
      lineCount++
      if (line.end.graphemeIndex !== 0) breaksWord = true
    })

    const totalHeight = lineCount * lineHeight
    if (!breaksWord && totalHeight <= maxHeight) {
      best = size
      const result = layoutWithLines(prepared, maxWidth, lineHeight)
      bestLines = result.lines.map((line, index) => ({
        x: 0,
        y: index * lineHeight,
        text: line.text,
        width: line.width,
      }))
      lo = size + 1
    } else {
      hi = size - 1
    }
  }

  cachedHeadlineFontSize = best
  cachedHeadlineLines = bestLines
  return { fontSize: best, lines: bestLines }
}

// ── Column layout ──

function layoutColumn(
  prepared: PreparedTextWithSegments,
  startCursor: LayoutCursor,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
  lineHeight: number,
  circleObstacles: CircleObstacle[],
  rectObstacles: RectObstacle[],
  singleSlotOnly: boolean = false,
): { lines: PositionedLine[], cursor: LayoutCursor } {
  let cursor: LayoutCursor = startCursor
  let lineTop = regionY
  const lines: PositionedLine[] = []
  let textExhausted = false

  while (lineTop + lineHeight <= regionY + regionH && !textExhausted) {
    const bandTop = lineTop
    const bandBottom = lineTop + lineHeight
    const blocked: Interval[] = []

    for (let obstacleIndex = 0; obstacleIndex < circleObstacles.length; obstacleIndex++) {
      const obstacle = circleObstacles[obstacleIndex]!
      const interval = circleIntervalForBand(
        obstacle.cx,
        obstacle.cy,
        obstacle.r,
        bandTop,
        bandBottom,
        obstacle.hPad,
        obstacle.vPad,
      )
      if (interval !== null) blocked.push(interval)
    }

    for (let rectIndex = 0; rectIndex < rectObstacles.length; rectIndex++) {
      const rect = rectObstacles[rectIndex]!
      if (bandBottom <= rect.y || bandTop >= rect.y + rect.h) continue
      blocked.push({ left: rect.x, right: rect.x + rect.w })
    }

    const slots = carveTextLineSlots({ left: regionX, right: regionX + regionW }, blocked)
    if (slots.length === 0) {
      lineTop += lineHeight
      continue
    }

    const orderedSlots = singleSlotOnly
      ? [slots.reduce((best, slot) => {
          const bestWidth = best.right - best.left
          const slotWidth = slot.right - slot.left
          if (slotWidth > bestWidth) return slot
          if (slotWidth < bestWidth) return best
          return slot.left < best.left ? slot : best
        })]
      : [...slots].sort((a, b) => a.left - b.left)

    for (let slotIndex = 0; slotIndex < orderedSlots.length; slotIndex++) {
      const slot = orderedSlots[slotIndex]!
      const slotWidth = slot.right - slot.left
      const line = layoutNextLine(prepared, cursor, slotWidth)
      if (line === null) {
        textExhausted = true
        break
      }
      lines.push({
        x: Math.round(slot.left),
        y: Math.round(lineTop),
        text: line.text,
        width: line.width,
      })
      cursor = line.end
    }

    lineTop += lineHeight
  }

  return { lines, cursor }
}

// ── Interaction ──

function hitTestOrbs(orbs: Orb[], px: number, py: number, activeCount: number, radiusScale: number): number {
  for (let index = activeCount - 1; index >= 0; index--) {
    const orb = orbs[index]!
    const radius = orb.r * radiusScale
    const dx = px - orb.x
    const dy = py - orb.y
    if (dx * dx + dy * dy <= radius * radius) return index
  }
  return -1
}

function pointerSampleFromEvent(event: PointerEvent): PointerSample {
  return { x: event.clientX, y: event.clientY }
}

function isSelectableTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.line, .headline-line, .pullquote-line') !== null
}

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0
}

function clearQueuedPointerEvents(): void {
  st.events.pointerDown = null
  st.events.pointerMove = null
  st.events.pointerUp = null
}

function enterTextSelectionMode(): void {
  st.interactionMode = 'text-select'
  clearQueuedPointerEvents()
  st.lastFrameTime = null
  domCache.stage.style.userSelect = ''
  domCache.stage.style.webkitUserSelect = ''
  document.body.style.cursor = ''
}

function syncSelectionState(): void {
  st.selectionActive = hasActiveTextSelection()
  if (st.selectionActive) {
    enterTextSelectionMode()
  } else if (st.interactionMode === 'text-select' && st.drag === null) {
    st.interactionMode = 'idle'
  }
}

function isTextSelectionInteractionActive(): boolean {
  return st.interactionMode === 'text-select' || st.selectionActive
}

let scheduledRaf: number | null = null
function scheduleRender(): void {
  if (scheduledRaf !== null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleEditorialFrame(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

stage.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch' && isSelectableTextTarget(event.target)) {
    enterTextSelectionMode()
    return
  }

  const activeOrbCount = window.innerWidth < NARROW_BREAKPOINT ? NARROW_ACTIVE_ORBS : st.orbs.length
  const radiusScale = window.innerWidth < NARROW_BREAKPOINT ? NARROW_ORB_SCALE : 1
  const hitOrbIndex = hitTestOrbs(st.orbs, event.clientX, event.clientY, activeOrbCount, radiusScale)
  if (hitOrbIndex !== -1) {
    event.preventDefault()
  } else if (event.pointerType === 'touch' && st.selectionActive) {
    enterTextSelectionMode()
    return
  }
  st.events.pointerDown = pointerSampleFromEvent(event)
  scheduleRender()
})

stage.addEventListener('touchmove', event => {
  if (isTextSelectionInteractionActive()) return
  event.preventDefault()
}, { passive: false })

window.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' && isTextSelectionInteractionActive() && st.drag === null) return
  st.events.pointerMove = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('pointerup', event => {
  if (event.pointerType === 'touch' && isTextSelectionInteractionActive() && st.drag === null) {
    syncSelectionState()
    return
  }
  if (event.pointerType === 'touch') syncSelectionState()
  st.events.pointerUp = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('pointercancel', event => {
  if (event.pointerType === 'touch') syncSelectionState()
  st.events.pointerUp = pointerSampleFromEvent(event)
  scheduleRender()
})

window.addEventListener('resize', () => scheduleRender())
document.addEventListener('selectionchange', () => {
  syncSelectionState()
  scheduleRender()
})

// ── Render ──

function render(now: number): boolean {
  // Skip stage rendering in article-only mode
  if (st.viewMode === 'article') return false

  if (isTextSelectionInteractionActive() && st.drag === null) {
    return false
  }

  const pageWidth = document.documentElement.clientWidth
  const pageHeight = document.documentElement.clientHeight
  const isNarrow = pageWidth < NARROW_BREAKPOINT
  const gutter = isNarrow ? NARROW_GUTTER : GUTTER
  const colGap = isNarrow ? NARROW_COL_GAP : COL_GAP
  const bottomGap = isNarrow ? NARROW_BOTTOM_GAP : BOTTOM_GAP
  const orbRadiusScale = isNarrow ? NARROW_ORB_SCALE : 1
  const activeOrbCount = isNarrow ? Math.min(NARROW_ACTIVE_ORBS, st.orbs.length) : st.orbs.length
  const orbs = st.orbs

  // Account for the header bar in visual/split modes
  const headerEl = document.querySelector('.demo-header')
  const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0
  const stageHeight = pageHeight - headerHeight

  let pointer = st.pointer
  let drag = st.drag
  if (st.events.pointerDown !== null) {
    const down = st.events.pointerDown
    pointer = down
    if (drag === null) {
      const orbIndex = hitTestOrbs(orbs, down.x, down.y, activeOrbCount, orbRadiusScale)
      if (orbIndex !== -1) {
        const orb = orbs[orbIndex]!
        drag = {
          orbIndex,
          startPointerX: down.x,
          startPointerY: down.y,
          startOrbX: orb.x,
          startOrbY: orb.y,
        }
      }
    }
  }

  if (st.events.pointerMove !== null) {
    const move = st.events.pointerMove
    pointer = move
    if (drag !== null) {
      const orb = orbs[drag.orbIndex]!
      orb.x = drag.startOrbX + (move.x - drag.startPointerX)
      orb.y = drag.startOrbY + (move.y - drag.startPointerY)
    }
  }

  if (st.events.pointerUp !== null) {
    const up = st.events.pointerUp
    pointer = up
    if (drag !== null) {
      const dx = up.x - drag.startPointerX
      const dy = up.y - drag.startPointerY
      const orb = orbs[drag.orbIndex]!
      if (dx * dx + dy * dy < 16) {
        orb.paused = !orb.paused
      } else {
        orb.x = drag.startOrbX + dx
        orb.y = drag.startOrbY + dy
      }
      drag = null
    }
  }

  const draggedOrbIndex = drag?.orbIndex ?? -1
  const lastFrameTime = st.lastFrameTime ?? now
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05)
  let stillAnimating = false

  for (let index = 0; index < orbs.length; index++) {
    if (index >= activeOrbCount) continue
    const orb = orbs[index]!
    const radius = orb.r * orbRadiusScale
    if (orb.paused || index === draggedOrbIndex) continue
    stillAnimating = true
    orb.x += orb.vx * dt
    orb.y += orb.vy * dt

    if (orb.x - radius < 0) {
      orb.x = radius
      orb.vx = Math.abs(orb.vx)
    }
    if (orb.x + radius > pageWidth) {
      orb.x = pageWidth - radius
      orb.vx = -Math.abs(orb.vx)
    }
    if (orb.y - radius < gutter * 0.5) {
      orb.y = radius + gutter * 0.5
      orb.vy = Math.abs(orb.vy)
    }
    if (orb.y + radius > pageHeight - bottomGap) {
      orb.y = pageHeight - bottomGap - radius
      orb.vy = -Math.abs(orb.vy)
    }
  }

  for (let index = 0; index < activeOrbCount; index++) {
    const a = orbs[index]!
    const aRadius = a.r * orbRadiusScale
    for (let otherIndex = index + 1; otherIndex < activeOrbCount; otherIndex++) {
      const b = orbs[otherIndex]!
      const bRadius = b.r * orbRadiusScale
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const minDist = aRadius + bRadius + (isNarrow ? 12 : 20)
      if (dist >= minDist || dist <= 0.1) continue

      const force = (minDist - dist) * 0.8
      const nx = dx / dist
      const ny = dy / dist

      if (!a.paused && index !== draggedOrbIndex) {
        a.vx -= nx * force * dt
        a.vy -= ny * force * dt
      }
      if (!b.paused && otherIndex !== draggedOrbIndex) {
        b.vx += nx * force * dt
        b.vy += ny * force * dt
      }
    }
  }

  const circleObstacles: CircleObstacle[] = []
  for (let index = 0; index < activeOrbCount; index++) {
    const orb = orbs[index]!
    circleObstacles.push({
      cx: orb.x,
      cy: orb.y,
      r: orb.r * orbRadiusScale,
      hPad: isNarrow ? 10 : 14,
      vPad: isNarrow ? 2 : 4,
    })
  }

  const stageW = st.viewMode === 'split' ? pageWidth * 0.62 : pageWidth
  const headlineWidth = Math.min(stageW - gutter * 2 - (isNarrow ? 12 : 0), 1000)
  const maxHeadlineHeight = Math.floor(stageHeight * (isNarrow ? 0.2 : 0.24))
  const { fontSize: headlineSize, lines: headlineLines } = fitHeadline(
    headlineWidth,
    maxHeadlineHeight,
    isNarrow ? 38 : 92,
  )
  const headlineLineHeight = Math.round(headlineSize * 0.93)
  const headlineFont = `700 ${headlineSize}px ${HEADLINE_FONT_FAMILY}`
  const headlineHeight = headlineLines.length * headlineLineHeight

  const bodyTop = gutter + headlineHeight + (isNarrow ? 14 : 20)
  const bodyHeight = stageHeight - bodyTop - bottomGap
  const columnCount = stageW > 1000 ? 3 : stageW > 640 ? 2 : 1
  const totalGutter = gutter * 2 + colGap * (columnCount - 1)
  const maxContentWidth = Math.min(stageW, 1500)
  const columnWidth = Math.floor((maxContentWidth - totalGutter) / columnCount)
  const contentLeft = Math.round((stageW - (columnCount * columnWidth + (columnCount - 1) * colGap)) / 2)
  const column0X = contentLeft
  const dropCapRect: RectObstacle = {
    x: column0X - 2,
    y: bodyTop - 2,
    w: DROP_CAP_TOTAL_W,
    h: DROP_CAP_LINES * BODY_LINE_HEIGHT + 2,
  }

  const pullquoteRects: PullquoteRect[] = []
  for (let index = 0; index < pullquoteSpecs.length; index++) {
    if (isNarrow) break
    const { prepared, placement } = pullquoteSpecs[index]!
    if (placement.colIdx >= columnCount) continue

    const pullquoteWidth = Math.round(columnWidth * placement.wFrac)
    const pullquoteLines = layoutWithLines(prepared, pullquoteWidth - 20, PQ_LINE_HEIGHT).lines
    const pullquoteHeight = pullquoteLines.length * PQ_LINE_HEIGHT + 16
    const columnX = contentLeft + placement.colIdx * (columnWidth + colGap)
    const pullquoteX = placement.side === 'right' ? columnX + columnWidth - pullquoteWidth : columnX
    const pullquoteY = Math.round(bodyTop + bodyHeight * placement.yFrac)
    const positionedLines = pullquoteLines.map((line, lineIndex) => ({
      x: pullquoteX + 20,
      y: pullquoteY + 8 + lineIndex * PQ_LINE_HEIGHT,
      text: line.text,
      width: line.width,
    }))

    pullquoteRects.push({
      x: pullquoteX,
      y: pullquoteY,
      w: pullquoteWidth,
      h: pullquoteHeight,
      lines: positionedLines,
      colIdx: placement.colIdx,
    })
  }

  const allBodyLines: PositionedLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 1 }
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
    const columnX = contentLeft + columnIndex * (columnWidth + colGap)
    const rects: RectObstacle[] = []
    if (columnIndex === 0) rects.push(dropCapRect)
    for (let rectIndex = 0; rectIndex < pullquoteRects.length; rectIndex++) {
      const pullquote = pullquoteRects[rectIndex]!
      if (pullquote.colIdx !== columnIndex) continue
      rects.push({ x: pullquote.x, y: pullquote.y, w: pullquote.w, h: pullquote.h })
    }

    const result = layoutColumn(
      preparedBody,
      cursor,
      columnX,
      bodyTop,
      columnWidth,
      bodyHeight,
      BODY_LINE_HEIGHT,
      circleObstacles,
      rects,
      isNarrow,
    )
    allBodyLines.push(...result.lines)
    cursor = result.cursor
  }

  let totalPullquoteLines = 0
  for (let index = 0; index < pullquoteRects.length; index++) totalPullquoteLines += pullquoteRects[index]!.lines.length

  const hoveredOrbIndex = hitTestOrbs(orbs, pointer.x, pointer.y, activeOrbCount, orbRadiusScale)
  const cursorStyle = drag !== null ? 'grabbing' : hoveredOrbIndex !== -1 ? 'grab' : ''

  st.pointer = pointer
  st.drag = drag
  st.events.pointerDown = null
  st.events.pointerMove = null
  st.events.pointerUp = null
  st.lastFrameTime = stillAnimating ? now : null

  // Sync slider positions with animated orbs
  syncOrbSliders(st.orbs)

  syncPool(domCache.headlineLines, headlineLines.length, 'headline-line')
  for (let index = 0; index < headlineLines.length; index++) {
    const element = domCache.headlineLines[index]!
    const line = headlineLines[index]!
    element.textContent = line.text
    element.style.left = `${gutter}px`
    element.style.top = `${gutter + line.y}px`
    element.style.font = headlineFont
    element.style.lineHeight = `${headlineLineHeight}px`
  }

  domCache.dropCap.style.left = `${column0X}px`
  domCache.dropCap.style.top = `${bodyTop}px`

  syncPool(domCache.bodyLines, allBodyLines.length, 'line')
  for (let index = 0; index < allBodyLines.length; index++) {
    const element = domCache.bodyLines[index]!
    const line = allBodyLines[index]!
    element.textContent = line.text
    element.style.left = `${line.x}px`
    element.style.top = `${line.y}px`
    element.style.font = BODY_FONT
    element.style.lineHeight = `${BODY_LINE_HEIGHT}px`
  }

  syncPool(domCache.pullquoteBoxes, pullquoteRects.length, 'pullquote-box')
  syncPool(domCache.pullquoteLines, totalPullquoteLines, 'pullquote-line')

  let pullquoteLineIndex = 0
  for (let index = 0; index < pullquoteRects.length; index++) {
    const pullquote = pullquoteRects[index]!
    const boxElement = domCache.pullquoteBoxes[index]!
    boxElement.style.left = `${pullquote.x}px`
    boxElement.style.top = `${pullquote.y}px`
    boxElement.style.width = `${pullquote.w}px`
    boxElement.style.height = `${pullquote.h}px`

    for (let lineIndex = 0; lineIndex < pullquote.lines.length; lineIndex++) {
      const element = domCache.pullquoteLines[pullquoteLineIndex]!
      const line = pullquote.lines[lineIndex]!
      element.textContent = line.text
      element.style.left = `${line.x}px`
      element.style.top = `${line.y}px`
      element.style.font = PQ_FONT
      element.style.lineHeight = `${PQ_LINE_HEIGHT}px`
      pullquoteLineIndex++
    }
  }

  for (let index = 0; index < orbs.length; index++) {
    const orb = orbs[index]!
    const element = domCache.orbs[index]!
    if (index >= activeOrbCount) {
      element.style.display = 'none'
      continue
    }
    const radius = orb.r * orbRadiusScale
    element.style.display = ''
    element.style.left = `${orb.x - radius}px`
    element.style.top = `${orb.y - radius}px`
    element.style.width = `${radius * 2}px`
    element.style.height = `${radius * 2}px`
    element.style.opacity = orb.paused ? '0.45' : '1'
  }

  domCache.stage.style.userSelect = drag !== null ? 'none' : ''
  domCache.stage.style.webkitUserSelect = drag !== null ? 'none' : ''
  document.body.style.cursor = cursorStyle

  // Set stage height to viewport minus header
  stage.style.height = `${stageHeight}px`

  return stillAnimating
}

scheduleRender()
