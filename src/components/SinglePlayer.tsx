import { useState } from 'react'
import Game, { type ThrowMode } from './Game'
import { SINGLE_COLS, emptySheet, grandTotal, isComplete, type ColId, type RowId, type Sheet } from '../game/rules'

interface Props {
  throwMode: ThrowMode
  onGameEnd: (score: number) => void
}

export default function SinglePlayer({ throwMode, onGameEnd }: Props) {
  const [sheet, setSheet] = useState<Sheet>(emptySheet)
  const [done, setDone] = useState(false)

  function handleMove(col: ColId, row: RowId, score: number) {
    const next: Sheet = { ...sheet, [col]: { ...sheet[col], [row]: score } }
    setSheet(next)
    if (isComplete(next, SINGLE_COLS)) {
      setDone(true)
      onGameEnd(grandTotal(next, SINGLE_COLS))
    }
  }

  return (
    <Game sheet={sheet} cols={SINGLE_COLS} throwMode={throwMode} active={!done} onMove={handleMove} />
  )
}
