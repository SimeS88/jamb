import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { asRow, type MatchRow } from '../game/match'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface Profile {
  id: string
  display_name: string
}

interface Props {
  session: Session
  online: Set<string>
  /** called with a waiting or active match to enter it */
  onMatch: (m: MatchRow) => void
}

export default function Lobby({ session, online, onMatch }: Props) {
  const { t } = useI18n()
  const me = session.user.id
  const [players, setPlayers] = useState<Profile[]>([])
  const [incoming, setIncoming] = useState<MatchRow[]>([])
  const [outgoing, setOutgoing] = useState<MatchRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [profilesRes, challengesRes, activeRes] = await Promise.all([
      supabase.from('jamb_profiles').select('id, display_name').neq('id', me).order('display_name'),
      supabase
        .from('jamb_matches')
        .select('*')
        .eq('status', 'challenge')
        .or(`player1.eq.${me},player2.eq.${me}`),
      supabase
        .from('jamb_matches')
        .select('*')
        .eq('status', 'active')
        .or(`player1.eq.${me},player2.eq.${me}`)
        .order('updated_at', { ascending: false })
        .limit(1),
    ])
    if (profilesRes.data) setPlayers(profilesRes.data as Profile[])
    if (challengesRes.data) {
      const rows = challengesRes.data as MatchRow[]
      setIncoming(rows.filter((r) => r.player2 === me))
      setOutgoing(rows.find((r) => r.player1 === me) ?? null)
    }
    // a challenge we sent got accepted (or quick match paired) → enter the game
    if (activeRes.data && activeRes.data.length > 0) onMatch(activeRes.data[0] as MatchRow)
  }, [me, onMatch])

  useEffect(() => {
    void refresh()
    const channel = supabase
      .channel(`lobby-${me}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jamb_matches', filter: `player2=eq.${me}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jamb_matches', filter: `player1=eq.${me}` },
        () => void refresh(),
      )
      .subscribe()
    const poll = window.setInterval(() => void refresh(), 5000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      void supabase.removeChannel(channel)
      window.clearInterval(poll)
      window.removeEventListener('focus', onFocus)
    }
  }, [me, refresh])

  async function quickMatch() {
    setBusy(true)
    setNotice(null)
    const { data, error } = await supabase.rpc('jamb_find_match')
    setBusy(false)
    if (error) setNotice(error.message)
    else onMatch(asRow(data))
  }

  async function challenge(opponent: Profile) {
    setBusy(true)
    setNotice(null)
    const { data, error } = await supabase.rpc('jamb_challenge', { p_opponent: opponent.id })
    setBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    const row = asRow(data)
    if (row.status === 'active') onMatch(row) // mutual challenge → instant start
    else setOutgoing(row)
  }

  async function cancelChallenge() {
    if (!outgoing) return
    await supabase
      .from('jamb_matches')
      .update({ status: 'declined' })
      .eq('id', outgoing.id)
      .eq('status', 'challenge')
    setOutgoing(null)
  }

  async function respond(m: MatchRow, accept: boolean) {
    setBusy(true)
    setNotice(null)
    const { data, error } = await supabase.rpc('jamb_respond_challenge', {
      p_match: m.id,
      p_accept: accept,
    })
    setBusy(false)
    if (error) {
      setNotice(error.message)
      void refresh()
      return
    }
    const row = asRow(data)
    if (accept && row.status === 'active') onMatch(row)
    else setIncoming((prev) => prev.filter((c) => c.id !== m.id))
  }

  const challengerName = (m: MatchRow) => m.state.names?.[m.player1] ?? t('opponent')

  return (
    <div className="lobby-2p">
      {notice && <p className="auth-message">{notice}</p>}

      {incoming.map((m) => (
        <div className="banner challenge-banner" key={m.id}>
          <span>⚔️ {challengerName(m)} — {t('challengesYou')}</span>
          <button className="primary" disabled={busy} onClick={() => respond(m, true)}>
            {t('accept')}
          </button>
          <button disabled={busy} onClick={() => respond(m, false)}>{t('decline')}</button>
        </div>
      ))}

      {outgoing && (
        <div className="banner warn">
          <span>
            📨 {outgoing.state.names && players.find((p) => p.id === outgoing.player2)?.display_name} — {t('waitingConfirm')}
          </span>
          <button onClick={cancelChallenge}>{t('cancelSearch')}</button>
        </div>
      )}

      <div className="lobby-actions">
        <button className="primary" disabled={busy || !!outgoing} onClick={quickMatch}>
          🎲 {t('quickMatch')}
        </button>
      </div>

      <div className="player-list">
        <h3>{t('players')}</h3>
        {players.length === 0 ? (
          <p className="hint">{t('noPlayers')}</p>
        ) : (
          <ul>
            {players.map((p) => (
              <li key={p.id}>
                <span className={`presence ${online.has(p.id) ? 'on' : 'off'}`} />
                <span className="player-name">{p.display_name}</span>
                <span className="presence-label">{online.has(p.id) ? t('online') : t('offline')}</span>
                <button
                  disabled={busy || !!outgoing}
                  onClick={() => challenge(p)}
                >
                  ⚔️ {t('challengeBtn')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
