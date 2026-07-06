// Cryptographically secure dice rolls. Math.random() is predictable enough
// to matter for a game with a public leaderboard, so we use the Web Crypto
// API with rejection sampling for a uniform 1..6 distribution.
export function rollDie(): number {
  const buf = new Uint8Array(1)
  // 252 is the largest multiple of 6 below 256; reject values above it
  // so each face has exactly equal probability.
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < 252) return (buf[0] % 6) + 1
  }
}

export interface Die {
  value: number
  held: boolean
}

export function newDice(count: number): Die[] {
  return Array.from({ length: count }, () => ({ value: 1, held: false }))
}

export function rollFree(dice: Die[]): Die[] {
  return dice.map((d) => (d.held ? d : { ...d, value: rollDie() }))
}
