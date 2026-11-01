import { useEffect, useRef, useState } from 'react'
import { rollDie } from '../game/dice'
import { ROWS, allowedRows, scoreFor, type ColId, type RowId, type Sheet } from '../game/rules'
import SheetTable from './SheetTable'
import { Pips } from './DieGlyph'
import { useI18n } from '../i18n'

export type ThrowMode = 'manual' | 'automatic'

/** Live snapshot of the current turn, broadcast to the opponent in 2P games. */
export interface TurnSnapshot {
  values: number[]
  held: boolean[]
  rollsUsed: number
  rolling: boolean
}

/**
 * The current turn as the authority (the database, or the local guest
 * engine) reports it. Game never invents dice or scores of its own.
 */
export interface TurnView {
  dice: number[] | null
  rolls: number
  announced: RowId | null
}

export const EMPTY_TURN: TurnView = { dice: null, rolls: 0, announced: null }

interface Props {
  sheet: Sheet
  cols: readonly ColId[]
  throwMode: ThrowMode
  /** whether this player may act right now */
  active: boolean
  turn: TurnView
  /** counter-announcement: the row this player is forced to play in the counter column */
  forcedAnnounce?: RowId | null
  /** roll every die not listed in `hold` (die indexes 0..5) */
  onRoll: (hold: number[]) => Promise<void>
  onAnnounce: (row: RowId) => Promise<void>
  onMove: (col: ColId, row: RowId) => Promise<void>
  onTurnEvent?: (s: TurnSnapshot) => void
}

const DICE_COUNT = 6
const BLANK = Array.from({ length: DICE_COUNT }, () => 1)
const NO_HOLDS = Array.from({ length: DICE_COUNT }, () => false)

