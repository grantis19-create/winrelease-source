import { BookOpen, ChevronDown, Download, Laptop2, Play, Settings, ShieldCheck, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBackendStatus } from '../../state/backend'
import { HELPER_DOWNLOAD_URL, HELPER_LATEST_VERSION, HELPER_LINK, startHelperAndWait } from '../../state/helperLinks'
import { isUpdateAvailable } from '../../state/helperVersion'

/**
 * "Helper & Tools" dropdown in the top bar: connection state (passive - never starts the probe itself, ADR 0070), the Helper
 * download, the setup guide and the settings. Closes on outside click or Escape.
 */
export function HelperMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const status = useBackendStatus()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-panel-alt'

  return (
    <div ref={ref} className="relative self-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-subtle bg-panel px-3 py-1.5 text-xs text-ink hover:bg-panel-alt"
      >
        <span className={`h-2 w-2 rounded-full ${status?.isHelper ? 'bg-ok' : 'bg-muted'}`} aria-hidden />
        Helper &amp; Tools
        <ChevronDown size={12} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-md border border-subtle bg-panel shadow-lg">
          <p className="border-b border-subtle px-3 py-2 text-xs text-muted">
            {status?.isHelper ? `Local Helper connected${status.helperVersion ? ` (v${status.helperVersion})` : ''}` : 'Helper not checked or not running'}
          </p>
          {status?.isHelper && isUpdateAvailable(status.helperVersion) && (
            <a role="menuitem" href={HELPER_DOWNLOAD_URL} className={`${item} text-warn`} onClick={() => setOpen(false)}>
              <Download size={14} /> Update available (v{HELPER_LATEST_VERSION})
            </a>
          )}
          {HELPER_DOWNLOAD_URL ? (
            <a role="menuitem" href={HELPER_DOWNLOAD_URL} className={item} onClick={() => setOpen(false)}>
              <Download size={14} /> Download the Helper
            </a>
          ) : (
            <Link role="menuitem" to="/settings#download" className={item} onClick={() => setOpen(false)}>
              <Download size={14} /> Get the Helper
            </Link>
          )}
          {!status?.isHelper && (
            <a role="menuitem" href={HELPER_LINK} className={item} onClick={() => void startHelperAndWait().then(() => setOpen(false))}>
              <Play size={14} /> Start the Helper
            </a>
          )}
          <Link role="menuitem" to="/settings#quick-start" className={item} onClick={() => setOpen(false)}>
            <BookOpen size={14} /> Quick-start guide
          </Link>
          <Link role="menuitem" to="/settings#about" className={item} onClick={() => setOpen(false)}>
            <ShieldCheck size={14} /> What is the Helper?
          </Link>
          <Link role="menuitem" to="/settings#troubleshooting" className={item} onClick={() => setOpen(false)}>
            <Wrench size={14} /> Troubleshooting
          </Link>
          <Link role="menuitem" to="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings size={14} /> Settings
          </Link>
          <a role="menuitem" href="https://geappsolutions.com/" target="_blank" rel="noreferrer" className={item}>
            <Laptop2 size={14} /> Need more than a basic MSI?
          </a>
        </div>
      )}
    </div>
  )
}
