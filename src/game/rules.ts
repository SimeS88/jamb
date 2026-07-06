// Jamb (Yamb) rules for the 6-dice variant. In every field at most 5 of the
// 6 dice count, per the standard Croatian 6-dice convention.

export const ROWS = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'max', 'min',
  'tris', 'kenta', 'full', 'poker', 'jamb',
] as const
export type RowId = (typeof ROWS)[number]

export const COLS = ['down', 'up', 'free', 'announce'] as const
export type ColId = (typeof COLS)[number]

export type Sheet = Record<ColId, Partial<Record<RowId, number>>>

export const NUMBER_ROWS: RowId[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
const NUMBER_VALUE: Partial<Record<RowId, number>> = {
  ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
}

export function emptySheet(): Sheet {
  return { down: {}, up: {}, free: {}, announce: {} }
}

function counts(values: number[]): number[] {
  const c = new Array(7).fill(0)
  for (const v of values) c[v]++
  return c
}

/** Score a row given the 6 dice values. */
export function scoreFor(row: RowId, values: number[]): number {
  const c = counts(values)
  const numberValue = NUMBER_VALUE[row]
  if (numberValue !== undefined) {
    return Math.min(c[numberValue], 5) * numberValue
  }
  const sorted = [...values].sort((a, b) => a - b)
  switch (row) {
    case 'max':
      return sorted.slice(1).reduce((a, b) => a + b, 0) // 5 highest
    case 'min':
      return sorted.slice(0, 5).reduce((a, b) => a + b, 0) // 5 lowest
    case 'tris': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 3) return 3 * v + 10
      return 0
    }
    case 'kenta': {
      // large straight (2-6) beats small (1-5) when both are present
      if ([2, 3, 4, 5, 6].every((v) => c[v] > 0)) return 45
      if ([1, 2, 3, 4, 5].every((v) => c[v] > 0)) return 35
      return 0
    }
    case 'full': {
      // Best three-of-a-kind + pair of a different value.
      let best = 0
      for (let three = 6; three >= 1; three--) {
        if (c[three] < 3) continue
        for (let two = 6; two >= 1; two--) {
          if (two === three || c[two] < 2) continue
          best = Math.max(best, 3 * three + 2 * two + 30)
        }
      }
      return best
    }
    case 'poker': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 4) return 4 * v + 40
      return 0
    }
    case 'jamb': {
      for (let v = 6; v >= 1; v--) if (c[v] >= 5) return 5 * v + 50
      return 0
    }
    default:
      return 0
  }
}

/** Rows currently allowed to be written in a column (ignoring announcements). */
export function allowedRows(sheet: Sheet, col: ColId): RowId[] {
  const filled = sheet[col]
  const empty = ROWS.filter((r) => filled[r] === undefined)
  if (empty.length === 0) return []
  switch (col) {
    case 'down':
      return [empty[0]]
    case 'up':
      return [empty[empty.length - 1]]
    case 'free':
    case 'announce':
      return empty
  }
}

export interface ColumnTotals {
  upper: number
  bonus: number
  middle: number
  lower: number
  total: number
}

export function columnTotals(col: Partial<Record<RowId, number>>): ColumnTotals {
  const upperRaw = NUMBER_ROWS.reduce((sum, r) => sum + (col[r] ?? 0), 0)
  const upperDone = NUMBER_ROWS.every((r) => col[r] !== undefined)
  const bonus = upperDone && upperRaw >= 60 ? 30 : 0
  const middleReady =
    col.max !== undefined && col.min !== undefined && col.ones !== undefined
  const middle = middleReady ? Math.max(0, (col.max! - col.min!)) * col.ones! : 0
  const lower =
    (col.tris ?? 0) + (col.kenta ?? 0) + (col.full ?? 0) + (col.poker ?? 0) + (col.jamb ?? 0)
  return { upper: upperRaw, bonus, middle, lower, total: upperRaw + bonus + middle + lower }
}

export function grandTotal(sheet: Sheet): number {
  return COLS.reduce((sum, c) => sum + columnTotals(sheet[c]).total, 0)
}

export function isComplete(sheet: Sheet): boolean {
  return COLS.every((c) => ROWS.every((r) => sheet[c][r] !== undefined))
}