function DieFace({
  value, held, disabled, rolling, onClick,
}: { value: number; held: boolean; disabled: boolean; rolling?: boolean; onClick: () => void }) {
  return (
    <button
      className={`die ${held ? 'held' : ''} ${rolling && !held ? 'tumbling' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={held}
      aria-label={`${value}`}
    >
      <Pips value={value} />
    </button>
  )
}

export default function Game({
  sheet, cols, throwMode, active, turn, forcedAnnounce = null,
  onRoll, onAnnounce, onMove, onTurnEvent,
}: Props) {
  const { t } = useI18n()
  const [held, setHeld] = useState<boolean[]>(NO_HOLDS)
  const [rolling, setRolling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [animFaces, setAnimFaces] = useState<number[] | null>(null)
  const autoTried = useRef(false)

  const rollsUsed = turn.rolls
  const announced = turn.announced
  const values = turn.dice ?? BLANK
  const shown = animFaces ?? values
  const canRoll = active && !rolling && !busy && rollsUsed < 3
  const canAnnounce =
    active && !rolling && !busy && rollsUsed === 1 && announced === null && !forcedAnnounce
  const ordinaryLegal = (['down', 'up', 'free'] as ColId[]).some(
    (c) => allowedRows(sheet, c).length > 0,
  )

  // New turn (or turn handed over): drop holds, allow one automatic roll.
  const fresh = rollsUsed === 0
  useEffect(() => {
    if (fresh || !active) {
      setHeld(NO_HOLDS)
      autoTried.current = false
    }
  }, [fresh, active])

  // Mirror the turn to the opponent whenever it settles.
  useEffect(() => {
    if (!active || rolling) return
    onTurnEvent?.({ values, held, rollsUsed, rolling: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rolling, values.join(''), held.join(''), rollsUsed])

  async function doRoll() {
    if (!canRoll) return
    const hold = rollsUsed > 0 ? held.flatMap((h, i) => (h ? [i] : [])) : []
    const keep = (i: number) => rollsUsed > 0 && held[i]
    setRolling(true)
    onTurnEvent?.({ values, held, rollsUsed, rolling: true })
    // tumble locally while the authority rolls the real dice
    let faces = values
    const timer = window.setInterval(() => {
      faces = faces.map((v, i) => (keep(i) ? v : rollDie()))
      setAnimFaces(faces)
    }, 80)
    const minSpin = new Promise((r) => window.setTimeout(r, 480))
    try {
      await Promise.all([onRoll(hold), minSpin])
    } catch {
      // the parent reports failures; just stop spinning
    } finally {
      window.clearInterval(timer)
      setAnimFaces(null)
      setRolling(false)
    }
  }

  // Automatic mode: first roll of each turn happens by itself (once).
  useEffect(() => {
    if (throwMode !== 'automatic' || !active || rollsUsed !== 0 || rolling || busy) return
    if (autoTried.current) return
    const id = window.setTimeout(() => {
      autoTried.current = true
      void doRoll()
    }, 500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwMode, active, rollsUsed, rolling, busy])

  function toggleHold(i: number) {
    if (rollsUsed === 0 || rollsUsed >= 3 || rolling || busy || !active) return
    setHeld((h) => h.map((x, j) => (j === i ? !x : x)))
  }

  function scorableIn(col: ColId): RowId[] {
    if (!cols.includes(col) || !active || rollsUsed === 0 || rolling || busy) return []
    // Counter-announcement in force: the counter cell is the only legal move.
    if (forcedAnnounce !== null) {
      return col === 'counter' && sheet.counter[forcedAnnounce] === undefined
        ? [forcedAnnounce]
        : []
    }
    if (announced !== null) {
      return col === 'announce' && sheet.announce[announced] === undefined ? [announced] : []
    }
    switch (col) {
      case 'announce':
        // normally needs an announcement; playable directly only in the
        // endgame when down/up/free are complete (so the game can't stall)
        return ordinaryLegal ? [] : allowedRows(sheet, 'announce')
      case 'counter':
        // only fillable when forced, except in the endgame when nothing
        // else is left to play
        return ordinaryLegal || allowedRows(sheet, 'announce').length > 0
          ? []
          : allowedRows(sheet, 'counter')
      default:
        return allowedRows(sheet, col)
    }
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch {
      // reported by the parent
    } finally {
      setBusy(false)
    }
  }

  function writeCell(col: ColId, row: RowId) {
    if (!scorableIn(col).includes(row)) return
    void act(() => onMove(col, row))
  }

  function announceRow(row: RowId) {
    if (!canAnnounce || sheet.announce[row] !== undefined) return
    void act(() => onAnnounce(row))
  }

  return (
    <div className="game">
      <div className="dice-area">
        <div className="dice-row">
          {shown.map((v, i) => (
            <DieFace
              key={i}
              value={v}
              held={held[i]}
              rolling={rolling}
              disabled={rollsUsed === 0 || rollsUsed >= 3 || rolling || busy || !active}
              onClick={() => toggleHold(i)}
            />
          ))}
        </div>
        <div className="controls">
          <button className="primary roll-btn" onClick={() => void doRoll()} disabled={!canRoll}>
            <span>{rolling ? t('rolling') : t('roll')}</span>
            <span className="rolls-left" aria-label={`${t('rollsLeft')}: ${3 - rollsUsed}`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < 3 - rollsUsed ? 'dot on' : 'dot'} />
              ))}
            </span>
          </button>
        </div>
        {active && rollsUsed > 0 && rollsUsed < 3 && <p className="hint hold-hint">{t('holdHint')}</p>}
        {canAnnounce && <p className="hint">{t('announcePick')}: {t('announceHint').toLowerCase()}</p>}
        {forcedAnnounce && active && (
          <p className="hint announced">⚡ {t('counterForced')}: {t(forcedAnnounce)}</p>
        )}
        {announced && !forcedAnnounce && (
          <p className="hint announced">📣 {t('announced')}: {t(announced)}</p>
        )}
      </div>

      <SheetTable
        sheet={sheet}
        cols={cols}
        scorable={scorableIn}
        preview={(row) => scoreFor(row, values)}
        announceTargets={canAnnounce ? ROWS.filter((r) => sheet.announce[r] === undefined) : []}
        forcedRow={active ? forcedAnnounce : null}
        onCell={writeCell}
        onAnnounce={announceRow}
      />
    </div>
  )
}
