import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearStagedFiles, loadStagedFiles, saveStagedFiles } from './stagedFileStore'

const file = (name: string, text: string) => new File([text], name, { type: 'text/plain', lastModified: 1234 })

describe('stagedFileStore', () => {
  it('round-trips staged files per project, keyed by path', async () => {
    await saveStagedFiles('p1', [{ path: 'bin/app.txt', file: file('app.txt', 'hello') }])
    await saveStagedFiles('p2', [{ path: 'other.txt', file: file('other.txt', 'x') }])

    const restored = await loadStagedFiles('p1')

    expect([...restored.keys()]).toEqual(['bin/app.txt'])
    const f = restored.get('bin/app.txt')!
    expect(f.name).toBe('app.txt')
    expect(f.lastModified).toBe(1234)
    // Blob contents aren't asserted: jsdom's Blob isn't structured-cloneable by fake-indexeddb. Real-browser round trip is verified manually (ADR 0047).
  })

  it('clearing one project leaves the others', async () => {
    await saveStagedFiles('a', [{ path: 'f', file: file('f', '1') }])
    await saveStagedFiles('b', [{ path: 'f', file: file('f', '2') }])

    await clearStagedFiles('a')

    expect((await loadStagedFiles('a')).size).toBe(0)
    expect((await loadStagedFiles('b')).size).toBe(1)
  })
})
