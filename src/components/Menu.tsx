import { useI18n } from '../i18n'

interface Props {
  signedIn: boolean
  onSingle: () => void
  onMulti: () => void
}

export default function Menu({ signedIn, onSingle, onMulti }: Props) {
  const { t } = useI18n()
  return (
    <div className="menu">
      <button className="menu-choice" onClick={onSingle}>
        <span className="menu-icon">🎲</span>
        {t('singleGame')}
      </button>
      <button className="menu-choice" onClick={onMulti} disabled={!signedIn}>
        <span className="menu-icon">⚔️</span>
        {t('twoPlayers')}
      </button>
      {!signedIn && <p className="hint">{t('signInFor2p')}</p>}
    </div>
  )
}
