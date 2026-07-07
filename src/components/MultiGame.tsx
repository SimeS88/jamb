import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Game, { type ThrowMode } from './Game'
import SheetTable from './SheetTable'
import { MULTI_COLS, emptySheet, grandTotal, isComplete, type ColId, type RowId, type Sheet } from '../game/rules'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface MatchState {
  names?: Record<string, string>
  sheets?: Record<string, Sheet>
  lastMove?: { by: string; col: ColId; row: RowId } | null
}

interface MatchRow {
  id: string
  player1: string
  player2: string | null
  status: 'waiting' | 'active' | 'finished' | 'abandoned'
  turn: string | null
  winner: string | null
  state: MatchState
  updated_at: string
}

function asRow(data: unknown): MatchRow {
  return (Array.isArray(data) ? data[0] : data) as MatchRow
}

interface Props {
  session: Session
  throwMode: ThrowMode
  onExit: () => void
  onFinished: (score: number) => void
}

function normalizeSheet(s: Sheet | undefined): Sheet {
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

export default function MultiGame({ session, throwMode, onExit, onFinished }: Props) {
  const { t } = useI18n()
  const me = session.user.id
  const [match, setMatch] = useState<MatchRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncTrouble, setSyncTrouble] = useState(false)
  const savedRef = useRef(false)
  const failsRef = useRef(0)

  // Never let a stale fetch overwrite newer state.
  const applyRow = useCallback((row: MatchRow) => {
    setMatch((prev) => (prev && prev.id === row.id && prev.updated_at > row.updated_at ? prev : row))
  }, [])

  // Pair up (or resume a running/waiting match).
  useEffect(() => {
    let cancelled = false
    supabase.rpc('jamb_find_match').then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message)
      else setMatch(asRow(data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Live updates + a self-healing polling fallback. A silent failure here is
  // what makes a match look stuck, so errors trigger a session refresh and,
  // if they persist, a visible notice.
  const matchId = match?.id
  useEffect(() => {
    if (!matchId) return
    const refresh = async () => {
      const { data, error } = await supabase
        .from('jamb_matches')
        .select('*')
        .eq('id', matchId)
        .single()
      if (error || !data) {
        failsRef.current += 1
        if (failsRef.current >= 2) setSyncTrouble(true)
        // stale/expired token is the usual culprit — force a refresh
        await supabase.auth.refreshSession()
        return
      }
      failsRef.current = 0
      setSyncTrouble(false)
      applyRow(data as MatchRow)
    }
    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jamb_matches', filter: `id=eq.${matchId}` },
        (payload) => applyRow(payload.new as MatchRow),
      )
      .subscribe((status) => {
        // catch anything that happened between the initial fetch and the
        // subscription becoming live
        if (status === 'SUBSCRIBED') void refresh()
      })
    const poll = window.setInterval(() => void refresh(), 5000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      void supabase.removeChannel(channel)
      window.clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [matchId, applyRow])

  if (error) {
    return (
      <div className="multi-status">
        <p className="auth-message">{error}</p>
        <button onClick={onExit}>{t('backToMenu')}</button>
      </div>
    )
  }
  if (!match) return <div className="multi-status"><p>{t('loading')}</p></div>

  if (match.status === 'waiting') {
    return (
      <div className="multi-status">
        <p className="searching">🔍 {t('searching')}</p>
        <button
          onClick={async () => {
            await supabase
              .from('jamb_matches')
              .update({ status: 'abandoned' })
              .eq('id', match.id)
              .eq('status', 'waiting')
            onExit()
          }}
        >
          {t('cancelSearch')}
        </button>
      </div>
    )
  }

  const opp = match.player1 === me ? match.player2! : match.player1
  const names = match.state.names ?? {}
  const mySheet = normalizeSheet(match.state.sheets?.[me])
  const oppSheet = normalizeSheet(match.state.sheets?.[opp])
  const myTurn = match.status === 'active' && match.turn === me
  const last = match.state.lastMove
  const forcedAnnounce: RowId | null =
    myTurn && last && last.by === opp && last.col === 'announce' && mySheet.counter[last.row] === undefined
      ? last.row
      : null

  async function play(col: ColId, row: RowId, score: number) {
    if (!match || !myTurn) return
    // The move is applied atomically in the database (turn and cell are
    // validated there); a failure is shown instead of silently losing it.
    const { data, error: rpcErr } = await supabase.rpc('jamb_play_move', {
      p_match: match.id,
      p_col: col,
      p_row: row,
      p_score: score,
    })
    if (rpcErr || !data) {
      setSyncTrouble(true)
      await supabase.auth.refreshSession()
      return
    }
    const updated = asRow(data)
    setSyncTrouble(false)
    applyRow(updated)
    const nextMine = normalizeSheet(updated.state.sheets?.[me])
    if (isComplete(nextMine, MULTI_COLS) && !savedRef.current) {
      savedRef.current = true
      onFinished(grandTotal(nextMine, MULTI_COLS))
    }
  }

  async function leave() {
    if (!match) return
    if (match.status === 'active') {
      if (!window.confirm(t('confirmLeave'))) return
      await supabase
        .from('jamb_matches')
        .update({ status: 'abandoned', winner: opp })
        .eq('id', match.id)
        .eq('status', 'active')
    }
    onExit()
  }

  const finished = match.status === 'finished'
  const abandoned = match.status === 'abandoned'
  const resultText = finished
    ? match.winner === me
      ? t('youWin')
      : match.winner === opp
        ? t('youLose')
        : t('draw')
    : abandoned
      ? `${t('opponentLeft')} ${match.winner === me ? t('youWin') : ''}`
      : null

  return (
    <div className="multi">
      <div className="multi-header">
        <div className={`player-chip ${myTurn ? 'turn' : ''}`}>
          {names[me] ?? t('you')} · {grandTotal(mySheet)}
        </div>
        <span className="vs">⚔️</span>
        <div className={`player-chip ${!myTurn && match.status === 'active' ? 'turn' : ''}`}>
          {names[opp] ?? t('opponent')} · {grandTotal(oppSheet)}
        </div>
        <button className="leave" onClick={leave}>
          {match.status === 'active' ? t('leaveMatch') : t('backToMenu')}
        </button>
      </div>

      {resultText ? (
        <div className="banner" role="status">
          <span>{resultText} {finished && `${grandTotal(mySheet)} : ${grandTotal(oppSheet)}`}</span>
        </div>
      ) : (
        <p className="turn-indicator">{myTurn ? `▶ ${t('yourTurn')}` : `⏳ ${t('opponentTurn')}`}</p>
      )}
      {syncTrouble && (
        <div className="banner warn" role="alert">
          <span>⚠ {t('syncProblem')}</span>
        </div>
      )}

      <div className="multi-boards">
        <div>
          <Game
            sheet={mySheet}
            cols={MULTI_COLS}
            throwMode={throwMode}
            active={myTurn && !finished && !abandoned}
            forcedAnnounce={forcedAnnounce}
            onMove={play}
          />
        </div>
        <div className="opponent-board">
          <h3>{names[opp] ?? t('opponent')}</h3>
          <SheetTable sheet={oppSheet} cols={MULTI_COLS} compact />
        </div>
      </div>
    </div>
  )
}
