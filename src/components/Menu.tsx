import { useI18n } from '../i18n'
import { Pips } from './DieGlyph'

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
        <span className="menu-icon" aria-hidden="true">
          <span className="menu-die"><Pips value={6} /></span>
        </span>
        {t('singleGame')}
      </button>
      <button className="menu-choice" onClick={onMulti} disabled={!signedIn}>
        <span className="menu-icon" aria-hidden="true">
          <span className="menu-die"><Pips value={3} /></span>
          <span className="menu-die second"><Pips value={4} /></span>
        </span>
        {t('twoPlayers')}
      </button>
      {!signedIn && <p className="hint">{t('signInFor2p')}</p>}
    </div>
  )
}
