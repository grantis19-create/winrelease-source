import { CheckCircle2, Laptop2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_HELPER_URL,
  getBackendConfig,
  resetResolvedBackend,
  resolveBackend,
  setBackendConfig,
  useBackendStatus,
  type BackendMode,
} from '../state/backend'
import { HELPER_LATEST_VERSION, startHelperAndWait } from '../state/helperLinks'
import { isUpdateAvailable } from '../state/helperVersion'
import { isMvpMode } from '../mode'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { Panel } from './ui/Panel'

const MODE_LABELS: Record<BackendMode, string> = {
  auto: 'Auto-detect (recommended)',
  helper: 'Always use the local Helper',
  hosted: 'Always use the hosted service',
}

const MODE_HINTS: Record<BackendMode, string> = {
  auto: 'Uses the WinRelease Helper on this machine when it\'s running, otherwise falls back to the hosted service.',
  helper: 'Every build goes through the Helper. If it isn\'t running, builds will fail instead of falling back.',
  hosted: 'Every build goes through the hosted service, even if a Helper is running on this machine.',
}

/**
 * Lets the user choose which backend handles manifest validation and Build MSI
 * (docs/roadmap/helper-exe-strategy.md, Phase 3): the WinRelease Helper running on their own
 * machine (source files never leave it), or the hosted service. The choice is a per-browser
 * preference (state/backend.ts, localStorage) - there's no server-side user profile to hang it off
 * yet (ADR 0032's open "ownership model" caveat), same reasoning as every other Console preference
 * that lives in localStorage today (Panel's collapsed state, the dev-mode token). Intune packaging,
 * accounts/projects, and storage settings are unaffected - the Helper doesn't implement those routes
 * (ADR 0067), so they always use the hosted service regardless of this setting.
 */
export function BackendSettings() {
  // The config last written to storage (by this component or on first mount) - compared against
  // the live mode/helperUrl state below to know whether there's anything unsaved. Updated on every
  // successful save so "dirty" goes back to false instead of staying stuck true (it compared
  // against a stale initial snapshot before this fix).
  const [lastSaved, setLastSaved] = useState(getBackendConfig)
  const [mode, setMode] = useState<BackendMode>(lastSaved.mode)
  const [helperUrl, setHelperUrl] = useState(lastSaved.helperUrl)
  const status = useBackendStatus()

  // The one deliberate place this probes on mount - useBackendStatus() itself never does (ADR 0070 /
  // state/backend.ts's own doc comment): a visitor who's actually on the Backend settings page has a
  // real reason to know whether a Helper is reachable, unlike a passive badge shown on every route.
  useEffect(() => {
    void resolveBackend()
  }, [])

  // The free site has no hosted service to choose between (ADR 0101): the only thing to configure is the Helper's address.
  const helperOnly = isMvpMode()

  const dirty = mode !== lastSaved.mode || helperUrl !== lastSaved.helperUrl

  function save() {
    const next = { mode, helperUrl: helperUrl.trim() || DEFAULT_HELPER_URL }
    setBackendConfig(next)
    setHelperUrl(next.helperUrl)
    setLastSaved(next)
    void resolveBackend()
  }

  function recheck() {
    resetResolvedBackend()
    void resolveBackend()
  }

  const [starting, setStarting] = useState(false)
  const [startFailed, setStartFailed] = useState(false)

  async function start() {
    setStarting(true)
    setStartFailed(false)
    setStartFailed(!(await startHelperAndWait()))
    setStarting(false)
  }

  const addressField = (
    <Field label="Helper URL" hint="The address the WinRelease Helper is listening on - leave this as the default unless you've changed its port.">
      <TextInput value={helperUrl} onChange={(e) => setHelperUrl(e.target.value)} placeholder={DEFAULT_HELPER_URL} className="max-w-sm" />
    </Field>
  )

  return (
    <Panel
      icon={Laptop2}
      title={helperOnly ? 'Helper' : 'Backend'}
      description={
        helperOnly
          ? 'MSI builds run in the WinRelease Helper on your own computer, so your files never leave it.'
          : 'Choose whether manifest validation and MSI builds run through the WinRelease Helper on this machine or the hosted service.'
      }
    >
      <div className="flex flex-col gap-4">
        <StatusLine status={status} helperOnly={helperOnly} />

        {!helperOnly && (
        <div className="flex flex-col gap-2">
          {(Object.keys(MODE_LABELS) as BackendMode[]).map((candidate) => (
            <label key={candidate} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-0.5"
                checked={mode === candidate}
                onChange={() => setMode(candidate)}
              />
              <span>
                <span className="text-ink">{MODE_LABELS[candidate]}</span>
                <span className="block text-xs text-muted">{MODE_HINTS[candidate]}</span>
              </span>
            </label>
          ))}
        </div>
        )}

        {helperOnly && status?.isHelper && <SetupChecks status={status} />}

        {!helperOnly && mode !== 'hosted' && addressField}

        <div className="flex items-center gap-3">
          {!helperOnly && (
            <Button variant="primary" onClick={save} disabled={!dirty}>
              Save Backend Settings
            </Button>
          )}
          <Button variant="secondary" onClick={recheck} disabled={starting}>
            Re-check connection
          </Button>
          {helperOnly && !status?.isHelper && (
            <Button variant="primary" onClick={start} disabled={starting}>
              {starting && <Loader2 size={13} className="animate-spin" />} Start the Helper
            </Button>
          )}
          {!helperOnly && !dirty && <span className="text-xs text-ok">Saved.</span>}
        </div>
        {startFailed && !status?.isHelper && (
          <p className="text-xs text-warn">
            It didn&apos;t start. Run WinRelease.Helper.exe once by hand (see the Quick-start guide below), and choose Open if your browser asks.
          </p>
        )}

        {helperOnly && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer select-none text-ink">Advanced: the Helper&apos;s address</summary>
            <div className="mt-2 flex flex-col gap-3">
              <p>
                The Helper listens on port 5601 of your own PC, and this site looks for it there. You only need to change this if something else on your
                PC already uses port 5601 and you started the Helper on a different port yourself (for example with <code>--Urls=http://127.0.0.1:5602</code>).
                Most people never touch it. The site can only reach addresses on your own computer, so it cannot be pointed at a server elsewhere.
              </p>
              {addressField}
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={save} disabled={!dirty}>
                  Save address
                </Button>
                {!dirty && <span className="text-xs text-ok">Saved.</span>}
              </div>
            </div>
          </details>
        )}
      </div>
    </Panel>
  )
}

