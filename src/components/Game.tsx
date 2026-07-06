import { Fragment, useEffect, useRef, useState } from 'react'
import { newDice, rollDie, rollFree, type Die } from '../game/dice'
import {
  COLS, ROWS, allowedRows, columnTotals, emptySheet,
  grandTotal, isComplete, scoreFor, type ColId, type RowId, type Sheet,
} from '../game/rules'
import { useI18n, type TKey } from '../i18n'

export type ThrowMode = 'manual' | 'automatic'

interface Props {
  throwMode: ThrowMode
  onGameEnd: (score: number) => void
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

export default function Game({ throwMode, onGameEnd }: Props) {
  const { t } = useI18n()
  const [sheet, setSheet] = useState<Sheet>(emptySheet)
  const [dice, setDice] = useState<Die[]>(() => newDice(DICE_COUNT))
  const [rollsUsed, setRollsUsed] = useState(0)
  const [announced, setAnnounced] = useState<RowId | null>(null)
  const [rolling, setRolling] = useState(false)
  const [finished, setFinished] = useState(false)
  const animTimer = useRef<number | null>(null)

  const values = dice.map((d) => d.value)
  const canRoll = !finished && !rolling && rollsUsed < 3 && (announced === null || rollsUsed < 3)
  const canAnnounce = !finished && !rolling && rollsUsed === 1 && announced === null

  useEffect(() => () => { if (animTimer.current) window.clearInterval(animTimer.current) }, [])

  function doRoll(current: Die[], used: number) {
    if (used >= 3 || rolling || finished) return
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
    if (throwMode === 'automatic' && rollsUsed === 0 && !rolling && !finished) {
      const id = window.setTimeout(() => doRoll(dice, 0), 500)
      return () => window.clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwMode, rollsUsed, finished])

  function toggleHold(i: number) {
    if (rollsUsed === 0 || rollsUsed >= 3 || rolling || finished) return
    setDice((prev) => prev.map((d, j) => (j === i ? { ...d, held: !d.held } : d)))
  }

  function scorableIn(col: ColId): RowId[] {
    if (rollsUsed === 0 || rolling || finished) return []
    if (announced !== null) return col === 'announce' ? [announced] : []
    if (col === 'announce') return [] // must announce first
    return allowedRows(sheet, col)
  }

  function writeCell(col: ColId, row: RowId) {
    if (!scorableIn(col).includes(row)) return
    const score = scoreFor(row, values, rollsUsed)
    const next: Sheet = { ...sheet, [col]: { ...sheet[col], [row]: score } }
    setSheet(next)
    setAnnounced(null)
    setDice(newDice(DICE_COUNT))
    setRollsUsed(0)
    if (isComplete(next)) {
      setFinished(true)
      onGameEnd(grandTotal(next))
    }
  }

  function announceRow(row: RowId) {
    if (!canAnnounce) return
    if (sheet.announce[row] !== undefined) return
    setAnnounced(row)
  }

  function reset() {
    if (!finished && !window.confirm(t('confirmNewGame'))) return
    setSheet(emptySheet())
    setDice(newDice(DICE_COUNT))
    setRollsUsed(0)
    setAnnounced(null)
    setFinished(false)
  }

  const rowLabel: Record<RowId, TKey> = {
    ones: 'ones', twos: 'twos', threes: 'threes', fours: 'fours', fives: 'fives', sixes: 'sixes',
    max: 'max', min: 'min', kenta: 'kenta', full: 'full', poker: 'poker', jamb: 'jamb',
  }
  const colLabel: Record<ColId, { label: TKey; hint: TKey; symbol: string }> = {
    down: { label: 'down', hint: 'downHint', symbol: '⬇' },
    up: { label: 'up', hint: 'upHint', symbol: '⬆' },
    free: { label: 'free', hint: 'freeHint', symbol: '⬍' },
    announce: { label: 'announce', hint: 'announceHint', symbol: '📣' },
  }

  const totals = COLS.map((c) => columnTotals(sheet[c]))

  return (
    <div className="game">
      <div className="dice-area">
        <div className="dice-row">
          {dice.map((d, i) => (
            <DieFace
              key={i}
              die={d}
              disabled={rollsUsed === 0 || rollsUsed >= 3 || rolling || finished}
              onClick={() => toggleHold(i)}
            />
          ))}
        </div>
        <div className="controls">
          <button className="primary" onClick={() => doRoll(dice, rollsUsed)} disabled={!canRoll}>
            {rolling ? t('rolling') : `${t('roll')} (${3 - rollsUsed})`}
          </button>
          <button onClick={reset}>{t('newGame')}</button>
        </div>
        {rollsUsed > 0 && rollsUsed < 3 && <p className="hint">{t('holdHint')}</p>}
        {canAnnounce && <p className="hint">{t('announcePick')}: {t('announceHint').toLowerCase()}</p>}
        {announced && (
          <p className="hint announced">📣 {t('announced')}: {t(rowLabel[announced])}</p>
        )}
      </div>

      <table className="sheet">
        <thead>
          <tr>
            <th></th>
            {COLS.map((c) => (
              <th key={c} title={t(colLabel[c].hint)}>
                <span className="col-symbol">{colLabel[c].symbol}</span>
                <span className="col-name">{t(colLabel[c].label)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <Fragment key={row}>
              <tr>
                <th>{t(rowLabel[row])}</th>
                {COLS.map((col) => {
                  const val = sheet[col][row]
                  const active = scorableIn(col).includes(row)
                  const announceTarget = canAnnounce && col === 'announce' && sheet.announce[row] === undefined
                  const preview = active ? scoreFor(row, values, rollsUsed) : null
                  return (
                    <td key={col}>
                      {val !== undefined ? (
                        <span className="filled">{val}</span>
                      ) : active ? (
                        <button className="cell playable" onClick={() => writeCell(col, row)}>
                          {preview}
                        </button>
                      ) : announceTarget ? (
                        <button className="cell announceable" onClick={() => announceRow(row)}>
                          📣
                        </button>
                      ) : (
                        <span className="cell blank" />
                      )}
                    </td>
                  )
                })}
              </tr>
              {row === 'sixes' && (
                <tr className="subtotal">
                  <th>{t('upperSum')} / {t('bonus')}</th>
                  {totals.map((tt, i) => (
                    <td key={i}>{tt.upper}{tt.bonus > 0 ? ` +${tt.bonus}` : ''}</td>
                  ))}
                </tr>
              )}
              {row === 'min' && (
                <tr className="subtotal">
                  <th>{t('middleSum')}</th>
                  {totals.map((tt, i) => <td key={i}>{tt.middle}</td>)}
                </tr>
              )}
              {row === 'jamb' && (
                <tr className="subtotal">
                  <th>{t('lowerSum')}</th>
                  {totals.map((tt, i) => <td key={i}>{tt.lower}</td>)}
                </tr>
              )}
            </Fragment>
          ))}
          <tr className="grand">
            <th>{t('total')}</th>
            <td colSpan={COLS.length}>{grandTotal(sheet)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
