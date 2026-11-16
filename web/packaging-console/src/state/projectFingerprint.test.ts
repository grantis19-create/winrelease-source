import { describe, expect, it } from 'vitest'
import { projectFingerprint } from './projectFingerprint'
import { createSampleProject } from './sampleProject'

const staged = (entries: [string, string, number][]) => new Map(entries.map(([path, text, modified]) => [path, new File([text], path, { lastModified: modified })]))

describe('projectFingerprint', () => {
  it('is the same for the same project and files, whatever order the files were added in', () => {
    const { manifest } = createSampleProject()

    const a = projectFingerprint(manifest, staged([['a.txt', 'x', 1], ['b.txt', 'yy', 2]]))
    const b = projectFingerprint(manifest, staged([['b.txt', 'yy', 2], ['a.txt', 'x', 1]]))

    expect(a).toBe(b)
  })

  it('changes when a setting changes', () => {
    const { manifest } = createSampleProject()
    const files = staged([['a.txt', 'x', 1]])

    expect(projectFingerprint({ ...manifest, displayVersion: '1.0.1' }, files)).not.toBe(projectFingerprint(manifest, files))
    expect(projectFingerprint({ ...manifest, shortcuts: [] }, files)).not.toBe(projectFingerprint(manifest, files))
  })

  it('changes when a file is added, replaced with a different size, or modified', () => {
    const { manifest } = createSampleProject()
    const base = projectFingerprint(manifest, staged([['a.txt', 'x', 1]]))

    expect(projectFingerprint(manifest, staged([['a.txt', 'x', 1], ['b.txt', 'y', 1]]))).not.toBe(base)
    expect(projectFingerprint(manifest, staged([['a.txt', 'xx', 1]]))).not.toBe(base)
    expect(projectFingerprint(manifest, staged([['a.txt', 'x', 2]]))).not.toBe(base)
  })
})
