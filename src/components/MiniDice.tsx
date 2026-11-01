import { useEffect, useState } from 'react'
import { rollDie } from '../game/dice'
import { Pips } from './DieGlyph'

interface Props {
  values: number[]
  held: boolean[]
  rolling: boolean
}

/** Read-only dice strip used to mirror the opponent's dice live. */
export default function MiniDice({ values, held, rolling }: Props) {
  const [shown, setShown] = useState(values)

  useEffect(() => {
    if (!rolling) {
      setShown(values)
      return
    }
    // While the opponent is rolling we only know it started — animate
    // random faces locally until the settled snapshot arrives.
    const id = window.setInterval(() => {
      setShown((prev) => prev.map((v, i) => (held[i] ? v : rollDie())))
    }, 100)
    return () => window.clearInterval(id)
  }, [rolling, values, held])

  return (
    <span className="mini-dice">
      {shown.map((v, i) => (
        <span key={i} className={`mini-die ${held[i] ? 'held' : ''} ${rolling && !held[i] ? 'tumbling' : ''}`}>
          <Pips value={v} />
        </span>
      ))}
    </span>
  )
}
