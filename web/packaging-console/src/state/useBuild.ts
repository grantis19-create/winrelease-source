import { useEffect, useMemo, useState } from 'react'
import { buildMsi, packageIntune } from '../api/builds'
import { ApiError } from '../api/client'
import { needsHelper, resolveBackend, type ResolvedBackend } from './backend'
import { isTooOld } from './helperVersion'
import { recordBuildOutcome } from './supportReport'
import { buildZip } from './zipBuilder'
import { loadBuiltMsi, saveBuiltMsi } from './builtMsiStore'
import { projectFingerprint } from './projectFingerprint'
import type { WinReleaseManifest } from '../types/manifest'

export interface BuildResult {
  kind: BuildJob
  url: string
  fileName: string
  builtAt: Date
  bytes: number
  /** How many source files the project used when this was built (see sourceSummary). */
  sourceFiles: number
  /** projectFingerprint at build time: when it no longer matches the project, this MSI is out of date. */
  fingerprint: string
  /** Built in an earlier visit and brought back from this browser's storage. */
  restored?: boolean
}

export type BuildJob = 'msi' | 'intune'

/** Short type label for a result row - deliberately not file-extension-shaped ("Unbundled .msi" used to sit right next to the real filename and read as if *that* were the filename WinRelease picked, when the real one - already product name + version, ADR fixed separately - was the fileName field beside it all along). */
export const BUILD_RESULT_LABELS: Record<BuildJob, string> = {
  msi: 'MSI package',
  intune: 'Intune package',
}

export interface BuildLog {
  standardOutput?: string
  standardError?: string
}

/**
 * What the staged files are doing for this project, worked out from the manifest every time it changes: declared files and harvested folders are
 * "files", icons named by a shortcut or the Apps entry are "icons", anything else attached is "unused" (the build ignores it).
 */
export function summariseSources(manifest: WinReleaseManifest, stagedPaths: string[]): { files: number; icons: number; unused: number } {
  const staged = stagedPaths.map(normalize)
  const declared = new Set(manifest.files.declared.map((f) => normalize(f.sourcePath)))
  const harvest = manifest.files.harvest.map((h) => normalize(h.sourceFolder).replace(/\/?$/, '/'))
  const iconNames = [...manifest.shortcuts.map((sc) => sc.iconPath), manifest.appInfo.autoExtractIcon ? null : manifest.appInfo.iconPath]
  const icons = new Set(iconNames.filter((p): p is string => !!p).map(normalize))
  let files = 0
  let iconCount = 0
  let unused = 0
  for (const path of staged) {
    if (declared.has(path) || harvest.some((h) => path.startsWith(h))) files++
    else if (icons.has(path)) iconCount++
    else unused++
  }
  return { files, icons: iconCount, unused }
}

export const HELPER_NEEDED_MESSAGE = 'Building an MSI needs the free WinRelease Helper running on your PC.'

