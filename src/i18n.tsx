import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'hr' | 'en'

const dict = {
  hr: {
    title: 'Jamb',
    subtitle: 'Igra sa 6 kockica',
    roll: 'Baci kocke',
    rolling: 'Bacanje…',
    rollsLeft: 'Preostala bacanja',
    holdHint: 'Klikni kockicu da je zadržiš',
    announce: 'Najava',
    announcePick: 'Najavi red',
    announced: 'Najavljeno',
    newGame: 'Nova igra',
    confirmNewGame: 'Započeti novu igru? Trenutna igra bit će izgubljena.',
    signIn: 'Prijava',
    signUp: 'Registracija',
    signOut: 'Odjava',
    email: 'E-pošta',
    password: 'Lozinka',
    passwordHint: 'Najmanje 8 znakova',
    displayName: 'Nadimak',
    playAsGuest: 'Igraj kao gost',
    guestNote: 'Rezultati gostiju se ne spremaju.',
    checkEmail: 'Provjeri e-poštu i potvrdi registraciju.',
    leaderboard: 'Ljestvica',
    bestScore: 'Najbolji rezultat',
    gamesPlayed: 'Odigrano',
    player: 'Igrač',
    noScores: 'Još nema rezultata.',
    throwMode: 'Bacanje kockica',
    manual: 'Ručno',
    automatic: 'Automatski',
    language: 'Jezik',
    down: 'Dolje',
    downHint: 'Popunjava se odozgo prema dolje',
    up: 'Gore',
    upHint: 'Popunjava se odozdo prema gore',
    free: 'Slobodno',
    freeHint: 'Popunjava se bilo kojim redoslijedom',
    announceHint: 'Red se mora najaviti nakon prvog bacanja',
    ones: 'Jedinice',
    twos: 'Dvice',
    threes: 'Trice',
    fours: 'Četvorke',
    fives: 'Petice',
    sixes: 'Šestice',
    max: 'Najviše',
    min: 'Najmanje',
    kenta: 'Kenta',
    full: 'Ful',
    poker: 'Poker',
    jamb: 'Jamb',
    upperSum: 'Zbroj (1–6)',
    bonus: 'Bonus',
    middleSum: '(Max − Min) × 1',
    lowerSum: 'Zbroj (kenta–jamb)',
    columnTotal: 'Ukupno stupac',
    total: 'Ukupno',
    gameOver: 'Kraj igre!',
    finalScore: 'Konačni rezultat',
    scoreSaved: 'Rezultat je spremljen.',
    scoreNotSaved: 'Igraš kao gost — rezultat nije spremljen.',
    saveError: 'Greška pri spremanju rezultata.',
    chooseName: 'Odaberi nadimak za ljestvicu',
    save: 'Spremi',
    close: 'Zatvori',
    rules: 'Pravila',
    rulesText:
      'Igra se sa 6 kockica, u svakom polju boduje se najviše 5. U svakom potezu imaš do 3 bacanja; kockice koje zadržiš se ne bacaju ponovno. Stupci: Dolje (odozgo), Gore (odozdo), Slobodno (bilo koji red) i Najava (red moraš najaviti odmah nakon prvog bacanja). Bonus +30 ako je zbroj brojeva ≥ 60. Kenta vrijedi 66/56/46 ovisno o bacanju.',
    loading: 'Učitavanje…',
  },
  en: {
    title: 'Jamb',
    subtitle: 'Dice game with 6 dice',
    roll: 'Roll dice',
    rolling: 'Rolling…',
    rollsLeft: 'Rolls left',
    holdHint: 'Click a die to hold it',
    announce: 'Announce',
    announcePick: 'Announce a row',
    announced: 'Announced',
    newGame: 'New game',
    confirmNewGame: 'Start a new game? The current game will be lost.',
    signIn: 'Sign in',
    signUp: 'Sign up',
    signOut: 'Sign out',
    email: 'Email',
    password: 'Password',
    passwordHint: 'At least 8 characters',
    displayName: 'Display name',
    playAsGuest: 'Play as guest',
    guestNote: 'Guest scores are not saved.',
    checkEmail: 'Check your email to confirm your account.',
    leaderboard: 'Leaderboard',
    bestScore: 'Best score',
    gamesPlayed: 'Games',
    player: 'Player',
    noScores: 'No scores yet.',
    throwMode: 'Dice throw',
    manual: 'Manual',
    automatic: 'Automatic',
    language: 'Language',
    down: 'Down',
    downHint: 'Filled top to bottom',
    up: 'Up',
    upHint: 'Filled bottom to top',
    free: 'Free',
    freeHint: 'Filled in any order',
    announceHint: 'Row must be announced right after the first roll',
    ones: 'Ones',
    twos: 'Twos',
    threes: 'Threes',
    fours: 'Fours',
    fives: 'Fives',
    sixes: 'Sixes',
    max: 'Max',
    min: 'Min',
    kenta: 'Straight',
    full: 'Full house',
    poker: 'Poker',
    jamb: 'Jamb',
    upperSum: 'Sum (1–6)',
    bonus: 'Bonus',
    middleSum: '(Max − Min) × 1s',
    lowerSum: 'Sum (straight–jamb)',
    columnTotal: 'Column total',
    total: 'Total',
    gameOver: 'Game over!',
    finalScore: 'Final score',
    scoreSaved: 'Score saved.',
    scoreNotSaved: 'Playing as guest — score not saved.',
    saveError: 'Failed to save score.',
    chooseName: 'Pick a display name for the leaderboard',
    save: 'Save',
    close: 'Close',
    rules: 'Rules',
    rulesText:
      'Played with 6 dice; at most 5 count in each field. Each turn allows up to 3 rolls; held dice are not re-rolled. Columns: Down (top to bottom), Up (bottom to top), Free (any order) and Announce (you must announce a row right after the first roll). Bonus +30 if the number section sums to 60 or more. Straight scores 66/56/46 depending on the roll.',
    loading: 'Loading…',
  },
} as const

export type TKey = keyof (typeof dict)['en']

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (k: TKey) => string
}

const I18nContext = createContext<I18n | null>(null)

function initialLang(): Lang {
  const stored = localStorage.getItem('jamb.lang')
  if (stored === 'hr' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('hr') ? 'hr' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('jamb.lang', l)
    document.documentElement.lang = l
  }
  const t = (k: TKey) => dict[lang][k]
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside provider')
  return ctx
}
