import type { ColId, RowId, Sheet } from './rules'
import { emptySheet } from './rules'

export interface MatchState {
  names?: Record<string, string>
  sheets?: Record<string, Sheet>
  lastMove?: { by: string; col: ColId; row: RowId } | null
}

export type MatchStatus = 'waiting' | 'challenge' | 'active' | 'finished' | 'abandoned' | 'declined'

export interface MatchRow {
  id: string
  player1: string
  player2: string | null
  status: MatchStatus
  turn: string | null
  winner: string | null
  state: MatchState
  updated_at: string
}

export function asRow(data: unknown): MatchRow {
  return (Array.isArray(data) ? data[0] : data) as MatchRow
}

export function normalizeSheet(s: Sheet | undefined): Sheet {
  return s
    ? {
        down: { ...s.down },
        up: { ...s.up },
        free: { ...s.free },
        announce: { ...s.announce },
        counter: { ...(s.counter ?? {}) },
      }
    : emptySheet()
}
