import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HELPER_URL,
  getBackendConfig,
  helperHeaders,
  needsHelper,
  resetResolvedBackend,
  resolveBackend,
  setBackendConfig,
} from './backend'

beforeEach(() => {
  localStorage.clear()
  resetResolvedBackend()
})

afterEach(() => vi.restoreAllMocks())

describe('getBackendConfig', () => {
  it('defaults to auto-detect with the standard helper URL when nothing is stored', () => {
    expect(getBackendConfig()).toEqual({ mode: 'auto', helperUrl: DEFAULT_HELPER_URL })
  })

  it('falls back to the default on corrupt JSON instead of throwing', () => {
    localStorage.setItem('winrelease.backendConfig', '{not json')
    expect(getBackendConfig()).toEqual({ mode: 'auto', helperUrl: DEFAULT_HELPER_URL })
  })

  it('rejects an unrecognized mode back to auto rather than trusting stale/tampered storage', () => {
    localStorage.setItem('winrelease.backendConfig', JSON.stringify({ mode: 'bogus', helperUrl: 'http://x' }))
    expect(getBackendConfig().mode).toBe('auto')
  })
})

describe('setBackendConfig', () => {
  it('persists the config and invalidates any cached resolution', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    setBackendConfig({ mode: 'hosted', helperUrl: DEFAULT_HELPER_URL })
    expect(getBackendConfig().mode).toBe('hosted')
    expect(await resolveBackend()).toEqual({ baseUrl: '', isHelper: false })

    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:9999' })
    expect(getBackendConfig()).toEqual({ mode: 'helper', helperUrl: 'http://127.0.0.1:9999' })
  })
})

describe('resolveBackend', () => {
  it('mode "hosted" resolves to same-origin without ever calling fetch', async () => {
    setBackendConfig({ mode: 'hosted', helperUrl: DEFAULT_HELPER_URL })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(await resolveBackend()).toEqual({ baseUrl: '', isHelper: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('mode "helper" resolves to the configured helper and fetches its version from /api/info with the helper header', async () => {
    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: '0.1.0' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    expect(await resolveBackend()).toEqual({ baseUrl: 'http://127.0.0.1:5601', isHelper: true, helperVersion: '0.1.0' })
    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:5601/api/info', { headers: { 'X-WinRelease-Helper': '1' } })
  })

  it('mode "auto" prefers the helper when its /health probe succeeds', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn((url: string) => {
      if (String(url).endsWith('/health')) return Promise.resolve(new Response(null, { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ version: '0.2.0' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    })
    vi.stubGlobal('fetch', fetchSpy)

    const resolved = await resolveBackend()
    expect(resolved).toEqual({ baseUrl: 'http://127.0.0.1:5601', isHelper: true, helperVersion: '0.2.0' })
  })

  it('mode "auto" falls back to hosted when the helper is unreachable', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('NetworkError')))

    expect(await resolveBackend()).toEqual({ baseUrl: '', isHelper: false })
  })

  it('mode "auto" falls back to hosted when the helper answers but not with a 2xx', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    expect(await resolveBackend()).toEqual({ baseUrl: '', isHelper: false })
  })

  it('caches the resolution - a second call does not re-probe', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    await resolveBackend()
    const callsAfterFirst = fetchSpy.mock.calls.length
    await resolveBackend()

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst)
  })

  it('resetResolvedBackend forces a fresh probe on the next call', async () => {
    setBackendConfig({ mode: 'auto', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    await resolveBackend()
    const callsAfterFirst = fetchSpy.mock.calls.length
    resetResolvedBackend()
    await resolveBackend()

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })
})

describe('helperHeaders', () => {
  it('includes the required helper header only when talking to the helper', () => {
    expect(helperHeaders(true)).toEqual({ 'X-WinRelease-Helper': '1' })
    expect(helperHeaders(false)).toEqual({})
  })
})

describe('needsHelper', () => {
  it('is true when the hosted site has no build service (404/405) or its proxy has nothing behind it (502-504)', () => {
    const hosted = { baseUrl: '', isHelper: false }
    for (const status of [404, 405, 502, 503, 504]) expect(needsHelper(hosted, status)).toBe(true)
    for (const status of [400, 422, 500]) expect(needsHelper(hosted, status)).toBe(false)
  })

  it('is never true for an answer from the Helper itself', () => {
    expect(needsHelper({ baseUrl: DEFAULT_HELPER_URL, isHelper: true }, 404)).toBe(false)
  })
})
