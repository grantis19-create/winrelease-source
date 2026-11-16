export type ThemeId = 'orange' | 'green' | 'blue' | 'mono'

export interface ThemeOption {
  id: ThemeId
  label: string
  /** Accent colour shown on the picker swatch (the live colours come from index.css). */
  swatch: string
}

export const THEMES: ThemeOption[] = [
  { id: 'orange', label: 'Orange', swatch: '#f97316' },
  { id: 'green', label: 'Green', swatch: '#4ade80' },
  { id: 'blue', label: 'Blue', swatch: '#60a5fa' },
  { id: 'mono', label: 'Mono', swatch: '#e5e7eb' },
]

const KEY = 'winrelease:theme'
export const DEFAULT_THEME: ThemeId = 'orange'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function getStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(KEY)
    return isThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME // Storage blocked: the default look.
  }
}

/** Puts the theme on the page (index.css reacts to the attribute) and remembers it in this browser only. */
export function applyTheme(theme: ThemeId, remember = true): void {
  if (theme === DEFAULT_THEME) document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
  if (!remember) return
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Best-effort only.
  }
}
