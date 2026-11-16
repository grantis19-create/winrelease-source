import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteBuiltMsi, loadBuiltMsi, saveBuiltMsi } from './builtMsiStore'

const build = (projectId: string, fileName: string, fingerprint: string) => ({ projectId, fileName, blob: new Blob(['msi']), builtAt: 1700000000000, fingerprint, sourceFiles: 2 })

describe('builtMsiStore', () => {
  it('keeps the last build per project and replaces it on the next one', async () => {
    await saveBuiltMsi(build('p1', 'App-1.0.0.msi', 'one'))
    await saveBuiltMsi(build('p2', 'Other-1.0.0.msi', 'two'))
    await saveBuiltMsi(build('p1', 'App-1.0.1.msi', 'three'))

    const p1 = await loadBuiltMsi('p1')
    const p2 = await loadBuiltMsi('p2')

    expect(p1?.fileName).toBe('App-1.0.1.msi')
    expect(p1?.fingerprint).toBe('three')
    expect(p2?.fileName).toBe('Other-1.0.0.msi')
    // Blob contents aren't asserted: jsdom's Blob isn't structured-cloneable by fake-indexeddb (same as stagedFileStore's test).
  })

  it('has nothing for a project that was never built, and forgets a deleted one', async () => {
    expect(await loadBuiltMsi('never')).toBeNull()

    await saveBuiltMsi(build('gone', 'X.msi', 'f'))
    await deleteBuiltMsi('gone')

    expect(await loadBuiltMsi('gone')).toBeNull()
  })
})
