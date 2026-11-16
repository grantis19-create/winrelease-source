import { useSyncExternalStore } from 'react'
import { isMvpMode } from '../mode'

/**
 * Which backend the Console sends manifest-parse/upgrade-code/build requests to
 * (docs/roadmap/helper-exe-strategy.md, Phase 3). Everything else (Intune packaging, accounts,
 * projects, storage, .wxs import) has no Helper equivalent (ADR 0067's
 * AdvancedProductRoutes_AreNotMapped) and always stays on the hosted/same-origin backend regardless
 * of this setting - see api/client.ts's split between the *ToBackend functions and the originals.
 */
export type BackendMode = 'auto' | 'helper' | 'hosted'

export interface BackendConfig {
  mode: BackendMode
  helperUrl: string
}

export interface ResolvedBackend {
  /** Prefixed onto a relative API path. '' means same-origin (the hosted backend, or WinRelease.Local serving this Console itself in MVP mode). */
  baseUrl: string
  isHelper: boolean
  /** Only set when isHelper is true and /api/info answered - the Helper's own self-reported version. */
  helperVersion?: string
  /** The Helper's own report of whether the `wix` compiler is installed; undefined from an older Helper that does not say. */
  wixAvailable?: boolean
  /** Highest .NET SDK version the Helper found on this PC; null when none, undefined from an older Helper. */
  dotnetSdkVersion?: string | null
  /** The WiX UI extension (the installer screens) is added; undefined from an older Helper that does not say. */
  wixUiExtension?: boolean
}

const CONFIG_STORAGE_KEY = 'winrelease.backendConfig'
export const DEFAULT_HELPER_URL = 'http://127.0.0.1:5601'
export const HELPER_HEADER_NAME = 'X-WinRelease-Helper'
const PROBE_TIMEOUT_MS = 1500

function defaultConfig(): BackendConfig {
  return { mode: 'auto', helperUrl: DEFAULT_HELPER_URL }
}

export function getBackendConfig(): BackendConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as Partial<BackendConfig>
    return {
      mode: parsed.mode === 'helper' || parsed.mode === 'hosted' ? parsed.mode : 'auto',
      helperUrl: typeof parsed.helperUrl === 'string' && parsed.helperUrl.trim() ? parsed.helperUrl.trim() : DEFAULT_HELPER_URL,
    }
  } catch {
    return defaultConfig()
  }
}

export function setBackendConfig(config: BackendConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Best-effort only - a blocked/private-mode localStorage just means the preference doesn't survive a reload.
  }
  resetResolvedBackend()
}

const listeners = new Set<() => void>()
let resolvedPromise: Promise<ResolvedBackend> | null = null
let lastResolved: ResolvedBackend | null = null

