import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AuthPanel from './components/AuthPanel'
import type { ThrowMode } from './components/Game'
import Leaderboard from './components/Leaderboard'
import Menu from './components/Menu'
import MultiGame from './components/MultiGame'
import SinglePlayer from './components/SinglePlayer'
import StatsPanel from './components/StatsPanel'
import { supabase } from './lib/supabase'
import { useI18n, type Lang } from './i18n'

type Screen = 'menu' | 'single' | 'multi'

function initialThrowMode(): ThrowMode {
  return localStorage.getItem('jamb.throwMode') === 'automatic' ? 'automatic' : 'manual'
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [guest, setGuest] = useState(false)
  const [screen, setScreen] = useState<Screen>('menu')
  const [throwMode, setThrowModeState] = useState<ThrowMode>(initialThrowMode)
  const [gameKey, setGameKey] = useState(0)
  const [lbKey, setLbKey] = useState(0)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Make sure a signed-in user has a leaderboard profile (e.g. after email
  // confirmation, when the signup-time upsert never ran in this browser).
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    supabase
      .from('jamb_profiles')
      .select('id')
      .eq('id', uid)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) {
          const raw = session.user.user_metadata?.display_name
          const name =
            typeof raw === 'string' && raw.trim().length >= 2
              ? raw.trim().slice(0, 24)
              : (session.user.email ?? 'player').split('@')[0].slice(0, 24).padEnd(2, '_')
          // note: supabase-js queries only run when awaited
          const { error } = await supabase
            .from('jamb_profiles')
            .upsert({ id: uid, display_name: name })
          if (error) console.error('profile creation failed:', error.message)
        }
      })
  }, [session])

  function setThrowMode(m: ThrowMode) {
    setThrowModeState(m)
    localStorage.setItem('jamb.throwMode', m)
  }

  async function saveScore(score: number): Promise<boolean> {
    if (!session) return false
    const { error } = await supabase.from('jamb_games').insert({
      user_id: session.user.id,
      score,
      dice_count: 6,
      throw_mode: throwMode,
    })
    if (!error) setLbKey((k) => k + 1)
    return !error
  }

  async function handleSingleEnd(score: number) {
    if (!session) {
      setBanner(`${t('gameOver')} ${t('finalScore')}: ${score}. ${t('scoreNotSaved')}`)
      return
    }
    const ok = await saveScore(score)
    setBanner(
      `${t('gameOver')} ${t('finalScore')}: ${score}. ${ok ? t('scoreSaved') : t('saveError')}`,
    )
  }

  function backToMenu() {
    if (screen === 'single' && !banner && !window.confirm(t('confirmNewGame'))) return
    setBanner(null)
    setGameKey((k) => k + 1)
    setScreen('menu')
  }

  if (!authReady) return <main className="app"><p>{t('loading')}</p></main>

  const playing = session !== null || guest

  return (
    <main className="app">
      <header>
        <div>
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="settings">
          {screen !== 'menu' && screen !== 'multi' && (
            <button onClick={backToMenu}>← {t('backToMenu')}</button>
          )}
          <label>
            {t('language')}
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="hr">Hrvatski</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t('throwMode')}
            <select
              value={throwMode}
              onChange={(e) => setThrowMode(e.target.value as ThrowMode)}
            >
              <option value="manual">{t('manual')}</option>
              <option value="automatic">{t('automatic')}</option>
            </select>
          </label>
          {session && (
            <button
              onClick={() => {
                void supabase.auth.signOut()
                setGuest(false)
                setScreen('menu')
              }}
            >
              {t('signOut')}
            </button>
          )}
        </div>
      </header>

      {banner && (
        <div className="banner" role="status">
          <span>{banner}</span>
          <button
            onClick={() => {
              setBanner(null)
              setGameKey((k) => k + 1)
            }}
          >
            {t('newGame')}
          </button>
          <button onClick={backToMenu}>{t('backToMenu')}</button>
        </div>
      )}

      {!playing ? (
        <div className="lobby">
          <AuthPanel onGuest={() => setGuest(true)} />
          <Leaderboard refreshKey={lbKey} />
        </div>
      ) : screen === 'menu' ? (
        <div className="lobby">
          <div>
            <Menu
              signedIn={session !== null}
              onSingle={() => {
                setBanner(null)
                setGameKey((k) => k + 1)
                setScreen('single')
              }}
              onMulti={() => setScreen('multi')}
            />
            <details className="rules">
              <summary>{t('rules')}</summary>
              <p>{t('rulesText')}</p>
            </details>
          </div>
          <div>
            <Leaderboard refreshKey={lbKey} />
            {session && <StatsPanel refreshKey={lbKey} />}
          </div>
        </div>
      ) : screen === 'single' ? (
        <div className="play-area">
          <SinglePlayer key={gameKey} throwMode={throwMode} onGameEnd={handleSingleEnd} />
          <aside>
            <Leaderboard refreshKey={lbKey} />
            <details className="rules">
              <summary>{t('rules')}</summary>
              <p>{t('rulesText')}</p>
            </details>
          </aside>
        </div>
      ) : (
        session && (
          <MultiGame
            key={gameKey}
            session={session}
            throwMode={throwMode}
            onExit={backToMenu}
            onFinished={(score) => void saveScore(score)}
          />
        )
      )}
    </main>
  )
}
