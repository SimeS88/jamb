import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../i18n'

interface Props {
  onGuest: () => void
}

export default function AuthPanel({ onGuest }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (mode === 'signUp' && (displayName.trim().length < 2 || displayName.trim().length > 24)) {
      setMessage(`${t('displayName')}: 2–24`)
      return
    }
    if (password.length < 8) {
      setMessage(t('passwordHint'))
      return
    }
    setBusy(true)
    try {
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error
        if (data.session) {
          await supabase.from('jamb_profiles').upsert({
            id: data.session.user.id,
            display_name: displayName.trim(),
          })
        } else {
          setMessage(t('checkEmail'))
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-tabs">
        <button className={mode === 'signIn' ? 'active' : ''} onClick={() => setMode('signIn')}>
          {t('signIn')}
        </button>
        <button className={mode === 'signUp' ? 'active' : ''} onClick={() => setMode('signUp')}>
          {t('signUp')}
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'signUp' && (
          <label>
            {t('displayName')}
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={24}
              required
              autoComplete="nickname"
            />
          </label>
        )}
        <label>
          {t('email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          {t('password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? '…' : t(mode)}
        </button>
      </form>
      {message && <p className="auth-message">{message}</p>}
      <hr />
      <button onClick={onGuest}>{t('playAsGuest')}</button>
      <p className="hint">{t('guestNote')}</p>
    </div>
  )
}
