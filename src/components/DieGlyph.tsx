/** Pip positions on a 3×3 grid (0 = top-left … 8 = bottom-right). */
export const PIP_LAYOUT: Record<number, number[]> = {
  1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}

/** The face of a die: a 3×3 pip grid. The single pip of a 1 is red, as on real dice. */
export function Pips({ value }: { value: number }) {
  const on = PIP_LAYOUT[value] ?? []
  return (
    <span className={`pips face-${value}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.includes(i) ? 'pip' : 'pip empty'} />
      ))}
    </span>
  )
}

/** Tiny inline die used as a row label in the score sheet. */
export function DieGlyph({ value }: { value: number }) {
  return (
    <span className="die-glyph" aria-hidden="true">
      <Pips value={value} />
    </span>
  )
}
