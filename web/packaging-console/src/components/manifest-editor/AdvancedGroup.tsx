import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

const OPEN_STORAGE_KEY = 'winrelease:advanced-sections-open'

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Folds the sections most first-time users never need (Environment Variables, Properties, Manifest JSON) behind one line, so the editor
 * reads as a short page. Always open when the project already uses one of them - content is never hidden behind a closed group.
 */
export function AdvancedGroup({ hasContent, summary, children }: { hasContent: boolean; summary: string; children: ReactNode }) {
  const [open, setOpenState] = useState(() => hasContent || readStoredOpen())
  const shown = open || hasContent

  function toggle() {
    const next = !shown
    setOpenState(next)
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Best-effort only - a blocked localStorage just means the choice does not survive a reload.
    }
  }

  // Same box, icon chip, orange heading and trailing chevron as every Panel header, so the group reads as one more section. The sections it
  // holds open *inside* its box (not as loose siblings below it), so it is obvious which sections belong to Advanced.
  return (
    <section className="rounded-lg border border-subtle bg-panel p-5 transition-colors hover:border-brand/50">
      <button
        type="button"
        onClick={toggle}
        disabled={hasContent && shown}
        aria-expanded={shown}
        title={hasContent ? 'This project uses these sections, so they stay open.' : undefined}
        className="block w-full cursor-pointer select-none text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
            <Settings2 size={14} />
          </span>
          <span className="text-base font-bold uppercase tracking-wide text-brand">Advanced</span>
          <span className="text-muted">{shown ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        </span>
        <span className="mt-1.5 block text-xs text-muted">{summary}</span>
      </button>
      {shown && <div className="mt-4 flex flex-col gap-4 [&>section]:bg-canvas">{children}</div>}
    </section>
  )
}
