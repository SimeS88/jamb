import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Game, { type ThrowMode } from './Game'
import Lobby from './Lobby'
import SheetTable from './SheetTable'
import { MULTI_COLS, grandTotal, isComplete, type ColId, type RowId } from '../game/rules'
import { asRow, normalizeSheet, type MatchRow } from '../game/match'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface Props {
  session: Session
  throwMode: ThrowMode
  onExit: () => void
  onFinished: (score: number) => void
}

export default function MultiGame({ session, throwMode, onExit, onFinished }: Props) {
  const { t } = useI18n()
  const me = session.user.id
  const [booting, setBooting] = useState(true)
  const [match, setMatch] = useState<MatchRow | null>(null)
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [syncTrouble, setSyncTrouble] = useState(false)
  const savedRef = useRef(false)
  const failsRef = useRef(0)

  // Never let a stale fetch overwrite newer state.
  const applyRow = useCallback((row: MatchRow) => {
    setMatch((prev) => (prev && prev.id === row.id && prev.updated_at > row.updated_at ? prev : row))
  }, [])

  // Resume a running match if there is one; otherwise show the lobby.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('jamb_matches')
      .select('*')
      .eq('status', 'active')
      .or(`player1.eq.${me},player2.eq.${me}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else if (data && data.length > 0) setMatch(data[0] as MatchRow)
        setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [me])

  // Presence: announce ourselves while in the two-player area and track
  // who else is here (drives the online badges in the lobby).
  useEffect(() => {
    const channel = supabase.channel('jamb-presence', { config: { presence: { key: me } } })
    channel
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() })
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [me])

  // Live match updates + a self-healing polling fallback. A silent failure
  // here is what makes a match look stuck, so errors trigger a session
  // refresh and, if they persist, a visible notice.
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
  if (booting) return <div className="multi-status"><p>{t('loading')}</p></div>

  if (!match) {
    return (
      <div className="multi">
        <div className="multi-header">
          <h2 className="lobby-title">⚔️ {t('twoPlayers')}</h2>
          <button className="leave" onClick={onExit}>{t('backToMenu')}</button>
        </div>
        <Lobby session={session} online={online} onMatch={(m) => { savedRef.current = false; setMatch(m) }} />
      </div>
    )
  }

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
            setMatch(null)
          }}
        >
          {t('cancelSearch')}
        </button>
      </div>
    )
  }

  if (match.status === 'declined') {
    return (
      <div className="multi-status">
        <p>{t('challengeDeclined')}</p>
        <button onClick={() => setMatch(null)}>{t('backToMenu')}</button>
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
    setMatch(null) // back to the lobby
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
