import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { validateManifest } from '../api/manifest'
import { resetResolvedBackend, resolveBackend } from '../state/backend'
import { startHelperAndWait } from '../state/helperLinks'
import type { ValidationErrors, WinReleaseManifest } from '../types/manifest'

const DEBOUNCE_MS = 400
/** While the banner says the Helper is needed, look for it this often (and whenever the tab is focused again), for up to this many tries. */
const HELPER_POLL_MS = 5000
const HELPER_POLL_TRIES = 24

/**
 * The backend's `ValidationResult` member names (`ManifestModel.Validate`, `nameof(...)`),
 * camelCased by the API's JSON serializer - "name", "targetDirectory", etc. These are raw
 * manifest/JSON property names, not what the field is actually labeled in the editor ("Product
 * Name", "Install Directory") - this maps each one back to its on-screen label so an error reads
 * the same name the user sees on the field, not the wire format underneath it. Covers every
 * `nameof(...)` currently used in ManifestModel.Validate; an unmapped key (a future validation
 * rule added before this map catches up) falls back to showing the raw key rather than nothing.
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Product Name',
  manufacturer: 'Manufacturer',
  upgradeCode: 'Upgrade Code',
  productVersion: 'Product Version',
  targetDirectory: 'Install Directory',
  properties: 'Properties',
  files: 'Files & Folders',
  shortcuts: 'Shortcuts',
  intune: 'Intune Requirements',
}

/** Debounced live validation against POST /api/manifest/parse - the only place manifest validation rules live (ManifestParser). Sticky so it stays visible while editing lower sections. */
export function ValidationBanner({ manifest, onResolved }: { manifest: WinReleaseManifest; onResolved?: (resolved: WinReleaseManifest) => void }) {
  const [state, setState] = useState<'checking' | 'ok' | 'invalid' | 'unreachable' | 'helper-needed'>('checking')
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [errors, setErrors] = useState<ValidationErrors>({})

  useEffect(() => {
    let cancelled = false
    setState('checking')

    const timer = setTimeout(async () => {
      let result: Awaited<ReturnType<typeof validateManifest>>
      try {
        result = await validateManifest(manifest)
      } catch {
        // The chosen backend (a Helper set in Settings) isn't answering - the same remedy as no backend at all: start the Helper.
        if (!cancelled) setState('helper-needed')
        return
      }
      if (cancelled) return
      if (result.ok) {
        if (result.manifest) onResolved?.(result.manifest)
        setState('ok')
        setErrors({})
      } else if (result.helperNeeded) {
        setState('helper-needed')
      } else if (result.failure) {
        setFailure(result.failure)
        setState('unreachable')
      } else {
        setState('invalid')
        setErrors(result.errors ?? {})
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [manifest, attempt])

  function recheck() {
    resetResolvedBackend()
    setAttempt((n) => n + 1)
  }

  const [startFailed, setStartFailed] = useState(false)

  // The Helper is often started after this page first looked for it (the tray program quits on its own when the site has been closed for a few
  // minutes, and starting it from the Start button or by hand takes a moment). The answer used to be cached until "Check again", so a Helper that
  // was already running still read as missing. Keep looking quietly while the banner is up, and again whenever the tab comes back into view.
  useEffect(() => {
    if (state !== 'helper-needed') return
    let stopped = false
    let tries = 0
    async function look() {
      if (stopped || document.hidden) return
      tries++
      resetResolvedBackend()
      const resolved = await resolveBackend()
      if (!stopped && resolved.isHelper) setAttempt((n) => n + 1)
    }
    const timer = setInterval(() => {
      if (tries < HELPER_POLL_TRIES) void look()
    }, HELPER_POLL_MS)
    const onReturn = () => {
      if (document.hidden) return
      tries = 0
      void look()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [state])

  async function startHelper() {
    setStartFailed(false)
    if (await startHelperAndWait()) {
      recheck()
    } else {
      setStartFailed(true)
    }
  }

  return (
    <div>
      {state === 'checking' && (
        <div className="flex items-center gap-2 rounded-md border border-subtle bg-panel px-3 py-2 text-xs text-muted shadow-lg">
          <Loader2 size={14} className="animate-spin" /> Validating…
        </div>
      )}

      {state === 'helper-needed' && (
        // The normal state on the free site before the Helper is started - informational, not a warning.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-subtle bg-panel px-3 py-2 text-xs text-muted shadow-lg">
          <Info size={14} className="shrink-0" />
          <span>
            Checks and builds run in the free WinRelease Helper on your PC. Your edits are saved in this browser.{' '}
            <button type="button" onClick={() => void startHelper()} className="font-medium text-brand hover:underline">
              Start the Helper
            </button>{' '}
            ·{' '}
            <Link to="/settings#quick-start" className="font-medium text-brand hover:underline">Get the Helper</Link>
            {startFailed && <span className="ml-1 text-warn">It did not answer: run it once by hand (see Get the Helper), then Check again.</span>}
          </span>
          <button type="button" onClick={recheck} className="ml-auto shrink-0 font-medium underline hover:text-ink">
            Check again
          </button>
        </div>
      )}

      {state === 'unreachable' && (
        <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn shadow-lg">
          <AlertTriangle size={14} /> The project couldn't be checked right now{failure ? ` (${failure})` : ''}. Your edits are still saved in this browser.
          <button type="button" onClick={recheck} className="ml-auto font-medium underline hover:text-ink">
            Try again
          </button>
        </div>
      )}

      {state === 'ok' && (
        <div className="flex items-center gap-2 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok shadow-lg">
          <CheckCircle2 size={14} /> Manifest is valid.
        </div>
      )}

      {state === 'invalid' && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger shadow-lg">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} /> {Object.entries(errors).length} validation{' '}
            {Object.entries(errors).length === 1 ? 'issue' : 'issues'}
          </div>
          <ul className="mt-1.5 ml-5 max-h-24 list-disc space-y-0.5 overflow-auto">
            {Object.entries(errors).map(([field, fieldMessages]) =>
              fieldMessages.map((message, i) => (
                <li key={`${field}-${i}`}>
                  {field && <span className="font-medium">{FIELD_LABELS[field] ?? field}: </span>}
                  {message}
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
