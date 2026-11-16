import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createEmptyManifest, type WinReleaseManifest } from '../types/manifest'
import { HELPER_NEEDED_MESSAGE, useBuild } from './useBuild'

const mocks = vi.hoisted(() => ({
  buildMsi: vi.fn(),
  packageIntune: vi.fn(),
  resolveBackend: vi.fn(),
  buildZip: vi.fn(),
}))

vi.mock('../api/builds', () => ({ buildMsi: mocks.buildMsi, packageIntune: mocks.packageIntune }))
vi.mock('./zipBuilder', () => ({ buildZip: mocks.buildZip }))
vi.mock('./backend', async (importOriginal) => ({ ...(await importOriginal<typeof import('./backend')>()), resolveBackend: mocks.resolveBackend }))

const hosted = { baseUrl: '', isHelper: false }
const helper = { baseUrl: 'http://127.0.0.1:5601', isHelper: true, helperVersion: '99.0.0' }

/** A package with one registry value: buildable without any staged files. */
function registryOnlyManifest(): WinReleaseManifest {
  return { ...createEmptyManifest(), name: 'App', registry: [{ root: 'hkcu', key: 'Software\\App', name: 'X', value: '1', valueType: 'string' }] } as WinReleaseManifest
}

async function runBuild() {
  const { result } = renderHook(() => useBuild(registryOnlyManifest(), new Map()))
  await act(() => result.current.run('msi'))
  return result.current
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildZip.mockResolvedValue(new Blob())
})

describe('useBuild failure messages', () => {
  it('asks for the Helper when the site itself has no build service (404)', async () => {
    mocks.resolveBackend.mockResolvedValue(hosted)
    mocks.buildMsi.mockRejectedValue(new ApiError(404, ''))

    const build = await runBuild()

    expect(build.helperNeeded).toBe(true)
    expect(build.error).toBe(HELPER_NEEDED_MESSAGE)
  })

  it('never shows a blank error when the server sends no status text', async () => {
    mocks.resolveBackend.mockResolvedValue(hosted)
    mocks.buildMsi.mockRejectedValue(new ApiError(500, ''))

    const build = await runBuild()

    expect(build.helperNeeded).toBe(false)
    expect(build.error).toBe('The build failed (HTTP 500).')
  })

  it('asks for the Helper when the chosen Helper stops answering', async () => {
    mocks.resolveBackend.mockResolvedValue(helper)
    mocks.buildMsi.mockRejectedValue(new TypeError('Failed to fetch'))

    const build = await runBuild()

    expect(build.helperNeeded).toBe(true)
  })

  it('does not blame the Helper for a failure before the request is sent', async () => {
    mocks.resolveBackend.mockResolvedValue(helper)
    mocks.buildZip.mockRejectedValue(new TypeError('Cannot read the file'))

    const build = await runBuild()

    expect(build.helperNeeded).toBe(false)
    expect(build.error).toMatch(/Cannot read the file/)
    expect(mocks.buildMsi).not.toHaveBeenCalled()
  })

  it('shows a real compile failure (422) as an error, not as a missing Helper', async () => {
    mocks.resolveBackend.mockResolvedValue(helper)
    mocks.buildMsi.mockRejectedValue(new ApiError(422, 'Unprocessable Entity', undefined, 'wix output', 'WIX0001 bad'))

    const build = await runBuild()

    expect(build.helperNeeded).toBe(false)
    expect(build.log?.standardError).toBe('WIX0001 bad')
  })
})

describe('useBuild keeps the MSI and notices when the project moves on', () => {
  it('marks the build current right after it, and out of date once the project changes', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:msi')
    URL.revokeObjectURL = vi.fn()
    mocks.resolveBackend.mockResolvedValue(helper)
    mocks.buildMsi.mockResolvedValue({ blob: new Blob(['msi']), fileName: 'App-1.0.0.msi', standardOutput: '', standardError: '' })
    const files = new Map<string, File>()
    const first = registryOnlyManifest()
    const { result, rerender } = renderHook(({ manifest }) => useBuild(manifest, files), { initialProps: { manifest: first } })

    await act(() => result.current.run('msi'))
    const built = result.current.results.find((r) => r.kind === 'msi')!
    expect(built.fingerprint).toBe(result.current.fingerprint)

    rerender({ manifest: { ...first, displayVersion: '2.0.0' } })
    expect(built.fingerprint).not.toBe(result.current.fingerprint)

    rerender({ manifest: first })
    expect(built.fingerprint).toBe(result.current.fingerprint)
  })
})
