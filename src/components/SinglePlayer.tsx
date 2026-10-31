import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Game, { EMPTY_TURN, type ThrowMode, type TurnView } from './Game'
import { rollDie } from '../game/dice'
import { asRow, normalizeSheet, turnView, type SoloRow } from '../game/match'
import {
  SINGLE_COLS, emptySheet, grandTotal, isComplete, scoreFor,
  type ColId, type RowId, type Sheet,
} from '../game/rules'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface Props {
  session: Session | null
  throwMode: ThrowMode
  /** `saved` is true when the database recorded the score itself */
  onGameEnd: (score: number, saved: boolean) => void
}

export default function SinglePlayer(props: Props) {
  return props.session ? <RankedGame {...props} /> : <GuestGame {...props} />
}

/**
 * Signed in: the database rolls the dice, validates every move and writes
 * the final score to the leaderboard. The browser only picks holds and cells.
 */
function RankedGame({ throwMode, onGameEnd }: Props) {
  const { t } = useI18n()
  const [game, setGame] = useState<SoloRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('jamb_solo_start', { p_throw_mode: throwMode }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) setError(error?.message ?? t('syncProblem'))
      else setGame(asRow<SoloRow>(data))
    })
    return () => {
      cancelled = true
    }
    // a new game starts on mount only; changing throw mode mid-game doesn't restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function call(fn: string, args: Record<string, unknown>) {
    const { data, error } = await supabase.rpc(fn, { p_game: game!.id, ...args })
    if (error || !data) {
      setError(error?.message ?? t('syncProblem'))
      return
    }
    setError(null)
    const row = asRow<SoloRow>(data)
    setGame(row)
    if (row.status === 'finished') onGameEnd(row.score ?? 0, true)
  }

  if (!game) {
    return error ? <p className="auth-message">⚠ {error}</p> : <p>{t('loading')}</p>
  }

  return (
    <>
      {error && (
        <div className="banner warn" role="alert">
          <span>⚠ {error}</span>
        </div>
      )}
      <Game
        sheet={normalizeSheet(game.sheet)}
        cols={SINGLE_COLS}
        throwMode={throwMode}
        active={game.status === 'active'}
        turn={turnView(game.cur)}
        onRoll={(hold) => call('jamb_solo_roll', { p_hold: hold })}
        onAnnounce={(row) => call('jamb_solo_announce', { p_row: row })}
        onMove={(col, row) => call('jamb_solo_move', { p_col: col, p_row: row })}
      />
    </>
  )
}

/** Guest play: same rules, dice rolled locally, nothing is saved. */
function GuestGame({ throwMode, onGameEnd }: Props) {
  const [sheet, setSheet] = useState<Sheet>(emptySheet)
  const [turn, setTurn] = useState<TurnView>(EMPTY_TURN)
  const [done, setDone] = useState(false)

  async function roll(hold: number[]) {
    setTurn((cur) => {
      if (cur.rolls >= 3) return cur
      const base = cur.dice ?? []
      const dice = Array.from({ length: 6 }, (_, i) =>
        cur.rolls > 0 && hold.includes(i) ? base[i] : rollDie(),
      )
      return { ...cur, dice, rolls: cur.rolls + 1 }
    })
  }

  async function announce(row: RowId) {
    setTurn((cur) => ({ ...cur, announced: row }))
  }

  async function move(col: ColId, row: RowId) {
    if (!turn.dice) return
    const next: Sheet = { ...sheet, [col]: { ...sheet[col], [row]: scoreFor(row, turn.dice) } }
    setSheet(next)
    setTurn(EMPTY_TURN)
    if (isComplete(next, SINGLE_COLS)) {
      setDone(true)
      onGameEnd(grandTotal(next, SINGLE_COLS), false)
    }
  }

  return (
    <Game
      sheet={sheet}
      cols={SINGLE_COLS}
      throwMode={throwMode}
      active={!done}
      turn={turn}
      onRoll={roll}
      onAnnounce={announce}
      onMove={move}
    />
  )
}
