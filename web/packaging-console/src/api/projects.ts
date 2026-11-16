import { apiDelete, apiGet, apiSend } from './client'
import { isMvpMode } from '../mode'
import {
  createLocalProject,
  deleteLocalProject,
  getLocalProject,
  listLocalProjects,
  updateLocalProject,
} from '../state/localProjects'
import type { ProjectView, StorageConnectionRequest, WebhookConfigView } from '../types/domain'
import type { WinReleaseManifest } from '../types/manifest'

// In MVP mode (see mode.ts) these resolve against localStorage instead of the API, with the same
// signatures, so no caller needs to know which backend it is talking to.

export async function listProjects(accountId: string): Promise<ProjectView[]> {
  if (isMvpMode()) return listLocalProjects()
  return apiGet<ProjectView[]>(`/api/projects?accountId=${accountId}`)
}

export async function createProject(accountId: string, manifest: WinReleaseManifest): Promise<ProjectView> {
  if (isMvpMode()) return createLocalProject(manifest)
  return apiSend<ProjectView>('POST', '/api/projects', { accountId, manifest })
}

export async function getProject(id: string): Promise<ProjectView> {
  if (isMvpMode()) return getLocalProject(id)
  return apiGet<ProjectView>(`/api/projects/${id}`)
}

export async function updateProject(id: string, manifest: WinReleaseManifest): Promise<ProjectView> {
  if (isMvpMode()) return updateLocalProject(id, manifest)
  return apiSend<ProjectView>('PUT', `/api/projects/${id}`, { manifest })
}

export function setProjectStorageOverride(id: string, storage: StorageConnectionRequest | null): Promise<ProjectView> {
  return apiSend<ProjectView>('PUT', `/api/projects/${id}/storage`, storage)
}

export function setProjectWebhookOverride(id: string, webhook: WebhookConfigView | null): Promise<ProjectView> {
  return apiSend<ProjectView>('PUT', `/api/projects/${id}/webhook`, webhook)
}

export async function deleteProject(id: string): Promise<void> {
  if (isMvpMode()) return deleteLocalProject(id)
  return apiDelete(`/api/projects/${id}`)
}
