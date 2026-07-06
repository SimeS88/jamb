import { Fragment } from 'react'
import { COLS, ROWS, columnTotals, grandTotal, type ColId, type RowId, type Sheet } from '../game/rules'
import { useI18n, type TKey } from '../i18n'

const ROW_LABEL: Record<RowId, TKey> = {
  ones: 'ones', twos: 'twos', threes: 'threes', fours: 'fours', fives: 'fives', sixes: 'sixes',
  max: 'max', min: 'min', tris: 'tris', kenta: 'kenta', full: 'full', poker: 'poker', jamb: 'jamb',
}

const COL_META: Record<ColId, { label: TKey; hint: TKey; symbol: string }> = {
  down: { label: 'down', hint: 'downHint', symbol: '⬇' },
  up: { label: 'up', hint: 'upHint', symbol: '⬆' },
  free: { label: 'free', hint: 'freeHint', symbol: '⬍' },
  announce: { label: 'announce', hint: 'announceHint', symbol: '📣' },
  counter: { label: 'counter', hint: 'counterHint', symbol: '🛡️' },
}

interface Props {
  sheet: Sheet
  /** which columns this game uses (single: 4, two players: 5) */
  cols?: readonly ColId[]
  compact?: boolean
  /** rows currently playable per column (empty/omitted = read-only) */
  scorable?: (col: ColId) => RowId[]
  /** score preview for a playable cell */
  preview?: (row: RowId) => number
  /** rows that can be announced right now */
  announceTargets?: RowId[]
  /** the forced counter-announcement cell to highlight */
  forcedRow?: RowId | null
  onCell?: (col: ColId, row: RowId) => void
  onAnnounce?: (row: RowId) => void
}

export default function SheetTable({
  sheet, cols = COLS, compact, scorable, preview, announceTargets, forcedRow, onCell, onAnnounce,
}: Props) {
  const { t } = useI18n()
  const totals = cols.map((c) => columnTotals(sheet[c]))

  return (
    <table className={`sheet ${compact ? 'compact' : ''}`}>
      <thead>
        <tr>
          <th></th>
          {cols.map((c) => (
            <th key={c} title={t(COL_META[c].hint)}>
              <span className="col-symbol">{COL_META[c].symbol}</span>
              {!compact && <span className="col-name">{t(COL_META[c].label)}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <Fragment key={row}>
            <tr>
              <th>{t(ROW_LABEL[row])}</th>
              {cols.map((col) => {
                const val = sheet[col][row]
                const active = scorable?.(col).includes(row) ?? false
                const announceTarget =
                  (announceTargets?.includes(row) ?? false) && col === 'announce'
                const forced = forcedRow === row && col === 'counter' && val === undefined
                return (
                  <td key={col} className={forced ? 'forced' : ''}>
                    {val !== undefined ? (
                      <span className="filled">{val}</span>
                    ) : active ? (
                      <button className="cell playable" onClick={() => onCell?.(col, row)}>
                        {preview?.(row)}
                      </button>
                    ) : announceTarget ? (
                      <button className="cell announceable" onClick={() => onAnnounce?.(row)}>
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
        <tr className="subtotal coltotal">
          <th>{t('columnTotal')}</th>
          {totals.map((tt, i) => <td key={i}>{tt.total}</td>)}
        </tr>
        <tr className="grand">
          <th>{t('total')}</th>
          <td colSpan={cols.length}>{grandTotal(sheet, cols)}</td>
        </tr>
      </tbody>
    </table>
  )
}
