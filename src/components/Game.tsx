import { useEffect, useRef, useState } from 'react'
import { newDice, rollDie, rollFree, type Die } from '../game/dice'
import { ROWS, allowedRows, scoreFor, type ColId, type RowId, type Sheet } from '../game/rules'
import SheetTable from './SheetTable'
import { useI18n } from '../i18n'

export type ThrowMode = 'manual' | 'automatic'

interface Props {
  sheet: Sheet
  cols: readonly ColId[]
  throwMode: ThrowMode
  /** whether this player may act right now (always true in single player until done) */
  active: boolean
  /** counter-announcement: the row this player is forced to play in the counter column */
  forcedAnnounce?: RowId | null
  onMove: (col: ColId, row: RowId, score: number) => void
}

const DICE_COUNT = 6
const PIP_LAYOUT: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}

function DieFace({ die, disabled, onClick }: { die: Die; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className={`die ${die.held ? 'held' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={die.held}
    >
      <span className="pips">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={PIP_LAYOUT[die.value].includes(i) ? 'pip' : 'pip empty'} />
        ))}
      </span>
    </button>
  )
}

export default function Game({ sheet, cols, throwMode, active, forcedAnnounce = null, onMove }: Props) {
  const { t } = useI18n()
  const [dice, setDice] = useState<Die[]>(() => newDice(DICE_COUNT))
  const [rollsUsed, setRollsUsed] = useState(0)
  const [announced, setAnnounced] = useState<RowId | null>(null)
  const [rolling, setRolling] = useState(false)
  const animTimer = useRef<number | null>(null)

  const values = dice.map((d) => d.value)
  const canRoll = active && !rolling && rollsUsed < 3
  const canAnnounce = active && !rolling && rollsUsed === 1 && announced === null && !forcedAnnounce
  // Is any cell playable in the self-directed columns this turn?
  const ordinaryLegal = (['down', 'up', 'free'] as ColId[]).some(
    (c) => allowedRows(sheet, c).length > 0,
  )

  useEffect(() => () => { if (animTimer.current) window.clearInterval(animTimer.current) }, [])

  // A new turn begins whenever we become active: fresh dice, forced announcement applied.
  useEffect(() => {
    if (active) {
      setDice(newDice(DICE_COUNT))
      setRollsUsed(0)
      setAnnounced(forcedAnnounce)
    }
  }, [active, forcedAnnounce])

  function doRoll(current: Die[], used: number) {
    if (used >= 3 || rolling || !active) return
    setRolling(true)
    const final = rollFree(current)
    let ticks = 0
    animTimer.current = window.setInterval(() => {
      ticks++
      if (ticks < 6) {
        setDice((prev) => prev.map((d) => (d.held ? d : { ...d, value: rollDie() })))
      } else {
        if (animTimer.current) window.clearInterval(animTimer.current)
        animTimer.current = null
        setDice(final)
        setRollsUsed(used + 1)
        setRolling(false)
      }
    }, 80)
  }

  // Automatic mode: first roll of each turn happens by itself.
  useEffect(() => {
    if (throwMode === 'automatic' && active && rollsUsed === 0 && !rolling) {
      const id = window.setTimeout(() => doRoll(dice, 0), 500)
      return () => window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwMode, active, rollsUsed])

  function toggleHold(i: number) {
    if (rollsUsed === 0 || rollsUsed >= 3 || rolling || !active) return
    setDice((prev) => prev.map((d, j) => (j === i ? { ...d, held: !d.held } : d)))
  }

  function scorableIn(col: ColId): RowId[] {
    if (!cols.includes(col) || !active || rollsUsed === 0 || rolling) return []
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

  function writeCell(col: ColId, row: RowId) {
    if (!scorableIn(col).includes(row)) return
    const score = scoreFor(row, values)
    setDice(newDice(DICE_COUNT))
    setRollsUsed(0)
    setAnnounced(null)
    onMove(col, row, score)
  }

  function announceRow(row: RowId) {
    if (!canAnnounce || sheet.announce[row] !== undefined) return
    setAnnounced(row)
  }

  return (
    <div className="game">
      <div className="dice-area">
        <div className="dice-row">
          {dice.map((d, i) => (
            <DieFace
              key={i}
              die={d}
              disabled={rollsUsed === 0 || rollsUsed >= 3 || rolling || !active}
              onClick={() => toggleHold(i)}
            />
          ))}
        </div>
        <div className="controls">
          <button className="primary" onClick={() => doRoll(dice, rollsUsed)} disabled={!canRoll}>
            {rolling ? t('rolling') : `${t('roll')} (${3 - rollsUsed})`}
          </button>
        </div>
        {active && rollsUsed > 0 && rollsUsed < 3 && <p className="hint">{t('holdHint')}</p>}
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