function notify(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Drops any cached detection result so the next call to resolveBackend() re-probes - call after
 * changing the config or when the user asks to re-check. Doesn't re-probe itself: useBackendStatus
 * sees `lastResolved` go back to null via notify() below and calls resolveBackend() again on its
 * next render, which is enough for every subscribed component to pick up the fresh result.
 */
export function resetResolvedBackend(): void {
  resolvedPromise = null
  lastResolved = null
  notify()
}

async function probeHelper(helperUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(`${helperUrl}/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchHelperInfo(helperUrl: string): Promise<{ version?: string; wixAvailable?: boolean; dotnetSdkVersion?: string | null; wixUiExtension?: boolean }> {
  try {
    const response = await fetch(`${helperUrl}/api/info`, { headers: { [HELPER_HEADER_NAME]: '1' } })
    if (!response.ok) return {}
    const body = (await response.json()) as { version?: string; wixAvailable?: boolean; dotnetSdkVersion?: string | null; wixUiExtensionAvailable?: boolean }
    return { version: body.version, wixAvailable: body.wixAvailable, dotnetSdkVersion: body.dotnetSdkVersion, wixUiExtension: body.wixUiExtensionAvailable }
  } catch {
    return {}
  }
}

async function resolveBackendUncached(): Promise<ResolvedBackend> {
  const config = getBackendConfig()

  if (config.mode === 'hosted') {
    return { baseUrl: '', isHelper: false }
  }

  if (config.mode === 'helper') {
    const info = await fetchHelperInfo(config.helperUrl)
    return { baseUrl: config.helperUrl, isHelper: true, helperVersion: info.version, wixAvailable: info.wixAvailable, dotnetSdkVersion: info.dotnetSdkVersion, wixUiExtension: info.wixUiExtension }
  }

  // auto: prefer the helper when it's actually reachable from this origin, otherwise fall back to hosted.
  const reachable = await probeHelper(config.helperUrl)
  if (!reachable) {
    return { baseUrl: '', isHelper: false }
  }
  const info = await fetchHelperInfo(config.helperUrl)
  return { baseUrl: config.helperUrl, isHelper: true, helperVersion: info.version, wixAvailable: info.wixAvailable, dotnetSdkVersion: info.dotnetSdkVersion, wixUiExtension: info.wixUiExtension }
}

/**
 * Resolves once per config generation (cached) - every caller in the same "session" (until reset)
 * gets the same answer instead of re-probing on every request. Only ever called by something with a
 * real reason to: the Settings page (BackendSettings' own mount effect, and its "Re-check
 * connection" action), or an actual manifest-parse/upgrade-code/build call (api/client.ts,
 * api/manifest.ts) - never implicitly by passive status UI (the Sidebar badge,
 * HelperPermissionNotice). That split is deliberate: auto mode's probe is what triggers Chrome's
 * Local Network Access prompt (ADR 0070), and a visitor who never opens a project or Settings should
 * never see that prompt just for having the app open.
 */
export function resolveBackend(): Promise<ResolvedBackend> {
  if (!resolvedPromise) {
    notify() // a probe is now in flight - useIsBackendProbing() subscribers should see that immediately.
    resolvedPromise = resolveBackendUncached().then((resolved) => {
      lastResolved = resolved
      if (resolved.isHelper) startHeartbeat(resolved.baseUrl)
      notify()
      return resolved
    })
  }
  return resolvedPromise
}

const HEARTBEAT_MS = 30_000
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/**
 * While this page is open and talking to a Helper, ping it every 30s. The tray Helper (ADR 0102) quits by itself after a few minutes with no
 * requests, so closing the site is what ends it. If a ping fails the Helper has gone: forget it so the next action re-probes (and the UI says so).
 */
function startHeartbeat(helperUrl: string): void {
  if (heartbeatTimer !== null || import.meta.env.MODE === 'test') return
  heartbeatTimer = setInterval(() => {
    fetch(`${helperUrl}/health`).then(
      (response) => {
        if (!response.ok) stopHeartbeatAndForget()
      },
      () => stopHeartbeatAndForget(),
    )
  }, HEARTBEAT_MS)
}

function stopHeartbeatAndForget(): void {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = null
  resetResolvedBackend()
}

/** A same-origin (hosted) answer of 502-504 usually means the helper was not reachable when we probed and has been started since: forget the cached choice so the next request re-probes. */
export function forgetBackendIfGatewayFailed(backend: ResolvedBackend, status: number): void {
  if (!backend.isHelper && status >= 502 && status <= 504) resetResolvedBackend()
}

/**
 * True when a same-origin (hosted) answer means there is no build service behind this site at all, so the visitor needs the Helper: the
 * free static site has no /api (404/405), and a reverse proxy with nothing behind it answers 502-504. Never true for a Helper answer.
 */
export function needsHelper(backend: ResolvedBackend, status: number): boolean {
  return !backend.isHelper && (status === 404 || status === 405 || (status >= 502 && status <= 504))
}

/**
 * fetch() for a request routed through the resolved backend. The free site has no backend of its own: with no Helper reachable, the request
 * would only travel to the website's host and come back 404, carrying the project (names, paths, registry values) for nothing. So nothing is
 * sent; a synthetic 404 gives every caller the same "Helper needed" answer it already handles (needsHelper).
 */
export function fetchBackend(backend: ResolvedBackend, path: string, init: RequestInit): Promise<Response> {
  if (isMvpMode() && !backend.isHelper) return Promise.resolve(new Response(null, { status: 404 }))
  return fetch(`${backend.baseUrl}${path}`, init)
}

export function helperHeaders(isHelper: boolean): HeadersInit {
  return isHelper ? { [HELPER_HEADER_NAME]: '1' } : {}
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The live detection status for passive display (a status badge) - `null` until *something else*
 * (see resolveBackend's own doc) has actually triggered a probe. Deliberately never triggers one
 * itself - see resolveBackend.
 */
export function useBackendStatus(): ResolvedBackend | null {
  return useSyncExternalStore(subscribe, () => lastResolved)
}

/** True from the moment resolveBackend() is first called for this config generation until it resolves - lets a passive UI (HelperPermissionNotice) show only while a probe someone else started is actually in flight, not merely because nothing has happened yet. */
export function useIsBackendProbing(): boolean {
  return useSyncExternalStore(subscribe, () => resolvedPromise !== null && lastResolved === null)
}

/** The latest detection result without subscribing to it - for one-off reads such as the support bundle. */
export function getBackendStatus(): ResolvedBackend | null {
  return lastResolved
}
