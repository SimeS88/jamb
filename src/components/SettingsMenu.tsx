import { useEffect, useRef, useState } from 'react'
import type { ThrowMode } from './Game'
import { useI18n, type Lang } from '../i18n'

interface Props {
  throwMode: ThrowMode
  setThrowMode: (m: ThrowMode) => void
  signedIn: boolean
  onSignOut: () => void
}

/** Compact ⚙ popover so options don't take vertical space from the board. */
export default function SettingsMenu({ throwMode, setThrowMode, signedIn, onSignOut }: Props) {
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="settings-menu" ref={wrapRef}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('settings')}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-pop" role="menu">
          <label>
            {t('language')}
            <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="hr">Hrvatski</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t('throwMode')}
            <select value={throwMode} onChange={(e) => setThrowMode(e.target.value as ThrowMode)}>
              <option value="manual">{t('manual')}</option>
              <option value="automatic">{t('automatic')}</option>
            </select>
          </label>
          {signedIn && (
            <button
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
            >
              {t('signOut')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
