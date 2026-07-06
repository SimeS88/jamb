import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Game, { type ThrowMode } from './Game'
import SheetTable from './SheetTable'
import { emptySheet, grandTotal, isComplete, type ColId, type RowId, type Sheet } from '../game/rules'
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
}

interface Props {
  session: Session
  throwMode: ThrowMode
  onExit: () => void
  onFinished: (score: number) => void
}

function normalizeSheet(s: Sheet | undefined): Sheet {
  return s ? { down: { ...s.down }, up: { ...s.up }, free: { ...s.free }, announce: { ...s.announce } } : emptySheet()
}

export default function MultiGame({ session, throwMode, onExit, onFinished }: Props) {
  const { t } = useI18n()
  const me = session.user.id
  const [match, setMatch] = useState<MatchRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const savedRef = useRef(false)

  // Pair up (or resume own waiting match).
  useEffect(() => {
    let cancelled = false
    supabase.rpc('jamb_find_match').then(({ data, error }) => {
      if (cancelled) return
      if (error) setError(error.message)
      else setMatch(Array.isArray(data) ? (data[0] as MatchRow) : (data as MatchRow))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Live updates + a polling fallback in case the websocket drops.
  const matchId = match?.id
  useEffect(() => {
    if (!matchId) return
    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jamb_matches', filter: `id=eq.${matchId}` },
        (payload) => setMatch(payload.new as MatchRow),
      )
      .subscribe()
    const poll = window.setInterval(async () => {
      const { data } = await supabase.from('jamb_matches').select('*').eq('id', matchId).single()
      if (data) setMatch(data as MatchRow)
    }, 7000)
    return () => {
      void supabase.removeChannel(channel)
      window.clearInterval(poll)
    }
  }, [matchId])

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
    myTurn && last && last.by === opp && last.col === 'announce' && mySheet.announce[last.row] === undefined
      ? last.row
      : null

  async function play(col: ColId, row: RowId, score: number) {
    if (!match || !myTurn) return
    const nextMine: Sheet = { ...mySheet, [col]: { ...mySheet[col], [row]: score } }
    const iAmDone = isComplete(nextMine)
    const bothDone = iAmDone && isComplete(oppSheet)
    const myTotal = grandTotal(nextMine)
    const oppTotal = grandTotal(oppSheet)
    const update = {
      state: {
        ...match.state,
        sheets: { ...match.state.sheets, [me]: nextMine, [opp]: oppSheet },
        lastMove: { by: me, col, row },
      },
      turn: opp,
      status: bothDone ? 'finished' : match.status,
      winner: bothDone ? (myTotal > oppTotal ? me : myTotal < oppTotal ? opp : null) : null,
    }
    setMatch({ ...match, ...update } as MatchRow) // optimistic
    const { error: upErr } = await supabase.from('jamb_matches').update(update).eq('id', match.id)
    if (upErr) setError(upErr.message)
    if (iAmDone && !savedRef.current) {
      savedRef.current = true
      onFinished(myTotal)
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

      <div className="multi-boards">
        <div>
          <Game
            sheet={mySheet}
            throwMode={throwMode}
            active={myTurn && !finished && !abandoned}
            forcedAnnounce={forcedAnnounce}
            onMove={play}
          />
        </div>
        <div className="opponent-board">
          <h3>{names[opp] ?? t('opponent')}</h3>
          <SheetTable sheet={oppSheet} compact />
        </div>
      </div>
    </div>
  )
}
