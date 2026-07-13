import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface HistoryRow {
  match_id: string
  opponent_id: string
  opponent_name: string
  my_score: number
  opp_score: number
  result: 'win' | 'loss' | 'draw'
  played_at: string
}

interface OpponentAgg {
  name: string
  wins: number
  losses: number
  draws: number
}

export default function StatsPanel({ refreshKey }: { refreshKey: number }) {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<HistoryRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('jamb_history').then(({ data, error }) => {
      if (!cancelled) setRows(error ? [] : ((data ?? []) as HistoryRow[]))
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (rows === null) {
    return (
      <div className="stats-panel">
        <h2>{t('myStats')}</h2>
        <p>{t('loading')}</p>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="stats-panel">
        <h2>{t('myStats')}</h2>
        <p className="hint">{t('noMatches')}</p>
      </div>
    )
  }

  const totals = { win: 0, loss: 0, draw: 0 }
  const byOpponent = new Map<string, OpponentAgg>()
  for (const r of rows) {
    totals[r.result]++
    const agg = byOpponent.get(r.opponent_id) ?? {
      name: r.opponent_name,
      wins: 0,
      losses: 0,
      draws: 0,
    }
    if (r.result === 'win') agg.wins++
    else if (r.result === 'loss') agg.losses++
    else agg.draws++
    byOpponent.set(r.opponent_id, agg)
  }
  const standings = [...byOpponent.values()].sort((a, b) => b.wins - a.wins)
  const resultLabel = { win: t('resWin'), loss: t('resLoss'), draw: t('resDraw') }

  return (
    <div className="stats-panel">
      <h2>{t('myStats')}</h2>
      <div className="scorecard">
        <div className="stat win">
          <strong>{totals.win}</strong>
          <span>{t('wins')}</span>
        </div>
        <div className="stat loss">
          <strong>{totals.loss}</strong>
          <span>{t('losses')}</span>
        </div>
        <div className="stat draw">
          <strong>{totals.draw}</strong>
          <span>{t('draws')}</span>
        </div>
      </div>

      <h3>{t('standings')}</h3>
      <table>
        <thead>
          <tr>
            <th>{t('player')}</th>
            <th>{t('wins')}</th>
            <th>{t('losses')}</th>
            <th>{t('draws')}</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td>{s.wins}</td>
              <td>{s.losses}</td>
              <td>{s.draws}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{t('recentMatches')}</h3>
      <ul className="history">
        {rows.slice(0, 10).map((r) => (
          <li key={r.match_id} className={r.result}>
            <span className="history-date">
              {new Date(r.played_at).toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB')}
            </span>
            <span className="history-opp">{r.opponent_name}</span>
            <span className="history-score">{r.my_score} : {r.opp_score}</span>
            <span className="history-result">{resultLabel[r.result]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
