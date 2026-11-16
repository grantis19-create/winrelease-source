import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

const COLLAPSE_STORAGE_PREFIX = 'winrelease:panel-collapsed:'

function readStoredCollapsed(title: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${COLLAPSE_STORAGE_PREFIX}${title}`)
    return stored === null ? fallback : stored === '1'
  } catch {
    return fallback
  }
}

export function Panel({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
  collapsible = true,
  defaultCollapsed = false,
  forceExpanded = false,
}: {
  id?: string
  icon: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  /** Every section collapses to just its header by default (a chevron appears), so a long editor can be folded down to the part being worked on; pass false to opt a panel out. Remembered in localStorage per panel title, not per project - a UI density preference, not project data. */
  collapsible?: boolean
  defaultCollapsed?: boolean
  /** Expands the panel whenever this turns true (e.g. a build starts or fails) - without touching the remembered preference. */
  forceExpanded?: boolean
}) {
  const [collapsed, setCollapsed] = useState(() => (collapsible ? readStoredCollapsed(title, defaultCollapsed) : false))

  useEffect(() => {
    if (forceExpanded) setCollapsed(false)
  }, [forceExpanded])

  function setAndRemember(next: boolean) {
    setCollapsed(next)
    try {
      localStorage.setItem(`${COLLAPSE_STORAGE_PREFIX}${title}`, next ? '1' : '0')
    } catch {
      // Best-effort only - a blocked/private-mode localStorage just means the preference doesn't survive a reload.
    }
  }

  function toggle() {
    setAndRemember(!collapsed)
  }

  return (
    <section id={id} className="scroll-mt-28 rounded-lg border border-subtle bg-panel p-5 transition-colors hover:border-brand/50">
      <div className={`flex items-start justify-between gap-4 ${collapsed ? '' : 'mb-4'}`}>
        <div
          className={collapsible ? 'flex-1 cursor-pointer select-none' : undefined}
          onClick={collapsible ? toggle : undefined}
          role={collapsible ? 'button' : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Icon size={14} />
            </span>
            <h2 className="text-base font-bold uppercase tracking-wide text-brand">{title}</h2>
            {collapsible && (
              <span className="text-muted">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
            )}
          </div>
          {description && !collapsed && <p className="mt-1.5 text-xs text-muted">{description}</p>}
        </div>
        {/* Using a header action (New Variable, Add Entry, ...) opens the section so its result is visible right away. */}
        {actions && (
          <div className="shrink-0" onClickCapture={() => collapsible && collapsed && setAndRemember(false)}>
            {actions}
          </div>
        )}
      </div>
      {!collapsed && children}
    </section>
  )
}
