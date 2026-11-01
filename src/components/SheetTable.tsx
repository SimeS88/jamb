import { Fragment, type ReactNode } from 'react'
import { COLS, ROWS, NUMBER_ROWS, columnTotals, grandTotal, type ColId, type RowId, type Sheet } from '../game/rules'
import { useI18n, type TKey } from '../i18n'
import { DieGlyph } from './DieGlyph'

/** Full label, plus a short one used on narrow screens and the compact sheet. */
const ROW_LABEL: Record<RowId, { long: TKey; short?: TKey }> = {
  ones: { long: 'ones' }, twos: { long: 'twos' }, threes: { long: 'threes' },
  fours: { long: 'fours' }, fives: { long: 'fives' }, sixes: { long: 'sixes' },
  max: { long: 'max' }, min: { long: 'min' },
  tris: { long: 'tris', short: 'shortTris' },
  kenta: { long: 'kenta', short: 'shortKenta' },
  full: { long: 'full', short: 'shortFull' },
  poker: { long: 'poker' }, jamb: { long: 'jamb' },
}

const ICON_PATHS: Record<ColId, ReactNode> = {
  down: <path d="M12 4v15m0 0-6-6m6 6 6-6" />,
  up: <path d="M12 20V5m0 0-6 6m6-6 6 6" />,
  free: <path d="M12 3v18M7 7.5 12 3l5 4.5M7 16.5 12 21l5-4.5" />,
  announce: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </>
  ),
  counter: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />,
}

export function ColIcon({ col }: { col: ColId }) {
  return (
    <svg className="col-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[col]}
    </svg>
  )
}

const COL_META: Record<ColId, { label: TKey; hint: TKey }> = {
  down: { label: 'down', hint: 'downHint' },
  up: { label: 'up', hint: 'upHint' },
  free: { label: 'free', hint: 'freeHint' },
  announce: { label: 'announce', hint: 'announceHint' },
  counter: { label: 'counter', hint: 'counterHint' },
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

function Label({ long, short }: { long: string; short?: string }) {
  if (short === undefined || short === long) return <span className="lbl">{long}</span>
  return (
    <>
      <span className="lbl lbl-long">{long}</span>
      <span className="lbl lbl-short">{short}</span>
    </>
  )
}

export default function SheetTable({
  sheet, cols = COLS, compact, scorable, preview, announceTargets, forcedRow, onCell, onAnnounce,
}: Props) {
  const { t } = useI18n()
  const totals = cols.map((c) => columnTotals(sheet[c]))

  const sumRow = (key: string, long: TKey, short: TKey, cell: (i: number) => ReactNode, extra = '') => (
    <tr className={`subtotal ${extra}`} key={key}>
      <th scope="row"><Label long={t(long)} short={t(short)} /></th>
      {cols.map((c, i) => <td key={c}>{cell(i)}</td>)}
    </tr>
  )

  return (
    <div className="sheet-wrap">
      <table className={`sheet cols-${cols.length} ${compact ? 'compact' : ''}`}>
        <colgroup>
          <col className="label-col" />
          {cols.map((c) => <col key={c} />)}
        </colgroup>
        <thead>
          <tr>
            <th aria-hidden="true" />
            {cols.map((c) => (
              <th key={c} scope="col" title={t(COL_META[c].hint)} className={`col-${c}`}>
                <ColIcon col={c} />
                <span className="col-name">{t(COL_META[c].label)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const lbl = ROW_LABEL[row]
            const face = NUMBER_ROWS.indexOf(row) + 1
            return (
              <Fragment key={row}>
                <tr className={row === 'max' || row === 'tris' ? 'group-start' : ''}>
                  <th scope="row">
                    {face > 0 && <DieGlyph value={face} />}
                    <Label long={t(lbl.long)} short={lbl.short ? t(lbl.short) : face > 0 ? '' : undefined} />
                  </th>
                  {cols.map((col) => {
                    const val = sheet[col][row]
                    const active = scorable?.(col).includes(row) ?? false
                    const announceTarget =
                      (announceTargets?.includes(row) ?? false) && col === 'announce'
                    const forced = forcedRow === row && col === 'counter' && val === undefined
                    return (
                      <td key={col} className={forced ? 'forced' : ''}>
                        {val !== undefined ? (
                          <span className={`filled ${val === 0 ? 'zero' : ''}`}>{val}</span>
                        ) : active ? (
                          <button
                            className="cell playable"
                            onClick={() => onCell?.(col, row)}
                            aria-label={`${t(COL_META[col].label)} · ${t(lbl.long)} · ${preview?.(row) ?? ''}`}
                          >
                            {preview?.(row)}
                          </button>
                        ) : announceTarget ? (
                          <button
                            className="cell announceable"
                            onClick={() => onAnnounce?.(row)}
                            aria-label={`${t('announce')} · ${t(lbl.long)}`}
                          >
                            <ColIcon col="announce" />
                          </button>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
                {row === 'sixes' &&
                  sumRow('upper', 'upperSum', 'shortUpperSum', (i) => (
                    <span className="sum">
                      {totals[i].upper}
                      {totals[i].bonus > 0 && <span className="bonus">+{totals[i].bonus}</span>}
                    </span>
                  ))}
                {row === 'min' &&
                  sumRow('middle', 'middleSum', 'shortMiddleSum', (i) => <span className="sum">{totals[i].middle}</span>)}
                {row === 'jamb' &&
                  sumRow('lower', 'lowerSum', 'shortLowerSum', (i) => <span className="sum">{totals[i].lower}</span>)}
              </Fragment>
            )
          })}
          {sumRow('coltotal', 'columnTotal', 'shortColumnTotal', (i) => <span className="sum">{totals[i].total}</span>, 'coltotal')}
          <tr className="grand">
            <th scope="row">{t('total')}</th>
            <td colSpan={cols.length}>{grandTotal(sheet, cols)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
