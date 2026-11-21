import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from './i18n'

/** Christmas season: 20 November – 6 January (Sveta tri kralja). */
function inSeason(d = new Date()): boolean {
  const m = d.getMonth()
  const day = d.getDate()
  return (m === 10 && day >= 20) || m === 11 || (m === 0 && day <= 6)
}

function initialOn(): boolean {
  try {
    const stored = localStorage.getItem('jamb.christmas')
    if (stored === 'on') return true
    if (stored === 'off') return false
  } catch { /* storage blocked */ }
  return inSeason()
}

interface Xmas {
  on: boolean
  setOn: (v: boolean) => void
}

const XmasContext = createContext<Xmas>({ on: false, setOn: () => {} })

export function ChristmasProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(initialOn)

  useEffect(() => {
    if (on) document.documentElement.dataset.xmas = '' 
    else delete document.documentElement.dataset.xmas
  }, [on])

  const setOn = (v: boolean) => {
    setOnState(v)
    try { localStorage.setItem('jamb.christmas', v ? 'on' : 'off') } catch { /* ignore */ }
  }

  return (
    <XmasContext.Provider value={{ on, setOn }}>
      {children}
      {on && <Snowfall />}
      {on && <FestiveBurst />}
    </XmasContext.Provider>
  )
}

export function useChristmas(): Xmas {
  return useContext(XmasContext)
}

/** Fired by the game when a roll lands five or more of a kind. */
export function celebrateJamb() {
  window.dispatchEvent(new CustomEvent('jamb:festive'))
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Light canvas snowfall behind the page; pauses while the tab is hidden. */
function Snowfall() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || reducedMotion()) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const count = Math.round(Math.min(90, (w * h) / 14000))
    const flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2.6,
      vy: 0.3 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      sway: 0.3 + Math.random() * 0.7,
    }))

    let raf = 0
    let t = 0
    const tick = () => {
      t += 0.01
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (const f of flakes) {
        f.y += f.vy
        f.x += Math.sin(t * 2 + f.phase) * f.sway * 0.4
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w }
        if (f.x > w + 4) f.x = -4
        if (f.x < -4) f.x = w + 4
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} className="snowfall" aria-hidden="true" />
}

const BURST_ITEMS = ['🎁', '⭐', '❄️', '🔔', '🎄', '🍬', '❄️', '⭐', '🎁', '❄️', '🔔', '⭐']

/** "Ho ho ho!" moment when a roll shows a jamb. */
function FestiveBurst() {
  const { t } = useI18n()
  const [shot, setShot] = useState(0)

  useEffect(() => {
    let timer = 0
    const onFest = () => {
      setShot((s) => s + 1)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setShot(0), 2600)
    }
    window.addEventListener('jamb:festive', onFest)
    return () => {
      window.removeEventListener('jamb:festive', onFest)
      window.clearTimeout(timer)
    }
  }, [])

  if (!shot) return null
  return (
    <div className="festive-burst" key={shot} aria-live="polite">
      <div className="festive-text">🎅 {t('hohoho')}</div>
      {!reducedMotion() &&
        BURST_ITEMS.map((e, i) => (
          <span
            key={i}
            className="festive-bit"
            style={{
              ['--a' as string]: `${(360 / BURST_ITEMS.length) * i}deg`,
              ['--d' as string]: `${30 + (i % 3) * 9}vmin`,
            }}
          >
            {e}
          </span>
        ))}
    </div>
  )
}

/** Blinking string of fairy lights for the header. */
export function Garland() {
  return (
    <div className="garland" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} className={`bulb b${i % 4}`} />
      ))}
    </div>
  )
}
