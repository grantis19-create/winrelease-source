import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { AlertTriangle, Archive, Download, FolderOpen, Loader2, Package } from 'lucide-react'
import { getProject, setProjectStorageOverride, updateProject } from '../api/projects'
import { AppLayout } from '../components/layout/AppLayout'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Button } from '../components/ui/Button'
import { InlineError } from '../components/ui/InlineError'
import { loadStagedFiles, saveStagedFiles } from '../state/stagedFileStore'
import { ValidationBanner } from '../components/ValidationBanner'
import { JsonPreviewPanel } from '../components/JsonPreviewPanel'
import { BUILD_PANEL_ID, BuildPanel } from '../components/BuildPanel'
import { useBuild } from '../state/useBuild'
import { normalizeManifestGuids } from '../state/guid'
import { bundleFileName, createProjectBundle, filesFromSourcesZip } from '../state/projectBundle'
import { SHORTCUT_LOCATIONS, createEmptyManifest, withManifestDefaults } from '../types/manifest'
import { StorageSettings } from '../components/StorageSettings'
import { OpenProjectModal } from '../components/OpenProjectModal'
import { apiErrorMessage } from '../state/errorMessage'
import { isMvpMode } from '../mode'
import { PropertiesSection } from '../components/manifest-editor/PropertiesSection'
import { GeneralSection } from '../components/manifest-editor/GeneralSection'
import { AppInfoSection } from '../components/manifest-editor/AppInfoSection'
import { FilesSection } from '../components/manifest-editor/FilesSection'
import { ShortcutsSection } from '../components/manifest-editor/ShortcutsSection'
import { RegistrySection } from '../components/manifest-editor/RegistrySection'
import { EnvironmentVariablesSection } from '../components/manifest-editor/EnvironmentVariablesSection'
import { AdvancedGroup } from '../components/manifest-editor/AdvancedGroup'
import { scopeWarnings, workingDirectorySentinel, workingDirectorySentinelForInstallPath } from '../state/installTargets'
import { executableShortcutDefaults } from '../state/fileMetadata'
import type { InstallRoot, WinReleaseManifest } from '../types/manifest'

