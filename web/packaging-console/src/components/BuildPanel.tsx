import { BuildLog } from './BuildLog'
import { AlertTriangle, CloudUpload, Download, Loader2, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isMvpMode } from '../mode'
import { BUILD_RESULT_LABELS, type BuildResult, type BuildState } from '../state/useBuild'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

export const BUILD_PANEL_ID = 'build-output'

/** The time for a build made today; the date as well for one brought back from an earlier visit. */
function formatBuiltAt(date: Date): string {
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : date.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** A successful build's log: one line from this page about what was built, then the compiler's own output unchanged (or a plain statement that it said nothing). */
function successLog(result: BuildResult, log: { standardOutput?: string; standardError?: string }): string {
  const compiler = [log.standardOutput, log.standardError].filter(Boolean).join('\n').trim()
  return [
    `Built ${result.fileName} (${formatBytes(result.bytes)}) from ${result.sourceFiles} source ${result.sourceFiles === 1 ? 'file' : 'files'} at ${formatBuiltAt(result.builtAt)}.`,
    compiler.length > 0 ? compiler : 'wix build reported no warnings or errors.',
  ].join('\n')
}

export function BuildPanel({ build }: { build: BuildState }) {
  const { manualZip, setManualZip, running, error, helperNeeded, log, results, hasStagedFiles, sourceSummary, fingerprint, canRun, needsFiles, missingSources, run } = build
  void manualZip

  return (
    <Panel
      id={BUILD_PANEL_ID}
      forceExpanded={running !== null || error !== null}
      icon={Package}
      title="Build Output"
      defaultCollapsed
      description={
        isMvpMode()
          ? 'Compiles your project into a Windows installer (.msi) you can download. Your files are used only for this build and are not stored on the server.'
          : 'Every artifact is compiled from this project\'s current settings and the files you\'ve added.'
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        {hasStagedFiles ? (
          <span className="text-xs text-muted">
            Using <span className="text-ink">{sourceSummary.files}</span> {sourceSummary.files === 1 ? 'file' : 'files'} from Files & Folders
            {sourceSummary.icons > 0 && (
              <>
                {' '}and <span className="text-ink">{sourceSummary.icons}</span> icon {sourceSummary.icons === 1 ? 'file' : 'files'}
              </>
            )}{' '}
            as sources.
            {sourceSummary.unused > 0 && (
              <span className="text-warn">
                {' '}
                {sourceSummary.unused} other attached {sourceSummary.unused === 1 ? 'file is' : 'files are'} not used by this project and will be ignored.
              </span>
            )}
          </span>
        ) : needsFiles ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            Or attach a sources .zip:
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setManualZip(e.target.files?.[0] ?? null)}
              className="text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-panel-alt file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </label>
        ) : (
          <span className="text-xs text-muted">This project delivers no files, so there is nothing to attach.</span>
        )}
        {!isMvpMode() && (
          <Button disabled={!canRun || running !== null} onClick={() => run('intune')}>
            {running === 'intune' ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
            Package for Intune
          </Button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">Use <span className="text-ink">Build MSI</span> at the top of the page - the result and its build log appear here.</p>

      {hasStagedFiles && missingSources.length > 0 && (
        <p className="mt-2 text-xs text-warn">
          {missingSources.length} item(s) in your project have no file attached ({missingSources.slice(0, 3).join(', ')}
          {missingSources.length > 3 ? ', …' : ''}). Re-add them in Files & Folders or the build will fail.
        </p>
      )}

      {error && helperNeeded && (
        <div className="mt-3 rounded-md border border-brand/40 bg-brand/10 p-3">
          <p className="text-sm font-semibold text-ink">{error}</p>
          <p className="mt-1 text-xs text-muted">
            The Helper is a small app that compiles your installer on your own PC, so your files never leave it. Download it, run it, then press Build MSI again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/settings#download" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-canvas hover:bg-brand-hover">
              <Download size={14} /> Get the Helper
            </Link>
            <Link to="/settings#quick-start" className="inline-flex items-center rounded-md border border-subtle px-3 py-1.5 text-xs font-medium text-ink hover:bg-panel-alt">
              Setup guide
            </Link>
          </div>
        </div>
      )}

      {error && !helperNeeded && (
        <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3">
          <p className="text-sm font-semibold text-danger">{error}</p>
          {(log?.standardOutput || log?.standardError) && (
            // Rule 3 (Transparent Error Pass-Through): the raw, verbatim native `wix build`
            // compiler log - pathing/schema/missing-preprocessor-variable errors read directly
            // from it, not a WinRelease-invented summary - prominently in red so it's impossible
            // to miss, right where the failure happened instead of collapsed behind a toggle.
            <div className="mt-2">
              <BuildLog text={[log.standardOutput, log.standardError].filter(Boolean).join('\n')} />
            </div>
          )}
        </div>
      )}

      {results.some((r) => r.kind === 'msi' && r.fingerprint !== fingerprint) && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            This MSI was built before your latest changes. Press <span className="font-medium">Build MSI</span> at the top of the page so it includes them.
          </span>
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-4 space-y-2">
          {results.map((result, index) => (
            <li
              key={index}
              className="flex items-center justify-between rounded-md border border-subtle bg-panel-alt px-3 py-2 text-sm"
            >
              <span>
                <span className="text-ink">{result.fileName}</span>{' '}
                <span className="text-xs text-muted">
                  ({BUILD_RESULT_LABELS[result.kind]}, {formatBytes(result.bytes)}, built {formatBuiltAt(result.builtAt)}
                  {result.kind === 'msi' && result.fingerprint !== fingerprint && <span className="text-warn"> - out of date</span>})
                </span>
                {result.productCode && (
                  <span className="mt-0.5 block text-xs text-muted" title="A new random Product Code is made for every build, unless you pin one in General.">
                    Product Code <span className="font-mono text-ink">{result.productCode}</span>
                  </span>
                )}
              </span>
              <a href={result.url} download={result.fileName} className="flex items-center gap-1 text-brand hover:text-brand-hover">
                <Download size={14} /> Download
              </a>
            </li>
          ))}
        </ul>
      )}

      {!error && log && results.length > 0 && (
        <details className="mt-4" open>
          <summary className="cursor-pointer text-xs font-medium text-muted">Build log</summary>
          <div className="mt-2">
            <BuildLog text={successLog(results[results.length - 1], log)} maxHeightClass="max-h-64" />
          </div>
        </details>
      )}
    </Panel>
  )
}
