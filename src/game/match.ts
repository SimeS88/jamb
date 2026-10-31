import type { ColId, RowId, Sheet } from './rules'
import { emptySheet } from './rules'
import type { TurnView } from '../components/Game'

/** The turn in progress, as kept by the database. */
export interface TurnState {
  dice?: number[]
  rolls?: number
  held?: number[]
  announced?: RowId | null
}

export interface MatchState {
  names?: Record<string, string>
  sheets?: Record<string, Sheet>
  lastMove?: { by: string; col: ColId; row: RowId; score?: number } | null
  /** current turn's dice; present only for the player whose turn it is */
  cur?: TurnState
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

/** A signed-in single-player game; all writes go through jamb_solo_* RPCs. */
export interface SoloRow {
  id: string
  status: 'active' | 'finished' | 'abandoned'
  sheet: Partial<Sheet>
  cur: TurnState
  score: number | null
}

export function asRow<T = MatchRow>(data: unknown): T {
  return (Array.isArray(data) ? data[0] : data) as T
}

export function turnView(cur: TurnState | undefined | null): TurnView {
  return {
    dice: cur?.dice && cur.dice.length === 6 ? cur.dice : null,
    rolls: cur?.rolls ?? 0,
    announced: cur?.announced ?? null,
  }
}

export function normalizeSheet(s: Partial<Sheet> | undefined): Sheet {
  return s
    ? {
        down: { ...(s.down ?? {}) },
        up: { ...(s.up ?? {}) },
        free: { ...(s.free ?? {}) },
        announce: { ...(s.announce ?? {}) },
        counter: { ...(s.counter ?? {}) },
      }
    : emptySheet()
}