export function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  })

  // Adjust state during render (React's documented pattern for "reset local
  // state when a prop/query result changes") instead of an effect - the
  // draft only ever re-seeds from the server once, when a *different*
  // Project's data arrives, never on every fetched object.
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null)
  const [draft, setDraft] = useState<WinReleaseManifest | null>(null)
  // The automatic Product Code the compiler will use for this draft, as the server's validation computes it (ADR 0054).
  const [resolvedProductVersion, setResolvedProductVersion] = useState<string | undefined>(undefined)

  // Session-local only, never persisted (ADR 0033 - "Set as Primary" is a UX
  // helper, not a manifest field) and staged real Files for BuildPanel's
  // client-side zip (state/zipBuilder.ts), keyed by their manifest-relative
  // source path.
  const [primaryFileId, setPrimaryFileId] = useState<string | null>(null)
  // Seeded synchronously from navigation state when arriving straight from "Try a sample project"
  // (ProjectsListPage) - otherwise Build MSI would silently do nothing (canRun stays false with no
  // error) for however long the async IndexedDB restore below takes to catch up. A normal project
  // open (no navigation state) still relies on that restore, which is the right tool there - this
  // only short-circuits the one path where the files are already sitting in memory at navigation time.
  const [sourceFiles, setSourceFiles] = useState<Map<string, File>>(() => {
    const initialFiles = (location.state as { initialFiles?: { path: string; file: File }[] } | null)?.initialFiles
    return initialFiles ? new Map(initialFiles.map(({ path, file }) => [path, file])) : new Map()
  })

  const build = useBuild(draft ?? createEmptyManifest(), sourceFiles, () => saveNow(), projectId)

  // A failed build leaves its native compiler log in Build & Output - bring it on screen, since the
  // header button that triggered it is far from that panel.
  useEffect(() => {
    if (build.error) document.getElementById(BUILD_PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [build.error])

  type SaveStatus = 'saved' | 'dirty' | 'saving'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [justSaved, setJustSaved] = useState(false)
  const [openModalVisible, setOpenModalVisible] = useState(false)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (project && project.id !== loadedProjectId) {
    setLoadedProjectId(project.id)
    setDraft(normalizeManifestGuids(withManifestDefaults(project.manifest)))
    setSaveStatus('saved')
  }

  /** Every manifest-editor section's onChange goes through here, not setDraft directly, so any edit is tracked as dirty and queues the debounced autosave. */
  function updateDraft(next: WinReleaseManifest) {
    setDraft(next)
    setSaveStatus('dirty')
  }

  /** Manual Save button, Ctrl+S, and "Build MSI" (which must save first) all funnel through here - cancels any pending debounced autosave rather than racing it. */
  async function saveNow(manifest = draft) {
    if (!manifest || !projectId) return
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }

    setSaveStatus('saving')
    try {
      await saveDraft.mutateAsync(manifest)
      setSaveStatus('saved')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 800)
    } catch {
      setSaveStatus('dirty')
    }
  }

  // Debounced autosave - 1.5s of no further edits before it fires. Skips saving a draft that
  // currently fails validation (ValidationBanner already tells the user why) rather than
  // spamming failed PUTs on every keystroke of a manifest mid-edit.
  useEffect(() => {
    if (saveStatus !== 'dirty' || !draft) return

    autosaveTimer.current = setTimeout(() => {
      void saveNow()
    }, 1500)

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saveStatus])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  // MVP mode only: staged files survive a reload via IndexedDB (ADR 0047). The full Console keeps
  // them session-only as before.
  useEffect(() => {
    if (!isMvpMode() || !project) return
    let cancelled = false
    void loadStagedFiles(project.id).then((restored) => {
      if (cancelled || restored.size === 0) return
      setSourceFiles((prev) => new Map([...restored, ...prev]))
    })
    return () => {
      cancelled = true
    }
  }, [project?.id])

  /** Offline copy: the settings plus every file added, as one .zip (reopen with Open). Projects otherwise live only in this browser. */
  async function saveProjectFile() {
    if (!draft) return
    // Files attached as a sources .zip in the Build panel count too, so nothing the build would use is left out.
    const attached = build.manualZip ? await filesFromSourcesZip(build.manualZip) : new Map<string, File>()
    const blob = await createProjectBundle(draft, new Map([...attached, ...sourceFiles]))
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = bundleFileName(draft.name)
    link.click()
    URL.revokeObjectURL(url)
  }

  function stageFiles(entries: { path: string; file: File }[]) {
    if (isMvpMode() && projectId) void saveStagedFiles(projectId, entries)
    setSourceFiles((prev) => {
      const next = new Map(prev)
      for (const { path, file } of entries) next.set(path, file)
      return next
    })
  }

  /** From a Files & Folders row's "Create Shortcut" action - only ever offered for a `.exe` row, so executable detection always has a name/icon to suggest. */
  function createShortcutFor(fileId: string) {
    setDraft((current) => {
      if (!current) return current
      const file = current.files.declared.find((f) => f.id === fileId)
      const defaults = file ? executableShortcutDefaults(file) : {}
      return {
        ...current,
        shortcuts: [
          ...current.shortcuts,
          {
            name: defaults.name ?? current.name ?? fileId,
            targetFileId: fileId,
            location: SHORTCUT_LOCATIONS.programMenuFolder,
            workingDirectory: file ? workingDirectorySentinelForInstallPath(file.root, file.installPath) : undefined,
            iconPath: defaults.iconPath ?? null,
          },
        ],
      }
    })
    setSaveStatus('dirty')
  }

  /** From a Harvest Folder row's "Create Shortcut" action - its individual files aren't known until build time, so the shortcut starts with a blank custom Target for the user to fill in (a relative filename inside that folder), not a picked file. */
  function createShortcutForHarvest(root: InstallRoot, installPath: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            shortcuts: [
              ...current.shortcuts,
              { name: '', targetPath: '', location: SHORTCUT_LOCATIONS.programMenuFolder, workingDirectory: workingDirectorySentinel(root, installPath) },
            ],
          }
        : current,
    )
    setSaveStatus('dirty')
  }

  const saveDraft = useMutation({
    mutationFn: (manifest: WinReleaseManifest) => updateProject(projectId!, manifest),
    onSuccess: (updated) => {
      queryClient.setQueryData(['project', projectId], updated)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const saveStorage = useMutation({
    mutationFn: (storage: Parameters<typeof setProjectStorageOverride>[1]) =>
      setProjectStorageOverride(projectId!, storage),
    onSuccess: (updated) => queryClient.setQueryData(['project', projectId], updated),
  })

  if (isLoading || !draft) {
    return (
      <AppLayout>
        <p className="text-sm text-muted">Loading…</p>
      </AppLayout>
    )
  }

  const statusBadge: Record<SaveStatus, { label: string; dot: string; text: string }> = {
    saved: { label: 'Saved', dot: 'bg-ok', text: 'text-ok' },
    dirty: { label: 'Unsaved Changes', dot: 'bg-warn', text: 'text-warn' },
    saving: { label: 'Saving…', dot: 'bg-brand animate-pulse', text: 'text-brand' },
  }
  const badge = statusBadge[saveStatus]

  const latestMsi = [...build.results].reverse().find((r) => r.kind === 'msi')
  /** The project changed after this MSI was built: a download now would miss those changes. */
  const latestMsiOutOfDate = latestMsi !== undefined && latestMsi.fingerprint !== build.fingerprint

  /** Header's Build button - on failure the effect above scrolls the compiler log into view. */
  function runBuild() {
    return build.run('msi')
  }

  return (
    <AppLayout>
      <Breadcrumb items={[{ label: 'Projects', to: '/projects' }, { label: draft.name || '(untitled)' }]} />

      <div className="sticky top-0 z-20 -mx-8 flex flex-col gap-2 bg-canvas px-8 pb-2 pt-2 shadow-[0_8px_8px_-8px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-ink">{draft.name || '(untitled)'}</h1>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${badge.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenModalVisible(true)}>
            <FolderOpen size={14} /> Open
          </Button>
          <Button onClick={() => void saveProjectFile()} title="Download this project - settings and your files - as one .zip to keep or share, then bring it back with Open. (Your work is already saved in this browser automatically.)">
            <Archive size={14} /> Export project
          </Button>
          {latestMsi && !build.running && (
            <a
              href={latestMsi.url}
              download={latestMsi.fileName}
              className={
                latestMsiOutOfDate
                  ? 'inline-flex items-center gap-1.5 rounded-md border border-warn/60 bg-warn/10 px-3 py-1.5 text-sm font-medium text-warn hover:bg-warn/20'
                  : 'inline-flex items-center gap-1.5 rounded-md border border-ok/50 bg-ok/10 px-3 py-1.5 text-sm font-medium text-ok hover:bg-ok/20'
              }
              title={latestMsiOutOfDate ? `${latestMsi.fileName} was built before your latest changes. Press Build MSI to include them.` : `Download ${latestMsi.fileName}`}
            >
              {latestMsiOutOfDate ? <AlertTriangle size={14} /> : <Download size={14} />} Download .msi{latestMsiOutOfDate ? ' (out of date)' : ''}
            </a>
          )}
          {/* Build MSI is what people come for, so it is the one orange button; Save stays plain because the project already saves itself. */}
          <Button
            variant="primary"
            onClick={() => void runBuild()}
            disabled={build.running !== null || !build.canRun}
            title={build.blockedReason ?? 'Compile this project into an .msi'}
          >
            {build.running === 'msi' ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {build.running === 'msi' ? 'Building…' : 'Build MSI'}
          </Button>
          <Button
            onClick={() => void saveNow()}
            disabled={saveStatus === 'saving'}
            title="Ctrl+S"
            className={justSaved ? 'ring-2 ring-ok' : ''}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <InlineError message={apiErrorMessage(saveDraft.error)} />

      {/* The header's Build MSI button only has a hover tooltip (title=blockedReason) explaining why
          it's disabled - easy to never see, which is exactly how "I hit Build MSI and nothing
          happened" (no files staged yet, most often the sample project's async restore not having
          caught up) went unexplained. This is the same reason, always visible, no hover required. */}
      {build.blockedReason && !build.running && (
        <p className="flex items-center gap-1.5 text-xs text-warn">
          <AlertTriangle size={13} /> Build MSI is disabled: {build.blockedReason}
        </p>
      )}

      {/* canRun only needs *one* staged file, so this can be true while other declared files/harvest
          folders still have nothing behind them - most commonly right after importing a project (a
          winrelease.json export names files but carries none of their actual bytes) or reopening one
          whose source tree moved. The button isn't disabled in that case (build.blockedReason above
          stays null), so without this it would silently send an incomplete zip and fail server-side
          with a native wix error that doesn't say which of *your* files it was missing or where the
          manifest expected them from - this does, before that round-trip even happens. Mirrors
          BuildPanel's own copy further down (ADR shown there) - this is the one visible without
          scrolling past the editor to Build & Output. */}
      {build.canRun && build.missingSources.length > 0 && !build.running && (
        <p className="flex items-start gap-1.5 text-xs text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            {build.missingSources.length} file{build.missingSources.length === 1 ? '' : 's'} in this project{' '}
            {build.missingSources.length === 1 ? "has" : 'have'} no file attached, expected from:{' '}
            <span className="font-mono">{build.missingSources.join(', ')}</span>. Re-add {build.missingSources.length === 1 ? 'it' : 'them'} in
            Files &amp; Folders, or the build will fail.
          </span>
        </p>
      )}

      {/* Same advice as the Install Scope field, kept visible here so a per-user package aimed at Program Files (or HKLM) is never missed. */}
      {scopeWarnings(draft).map((warning) => (
        <p key={warning} className="flex items-start gap-1.5 text-xs text-warn">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {warning}
        </p>
      ))}

      <ValidationBanner manifest={draft} onResolved={(m) => {
        setResolvedProductVersion(m.resolvedProductVersion)
      }} />
      </div>

      <GeneralSection manifest={draft} onChange={updateDraft} lastBuiltProductCode={latestMsi?.productCode} autoProductCode={build.nextProductCode} onNewAutoProductCode={build.newProductCodeForNextBuild} sourceFiles={sourceFiles} />
      <AppInfoSection manifest={draft} onChange={updateDraft} sourceFiles={sourceFiles} onStageFiles={stageFiles} />
      <FilesSection
        manifest={draft}
        onChange={updateDraft}
        primaryFileId={primaryFileId}
        onSetPrimaryFileId={setPrimaryFileId}
        onCreateShortcut={createShortcutFor}
        onCreateShortcutForHarvest={createShortcutForHarvest}
        onStageFiles={stageFiles}
        sourceFiles={sourceFiles}
      />
      <ShortcutsSection manifest={draft} onChange={updateDraft} primaryFileId={primaryFileId} sourceFiles={sourceFiles} onStageFiles={stageFiles} />
      <RegistrySection manifest={draft} onChange={updateDraft} primaryFileId={primaryFileId} />
      <AdvancedGroup
        hasContent={(draft.environmentVariables?.length ?? 0) > 0 || (draft.properties?.length ?? 0) > 0}
        summary="Environment variables, MSI properties and the manifest JSON - most installers don't need these."
      >
        <EnvironmentVariablesSection manifest={draft} onChange={updateDraft} />
        <PropertiesSection manifest={draft} onChange={updateDraft} resolved={{ productCode: build.nextProductCode, productVersion: resolvedProductVersion }} />
        <JsonPreviewPanel manifest={draft} />
      </AdvancedGroup>
      {!isMvpMode() && (
        <StorageSettings
          current={project!.storageOverride ?? null}
          allowInherit
          saving={saveStorage.isPending}
          saved={saveStorage.isSuccess}
          error={apiErrorMessage(saveStorage.error)}
          onSave={(storage) => saveStorage.mutate(storage)}
        />
      )}

      <BuildPanel build={build} />

      {openModalVisible && <OpenProjectModal onClose={() => setOpenModalVisible(false)} currentProjectId={projectId} />}
    </AppLayout>
  )
}