function StatusLine({ status, helperOnly }: { status: ReturnType<typeof useBackendStatus>; helperOnly: boolean }) {
  if (status === null) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={13} className="animate-spin" /> Checking for the WinRelease Helper…
      </p>
    )
  }

  if (status.isHelper) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ok">
        <CheckCircle2 size={13} /> Connected to the WinRelease Helper{status.helperVersion ? ` (v${status.helperVersion})` : ''} - your
        files stay on this machine.
      </p>
    )
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <XCircle size={13} />{' '}
      {helperOnly ? (
        <span>
          No Helper detected. Press Start the Helper below, or follow the <Link to="/settings#quick-start" className="text-brand hover:underline">quick-start guide</Link>.
        </span>
      ) : (
        'No Helper detected - using the hosted service. Files are uploaded for each build.'
      )}
    </p>
  )
}

/** What the connected Helper reports about itself and the tools it needs: version, whether a newer one exists, .NET SDK and WiX. */
function SetupChecks({ status }: { status: NonNullable<ReturnType<typeof useBackendStatus>> }) {
  const row = (ok: boolean, label: string) => (
    <p className={`flex items-center gap-1.5 text-xs ${ok ? 'text-ok' : 'text-warn'}`}>
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {label}
    </p>
  )

  return (
    <div className="flex flex-col gap-1">
      {isUpdateAvailable(status.helperVersion) && (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <XCircle size={13} /> A newer Helper is available (v{HELPER_LATEST_VERSION}). See Download the Helper below: run the new one and it replaces this one.
        </p>
      )}
      {status.dotnetSdkVersion !== undefined &&
        row(
          !!status.dotnetSdkVersion || status.wixAvailable === true,
          status.dotnetSdkVersion
            ? `.NET SDK found (${status.dotnetSdkVersion})`
            : status.wixAvailable
              ? '.NET SDK not detected, but WiX is working'
              : '.NET SDK not found - see Quick-start guide, step 2, first command',
        )}
      {status.wixAvailable !== undefined &&
        row(status.wixAvailable, status.wixAvailable ? 'WiX compiler found' : 'WiX compiler not found - see Quick-start guide, step 2, second command')}
      {status.wixAvailable === true &&
        status.wixUiExtension !== undefined &&
        row(
          status.wixUiExtension,
          status.wixUiExtension
            ? 'WiX installer-screens add-on found'
            : 'WiX installer-screens add-on not found - needed while Installer Screens is on: see Quick-start guide, step 2, last command',
        )}
    </div>
  )
}
