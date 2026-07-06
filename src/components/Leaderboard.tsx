import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface Row {
  display_name: string
  best_score: number
  games_played: number
}

export default function Leaderboard({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('jamb_leaderboard', { limit_count: 20 })
      .then(({ data, error }) => {
        if (!cancelled) setRows(error ? [] : (data as Row[]))
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <div className="leaderboard">
      <h2>{t('leaderboard')}</h2>
      {rows === null ? (
        <p>{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p>{t('noScores')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{t('player')}</th>
              <th>{t('bestScore')}</th>
              <th>{t('gamesPlayed')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.display_name}-${i}`}>
                <td>{i + 1}</td>
                <td>{r.display_name}</td>
                <td>{r.best_score}</td>
                <td>{r.games_played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
