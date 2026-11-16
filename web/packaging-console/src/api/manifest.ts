import type { ValidationErrors, WinReleaseManifest } from '../types/manifest'
import { apiSendToBackend, backendAuthHeaders, handleUnauthorized, isJsonResponse } from './client'
import { fetchBackend, forgetBackendIfGatewayFailed, needsHelper, resolveBackend } from '../state/backend'

export interface ManifestValidation {
  ok: boolean
  manifest?: WinReleaseManifest
  errors?: ValidationErrors
  /** Set when the check itself failed (not the manifest): the HTTP status and any message the server gave. */
  failure?: string
  /** The check failed because this site has no backend and no Helper is running (see needsHelper) - expected on the free site, not an error. */
  helperNeeded?: boolean
}

/**
 * POST /api/manifest/parse - the single source of truth for manifest validation (ManifestParser.Parse);
 * the Console never duplicates these rules client-side. Routed through resolveBackend() (state/backend.ts) -
 * the Helper implements this same route (ADR 0067), so live validation works identically whichever
 * backend the user has selected in Settings.
 */
export async function validateManifest(manifest: WinReleaseManifest): Promise<ManifestValidation> {
  const backend = await resolveBackend()
  const response = await fetchBackend(backend, '/api/manifest/parse', {
    method: 'POST',
    headers: { ...backendAuthHeaders(backend), 'Content-Type': 'application/json' },
    body: JSON.stringify(manifest),
  })

  forgetBackendIfGatewayFailed(backend, response.status)
  if (response.status === 401) {
    handleUnauthorized()
    return { ok: false }
  }

  // A 401 challenge (or any non-JSON failure) has no parseable body - avoid
  // throwing on response.json() for those, same reasoning as client.ts's isJsonResponse.
  const body = isJsonResponse(response) ? await response.json() : undefined
  if (response.ok) return { ok: true, manifest: body }
  if (body?.errors && Object.keys(body.errors).length > 0) return { ok: false, errors: body.errors }

  // No validation errors came back, so this is the check failing (wrong/old helper, server error), not the project being invalid.
  return { ok: false, helperNeeded: needsHelper(backend, response.status), failure: `${response.status}${body?.title ? ` ${body.title}` : ''}${body?.detail ? ` - ${body.detail}` : ''}` }
}

/** POST /api/manifest/upgrade-code - GeneralSection's 1-click "Auto-Gen" action (Pain Point 4). Deterministic: same Name+Manufacturer always returns the same UpgradeCode. Routed through resolveBackend() - the Helper implements this route too. */
export function generateUpgradeCode(name: string, manufacturer: string): Promise<{ upgradeCode: string }> {
  return apiSendToBackend('POST', '/api/manifest/upgrade-code', { name, manufacturer })
}
