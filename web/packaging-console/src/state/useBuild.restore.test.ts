import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyManifest, type WinReleaseManifest } from '../types/manifest'
import { saveBuiltMsi } from './builtMsiStore'
import { useBuild } from './useBuild'

function registryOnlyManifest(): WinReleaseManifest {
  return { ...createEmptyManifest(), name: 'App', registry: [{ root: 'hkcu', key: 'Software\App', name: 'X', value: '1', valueType: 'string' }] } as WinReleaseManifest
}

describe('useBuild brings back the MSI built in an earlier visit', () => {
  it('restores the result with its build log, and flags it out of date because the project is not the one it was built from', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:restored')
    URL.revokeObjectURL = vi.fn()
    await saveBuiltMsi({
      projectId: 'earlier', fileName: 'App-1.0.0.msi', blob: new Blob(['msi']), builtAt: Date.now() - 86_400_000, fingerprint: 'older-fingerprint', sourceFiles: 1,
      standardOutput: 'WinRelease note: check the version', standardError: '',
    })

    const { result } = renderHook(() => useBuild(registryOnlyManifest(), new Map(), undefined, 'earlier'))

    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(result.current.results[0]).toMatchObject({ kind: 'msi', fileName: 'App-1.0.0.msi', restored: true })
    expect(result.current.results[0].fingerprint).not.toBe(result.current.fingerprint)
    expect(result.current.log?.standardOutput).toBe('WinRelease note: check the version')
  })
})
