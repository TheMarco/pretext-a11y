import { ORB_DEFS } from './editorial-engine-content.ts'

export type ViewMode = 'visual' | 'article' | 'split'

export type ControlCallbacks = {
  onViewModeChange: (mode: ViewMode) => void
  onOrbPositionChange: (index: number, xPct: number, yPct: number) => void
  onOrbPauseToggle: (index: number) => void
  onOrbReset: (index: number) => void
  onToggleAllMotion: () => void
}

let statusEl: HTMLElement | null = null
let statusTimeout: ReturnType<typeof setTimeout> | null = null

function announce(message: string): void {
  if (!statusEl) return
  if (statusTimeout !== null) clearTimeout(statusTimeout)
  statusEl.textContent = ''
  statusTimeout = setTimeout(() => { statusEl!.textContent = message }, 60)
}

export function initControls(callbacks: ControlCallbacks): void {
  statusEl = document.getElementById('sr-status')

  // View mode buttons
  const viewButtons = document.querySelectorAll<HTMLButtonElement>('[data-view]')
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset['view'] as ViewMode
      viewButtons.forEach(b => b.setAttribute('aria-pressed', 'false'))
      btn.setAttribute('aria-pressed', 'true')
      callbacks.onViewModeChange(mode)
      announce(`View: ${mode}`)
    })
  })

  // Global motion toggle
  const motionBtn = document.getElementById('toggle-motion') as HTMLButtonElement | null
  if (motionBtn) {
    motionBtn.addEventListener('click', () => {
      callbacks.onToggleAllMotion()
      const allPaused = motionBtn.getAttribute('aria-pressed') === 'true'
      motionBtn.setAttribute('aria-pressed', allPaused ? 'false' : 'true')
      motionBtn.textContent = allPaused ? 'Pause all motion' : 'Resume all motion'
      announce(allPaused ? 'Animation resumed' : 'All motion paused')
    })
  }

  // Orb controls
  const orbControlsMount = document.getElementById('orb-controls')
  if (!orbControlsMount) return

  for (let i = 0; i < ORB_DEFS.length; i++) {
    const def = ORB_DEFS[i]!
    const fieldset = document.createElement('fieldset')
    const legend = document.createElement('legend')
    legend.textContent = `${def.name} orb`
    fieldset.appendChild(legend)

    const help = document.createElement('p')
    help.className = 'orb-control-help'
    help.textContent = 'Moves a decorative obstacle in the visual layout.'
    fieldset.appendChild(help)

    const xLabel = document.createElement('label')
    xLabel.htmlFor = `orb-${i}-x`
    xLabel.textContent = 'Horizontal'
    const xInput = document.createElement('input')
    xInput.type = 'range'
    xInput.id = `orb-${i}-x`
    xInput.min = '0'
    xInput.max = '100'
    xInput.value = String(Math.round(def.fx * 100))

    const yLabel = document.createElement('label')
    yLabel.htmlFor = `orb-${i}-y`
    yLabel.textContent = 'Vertical'
    const yInput = document.createElement('input')
    yInput.type = 'range'
    yInput.id = `orb-${i}-y`
    yInput.min = '0'
    yInput.max = '100'
    yInput.value = String(Math.round(def.fy * 100))

    function onSliderChange(): void {
      callbacks.onOrbPositionChange(i, Number(xInput.value) / 100, Number(yInput.value) / 100)
    }
    xInput.addEventListener('input', onSliderChange)
    yInput.addEventListener('input', onSliderChange)

    const pauseBtn = document.createElement('button')
    pauseBtn.type = 'button'
    pauseBtn.textContent = 'Pause'
    pauseBtn.addEventListener('click', () => {
      callbacks.onOrbPauseToggle(i)
      const nowPaused = pauseBtn.textContent === 'Pause'
      pauseBtn.textContent = nowPaused ? 'Resume' : 'Pause'
      announce(`${def.name} orb ${nowPaused ? 'paused' : 'resumed'}`)
    })

    const resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.textContent = 'Reset'
    resetBtn.addEventListener('click', () => {
      callbacks.onOrbReset(i)
      xInput.value = String(Math.round(def.fx * 100))
      yInput.value = String(Math.round(def.fy * 100))
      pauseBtn.textContent = 'Pause'
      announce(`${def.name} orb reset`)
    })

    fieldset.appendChild(xLabel)
    fieldset.appendChild(xInput)
    fieldset.appendChild(yLabel)
    fieldset.appendChild(yInput)
    fieldset.appendChild(pauseBtn)
    fieldset.appendChild(resetBtn)
    orbControlsMount.appendChild(fieldset)
  }
}

export function setViewMode(mode: ViewMode): void {
  document.body.classList.remove('view-visual', 'view-article', 'view-split')
  document.body.classList.add(`view-${mode}`)

  const stage = document.getElementById('stage')
  if (stage) {
    // In article-only mode, fully hide the stage
    if (mode === 'article') {
      stage.style.display = 'none'
    } else {
      stage.style.display = ''
    }
  }
}

export function syncOrbSliders(orbs: { x: number, y: number }[]): void {
  for (let i = 0; i < orbs.length; i++) {
    const xInput = document.getElementById(`orb-${i}-x`) as HTMLInputElement | null
    const yInput = document.getElementById(`orb-${i}-y`) as HTMLInputElement | null
    if (xInput && document.activeElement !== xInput) {
      xInput.value = String(Math.round((orbs[i]!.x / window.innerWidth) * 100))
    }
    if (yInput && document.activeElement !== yInput) {
      yInput.value = String(Math.round((orbs[i]!.y / window.innerHeight) * 100))
    }
  }
}
