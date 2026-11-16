import { describe, expect, it } from 'vitest'
import { buildNewProjectManifest } from './newProject'
import { suggestedTargetDirectory } from './installTargets'

describe('buildNewProjectManifest', () => {
  it('fills identity and leaves the install directory at the bare root (it is only suggested, ADR 0095)', () => {
    const m = buildNewProjectManifest({ name: ' Acme Reader ', manufacturer: 'Acme Corp', version: '2.1.0' })

    expect(m.name).toBe('Acme Reader')
    expect(m.manufacturer).toBe('Acme Corp')
    expect(m.displayVersion).toBe('2.1.0')
    expect(m.targetDirectory).toBe('[ProgramFiles64Folder]')
    expect(suggestedTargetDirectory(m)).toBe('[ProgramFiles64Folder]Acme Corp\\Acme Reader')
  })

  it('falls back to 1.0.0 for a blank version', () => {
    expect(buildNewProjectManifest({ name: 'A', manufacturer: 'B', version: '  ' }).displayVersion).toBe('1.0.0')
  })
})
