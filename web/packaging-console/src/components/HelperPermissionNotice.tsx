import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { getBackendConfig, useIsBackendProbing } from '../state/backend'

const DISMISSED_KEY = 'winrelease.helperPermissionNoticeDismissed'

/**
 * Context for Chrome's "Local Network Access" permission prompt, shown *before* the browser's own
 * dialog can appear - not after, since by then the generic wording ("access other apps and services
 * on this device") has already confused someone with no idea this is about the WinRelease Helper.
 *
 * Purely reactive, never triggers a probe itself (state/backend.ts is explicit about which few
 * places are allowed to: the Settings page, and a real manifest/build call) - a visitor who's never
 * opened a project or Settings should never see this notice (or the permission prompt it's about) at
 * all. Once something else starts a probe - opening a project (ValidationBanner's live validation) or
 * visiting Settings - this is what actually renders in the same pass, before that fetch resolves.
 * Hides itself once the probe resolves (the prompt, if it was going to appear, already has) or once
 * the user dismisses it for good (localStorage, same pattern as Panel's remembered collapse state).
 */
export function HelperPermissionNotice() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const probing = useIsBackendProbing()

  // resolveBackend() is still technically "in flight" for one microtask even in hosted mode (it
  // resolves immediately, with no network call, but async functions never resolve fully
  // synchronously) - guard explicitly rather than relying on that timing being too fast to render,
  // since hosted mode should never show a notice about a local-network permission it will never ask for.
  if (dismissed || !probing || getBackendConfig().mode === 'hosted') {
    return null
  }

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Best-effort only - a blocked/private-mode localStorage just means it reappears next session.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-subtle bg-panel-alt px-3 py-2 text-xs text-muted">
      <Info size={13} className="mt-0.5 shrink-0 text-brand" />
      <span className="flex-1">
        Your browser may ask permission to <span className="text-ink">"access other apps and services on this device."</span>{' '}
        That's Chrome checking whether this page can reach the WinRelease Helper running on your computer, so your files
        never have to leave it. Allow it if you're running the Helper - otherwise it's safe to ignore or block.
      </span>
      <button onClick={dismiss} className="shrink-0 text-muted hover:text-ink" aria-label="Dismiss">
        <X size={13} />
      </button>
    </div>
  )
}
