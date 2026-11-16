import { afterEach, describe, expect, it, vi } from 'vitest'
import * as mode from '../mode'
import * as backend from '../state/backend'
import { validateManifest } from './manifest'
import { createEmptyManifest } from '../types/manifest'

describe('free site: nothing is sent when no Helper is running', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not POST the project anywhere, and reports that the Helper is needed', async () => {
    vi.spyOn(mode, 'isMvpMode').mockReturnValue(true)
    vi.spyOn(backend, 'resolveBackend').mockResolvedValue({ baseUrl: '', isHelper: false })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await validateManifest(createEmptyManifest())

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.helperNeeded).toBe(true)
  })

  it('still sends to the Helper when one is running', async () => {
    vi.spyOn(mode, 'isMvpMode').mockReturnValue(true)
    vi.spyOn(backend, 'resolveBackend').mockResolvedValue({ baseUrl: 'http://127.0.0.1:5601', isHelper: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }))

    await validateManifest(createEmptyManifest())

    expect(fetchSpy).toHaveBeenCalledWith('http://127.0.0.1:5601/api/manifest/parse', expect.anything())
  })
})
