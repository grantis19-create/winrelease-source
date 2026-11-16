import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiSend, apiSendToBackend, apiUploadForBlobToBackend, ApiError } from './client'
import { resetResolvedBackend, setBackendConfig } from '../state/backend'

describe('apiSend error handling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses a ValidationProblem body even though its content-type is application/problem+json, not application/json', async () => {
    const problemBody = {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { storage: ['Connecting to the storage backend timed out - check the account/bucket name and network reachability.'] },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(problemBody), {
          status: 400,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    )

    await expect(apiSend('PUT', '/api/accounts/x/storage', {})).rejects.toMatchObject({
      errors: { storage: ['Connecting to the storage backend timed out - check the account/bucket name and network reachability.'] },
    })
  })

  it('still throws a usable ApiError when the body genuinely is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })))

    const error: unknown = await apiSend('PUT', '/api/accounts/x/storage', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).errors).toBeUndefined()
  })
})

describe('backend-routed requests (apiSendToBackend/apiUploadForBlobToBackend)', () => {
  beforeEach(() => {
    localStorage.clear()
    resetResolvedBackend()
  })

  it('apiSendToBackend hits the hosted origin with no helper header when resolveBackend picks "hosted"', async () => {
    setBackendConfig({ mode: 'hosted', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)

    await apiSendToBackend('POST', '/api/manifest/upgrade-code', { name: 'x', manufacturer: 'y' })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/manifest/upgrade-code')
    expect((init.headers as Record<string, string>)['X-WinRelease-Helper']).toBeUndefined()
  })

  it('apiSendToBackend hits the helper origin with the required header when resolveBackend picks "helper"', async () => {
    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:5601' })
    // A fresh Response per call - resolveBackend's own /api/info probe and the real request below
    // each consume their response body once; reusing a single Response instance for both throws
    // "Body has already been read".
    const fetchSpy = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await apiSendToBackend('POST', '/api/manifest/upgrade-code', { name: 'x', manufacturer: 'y' })

    const [url, init] = fetchSpy.mock.calls.at(-1)!
    expect(url).toBe('http://127.0.0.1:5601/api/manifest/upgrade-code')
    expect((init.headers as Record<string, string>)['X-WinRelease-Helper']).toBe('1')
  })

  it('apiUploadForBlobToBackend posts to the helper origin and parses the Wix log headers', async () => {
    setBackendConfig({ mode: 'helper', helperUrl: 'http://127.0.0.1:5601' })
    const fetchSpy = vi.fn((url: string, _init: RequestInit) => {
      if (String(url).endsWith('/api/info')) {
        return Promise.resolve(new Response(JSON.stringify({ version: '0.1.0' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      }
      return Promise.resolve(
        new Response(new Blob(['msi-bytes']), {
          status: 200,
          headers: { 'content-disposition': 'attachment; filename="App-1.0.0.msi"' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await apiUploadForBlobToBackend('/api/build', new FormData())

    const [url, init] = fetchSpy.mock.calls.at(-1)!
    expect(url).toBe('http://127.0.0.1:5601/api/build')
    expect((init.headers as Record<string, string>)['X-WinRelease-Helper']).toBe('1')
    expect(result.fileName).toBe('App-1.0.0.msi')
  })

  it("uses the Helper's own { error } text, so a busy Helper reads as busy rather than 'Service Unavailable'", async () => {
    setBackendConfig({ mode: 'hosted', helperUrl: 'http://127.0.0.1:5601' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'The build service is busy. Try again in a moment.' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'content-type': 'application/json' },
    }))))

    const failure = await apiUploadForBlobToBackend('/api/build', new FormData()).catch((e: unknown) => e)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).message).toBe('The build service is busy. Try again in a moment.')
  })
})
