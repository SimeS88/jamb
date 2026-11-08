export type Theme = 'auto' | 'light' | 'dark'

const KEY = 'jamb.theme'

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

/** 'auto' follows the device; light/dark pin the look via <html data-theme>. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme
}

export function saveTheme(theme: Theme) {
  applyTheme(theme)
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // private mode etc.: the choice just won't persist
  }
}