const normalize = (p: string) => p.replaceAll('\\', '/').replace(/^\.?\//, '')

/**
 * Build state shared by the header's sticky "Build MSI" button and the Build & Output panel
 * (ADR 0050) - one source of truth so both always agree on running/error/results.
 */
export function useBuild(
  manifest: WinReleaseManifest,
  sourceFiles: Map<string, File>,
  onBeforeBuild?: () => Promise<void>,
  /** The saved Project this build belongs to, if any - threaded through to buildMsi/packageIntune so the API can resolve a configured build-notification webhook (ADR 0078). */
  projectId?: string,
) {
  const [manualZip, setManualZip] = useState<File | null>(null)
  const [running, setRunning] = useState<BuildJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The last build failed only because no build service is reachable - Build Output shows Helper setup instead of a red error. */
  const [helperNeeded, setHelperNeeded] = useState(false)
  const [log, setLog] = useState<BuildLog | null>(null)
  const [results, setResults] = useState<BuildResult[]>([])

  const hasStagedFiles = sourceFiles.size > 0
  // A package does not have to deliver files: registry values, environment variables or shortcuts alone are a valid MSI (UAT T4-26/27).
  const needsFiles = manifest.files.declared.length > 0 || manifest.files.harvest.length > 0
  const hasContent = needsFiles || manifest.registry.length > 0 || (manifest.environmentVariables?.length ?? 0) > 0 || manifest.shortcuts.length > 0
  const canRun = hasContent && (!needsFiles || hasStagedFiles || manualZip !== null)

  const stagedPaths = [...sourceFiles.keys()].map(normalize)
  const sourceSummary = summariseSources(manifest, stagedPaths)
  const fingerprint = useMemo(() => projectFingerprint(manifest, sourceFiles, manualZip), [manifest, sourceFiles, manualZip])

  // The last MSI built for this project is kept in the browser, so its Download button is still there after leaving the project or reloading.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void loadBuiltMsi(projectId).then((stored) => {
      if (cancelled || !stored) return
      const url = URL.createObjectURL(stored.blob)
      setLog((prev) => prev ?? { standardOutput: stored.standardOutput ?? '', standardError: stored.standardError ?? '' })
      setResults((prev) =>
        prev.some((r) => r.kind === 'msi')
          ? (URL.revokeObjectURL(url), prev)
          : [...prev, { kind: 'msi', url, fileName: stored.fileName, builtAt: new Date(stored.builtAt), bytes: stored.blob.size, sourceFiles: stored.sourceFiles, fingerprint: stored.fingerprint, restored: true }],
      )
    })
    return () => {
      cancelled = true
    }
  }, [projectId])
  // Files the manifest names that have nothing staged behind them (e.g. a project reopened from an
  // exported winrelease.json) - the compile would fail on these, so say so up front.
  const missingSources = manualZip !== null ? [] : [
    ...manifest.files.declared.filter((f) => !stagedPaths.includes(normalize(f.sourcePath))).map((f) => f.sourcePath),
    ...manifest.files.harvest
      .filter((h) => !stagedPaths.some((p) => p.startsWith(normalize(h.sourceFolder).replace(/\/?$/, '/'))))
      .map((h) => h.sourceFolder),
  ]

  async function run(job: BuildJob) {
    if (!canRun || running !== null) return
    setRunning(job)
    setError(null)
    setHelperNeeded(false)
    setLog(null)

    let backend: ResolvedBackend | null = null
    // Set just before the build request goes out, so a failure while zipping or saving is never mistaken for an unreachable Helper.
    let requestSent = false
    try {
      backend = await resolveBackend()
      if (backend.isHelper && isTooOld(backend.helperVersion)) {
        setError(`Your WinRelease Helper (v${backend.helperVersion ?? 'unknown'}) is too old for this site. Download the current one from the Helper & Tools menu, quit the old one from its tray icon, and run the new one.`)
        return
      }
      if (onBeforeBuild) await onBeforeBuild()
      const sourcesZip = hasStagedFiles || manualZip === null ? await buildZip(sourceFiles) : manualZip
      requestSent = true
      const { blob, fileName, standardOutput, standardError } =
        job === 'msi' ? await buildMsi(manifest, sourcesZip, projectId) : await packageIntune(manifest, sourcesZip, projectId)
      const url = URL.createObjectURL(blob)
      // Only the latest build of each kind is kept: a second click replaces the first instead of stacking identically named downloads.
      setResults((prev) => {
        prev.filter((r) => r.kind === job).forEach((r) => URL.revokeObjectURL(r.url))
        return [...prev.filter((r) => r.kind !== job), { kind: job, url, fileName, builtAt: new Date(), bytes: blob.size, sourceFiles: sourceSummary.files + sourceSummary.icons, fingerprint }]
      })
      if (job === 'msi' && projectId) void saveBuiltMsi({ projectId, fileName, blob, builtAt: Date.now(), fingerprint, sourceFiles: sourceSummary.files + sourceSummary.icons, standardOutput, standardError })
      setLog({ standardOutput, standardError })
      recordBuildOutcome({ job, ok: true, projectName: manifest.name, standardOutput, standardError })
    } catch (e) {
      // No build service behind this site, or the Helper set in Settings has stopped answering (fetch rejects with a TypeError): the visitor
      // needs the Helper. MSI only - Intune packaging always goes to the hosted service, which the Helper does not replace.
      const helperUnreachable = backend !== null && requestSent && job === 'msi'
        && (e instanceof ApiError ? needsHelper(backend, e.status) : backend.isHelper && e instanceof TypeError)
      if (helperUnreachable) {
        setHelperNeeded(true)
        setError(HELPER_NEEDED_MESSAGE)
        recordBuildOutcome({ job, ok: false, projectName: manifest.name, error: `${e instanceof ApiError ? e.status : 'unreachable'} - no build service; Helper needed` })
      } else if (e instanceof ApiError) {
        const details = Object.entries(e.errors ?? {}).flatMap(([field, messages]) => messages.map((m) => (field ? `${field}: ${m}` : m)))
        // HTTP/2 responses carry no status text, so e.message can be empty - never leave the error blank (a blank error renders nothing).
        const message = e.message || `The build failed (HTTP ${e.status}).`
        setError(details.length > 0 ? `${message} ${details.join(' ')}` : message)
        if (e.standardOutput || e.standardError) {
          setLog({ standardOutput: e.standardOutput, standardError: e.standardError })
        }
        recordBuildOutcome({ job, ok: false, projectName: manifest.name, error: `${e.status} ${e.message} ${details.join(' ')}`.trim(), standardOutput: e.standardOutput, standardError: e.standardError })
      } else {
        const message = `Build failed: ${e instanceof Error ? e.message : String(e)}. Is the WinRelease helper running?`
        setError(message)
        recordBuildOutcome({ job, ok: false, projectName: manifest.name, error: message })
      }
    } finally {
      setRunning(null)
    }
  }

  /** Why Build is unavailable right now, or null when it can run. */
  const blockedReason = canRun
    ? null
    : !hasContent
      ? 'There is nothing to install yet - add files, registry entries, environment variables or shortcuts.'
      : `This project names files that have nothing attached yet${missingSources.length > 0 ? ` (${missingSources.slice(0, 3).join(', ')}${missingSources.length > 3 ? ', …' : ''})` : ''}. Add them in Files & Folders.`

  return { manualZip, setManualZip, running, error, helperNeeded, log, results, hasStagedFiles, stagedCount: sourceFiles.size, sourceSummary, fingerprint, canRun, needsFiles, missingSources, blockedReason, run }
}

export type BuildState = ReturnType<typeof useBuild>
