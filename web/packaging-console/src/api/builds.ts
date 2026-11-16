import { apiUploadForBlob, apiUploadForBlobToBackend } from './client'
import type { WinReleaseManifest } from '../types/manifest'

/**
 * ADR 0026's contract: multipart 'manifest' (winrelease.json text) + 'sources' (zip of the tree
 * sourcePath/sourceFolder resolve against). A Blob covers both a manually-picked .zip File and one
 * built client-side (state/zipBuilder.ts) from imported files. 'projectId' is optional (omitted for
 * an MVP/no-account build, or a manually-picked .zip not tied to a saved Project) - when present, it
 * lets the hosted API resolve and fire a configured build-notification webhook (ADR 0078). The local
 * WinRelease.Helper has no Account/Project concept at all and simply ignores the extra form field.
 */
function buildForm(manifest: WinReleaseManifest, sourcesZip: Blob, projectId?: string): FormData {
  const form = new FormData()
  form.append('manifest', new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'winrelease.json')
  form.append('sources', sourcesZip, 'sources.zip')
  if (projectId) form.append('projectId', projectId)
  return form
}

/** POST /api/build -> a real .msi. Routed through resolveBackend() (state/backend.ts) - the one build route the local WinRelease.Helper also implements (ADR 0067), so this can land on either backend depending on the user's Settings choice. */
export function buildMsi(manifest: WinReleaseManifest, sourcesZip: Blob, projectId?: string) {
  return apiUploadForBlobToBackend('/api/build', buildForm(manifest, sourcesZip, projectId))
}

/** POST /api/package/intune -> a real .intunewin. Always the hosted backend - the Helper has no Intune route (ADR 0067). */
export function packageIntune(manifest: WinReleaseManifest, sourcesZip: Blob, projectId?: string) {
  return apiUploadForBlob('/api/package/intune', buildForm(manifest, sourcesZip, projectId))
}
