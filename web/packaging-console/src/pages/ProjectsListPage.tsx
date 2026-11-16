import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { createProject, deleteProject, listProjects } from '../api/projects'
import { getCurrentAccountId } from '../api/currentAccount'
import { apiErrorMessage } from '../state/errorMessage'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { InlineError } from '../components/ui/InlineError'
import { buildNewProjectManifest } from '../state/newProject'
import { NewProjectModal, type NewProjectInput } from '../components/NewProjectModal'
import { createSampleProject } from '../state/sampleProject'
import { saveStagedFiles } from '../state/stagedFileStore'
import { OpenProjectModal } from '../components/OpenProjectModal'
import { isMvpMode } from '../mode'
import { useBackendStatus } from '../state/backend'

export function ProjectsListPage() {
  const navigate = useNavigate()
  const accountId = getCurrentAccountId()!
  const queryClient = useQueryClient()
  const [openModalVisible, setOpenModalVisible] = useState(false)
  const [newProjectVisible, setNewProjectVisible] = useState(false)
  // Passive: never probes for the Helper itself (that would raise Chrome's local-network prompt on page load, ADR 0070).
  const backend = useBackendStatus()

  const { data: projects, isLoading, error: listError } = useQuery({
    queryKey: ['projects', accountId],
    queryFn: () => listProjects(accountId),
  })

  const createDraft = useMutation({
    mutationFn: (input: NewProjectInput) => createProject(accountId, buildNewProjectManifest(input)),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', accountId] })
      navigate(`/projects/${project.id}`)
    },
  })

  const createSample = useMutation({
    mutationFn: async () => {
      const { manifest, files } = createSampleProject()
      const project = await createProject(accountId, manifest)
      // Best-effort (stagedFileStore's own contract - private mode/quota just means it won't survive
      // a reload). Not awaited-and-trusted on its own: `files` is handed to the editor directly below
      // via navigation state, so Build MSI works immediately regardless of whether this persisted.
      void saveStagedFiles(project.id, files)
      return { project, files }
    },
    onSuccess: ({ project, files }) => {
      queryClient.invalidateQueries({ queryKey: ['projects', accountId] })
      // Passing the already-in-memory files, not just the id, is what matters here: ProjectEditorPage
      // would otherwise only learn about them through an async IndexedDB read (loadStagedFiles) that
      // hasn't necessarily finished by the time this page has rendered and Build MSI looks clickable -
      // clicking in that window silently did nothing (canRun was still false), with no error to explain
      // why. State-based navigation skips that race entirely for this, the one path where the files
      // already exist in memory at the moment of navigation.
      navigate(`/projects/${project.id}`, { state: { initialFiles: files } })
    },
  })

  const removeProject = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', accountId] }),
  })

  function confirmDelete(id: string, name: string) {
    if (window.confirm(`Permanently delete "${name || '(untitled)'}"? This can't be undone.`)) {
      removeProject.mutate(id)
    }
  }

  return (
    <AppLayout>

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Projects</h1>
        <div className="flex gap-2">
          <Button onClick={() => setOpenModalVisible(true)}>
            <FolderOpen size={14} /> Import / Open Project
          </Button>
          <Button variant="primary" onClick={() => setNewProjectVisible(true)}>
            <Plus size={14} /> New Project
          </Button>
        </div>
      </div>

      <InlineError message={apiErrorMessage(createDraft.error) ?? apiErrorMessage(listError) ?? apiErrorMessage(removeProject.error) ?? apiErrorMessage(createSample.error)} />

      <div className="rounded-lg border border-subtle bg-panel">
        {isLoading && <p className="p-5 text-sm text-muted">Loading…</p>}
        {!isLoading && projects?.length === 0 && (
          <div className="p-6 text-sm">
            <p className="font-medium text-ink">Build a Windows installer (.msi) in a few clicks.</p>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted">
              {/* Builds run in the Helper on the visitor's PC (the free site has no build server), so say so up front rather than at Build MSI. */}
              {isMvpMode() && (
                <li>
                  {backend?.isHelper ? (
                    <>Get the free WinRelease Helper - <span className="text-ok">it is running on your computer, you are set.</span></>
                  ) : (
                    <>
                      <Link to="/settings#download" className="text-brand hover:underline">Get the free WinRelease Helper</Link> - a one-time download that builds your
                      installer on your own PC, so your files never leave it.
                    </>
                  )}
                </li>
              )}
              <li>Create a project and name your app.</li>
              <li>Drop in the files it should install.</li>
              <li>Optionally add shortcuts and registry entries.</li>
              <li>Press Build MSI and download your installer.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => createSample.mutate()} disabled={createSample.isPending}>
                <Sparkles size={14} /> {createSample.isPending ? 'Creating…' : 'Try a sample project'}
              </Button>
              <Button onClick={() => setNewProjectVisible(true)}>
                <Plus size={14} /> Create your first project
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">Projects are saved in this browser only. Use Export project inside a project to keep an offline copy (settings and files in one .zip), and Open to bring it back.</p>
          </div>
        )}
        <ul className="divide-y divide-subtle">
          {projects?.map((project) => (
            <li key={project.id} className="flex items-center hover:bg-panel-alt">
              <button
                onClick={() => navigate(`/projects/${project.id}`)}
                className="flex flex-1 items-center justify-between px-5 py-3 text-left text-sm"
              >
                <span className="font-medium text-ink">{project.manifest.name || '(untitled)'}</span>
                <span className="font-mono text-xs text-muted">{project.manifest.displayVersion}</span>
              </button>
              <button
                onClick={() => confirmDelete(project.id, project.manifest.name)}
                disabled={removeProject.isPending && removeProject.variables === project.id}
                title="Delete project"
                className="px-3 text-muted hover:text-danger disabled:opacity-60"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {newProjectVisible && (
        <NewProjectModal creating={createDraft.isPending} onClose={() => setNewProjectVisible(false)} onCreate={(input) => createDraft.mutate(input)} />
      )}
      {openModalVisible && <OpenProjectModal onClose={() => setOpenModalVisible(false)} />}
    </AppLayout>
  )
}
