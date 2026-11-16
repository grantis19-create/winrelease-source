import { clearToken, getToken } from './authToken'
import { fetchBackend, forgetBackendIfGatewayFailed, helperHeaders, resolveBackend, type ResolvedBackend } from '../state/backend'
import type { ValidationErrors } from '../types/manifest'

/** Thrown for any non-2xx response. `errors` is populated for a 400 ValidationProblem (RFC 7807, see ManifestParser/Validation.Validate); `standardOutput`/`standardError` for a 422 compile failure (ADR 0026). */
export class ApiError extends Error {
  readonly status: number
  readonly errors?: ValidationErrors
  readonly standardOutput?: string
  readonly standardError?: string

  constructor(status: number, message: string, errors?: ValidationErrors, standardOutput?: string, standardError?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.standardOutput = standardOutput
    this.standardError = standardError
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  if (response.status === 401) {
    handleUnauthorized()
  }

  const body = isJsonResponse(response) ? await response.json() : undefined

  if (!response.ok) {
    throw new ApiError(response.status, body?.title ?? body?.error ?? response.statusText, body?.errors)
  }

  return body as T
}

/**
 * A 401 means the dev-mode token expired (8h lifetime, DevAuthEndpoints.cs)
 * or was never valid. Left unhandled, every query on the page just fails
 * silently (and React Query's default retries make it look "hung" for
 * several seconds first) - clear the stale token and bounce to login
 * instead of leaving a blank/stuck page. Exported so api/manifest.ts (which
 * hits POST /api/manifest/parse directly, bypassing handle() above) can
 * apply the same treatment.
 */
export function handleUnauthorized(): void {
  clearToken()
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders() })
  return handle<T>(response)
}

export async function apiSend<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handle<T>(response)
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, { method: 'DELETE', headers: authHeaders() })
  await handle<void>(response)
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: authHeaders(), body: form })
  return handle<T>(response)
}

type BlobResult = { blob: Blob; fileName: string; standardOutput?: string; standardError?: string }

/**
 * The file name from a Content-Disposition header (RFC 6266). Prefers `filename*=UTF-8''...` (percent-encoded, exact), then a quoted
 * `filename="..."` whose value may itself contain `;` and escaped quotes, then a bare token. The old regex stopped at the first `;`, so a
 * product name such as "Names; Things" downloaded as "Names" with no .msi extension (found by UAT T9).
 */
export function fileNameFromContentDisposition(disposition: string): string | undefined {
  const encoded = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(disposition)?.[2]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim())
    } catch {
      // fall through to the plain form
    }
  }

  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(disposition)?.[1]
  if (quoted !== undefined) return quoted.replace(/\\(.)/g, '$1')

  return /filename\s*=\s*([^;\s]+)/i.exec(disposition)?.[1]
}

async function handleBlobResponse(response: Response): Promise<BlobResult> {
  if (response.status === 401) {
    handleUnauthorized()
  }

  if (!response.ok) {
    const body = isJsonResponse(response) ? await response.json() : undefined
    // A 422 compile failure (ADR 0026) carries { standardOutput, standardError } directly in the body, not a title/errors.
    throw new ApiError(response.status, body?.title ?? body?.error ?? response.statusText, body?.errors, body?.standardOutput, body?.standardError)
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const fileName = fileNameFromContentDisposition(disposition) ?? 'artifact.bin'
  return {
    blob: await response.blob(),
    fileName,
    standardOutput: decodeBase64Header(response, 'X-Wix-StdOut-Base64'),
    standardError: decodeBase64Header(response, 'X-Wix-StdErr-Base64'),
  }
}

/** Build & Output downloads (.msi/.intunewin) - the body is the file itself, not JSON. Always the hosted/same-origin backend - used for Intune packaging and anything else the Helper doesn't implement (ADR 0067). */
export async function apiUploadForBlob(path: string, form: FormData): Promise<BlobResult> {
  const response = await fetch(path, { method: 'POST', headers: authHeaders(), body: form })
  return handleBlobResponse(response)
}

/** Headers for a request routed through the resolved backend (see resolveBackend): the Helper has no auth of its own and its CORS policy only allows Content-Type/X-WinRelease-Helper, so the dev-auth Bearer token must never be sent to it. */
export function backendAuthHeaders(backend: ResolvedBackend): HeadersInit {
  return backend.isHelper ? helperHeaders(true) : authHeaders()
}

/** Same as apiSend, but against whichever backend resolveBackend() picks (Helper or hosted) - for the manifest-parse/upgrade-code/build routes the Helper actually implements. */
export async function apiSendToBackend<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T> {
  const backend = await resolveBackend()
  const response = await fetchBackend(backend, path, {
    method,
    headers: { ...backendAuthHeaders(backend), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  forgetBackendIfGatewayFailed(backend, response.status)
  return handle<T>(response)
}

/** Same as apiUploadForBlob, but against whichever backend resolveBackend() picks - used only for buildMsi (/api/build), which the Helper implements. packageIntune stays on apiUploadForBlob above - the Helper has no Intune route. */
export async function apiUploadForBlobToBackend(path: string, form: FormData): Promise<BlobResult> {
  const backend = await resolveBackend()
  const response = await fetchBackend(backend, path, { method: 'POST', headers: backendAuthHeaders(backend), body: form })
  forgetBackendIfGatewayFailed(backend, response.status)
  return handleBlobResponse(response)
}

export function decodeBase64Header(response: Response, headerName: string): string | undefined {
  const value = response.headers.get(headerName)
  if (!value) return undefined
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** ASP.NET Core's ValidationProblem() responses use application/problem+json (RFC 7807), not application/json - a plain equality/substring check on "application/json" misses it. */
export function isJsonResponse(response: Response): boolean {
  return /json/i.test(response.headers.get('content-type') ?? '')
}

export function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
