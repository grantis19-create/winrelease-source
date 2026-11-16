import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileJson, FolderOpen, Trash2 } from 'lucide-react'
import { Modal } from './ui/Modal'
import { InlineError } from './ui/InlineError'
import { listProjects, createProject, deleteProject } from '../api/projects'
import { getCurrentAccountId } from '../api/currentAccount'
import { apiErrorMessage } from '../state/errorMessage'
import { readProjectBundle, stripManifestHeader } from '../state/projectBundle'
import { saveStagedFiles } from '../state/stagedFileStore'
import { isPristinePlaceholderProject } from '../state/manifestDraft'
import { withManifestDefaults } from '../types/manifest'
import type { WinReleaseManifest } from '../types/manifest'

/** Header's "Open" action - recent Projects (open or delete), WinRelease's own winrelease.json, or a saved project .zip ("Export project" in the editor). WinRelease opens only what it made itself (ADR 0093). */
export function OpenProjectModal({ onClose, currentProjectId }: { onClose: () => void; currentProjectId?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accountId = getCurrentAccountId()!
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', accountId],
    queryFn: () => listProjects(accountId),
  })

  async function removeProject(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name || '(untitled)'}"? This can't be undone.`)) return

    setImportError(null)
    setDeletingId(id)
    try {
      await deleteProject(id)
      await queryClient.invalidateQueries({ queryKey: ['projects', accountId] })
      if (id === currentProjectId) {
        navigate('/projects')
        onClose()
      }
    } catch (e) {
      setImportError(apiErrorMessage(e) ?? 'Could not delete that project.')
    } finally {
      setDeletingId(null)
    }
  }

  async function openImportedManifest(manifest: WinReleaseManifest) {
    const project = await createProject(accountId, withManifestDefaults(manifest))

    // Rule 4 (decouple creation from importing): if the import was launched from inside an
    // already-open project's editor, and that project is still an untouched "New Project"
    // placeholder, importing into a fresh project shouldn't leave the placeholder behind as an
    // orphan on the dashboard. Best-effort - a failed cleanup here shouldn't block the import.
    const currentProject = projects?.find((p) => p.id === currentProjectId)
    if (currentProject && isPristinePlaceholderProject(currentProject.manifest)) {
      try {
        await deleteProject(currentProject.id)
        await queryClient.invalidateQueries({ queryKey: ['projects', accountId] })
      } catch {
        // Leave it - the successful import still takes priority over this cleanup.
      }
    }

    navigate(`/projects/${project.id}`)
    onClose()
  }

  async function openChosenFile(file: File) {
    setImportError(null)
    setImporting(true)
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const bundle = await readProjectBundle(file)
        const project = await createProject(accountId, bundle.manifest)
        if (bundle.files.length > 0) await saveStagedFiles(project.id, bundle.files)
        navigate(`/projects/${project.id}`)
        onClose()
        return
      }

      const text = await file.text()
      let manifest: WinReleaseManifest
      try {
        const parsed = JSON.parse(text)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
        manifest = stripManifestHeader(parsed, file.name) as unknown as WinReleaseManifest
      } catch (e) {
        if (e instanceof Error && e.message.includes(file.name)) throw e
        throw new Error(`"${file.name}" isn't valid JSON.`)
      }

      await openImportedManifest(manifest)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : apiErrorMessage(e) ?? 'Could not import that manifest.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal title="Open Project" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <InlineError message={importError} />

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <FolderOpen size={13} /> Recent Projects
          </h3>
          <div className="max-h-48 overflow-y-auto rounded-md border border-subtle">
            {isLoading && <p className="p-3 text-xs text-muted">Loading…</p>}
            {!isLoading && projects?.length === 0 && <p className="p-3 text-xs text-muted">No Projects yet.</p>}
            <ul className="divide-y divide-subtle">
              {projects?.map((project) => (
                <li key={project.id} className="flex items-center hover:bg-panel-alt">
                  <button
                    onClick={() => {
                      navigate(`/projects/${project.id}`)
                      onClose()
                    }}
                    className="flex flex-1 items-center justify-between px-3 py-2 text-left text-sm"
                  >
                    <span className="text-ink">{project.manifest.name || '(untitled)'}</span>
                    <span className="font-mono text-xs text-muted">{project.manifest.displayVersion}</span>
                  </button>
                  <button
                    onClick={() => void removeProject(project.id, project.manifest.name)}
                    disabled={deletingId === project.id}
                    title="Delete project"
                    className="px-2.5 text-muted hover:text-danger disabled:opacity-60"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <FileJson size={13} /> Open an exported project
          </h3>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void openChosenFile(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => jsonInputRef.current?.click()}
            disabled={importing}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-subtle py-4 text-sm text-muted hover:border-brand hover:text-brand disabled:opacity-60"
          >
            {importing ? 'Opening…' : 'Choose an exported project (.winrelease.zip) or a winrelease.json'}
          </button>
        </section>
      </div>
    </Modal>
  )
}
