import { BookOpen, FolderKanban, Laptop2, LifeBuoy, LogOut, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../../api/authToken'
import { isMvpMode } from '../../mode'
import { useBackendStatus } from '../../state/backend'
import { hasUnseenNews, onNewsSeenChange } from '../../state/whatsNew'

const navItemClasses = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-panel-alt text-ink' : 'text-muted hover:bg-panel-alt hover:text-ink'
  }`

export function Sidebar() {
  const navigate = useNavigate()
  const mvp = isMvpMode()
  const [unseenNews, setUnseenNews] = useState(hasUnseenNews)
  useEffect(() => onNewsSeenChange(() => setUnseenNews(hasUnseenNews())), [])

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-subtle bg-panel px-3 py-4">
      {/* The logo goes back to the front page (in the full console that route sends you to the projects list). */}
      <Link to="/" className="mb-6 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-panel-alt" title="Back to the front page" aria-label="WinRelease.io, back to the front page">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-canvas">W</span>
        <span className="text-sm font-semibold text-ink">WinRelease.io</span>
        <span className="rounded border border-brand px-1 text-[10px] font-semibold uppercase tracking-wide text-brand" title="WinRelease is in beta: free while in beta">
          Beta
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        <NavLink to="/projects" className={navItemClasses}>
          <FolderKanban size={16} />
          Projects
        </NavLink>
        {/* Shown in MVP mode too (unlike Sign out below) - Backend selection (docs/roadmap/helper-exe-strategy.md) applies there even though BYOS storage doesn't. */}
        <NavLink to="/settings" className={navItemClasses}>
          <Settings size={16} />
          Settings
        </NavLink>
        <NavLink to="/help" className={navItemClasses}>
          <BookOpen size={16} />
          Build Help
        </NavLink>
        <NavLink to="/release-notes" className={navItemClasses}>
          <Sparkles size={16} />
          Release notes
          {unseenNews && <span className="ml-auto h-2 w-2 rounded-full bg-brand" role="status" aria-label="New since you last looked" />}
        </NavLink>
        <NavLink to="/support" className={navItemClasses}>
          <LifeBuoy size={16} />
          Feedback &amp; Support
        </NavLink>
      </nav>

      <BackendIndicator />

      <p className="px-3 pb-2 text-[10px] leading-snug text-muted">
        &copy; {new Date().getFullYear()} GE App Solutions. All rights reserved. WinRelease may not be copied, resold or redistributed.{' '}
        <NavLink to="/help#disclaimer" className="underline hover:text-ink">
          Disclaimer
        </NavLink>
        {' · '}
        <NavLink to="/privacy" className="underline hover:text-ink">
          Privacy
        </NavLink>
      </p>

      {!mvp && (
        <button
          onClick={() => {
            clearToken()
            navigate('/login')
          }}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-panel-alt hover:text-ink"
        >
          <LogOut size={16} />
          Sign out
        </button>
      )}
    </aside>
  )
}

/**
 * Quiet confirmation that builds are staying on this machine - the strategy doc
 * (docs/roadmap/helper-exe-strategy.md) calls for the Console to "say so in the UI" whenever the
 * Helper is what's actually answering. Purely reactive (state/backend.ts's useBackendStatus never
 * triggers a probe itself, ADR 0070) - shows nothing until something else with a real reason to
 * (opening a project, visiting Settings) has actually started one, and nothing at all on the hosted
 * backend, so this is a pure addition, not a layout change for anyone not using a Helper.
 */
function BackendIndicator() {
  const status = useBackendStatus()
  if (!status?.isHelper) return null

  return (
    <div className="mb-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-ok">
      <Laptop2 size={13} />
      Local Helper{status.helperVersion ? ` v${status.helperVersion}` : ''}
    </div>
  )
}
