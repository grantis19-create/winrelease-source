import { ApiError } from '../api/client'
import { clearStagedFiles } from './stagedFileStore'
import { deleteBuiltMsi } from './builtMsiStore'
import type { ProjectView } from '../types/domain'
import type { WinReleaseManifest } from '../types/manifest'

// MVP mode's stand-in for the Project endpoints: the whole project list lives in one localStorage
// entry, so there's no server-side persistence at all (docs/roadmap/free-compiler-mvp.md).
// Source files live in IndexedDB (stagedFileStore.ts), not here - localStorage is too small for binaries.

const STORAGE_KEY = 'winrelease.mvp.projects'
const LOCAL_ACCOUNT_ID = 'local'

function readAll(): ProjectView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ProjectView[]) : []
  } catch {
    return []
  }
}

function writeAll(projects: ProjectView[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch {
    throw new ApiError(507, "Couldn't save the project - this browser's local storage is full or unavailable.")
  }
}

function notFound(): never {
  throw new ApiError(404, 'That project no longer exists in this browser.')
}

export function listLocalProjects(): ProjectView[] {
  return readAll()
}

export function getLocalProject(id: string): ProjectView {
  return readAll().find((p) => p.id === id) ?? notFound()
}

export function createLocalProject(manifest: WinReleaseManifest): ProjectView {
  const project: ProjectView = { id: crypto.randomUUID(), accountId: LOCAL_ACCOUNT_ID, manifest, storageOverride: null }
  writeAll([...readAll(), project])
  return project
}

export function updateLocalProject(id: string, manifest: WinReleaseManifest): ProjectView {
  const projects = readAll()
  const index = projects.findIndex((p) => p.id === id)
  if (index === -1) notFound()

  const updated = { ...projects[index], manifest }
  projects[index] = updated
  writeAll(projects)
  return updated
}

export function deleteLocalProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id))
  void clearStagedFiles(id)
  void deleteBuiltMsi(id)
}

export { LOCAL_ACCOUNT_ID }
