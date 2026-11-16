import { useState } from 'react'
import { applyTheme, getStoredTheme, THEMES, type ThemeId } from '../state/theme'
import { Palette } from 'lucide-react'
import { Panel } from './ui/Panel'

/** Colour theme picker. Kept in this browser only; Orange is the default. */
export function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme)

  const choose = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
  }

  return (
    <Panel icon={Palette} title="Theme" description="Pick the colour of the editor. It is remembered in this browser only.">
      <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            onClick={() => choose(t.id)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
              theme === t.id ? 'border-brand bg-panel-alt text-ink' : 'border-subtle text-muted hover:bg-panel-alt hover:text-ink'
            }`}
          >
            <span className="h-3.5 w-3.5 rounded-full border border-subtle" style={{ background: t.swatch }} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
    </Panel>
  )
}
